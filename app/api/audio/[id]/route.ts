import { cachedSoundForVideo } from "@/lib/amfinder-cache";
import {
  contentDisposition,
  parseSoundUrl,
  resolveAudioMime,
  soundFileName,
  soundUrl,
} from "@/lib/audio";
import { clientIp } from "@/lib/ip";
import { limitByIp, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const HEADER_TIMEOUT_MS = 12_000;
const TOTAL_TIMEOUT_MS = 90_000;

const MAX_ACTIVE = 3;
const MAX_QUEUE = 4;
const QUEUE_WAIT_MS = 15_000;

const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

function audioError(status: number, error: string, retryAfter?: number): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (retryAfter) headers.set("Retry-After", String(retryAfter));
  return Response.json({ ok: false, error }, { status, headers });
}

type Waiter = {
  ip: string;
  signal: AbortSignal;
  resolve: () => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
  onAbort: () => void;
};

let active = 0;
const activeIps = new Set<string>();
const queuedIps = new Set<string>();
const waiters: Waiter[] = [];

function removeWaiter(w: Waiter) {
  const index = waiters.indexOf(w);
  if (index >= 0) waiters.splice(index, 1);
  queuedIps.delete(w.ip);
  if (w.timer) clearTimeout(w.timer);
  w.signal.removeEventListener("abort", w.onAbort);
}

function drain() {
  while (active < MAX_ACTIVE) {
    const w = waiters.shift();
    if (!w) return;
    queuedIps.delete(w.ip);
    if (w.timer) clearTimeout(w.timer);
    w.signal.removeEventListener("abort", w.onAbort);
    if (w.signal.aborted) {
      w.reject(new Error("aborted"));
      continue;
    }
    if (activeIps.has(w.ip)) {
      w.reject(new Error("busy-ip"));
      continue;
    }
    active += 1;
    activeIps.add(w.ip);
    w.resolve();
  }
}

function acquire(ip: string, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error("aborted"));
  if (activeIps.has(ip)) return Promise.reject(new Error("busy-ip"));
  if (active < MAX_ACTIVE) {
    active += 1;
    activeIps.add(ip);
    return Promise.resolve();
  }
  if (waiters.length >= MAX_QUEUE || queuedIps.has(ip)) {
    return Promise.reject(new Error("busy"));
  }
  return new Promise<void>((resolve, reject) => {
    const w: Waiter = {
      ip,
      signal,
      resolve,
      reject,
      timer: null,
      onAbort: () => {},
    };
    w.timer = setTimeout(() => {
      removeWaiter(w);
      reject(new Error("timeout"));
    }, QUEUE_WAIT_MS);
    w.onAbort = () => {
      removeWaiter(w);
      reject(new Error("aborted"));
    };
    signal.addEventListener("abort", w.onAbort, { once: true });
    waiters.push(w);
    queuedIps.add(ip);
  });
}

function release(ip: string) {
  if (activeIps.delete(ip)) active = Math.max(0, active - 1);
  drain();
}

