// Autosuggest Google sebagai pelengkap index lokal.
// Endpoint ini tidak resmi dan bisa berubah/diblokir; semua kegagalan harus
// fail-open supaya autocomplete tetap jalan dari data lokal.
const ENDPOINT = "https://suggestqueries.google.com/complete/search";
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 500;
const TIMEOUT_MS = 1200;

type CacheItem = { at: number; items: string[] };

const cache = new Map<string, CacheItem>();
const inflight = new Map<string, Promise<string[]>>();

function enabled(): boolean {
  return (process.env.SUGGEST_REMOTE || "google").toLowerCase() !== "off";
}

async function fetchGoogle(query: string): Promise<string[]> {
  const url = `${ENDPOINT}?client=firefox&hl=id&gl=id&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "application/json, text/javascript, */*; q=0.1",
      "Accept-Language": "id-ID,id;q=0.9,en;q=0.5",
    },
  });
  if (!response.ok) return [];
  const text = await response.text();
  try {
    const data = JSON.parse(text) as unknown;
    if (!Array.isArray(data) || !Array.isArray(data[1])) return [];
    return data[1].filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

/** Saran dari Google (hl=id), di-cache 10 menit per query. */
export async function remoteSuggest(query: string): Promise<string[]> {
  const key = query.trim().toLowerCase();
  if (!enabled() || key.length < 3) return [];

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items;

  const pending = inflight.get(key);
  if (pending) return pending;

  const task = fetchGoogle(key)
    .then((items) => {
      cache.set(key, { at: Date.now(), items });
      if (cache.size > CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
      }
      return items;
    })
    .catch(() => [])
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, task);
  return task;
}
