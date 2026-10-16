import { spawn } from "node:child_process";
import path from "node:path";
import { normalizeBattery, sendLog } from "../../../lib/track";
import { limitByIp, tooManyRequests } from "../../../lib/rate-limit";
import { recordUrl, recordVisit } from "../../../lib/monitor";
import { isBareVideoId, videoIdOf } from "../../../lib/tiktok-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 150_000;
const MAX_ACTIVE = 3;
const MAX_QUEUE = 8;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

// Hasil yang barusan dicek disimpan sebentar di memori. Tempel link yang sama
// lagi langsung dibalas tanpa spawn proses scraper, jadi user nggak lihat fase
// "mencari link preset" lagi padahal barusan selesai. Dibatesin 10 menit biar
// hasilnya nggak ketinggalan jaman (tautan pratinjau video ada masa berlaku).
const RECENT_TTL_MS = 10 * 60_000;
// Satu hasil bisa nempel di beberapa kunci (URL aslinya + ID videonya), jadi
// batasnya dikali 2 dari jumlah baris yang diinginkan.
const RECENT_MAX = 400;
const recentFind: Map<string, { at: number; row: Record<string, unknown> }> = new Map();

function recentKey(target: string): string {
  return target.replace(/\/+$/, "").toLowerCase();
}

/**
 * Semua kunci yang boleh dipakai buat memanggil satu hasil.
 * URL aslinya selalu ikut, plus ID videonya — supaya link pendek yang sudah
 * di-resolve dan alamat /preset/<sumber>/<id> ketemu ke entri yang sama dan
 * nggak perlu dicek ulang ke TikTok/YouTube.
 */
function recentKeys(target: string, row?: Record<string, unknown>): string[] {
  const keys: string[] = [`t:${recentKey(target)}`];

  const rawVideoUrl = row?.videoUrl;
  const videoUrl = typeof rawVideoUrl === "string" ? rawVideoUrl : "";
  const rawId = row?.videoId;
  const id = typeof rawId === "string" ? rawId : null;
  if (id) {
    keys.push(`${/youtube|youtu\.be/i.test(videoUrl) ? "yt" : "tt"}:${id}`);
  }

  const direct = videoIdOf(target);
  if (direct) keys.push(`${direct.source === "youtube" ? "yt" : "tt"}:${direct.id}`);

  return [...new Set(keys)];
}

function peekRecent(target: string): Record<string, unknown> | null {
  const now = Date.now();
  for (const key of recentKeys(target)) {
    const hit = recentFind.get(key);
    if (!hit) continue;
    if (now - hit.at > RECENT_TTL_MS) {
      recentFind.delete(key);
      continue;
    }
    return hit.row;
  }
  return null;
}

function rememberRecent(target: string, row: Record<string, unknown>): void {
  const at = Date.now();
  for (const key of recentKeys(target, row)) {
    recentFind.delete(key);
    recentFind.set(key, { at, row });
  }
  while (recentFind.size > RECENT_MAX) {
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [key, value] of recentFind) {
      if (value.at < oldestAt) {
        oldestAt = value.at;
        oldestKey = key;
      }
    }
    if (oldestKey === null) break;
    recentFind.delete(oldestKey);
  }
}

function sseOf(events: Array<[string, unknown]>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const [event, data] of events) controller.enqueue(encoder.encode(encode(event, data)));
      controller.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

