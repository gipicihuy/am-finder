// Aturan URL audio/sampul sound. Dipakai klien (biar tombol tidak membuka link
// aneh) dan server (biar endpoint unduhan tidak bisa dipakai sebagai proxy).
const SOUND_HOSTS = [
  "tiktokcdn.com",
  "tiktokcdn-us.com",
  "tiktokcdn-eu.com",
  "tiktokv.com",
  "tikwm.com",
] as const;

function allowedHost(host: string): boolean {
  return SOUND_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/** URL HTTPS yang host-nya dikenal sebagai CDN audio/sampul sound. */
export function parseSoundUrl(raw: unknown): URL | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (url.port && url.port !== "443") return null;
    if (!allowedHost(url.hostname.toLowerCase())) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * URL audio/sampul yang masih berlaku. `VExpiration` dipakai URL audio TikTok,
 * `x-expires` dipakai sampul. Kalau kedaluwarsa, biar UI pakai fallback.
 */
export function soundUrl(raw: unknown): string | null {
  const url = parseSoundUrl(raw);
  if (!url) return null;
  const expires = Number(
    url.searchParams.get("VExpiration") || url.searchParams.get("x-expires") || 0,
  );
  if (Number.isFinite(expires) && expires > 0 && expires * 1000 <= Date.now() + 60_000) {
    return null;
  }
  return url.toString();
}

export const soundCoverUrl = soundUrl;

/**
 * TikTok kadang mengirim MP3 dengan `Content-Type: video/mp4` atau
 * `application/octet-stream`. Terima header non-audio itu hanya kalau isi
 * awalnya benar-benar file audio, lalu normalisasi MIME-nya.
 */
export function resolveAudioMime(contentType: string, sample: Uint8Array): string | null {
  const mime = contentType.split(";")[0].trim().toLowerCase();
  if (mime.startsWith("audio/")) return mime;
  if (
    mime !== "video/mp4" &&
    mime !== "application/octet-stream" &&
    mime !== "binary/octet-stream"
  ) {
    return null;
  }
  if (sample.length >= 3 && sample[0] === 0x49 && sample[1] === 0x44 && sample[2] === 0x33) {
    return "audio/mpeg";
  }
  if (sample.length >= 4 && sample[0] === 0x4f && sample[1] === 0x67 && sample[2] === 0x67 && sample[3] === 0x53) {
    return "audio/ogg";
  }
  if (sample.length >= 4 && sample[0] === 0x66 && sample[1] === 0x4c && sample[2] === 0x61 && sample[3] === 0x43) {
    return "audio/flac";
  }
  if (
    sample.length >= 12 &&
    sample[0] === 0x52 &&
    sample[1] === 0x49 &&
    sample[2] === 0x46 &&
    sample[3] === 0x46 &&
    sample[8] === 0x57 &&
    sample[9] === 0x41 &&
    sample[10] === 0x56 &&
    sample[11] === 0x45
  ) {
    return "audio/wav";
  }
  if (sample.length >= 2 && sample[0] === 0xff && (sample[1] & 0xe0) === 0xe0) {
    return (sample[1] & 0xf6) === 0xf0 ? "audio/aac" : "audio/mpeg";
  }
  return null;
}

/** Judul sound yang aman untuk nama file (bukan untuk ditampilkan). */
export function cleanSoundTitle(raw: unknown, max = 80): string {
  if (typeof raw !== "string") return "";
  return raw
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function extensionOf(contentType: string): string {
  const mime = contentType.split(";")[0].trim().toLowerCase();
  if (mime === "audio/mp4" || mime === "audio/m4a" || mime === "audio/x-m4a") return ".m4a";
  if (mime === "audio/aac") return ".aac";
  if (mime === "audio/ogg") return ".ogg";
  if (mime === "audio/wav" || mime === "audio/x-wav") return ".wav";
  if (mime === "audio/flac" || mime === "audio/x-flac") return ".flac";
  return ".mp3";
}

/** Nama file unduhan dari judul sound, sudah dibersihkan dan berekstensi cocok. */
export function soundFileName(title: unknown, videoId: string, contentType: string): string {
  const ext = extensionOf(contentType);
  let base = cleanSoundTitle(title, 80)
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .replace(/\.(mp3|m4a|aac|ogg|wav)$/i, "")
    .trim();
  if (!base) base = `sound-${videoId}`;
  return `${base}${ext}`;
}

/** Header attachment dengan fallback ASCII + filename* UTF-8. */
export function contentDisposition(name: string, fallback: string): string {
  const safeFallback = fallback.replace(/[^\w.-]/g, "_").slice(0, 120) || "sound.mp3";
  let encoded: string;
  try {
    encoded = encodeURIComponent(name);
  } catch {
    // Judul bisa saja mengandung lone surrogate; jangan sampai bikin 500.
    encoded = encodeURIComponent(safeFallback);
  }
  encoded = encoded.replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${safeFallback}"; filename*=UTF-8''${encoded}`;
}
