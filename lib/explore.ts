import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ExplorePresetItem } from "./types";

const CACHE_FILE = path.join(process.cwd(), "lib", "amfinder.cache.json");

type CachedPresetEntry = {
  t?: number;
  v?: {
    found?: boolean;
    videoId?: string;
    videoUrl?: string;
    author?: string;
    presetLinks?: Array<{
      type?: string;
      title?: string;
      thumb?: string;
      thumbs?: string[];
    }>;
    video?: {
      title?: string;
      description?: string;
      cover?: string;
      stats?: {
        views?: number;
        likes?: number;
      };
    };
    authorDetail?: {
      nickname?: string;
      uniqueId?: string;
    };
  };
};

let cachedExplore: { key: string; items: ExplorePresetItem[] } | null = null;

export async function getExplorePresets(limit = 36): Promise<ExplorePresetItem[]> {
  try {
    const fileStat = await stat(CACHE_FILE);
    const key = `${fileStat.mtimeMs}:${fileStat.size}:${limit}`;
    if (cachedExplore?.key === key) {
      return cachedExplore.items;
    }

    const raw = await readFile(CACHE_FILE, "utf8");
    const data = JSON.parse(raw) as Record<string, CachedPresetEntry>;

    const items: ExplorePresetItem[] = [];
    const seenIds = new Set<string>();
    const seenUrls = new Set<string>();
    const authorCounts = new Map<string, number>();

    for (const entry of Object.values(data)) {
      const v = entry?.v;
      if (!v || !v.found || !Array.isArray(v.presetLinks) || v.presetLinks.length === 0) continue;

      const videoId =
        v.videoId ||
        (typeof v.videoUrl === "string" ? v.videoUrl.match(/video\/(\d+)/)?.[1] : null);
      if (!videoId || seenIds.has(videoId)) continue;

      const authorRaw =
        v.author || v.authorDetail?.nickname || v.authorDetail?.uniqueId || "";
      const author = authorRaw.startsWith("@")
        ? authorRaw
        : authorRaw
          ? `@${authorRaw}`
          : "";

      // Batasi maksimal 2 video per author agar variasinya kaya
      const currentAuthorCount = authorCounts.get(author) || 0;
      if (currentAuthorCount >= 2) continue;

      const url =
        v.videoUrl ||
        `https://www.tiktok.com/@${(v.author || "user").replace(/^@/, "")}/video/${videoId}`;
      if (seenUrls.has(url)) continue;

      const thumb =
        v.video?.cover ||
        v.presetLinks[0]?.thumb ||
        v.presetLinks[0]?.thumbs?.[0];
      if (!thumb || typeof thumb !== "string" || !thumb.startsWith("http")) continue;

      let title = (
        v.presetLinks[0]?.title ||
        v.video?.title ||
        v.video?.description ||
        ""
      )
        .trim()
        .replace(/\s+/g, " ");
      if (!title || title.length < 3) title = "Preset Alight Motion";

      seenIds.add(videoId);
      seenUrls.add(url);
      authorCounts.set(author, currentAuthorCount + 1);

      const isYt = url.includes("youtube.com") || url.includes("youtu.be");
      const platform: "TikTok" | "YouTube" = isYt ? "YouTube" : "TikTok";
      const presetType = v.presetLinks[0]?.type || "5mb";
      const presetCount = v.presetLinks.length;
      const views =
        typeof v.video?.stats?.views === "number" ? v.video.stats.views : null;
      const likes =
        typeof v.video?.stats?.likes === "number" ? v.video.stats.likes : null;

      items.push({
        id: videoId,
        url,
        title: title.slice(0, 75),
        author,
        thumb,
        platform,
        presetType,
        presetCount,
        views,
        likes,
      });
    }

    // Urutkan berdasarkan views terbanyak, lalu likes
    items.sort((a, b) => {
      const viewsA = a.views ?? 0;
      const viewsB = b.views ?? 0;
      if (viewsA !== viewsB) return viewsB - viewsA;
      return (b.likes ?? 0) - (a.likes ?? 0);
    });

    const result = items.slice(0, limit);
    cachedExplore = { key, items: result };
    return result;
  } catch {
    return [];
  }
}