let active = 0;
const waiting: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_ACTIVE) {
    active += 1;
    return Promise.resolve();
  }
  if (waiting.length >= MAX_QUEUE) {
    return Promise.reject(new Error("server lagi penuh, coba lagi beberapa saat lagi"));
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function release() {
  const next = waiting.shift();
  if (next) next();
  else active -= 1;
}

function normalizeTarget(raw: string | null): string | null {
  if (!raw) return null;
  let value = raw.trim().slice(0, 2048);
  if (!value) return null;
  // ID video polos (TikTok 15-20 digit / YouTube 11 char) diteruskan apa adanya.
  // Resolvernya memang nerima ID langsung tanpa mengikuti redirect, jadi nggak
  // perlu dipaksa jadi URL — nambah URL palsu cuma buang request.
  if (isBareVideoId(value)) return value;
  if (!/^https?:\/\//i.test(value)) {
    if (!/^[a-z0-9.-]+\.[a-z]{2,}([/?#]|$)/i.test(value)) return null;
    value = "https://" + value;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return value;
  } catch {
    return null;
  }
}

function encode(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const target = normalizeTarget(params.get("url"));
  if (!target) {
    return Response.json({ ok: false, error: "link video tidak valid" }, { status: 400 });
  }

  const limit = limitByIp(request, "find");
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

  const t0 = Date.now();
  recordVisit(request.headers);

  // Link yang barusan dicek: balas langsung. Tidak dihitung sebagai pemeriksaan
  // baru di monitor karena memang tidak ada yang diperiksa ulang.
  const cached = peekRecent(target);
  if (cached) {
    return sseOf([
      ["log", "hasil barusan sudah dicek, langsung ditampilkan"],
      ["result", cached],
    ]);
  }

  const battery = params.has("bat")
    ? normalizeBattery({
        level: Number(params.get("bat")),
        charging: params.get("chg") === "1",
      })
    : undefined;
  void sendLog("search", request.headers, { link: target, battery }).catch(() => {});

  try {
    await acquire();
  } catch (error) {
    return Response.json(
      { ok: false, error: (error as Error).message },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  let child: ReturnType<typeof spawn> | null = null;
  let closed = false;
  let stdout = "";
  let stderrBuffer = "";
  let timer: ReturnType<typeof setTimeout> | null = null;

  const releaseOnce = () => {
    if (closed) return false;
    closed = true;
    if (timer) clearTimeout(timer);
    release();
    return true;
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const push = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encode(event, data)));
        } catch {
          releaseOnce();
        }
      };
      const finish = () => {
        if (!releaseOnce()) return;
        try {
          controller.close();
        } catch {
          /* stream sudah ditutup klien */
        }
      };

      const proc = spawn(process.execPath, [path.join(process.cwd(), "lib", "amfinder.js"), target, "--raw", "--all"], {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      });
      child = proc;

      timer = setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          /* proses sudah mati */
        }
      }, TIMEOUT_MS);

      proc.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        stderrBuffer += chunk.toString();
        let index = stderrBuffer.indexOf("\n");
        while (index >= 0) {
          const line = stderrBuffer.slice(0, index);
          stderrBuffer = stderrBuffer.slice(index + 1);
          const text = line.replace(/^\[[\d.]+s\]\s*/, "").trim();
          if (text) push("log", text);
          index = stderrBuffer.indexOf("\n");
        }
      });

      proc.on("error", (error) => {
        push("error", { message: error.message });
        finish();
      });

      proc.on("close", (code) => {
        if (closed) return;
        let parsed: {
          ok?: boolean;
          error?: string;
          found?: boolean;
          presetLinks?: unknown[];
          videoId?: string;
          videoUrl?: string;
        } | null = null;
        try {
          parsed = JSON.parse(stdout);
        } catch {
          parsed = null;
        }
        if (code !== 0) {
          push("error", { message: parsed?.error || `scraper berhenti dengan kode ${code}` });
          finish();
          return;
        }
        if (!parsed || typeof parsed !== "object") {
          push("error", { message: "keluaran scraper tidak terbaca" });
          finish();
          return;
        }
        recordUrl(request.headers, {
          url: target,
          found: !!parsed.found,
          presets: Array.isArray(parsed.presetLinks) ? parsed.presetLinks.length : 0,
          ms: Date.now() - t0,
        });
        rememberRecent(target, parsed);
        push("result", parsed);
        finish();
      });
    },
    cancel() {
      releaseOnce();
      try {
        child?.kill("SIGKILL");
      } catch {
        /* proses sudah mati */
      }
    },
  });

  request.signal.addEventListener("abort", () => {
    releaseOnce();
    try {
      child?.kill("SIGKILL");
    } catch {
      /* proses sudah mati */
    }
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
