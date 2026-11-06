import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { extractVideoUrl, videoIdOf } from "./tiktok-link";

/**
 * Logika bersama untuk menjalankan `lib/amfinder.js`.
 *
 * Dipakai oleh:
 * - `app/api/find/route.ts` (web, SSE)
 * - `app/api/search/route.ts` (web, per-video)
 * - `app/api/public/v1/find/route.ts` (API publik, JSON)
 *
 * Jadi cuma ada satu implementasi spawn + parsing + timeout + antrian.
 */

export type FindRow = Record<string, unknown> & {
  ok?: boolean;
  found?: boolean;
  error?: string;
};

export type FindFailureKind = "spawn" | "timeout" | "exit" | "unreadable" | "abort";

export type FindRunResult =
  | { ok: true; row: FindRow }
  | { ok: false; kind: FindFailureKind; error: string };

export const FIND_TIMEOUT_MS = 150_000;
export const FIND_MAX_ACTIVE = 3;
export const FIND_MAX_QUEUE = 8;

// ---------------------------------------------------------------------------
// Cache hasil yang barusan dicek (dipakai web & API publik)
// ---------------------------------------------------------------------------

const RECENT_TTL_MS = 10 * 60_000;
const RECENT_MAX = 400;

type RecentEntry = { at: number; row: FindRow };

type CoreState = {
  recent: Map<string, RecentEntry>;
  active: number;
  waiting: Array<() => void>;
};

function core(): CoreState {
  const g = globalThis as typeof globalThis & { __amFindCore?: CoreState };
  if (!g.__amFindCore) {
    g.__amFindCore = { recent: new Map(), active: 0, waiting: [] };
  }
  return g.__amFindCore;
}

function recentKey(target: string): string {
  return target.replace(/\/+$/, "").toLowerCase();
}

function recentKeys(target: string, row?: FindRow): string[] {
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

export function peekRecent(target: string): FindRow | null {
  const s = core();
  const now = Date.now();
  for (const key of recentKeys(target)) {
    const hit = s.recent.get(key);
    if (!hit) continue;
    if (now - hit.at > RECENT_TTL_MS) {
      s.recent.delete(key);
      continue;
    }
    return hit.row;
  }
  return null;
}

export function rememberRecent(target: string, row: FindRow): void {
  const s = core();
  const at = Date.now();
  for (const key of recentKeys(target, row)) {
    s.recent.delete(key);
    s.recent.set(key, { at, row });
  }
  while (s.recent.size > RECENT_MAX) {
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [key, value] of s.recent) {
      if (value.at < oldestAt) {
        oldestAt = value.at;
        oldestKey = key;
      }
    }
    if (oldestKey === null) break;
    s.recent.delete(oldestKey);
  }
}

// ---------------------------------------------------------------------------
// Antrian proses scraper
// ---------------------------------------------------------------------------

export function acquireFindSlot(): Promise<void> {
  const s = core();
  if (s.active < FIND_MAX_ACTIVE) {
    s.active += 1;
    return Promise.resolve();
  }
  if (s.waiting.length >= FIND_MAX_QUEUE) {
    return Promise.reject(new Error("server lagi penuh, coba lagi beberapa saat lagi"));
  }
  return new Promise((resolve) => s.waiting.push(resolve));
}

export function releaseFindSlot(): void {
  const s = core();
  const next = s.waiting.shift();
  if (next) next();
  else s.active = Math.max(0, s.active - 1);
}

// ---------------------------------------------------------------------------
// Normalisasi input
// ---------------------------------------------------------------------------

export function normalizeTarget(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim().slice(0, 2048);
  if (!value) return null;
  return extractVideoUrl(value);
}

// ---------------------------------------------------------------------------
// Jalankan scraper
// ---------------------------------------------------------------------------

export type RunFindOptions = {
  timeoutMs?: number;
  onLog?: (line: string) => void;
  onSpawn?: (child: ChildProcess) => void;
  signal?: AbortSignal;
};

export function runFindProcess(
  target: string,
  options: RunFindOptions = {},
): Promise<FindRunResult> {
  const timeoutMs = options.timeoutMs ?? FIND_TIMEOUT_MS;
  const { onLog, onSpawn, signal } = options;

  return new Promise<FindRunResult>((resolve) => {
    let settled = false;
    let child: ChildProcess | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let timeoutGuard: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;
    let aborted = false;
    let stdout = "";
    let stderrBuffer = "";

    const done = (result: FindRunResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (timeoutGuard) clearTimeout(timeoutGuard);
      signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };

    const kill = () => {
      try {
        child?.kill("SIGKILL");
      } catch {
        /* proses sudah mati */
      }
    };

    const onAbort = () => {
      aborted = true;
      kill();
    };

    if (signal?.aborted) {
      done({ ok: false, kind: "abort", error: "permintaan dibatalkan" });
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      child = spawn(
        process.execPath,
        [path.join(process.cwd(), "lib", "amfinder.js"), target, "--raw", "--all"],
        { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
      );
      onSpawn?.(child);
    } catch (error) {
      done({
        ok: false,
        kind: "spawn",
        error: error instanceof Error ? error.message : "gagal menjalankan scraper",
      });
      return;
    }

    timer = setTimeout(() => {
      timedOut = true;
      kill();
      // Jaga-jaga kalau proses tidak mau menutup setelah SIGKILL.
      timeoutGuard = setTimeout(() => {
        done({ ok: false, kind: "timeout", error: "scraper melebihi batas waktu" });
      }, 2_000);
      timeoutGuard.unref?.();
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
      let index = stderrBuffer.indexOf("\n");
      while (index >= 0) {
        const line = stderrBuffer.slice(0, index);
        stderrBuffer = stderrBuffer.slice(index + 1);
        const text = line.replace(/^\[[\d.]+s\]\s*/, "").trim();
        if (text) {
          try {
            onLog?.(text);
          } catch {
            /* callback log tidak boleh menggagalkan proses */
          }
        }
        index = stderrBuffer.indexOf("\n");
      }
    });

    child.on("error", (error) => {
      done({ ok: false, kind: "spawn", error: error.message });
    });

    child.on("close", (code) => {
      if (settled) return;
      if (aborted) {
        done({ ok: false, kind: "abort", error: "permintaan dibatalkan" });
        return;
      }
      if (timedOut) {
        done({ ok: false, kind: "timeout", error: "scraper melebihi batas waktu" });
        return;
      }
      if (code !== 0) {
        const tail = stderrBuffer.trim().split("\n").pop();
        done({ ok: false, kind: "exit", error: (tail || "scraper berhenti").slice(0, 200) });
        return;
      }

      // Scraper menulis JSON ke stdout. Ambil dari kurung kurawal pertama biar
      // aman kalau ada baris lain yang ikut tercetak.
      const jsonStart = stdout.indexOf("{");
      if (jsonStart < 0) {
        done({ ok: false, kind: "unreadable", error: "output scraper tidak terbaca" });
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(stdout.slice(jsonStart));
      } catch {
        done({ ok: false, kind: "unreadable", error: "JSON scraper tidak valid" });
        return;
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        done({ ok: false, kind: "unreadable", error: "output scraper tidak valid" });
        return;
      }
      done({ ok: true, row: parsed as FindRow });
    });
  });
}
