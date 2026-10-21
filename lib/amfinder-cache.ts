import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { cleanSoundTitle, soundUrl } from "./audio";

const CACHE_FILE = path.join(process.cwd(), "lib", "amfinder.cache.json");

type CacheEntry = {
  t?: unknown;
  ttl?: unknown;
  v?: {
    video?: {
      music?: {
        title?: unknown;
        playUrl?: unknown;
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

export type CachedSound = { title: string; playUrl: string };

/**
 * Ambil sound dari cache hasil /api/find. Tidak pernah scraping dan tidak
 * menerima URL dari klien. Null kalau video belum pernah dicek, cache sudah
 * kedaluwarsa, atau URL audionya tidak lolos allowlist.
 */
export async function cachedSoundForVideo(videoId: string): Promise<CachedSound | null> {
  const data = await loadCache();
  if (!data) return null;

  const entry =
    data[`video:v10:${videoId}:all`] ??
    data[`video:v10:${videoId}`] ??
    Object.entries(data).find(([key]) => key.endsWith(`:${videoId}:all`))?.[1];
  if (!entry || typeof entry.t !== "number") return null;

  const ttl = typeof entry.ttl === "number" ? entry.ttl : 3600;
  if (Date.now() - entry.t >= ttl * 1000) return null;

  const music = entry.v?.video?.music;
  if (!music || typeof music.playUrl !== "string") return null;

  const playUrl = soundUrl(music.playUrl);
  if (!playUrl) return null;

  return {
    title: cleanSoundTitle(music.title, 80),
    playUrl,
  };
}