async function fetchUpstream(initial: URL, signal: AbortSignal): Promise<Response> {
  let current = initial;
  for (let redirects = 0; ; redirects += 1) {
    const res = await fetch(current, {
      method: "GET",
      redirect: "manual",
      signal,
      cache: "no-store",
      headers: {
        Accept: "audio/*",
        "User-Agent": UA,
      },
    });
    if (res.status < 300 || res.status >= 400) return res;

    if (redirects >= MAX_REDIRECTS) {
      await res.body?.cancel().catch(() => {});
      throw new Error("redirect");
    }
    const location = res.headers.get("location");
    await res.body?.cancel().catch(() => {});
    if (!location) throw new Error("redirect");

    // Setiap hop wajib HTTPS + host allowlist. Jangan pernah meneruskan URL
    // mentah dari klien ke fetch ini.
    const next = soundUrl(new URL(location, current).toString());
    if (!next) throw new Error("redirect");
    current = new URL(next);
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!/^\d{15,20}$/.test(id)) {
    return audioError(400, "ID video tidak valid");
  }

  const limit = limitByIp(request, "audio");
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

  const sound = await cachedSoundForVideo(id);
  if (!sound) {
    return audioError(404, "Audio tidak tersedia atau link sudah kedaluwarsa");
  }

  const ip = clientIp(request.headers) || "-";
  try {
    await acquire(ip, request.signal);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    if (reason === "busy-ip") {
      return audioError(429, "Masih ada unduhan berjalan, coba lagi", 5);
    }
    if (reason === "aborted") return audioError(408, "Permintaan dibatalkan");
    return audioError(503, "Server sedang sibuk, coba lagi sebentar", 10);
  }

  let finished = false;
  const abortCtrl = new AbortController();
  const onRequestAbort = () => abortCtrl.abort();
  request.signal.addEventListener("abort", onRequestAbort, { once: true });
  const totalTimer = setTimeout(() => abortCtrl.abort(), TOTAL_TIMEOUT_MS);
  let headerTimer: ReturnType<typeof setTimeout> | null = setTimeout(
    () => abortCtrl.abort(),
    HEADER_TIMEOUT_MS,
  );

  const cleanup = () => {
    if (finished) return;
    finished = true;
    if (headerTimer) clearTimeout(headerTimer);
    clearTimeout(totalTimer);
    request.signal.removeEventListener("abort", onRequestAbort);
    release(ip);
  };

  const initial = parseSoundUrl(sound.playUrl);
  if (!initial) {
    cleanup();
    return audioError(404, "Audio tidak tersedia atau link sudah kedaluwarsa");
  }

  let upstream: Response;
  try {
    upstream = await fetchUpstream(initial, abortCtrl.signal);
  } catch {
    cleanup();
    return audioError(502, "Gagal mengambil audio dari sumber, coba lagi");
  }
  if (headerTimer) {
    clearTimeout(headerTimer);
    headerTimer = null;
  }

  if (!upstream.ok || !upstream.body) {
    await upstream.body?.cancel().catch(() => {});
    cleanup();
    return audioError(502, "Sumber audio menolak permintaan, coba lagi");
  }

  const typeHeader = upstream.headers.get("content-type") || "";

  const lengthHeader = upstream.headers.get("content-length");
  const length = lengthHeader ? Number(lengthHeader) : null;
  if (length !== null && Number.isFinite(length) && length > MAX_BYTES) {
    await upstream.body.cancel().catch(() => {});
    cleanup();
    return audioError(413, "File audio terlalu besar");
  }

  const reader = upstream.body.getReader();
  let firstChunk: Uint8Array;
  try {
    const first = await reader.read();
    if (first.done) {
      cleanup();
      return audioError(415, "Sumber bukan file audio");
    }
    firstChunk = first.value;
  } catch {
    await reader.cancel().catch(() => {});
    cleanup();
    return audioError(502, "Gagal membaca audio dari sumber, coba lagi");
  }

  const type = resolveAudioMime(typeHeader, firstChunk);
  if (!type) {
    await reader.cancel().catch(() => {});
    cleanup();
    return audioError(415, "Sumber bukan file audio");
  }

  const fileName = soundFileName(sound.title, id, type);
  const fallbackName = soundFileName("", id, type);
  const headers = new Headers({
    "Content-Type": type,
    "Content-Disposition": contentDisposition(fileName, fallbackName),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "none",
  });

  const encoding = upstream.headers.get("content-encoding");
  if (
    length !== null &&
    Number.isFinite(length) &&
    length > 0 &&
    length <= MAX_BYTES &&
    (!encoding || encoding === "identity")
  ) {
    headers.set("Content-Length", String(length));
  }

  let sent = 0;
  let pending: Uint8Array | null = firstChunk;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        let value: Uint8Array;
        if (pending !== null) {
          value = pending;
          pending = null;
        } else {
          const next = await reader.read();
          if (next.done) {
            controller.close();
            cleanup();
            return;
          }
          value = next.value;
        }
        sent += value.byteLength;
        if (sent > MAX_BYTES) {
          try {
            controller.error(new Error("file terlalu besar"));
          } catch {
            /* stream sudah ditutup */
          }
          await reader.cancel().catch(() => {});
          abortCtrl.abort();
          cleanup();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        try {
          controller.error(error);
        } catch {
          /* stream sudah ditutup */
        }
        abortCtrl.abort();
        cleanup();
      }
    },
    cancel(reason) {
      void reader.cancel(reason).catch(() => {});
      abortCtrl.abort();
      cleanup();
    },
  });

  return new Response(stream, { status: 200, headers });
}
