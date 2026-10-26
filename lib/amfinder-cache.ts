import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { cleanSoundTitle, soundUrl } from "./audio";

const CACHE_FILE = path.join(process.cwd(), "lib", "amfinder.cache.json");

type CacheEntry = {
  t?: unknown;
  ttl?: unknown;
  v?: {
    video?: {
      description?: unknown;
      playUrl?: unknown;
      playUrlNoWm?: unknown;
      music?: {
        title?: unknown;
        playUrl?: unknown;
        original?: unknown;
      } | null;
    } | null;
  } | null;
};

type CacheFile = Record<string, CacheEntry>;

// Baca file cache cuma kalau berubah. File ditulis ulang lewat rename oleh
// scraper, jadi mtime + ukuran cukup buat mendeteksi versi baru.
let loaded: { key: string; data: CacheFile } | null = null;

async function loadCache(): Promise<CacheFile | null> {
  try {
    const info = await stat(CACHE_FILE);
    const key = `${info.mtimeMs}:${info.size}`;
    if (loaded?.key === key) return loaded.data;
    const parsed: unknown = JSON.parse(await readFile(CACHE_FILE, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const data = parsed as CacheFile;
    loaded = { key, data };
    return data;
  } catch {
    return null;
  }
}

export type CachedSound = {
  title: string;
  playUrl: string;
  original: boolean;
  videoPlayUrl: string | null;
};

/**
 * Ambil sound dari cache hasil /api/find atau live fallback jika belum ada/kedaluwarsa.
 * Prioritas selalu mengembalikan `videoPlayUrl` agar audio bisa diekstrak langsung
 * dari video aktual TikTok.
 */
export async function cachedSoundForVideo(videoId: string): Promise<CachedSound | null> {
  const data = await loadCache();
  if (data) {
    const entry =
      data[`video:v10:${videoId}:all`] ??
      data[`video:v10:${videoId}`] ??
      Object.entries(data).find(([key]) => key.endsWith(`:${videoId}:all`))?.[1];

    if (entry && typeof entry.t === "number") {
      const ttl = typeof entry.ttl === "number" ? entry.ttl : 3600;
      if (Date.now() - entry.t < ttl * 1000) {
        const video = entry.v?.video;
        const music = video?.music;
        const videoPlayUrl =
          soundUrl(video?.playUrlNoWm) || soundUrl(video?.playUrl) || null;
        const musicPlayUrl =
          typeof music?.playUrl === "string" ? soundUrl(music.playUrl) : null;

        if (videoPlayUrl || musicPlayUrl) {
          const rawTitle =
            (typeof music?.title === "string" && music.title) ||
            (typeof video?.description === "string" && video.description) ||
            `sound-${videoId}`;

          return {
            title: cleanSoundTitle(rawTitle, 80),
            playUrl: musicPlayUrl || videoPlayUrl || "",
            original: music?.original === true,
            videoPlayUrl,
          };
        }
      }
    }
  }

  // Fallback on-demand via TikWM jika cache belum ada atau URL CDN di cache kedaluwarsa
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`https://tikwm.com/api/?url=https://www.tiktok.com/@/video/${videoId}`, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        Referer: "https://tikwm.com/",
      },
    });
    clearTimeout(timer);

    if (res.ok) {
      const json = (await res.json().catch(() => null)) as
        | {
            code?: number;
            data?: {
              play?: string;
              title?: string;
              music_info?: { title?: string; play?: string; original?: boolean };
            };
          }
        | null;

      if (json?.code === 0 && json.data) {
        const d = json.data;
        const videoPlayUrl = soundUrl(d.play);
        const musicPlayUrl = soundUrl(d.music_info?.play);

        if (videoPlayUrl || musicPlayUrl) {
          const rawTitle = d.music_info?.title || d.title || `sound-${videoId}`;
          return {
            title: cleanSoundTitle(rawTitle, 80),
            playUrl: musicPlayUrl || videoPlayUrl || "",
            original: d.music_info?.original === true,
            videoPlayUrl,
          };
        }
      }
    }
  } catch {
    // Abaikan kegagalan fallback on-demand
  }

  return null;
}
