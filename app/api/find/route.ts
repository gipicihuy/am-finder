import { spawn } from "node:child_process";
import path from "node:path";
import { normalizeBattery, sendLog } from "../../../lib/track";
import { limitByIp, tooManyRequests } from "../../../lib/rate-limit";
import { recordUrl, recordVisit } from "../../../lib/monitor";
import { extractVideoUrl, isBareVideoId, videoIdOf } from "../../../lib/tiktok-link";
import { getLocale } from "../../../lib/locale-server";
import { apiText } from "../../../lib/api-text";
import { guardRequest, poisonResponse } from "../../../lib/anti-scrape";

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
  const value = raw.trim().slice(0, 2048);
  if (!value) return null;
  return extractVideoUrl(value);
}

function encode(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function notifyIfWaChannel(row: Record<string, any>, inputUrl: string) {
  const presets = Array.isArray(row.presetLinks) ? (row.presetLinks as Record<string, any>[]) : [];
  const waPresets = presets.filter((p) => p.source === "saluran WA" || p.source === "saluran");
  if (!waPresets.length) return;

  const chInfo = row.channelInfo || {};
  const shareLinks = Array.isArray(row.shareLinks) ? row.shareLinks : [];
  const otherLinks = Array.isArray(row.otherLinks) ? row.otherLinks : [];
  const chUrl =
    chInfo.url ||
    shareLinks.find((s: any) => typeof s.url === "string" && s.url.includes("whatsapp.com/channel/"))?.url ||
    otherLinks.find((s: any) => typeof s.url === "string" && s.url.includes("whatsapp.com/channel/"))?.url ||
    "";
  const chCode = chUrl.match(/whatsapp\.com\/channel\/([A-Za-z0-9_-]+)/)?.[1] || "";
  const chName = chInfo.name || (chCode ? `Saluran ${chCode}` : "Saluran WhatsApp");

  const author = row.author || "-";
  const nickname = row.authorDetail?.nickname || "";
  const music = row.video?.music?.title || "";
  const stats = row.video?.stats;
  const views = stats?.views ? Number(stats.views).toLocaleString("id-ID") : "";
  const likes = stats?.likes ? Number(stats.likes).toLocaleString("id-ID") : "";

  const linksText = waPresets
    .map((p, i) => {
      const type = String(p.type || "").toUpperCase();
      const title = p.title ? ` - *${p.title}*` : "";
      const size = p.size ? ` (${p.size})` : "";
      return `${i + 1}. [${type}] ${p.url}${title}${size}`;
    })
    .join("\n");

  const metaLines = [
    `📢 *[AM-FINDER LOG]*`,
    ``,
    `Berhasil mengambil preset dari *Saluran WhatsApp*!`,
    ``,
    `*📋 METADATA SALURAN:*`,
    `• *Nama Saluran:* ${chName}`,
    chUrl ? `• *Link Saluran:* ${chUrl}` : (chCode ? `• *Kode Saluran:* ${chCode}` : null),
    ``,
    `*🎬 METADATA KREATOR & VIDEO:*`,
    `• *Author:* ${author}${nickname ? ` (${nickname})` : ""}`,
    `• *URL Video:* ${row.videoUrl || inputUrl}`,
    music ? `• *Sound/Musik:* ${music}` : null,
    views ? `• *Statistik:* 👁️ ${views} views | ❤️ ${likes} likes` : null,
    ``,
    `*📦 PRESET DITEMUKAN (${waPresets.length}):*`,
    linksText,
  ]
    .filter((l) => l !== null)
    .join("\n");

  void fetch("http://127.0.0.1:4040/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: metaLines }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => {});
}

export async function GET(request: Request) {
  const locale = await getLocale();
  const guard = guardRequest(request);
  if (!guard.ok) {
    return Response.json(
      { ok: false, error: guard.error },
      { status: guard.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (guard.poison) return poisonResponse("find");

  const params = new URL(request.url).searchParams;
  const target = normalizeTarget(params.get("url"));
  if (!target) {
    return Response.json({ ok: false, error: apiText(locale, "badLink") }, { status: 400 });
  }

  if (!guard.isInternal) {
    const limit = limitByIp(request, "find");
    if (!limit.ok) return tooManyRequests(limit.retryAfterSec, apiText(locale, "tooMany"));
  }

  const t0 = Date.now();
  recordVisit(request.headers);

  // Link yang barusan dicek: balas langsung. Tidak dihitung sebagai pemeriksaan
  // baru di monitor karena memang tidak ada yang diperiksa ulang.
  const cached = peekRecent(target);
  if (cached) {
    notifyIfWaChannel(cached as Record<string, any>, target);
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
  } catch {
    return Response.json(
      { ok: false, error: apiText(locale, "busy") },
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
        push("error", { message: apiText(locale, "scraperExit") });
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
          push("error", { message: apiText(locale, "scraperExit") });
          finish();
          return;
        }
        if (!parsed || typeof parsed !== "object") {
          push("error", { message: apiText(locale, "scraperUnreadable") });
          finish();
          return;
        }
        recordUrl(request.headers, {
          url: target,
          found: !!parsed.found,
          presets: Array.isArray(parsed.presetLinks) ? parsed.presetLinks.length : 0,
          ms: Date.now() - t0,
        });
        notifyIfWaChannel((parsed || {}) as Record<string, any>, target);
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
