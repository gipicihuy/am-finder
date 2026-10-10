import { searchTiktok } from "../../../lib/ttsearch";
import type { RekomenFeed, RekomenItem, RekomenSource } from "../../../lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Seed pencarian: beberapa gaya preset yang paling sering dicari di TikTok.
// Tiap seed dibatasi waktunya sendiri biar satu engine yang lambat
// gak nahan seluruh feed.
const SEEDS = [
  "preset alight motion velocity",
  "preset alight motion 5mb",
  "preset alight motion aesthetic",
  "preset alight motion transisi",
  "preset alight motion jedag jedug",
];

const SEED_BUDGET_MS = 25_000;
const LIMIT_PER_SEED = 8;
const MAX_ITEMS = 18;
const FEED_TTL_MS = 10 * 60 * 1000;

type RawItem = {
  url?: string;
  handle?: string;
  snippet?: string;
  thumb?: string;
  stats?: { playCount?: number; likeCount?: number };
};

type SeedResult = RekomenSource & { items: RawItem[] };

let feed: RekomenFeed | null = null;
let feedAt = 0;
let building: Promise<RekomenFeed> | null = null;

async function runSeed(query: string, refresh: boolean): Promise<SeedResult> {
  try {
    const res = (await Promise.race([
      searchTiktok(query, { limit: LIMIT_PER_SEED, timeout: 15_000, engine: "auto", refresh }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("seed kehabisan waktu")), SEED_BUDGET_MS),
      ),
    ])) as { items?: RawItem[]; engine?: string };

    const items = Array.isArray(res.items) ? res.items : [];
    return { query, ok: true, count: items.length, engine: res.engine, items };
  } catch (e) {
    return {
      query,
      ok: false,
      count: 0,
      error: e instanceof Error ? e.message : String(e),
      items: [],
    };
  }
}

async function build(refresh: boolean): Promise<RekomenFeed> {
  const results = await Promise.all(SEEDS.map((query) => runSeed(query, refresh)));

  const seen = new Set<string>();
  const items: RekomenItem[] = [];

  for (const result of results) {
    for (const item of result.items) {
      const url = String(item.url || "").trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      items.push({
        url,
        handle: item.handle || undefined,
        snippet: item.snippet || undefined,
        thumb: item.thumb || undefined,
        views: typeof item.stats?.playCount === "number" ? item.stats.playCount : null,
        likes: typeof item.stats?.likeCount === "number" ? item.stats.likeCount : null,
        seed: result.query,
      });
    }
  }

  // Rekomendasi: yang punya thumbnail dulu, lalu yang paling banyak ditonton.
  // Angka views hanya muncul kalau memang disediakan engine — tidak dikarang.
  items.sort((a, b) => {
    const thumbA = a.thumb ? 1 : 0;
    const thumbB = b.thumb ? 1 : 0;
    if (thumbA !== thumbB) return thumbB - thumbA;
    const viewsA = a.views ?? -1;
    const viewsB = b.views ?? -1;
    if (viewsA !== viewsB) return viewsB - viewsA;
    return 0;
  });

  const sources: RekomenSource[] = results.map(({ query, ok, count, engine, error }) => ({
    query,
    ok,
    count,
    engine,
    error,
  }));

  return {
    generatedAt: new Date().toISOString(),
    items: items.slice(0, MAX_ITEMS),
    sources,
  };
}

// Single-flight: request yang datang berbarengan berbagi satu proses build.
async function getFeed(refresh: boolean): Promise<RekomenFeed> {
  if (!refresh && feed && Date.now() - feedAt < FEED_TTL_MS) return feed;
  if (building) return building;

  building = (async () => {
    try {
      const next = await build(refresh);
      feed = next;
      feedAt = Date.now();
      return next;
    } finally {
      building = null;
    }
  })();

  return building;
}

export async function GET(request: Request) {
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";

  try {
    const result = await getFeed(refresh);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 502 });
  }
}
