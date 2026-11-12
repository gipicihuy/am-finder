export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 jam
const MAX_CACHE_ENTRIES = 500;

type CacheEntry = {
  buffer: Uint8Array;
  contentType: string;
  expiresAt: number;
};

// Cache in-memory server agar avatar yang sama tidak diambil berulang-ulang
// dari CDN TikTok, sekaligus mengatasi URL TikTok yang bertanda tangan/kedaluwarsa.
const avatarCache = new Map<string, CacheEntry>();

function isAllowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h.endsWith(".tiktokcdn.com") ||
    h === "tiktokcdn.com" ||
    h.endsWith(".tiktokcdn-eu.com") ||
    h === "tiktokcdn-eu.com" ||
    h.endsWith(".tiktokcdn-us.com") ||
    h === "tiktokcdn-us.com" ||
    h.endsWith(".byteoversea.com") ||
    h === "byteoversea.com" ||
    h.endsWith(".ibytedtos.com") ||
    h === "ibytedtos.com" ||
    h.endsWith(".tiktok.com") ||
    h === "tiktok.com" ||
    h.endsWith(".tikwm.com") ||
    h === "tikwm.com"
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const target = (searchParams.get("u") || "").trim();

  if (!target) {
    return new Response("Missing u parameter", { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response("Invalid URL", { status: 400 });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return new Response("Invalid protocol", { status: 400 });
  }

  if (!isAllowedHost(parsed.hostname)) {
    return new Response("Forbidden host", { status: 403 });
  }

  // Cek cache in-memory
  const now = Date.now();
  const cached = avatarCache.get(target);
  if (cached && cached.expiresAt > now) {
    return new Response(cached.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": cached.contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
        "Content-Length": String(cached.buffer.byteLength),
      },
    });
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        Referer: "https://www.tiktok.com/",
      },
      signal: AbortSignal.timeout(7000),
    });

    if (!upstream.ok) {
      return new Response("Upstream error", {
        status: upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502,
      });
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return new Response("Not an image", { status: 400 });
    }

    const contentLengthHeader = upstream.headers.get("content-length");
    if (contentLengthHeader && Number(contentLengthHeader) > MAX_AVATAR_BYTES) {
      return new Response("Image too large", { status: 413 });
    }

    const arrayBuf = await upstream.arrayBuffer();
    if (arrayBuf.byteLength > MAX_AVATAR_BYTES) {
      return new Response("Image too large", { status: 413 });
    }

    const buffer = new Uint8Array(arrayBuf);

    // Simpan ke cache memory
    if (avatarCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = avatarCache.keys().next().value;
      if (oldestKey) avatarCache.delete(oldestKey);
    }
    avatarCache.set(target, {
      buffer,
      contentType,
      expiresAt: now + CACHE_TTL_MS,
    });

    return new Response(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch {
    return new Response("Failed to fetch avatar", { status: 502 });
  }
}
