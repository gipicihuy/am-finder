import type { FindResult } from "@/lib/types";
import { tiktokId, youtubeId } from "@/lib/tiktok-link";

export const HISTORY_KEY = "amfinder:history";
export const HISTORY_UPDATED_EVENT = "amfinder:history-updated";
export const HISTORY_LIMIT = 60;
export const HISTORY_CHIP_LIMIT = 6;

export type HistoryEntry = {
  url: string;
  at: number;
  found: boolean | null;
  presetCount: number;
  title: string;
  author?: string;
  thumb?: string;
  detailPath?: string;
  videoId?: string;
  source?: "tiktok" | "youtube";
};

function legacyEntry(url: string, index = 0): HistoryEntry {
  const ytId = youtubeId(url);
  const ttId = tiktokId(url);
  const source = ytId ? "youtube" : ttId ? "tiktok" : undefined;
  const thumb = ytId ? `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg` : undefined;
  return {
    url,
    at: Date.now() - (index + 1) * 60_000,
    found: null,
    presetCount: 0,
    title: url,
    source,
    thumb,
    videoId: ytId || ttId || undefined,
  };
}

function isEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.url === "string" &&
    entry.url.trim().length > 0 &&
    typeof entry.at === "number" &&
    (entry.found === true || entry.found === false || entry.found === null) &&
    typeof entry.presetCount === "number" &&
    typeof entry.title === "string"
  );
}

export function readHistoryEntries(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .flatMap((item, index) => {
        if (typeof item === "string" && item.trim()) return [legacyEntry(item, index)];
        if (isEntry(item)) {
          // Pulihkan entri lama yang belum memiliki timestamp valid
          if (!item.at || item.at <= 0) {
            item.at = Date.now() - (index + 1) * 60_000;
          }
          // Entri lama dari versi sebelum ini bisa menyimpan detailPath untuk
          // video yang presetnya tidak ketemu. Jangan biarkan itu membuka
          // halaman detail lagi.
          if (item.found === false) item.detailPath = undefined;
          // Backfill thumbnail YouTube bila belum terisi
          if (!item.thumb) {
            const ytId = item.videoId && item.source === "youtube" ? item.videoId : youtubeId(item.url);
            if (ytId) {
              item.thumb = `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg`;
              item.source = "youtube";
            }
          }
          return [item];
        }
        return [];
      })
      .sort((a, b) => b.at - a.at)
      .slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function writeHistoryEntries(entries: HistoryEntry[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, HISTORY_LIMIT)));
    window.dispatchEvent(new Event(HISTORY_UPDATED_EVENT));
  } catch {
    /* riwayat lokal bukan kebutuhan utama */
  }
}

export function rememberHistoryLink(link: string): HistoryEntry[] {
  const url = link.trim();
  if (!url) return readHistoryEntries();
  const previous = readHistoryEntries();
  const existing = previous.find((entry) => entry.url === url);
  const ytId = youtubeId(url);
  const ttId = tiktokId(url);
  const source = ytId ? "youtube" : ttId ? "tiktok" : undefined;
  const fallbackThumb = ytId ? `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg` : existing?.thumb;

  const entry: HistoryEntry = {
    ...(existing ?? { url, found: null, presetCount: 0, title: url }),
    url,
    at: Date.now(),
    source: existing?.source ?? source,
    videoId: existing?.videoId ?? (ytId || ttId || undefined),
    thumb: existing?.thumb ?? fallbackThumb,
  };
  const next = [entry, ...previous.filter((item) => item.url !== url)].slice(0, HISTORY_LIMIT);
  writeHistoryEntries(next);
  return next;
}

function cleanTitle(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/#[^\s#]+/g, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function rememberHistoryResult(
  link: string,
  result: FindResult,
  detailPath?: string | null,
): HistoryEntry[] {
  const url = link.trim();
  if (!url) return readHistoryEntries();
  const previous = readHistoryEntries();
  const existing = previous.find((entry) => entry.url === url);
  const presets = result.presetLinks ?? [];
  const presetCount = presets.length;
  const source = /youtube|youtu\.be/i.test(result.videoUrl ?? "")
    ? "youtube"
    : "tiktok";
  const title =
    cleanTitle(result.video?.description) ||
    (result.author ? `@${result.author.replace(/^@/, "")}` : "") ||
    url;
  const ytId = result.videoId && source === "youtube" ? result.videoId : youtubeId(url);
  const fallbackThumb = ytId ? `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg` : undefined;
  const thumb =
    result.video?.cover ||
    presets.find((preset) => preset.thumb)?.thumb ||
    fallbackThumb ||
    existing?.thumb;

  const found = Boolean(result.found) || presetCount > 0;
  const entry: HistoryEntry = {
    ...(existing ?? {}),
    url,
    at: Date.now(),
    found,
    presetCount,
    title,
    author: result.author || result.authorDetail?.uniqueId || existing?.author,
    thumb,
    detailPath: found
      ? detailPath ||
        existing?.detailPath ||
        (result.videoId ? `/preset/${source}/${result.videoId}` : undefined)
      : undefined,
    videoId: result.videoId || existing?.videoId || ytId || undefined,
    source,
  };
  const next = [entry, ...previous.filter((item) => item.url !== url)].slice(0, HISTORY_LIMIT);
  writeHistoryEntries(next);
  return next;
}

export function clearHistoryEntries() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(HISTORY_KEY);
    window.dispatchEvent(new Event(HISTORY_UPDATED_EVENT));
  } catch {
    /* riwayat lokal bukan kebutuhan utama */
  }
}
