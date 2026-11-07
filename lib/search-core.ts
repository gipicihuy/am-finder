import { searchTiktok, setLog } from "./ttsearch";

export const SEARCH_BUDGET_MS = 40_000;
// Jumlah kandidat di mode=pick. Aman buat dikecilin/dibesarkan: di mode ini
// backend cuma nyari daftar, scraping baru jalan saat user pilih satu video.
// Dibatesin 30 karena tiap +30 kandidat = +1 request ke tikwm, kuotanya
// cuma 10.000 request/hari.
export const CANDIDATE_LIMIT = 30;

// logSink di ttsearch.js global — fase pencarian dijalankan antri biar
// log SSE dari dua request gak saling nyampur.
let searchChain: Promise<unknown> = Promise.resolve();
export function withSearchLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = searchChain.then(fn, fn);
  searchChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function normalizeQuery(raw: string | null): string | null {
  if (!raw) return null;
  const q = raw.trim().replace(/\s+/g, " ").slice(0, 100);
  if (q.length < 3) return null;
  return q;
}

// Prefix pencarian tersembunyi: user cukup ketik keyword (mis. "sesi potret"),
// backend yang nambahin "preset am" biar hasilnya relevan sama preset AM.
// Prefix ini TIDAK dikirim balik ke klien — cuma dipakai buat pencarian.
export const QUERY_PREFIX = "preset am";

export type Candidate = {
  url: string;
  handle?: string;
  kind?: string;
  snippet?: string;
  thumb?: string;
  thumbFallback?: string;
};

export type SearchResult = {
  items: Candidate[];
  engine?: string;
  fromCache?: boolean;
};

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Ranking relevansi: caption yang memuat frasa utuh judul yang diketik user
// diunggulkan, lalu yang cocok per kata. Kandidat yang gak cocok sama sekali
// tetap dikirim tapi nempel di belakang — biar hasil sesuai ekspektasi judul.
export function scoreCandidate(snippet: string | undefined, queryNorm: string): number {
  const text = normalizeText(snippet ?? "");
  if (!text || !queryNorm) return 0;
  let score = 0;
  if (text.includes(queryNorm)) score += 100;
  const padded = ` ${text} `;
  const tokens = queryNorm.split(" ").filter(t => t.length >= 2);
  let hits = 0;
  for (const token of tokens) {
    if (padded.includes(` ${token}`)) hits += 1;
  }
  if (hits > 0) score += hits * 20;
  if (tokens.length > 0 && hits === tokens.length) score += 40;
  return score;
}

// Kata kunci penanda video preset. Sengaja disamakan sama CONTEXT_CORE /
// CONTEXT_SUPPORT di lib/amfinder.js — kalau salah satu diubah, ubah dua-duanya.
const PRESET_CONTEXT_CORE = [
  "presetalightmotion",
  "alightmotionpreset",
  "presetdibawah5mb",
  "presetxml",
  "preset5mb",
  "alightmotion",
  "ampreset",
  "amedit",
  "alightmotiontutorial",
  "alightmotionedits",
  "alightmotionpro",
];
const PRESET_CONTEXT_SUPPORT = ["preset", "5mb", "velocity", "jedagjedug", "jedugalighmotion", "amprem"];

// Cari preset itu nyari video yang membagikan preset, bukan sekadar video yang
// menyebut judul lagu yang diketik user. Tanpa saringan ini, search "kaulah
// kamuku" nyampur cover lagu dan lirik video bareng video preset.
// Sama persis cara kerja videoContext() di lib/amfinder.js.
export function presetContextLevel(snippet?: string, handle?: string): "core" | "support" | "none" {
  const raw = `${snippet ?? ""}\n${(handle ?? "").replace(/^@/, "")}`
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ");
  const hay = raw.replace(/[#@]/g, " ").replace(/[\s_-]+/g, "");
  if (!hay) return "none";
  if (PRESET_CONTEXT_CORE.some((k) => hay.includes(k))) return "core";
  if (PRESET_CONTEXT_SUPPORT.some((k) => hay.includes(k))) return "support";
  return "none";
}

// Saring kandidat yang jelas bukan video preset. Kalau saringannya bikin
// hasil tinggal sedikit banget (query niche), kembalikan daftar asli —
// lebih baik kurang tepat daripada kosong sama sekali.
export function filterPresetCandidates(items: Candidate[]): Candidate[] {
  const kept = items.filter((it) => presetContextLevel(it.snippet, it.handle) !== "none");
  return kept.length >= 3 ? kept : items;
}

export function rankCandidates(items: Candidate[], queryNorm: string): Candidate[] {
  return items
    .map((item, index) => ({ item, index, score: scoreCandidate(item.snippet, queryNorm) }))
    .sort(
      (a, b) =>
        (b.score > 0 ? 1 : 0) - (a.score > 0 ? 1 : 0) ||
        b.score - a.score ||
        a.index - b.index,
    )
    .map((entry) => entry.item);
}


// ---------------------------------------------------------------------------
// Pencarian untuk API publik (parameter q=). Memakai alur yang sama dengan mode
// pick di /api/search: cari dulu dengan prefix "preset am", kalau kurang cocok
// cari ulang tanpa prefix, lalu ranking dan saring kandidat preset.
// ---------------------------------------------------------------------------

const MAX_PENDING_SEARCHES = 6;
let pendingSearches = 0;

export class SearchBusyError extends Error {
  constructor() {
    super("search busy");
    this.name = "SearchBusyError";
  }
}

function runSearch(query: string, timeout: number): Promise<SearchResult> {
  return withSearchLock(async (): Promise<SearchResult> => {
    setLog(() => {});
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return (await Promise.race([
        searchTiktok(query, { limit: CANDIDATE_LIMIT, timeout, engine: "auto", refresh: false }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("pencarian kehabisan waktu")), SEARCH_BUDGET_MS);
        }),
      ])) as SearchResult;
    } finally {
      if (timer) clearTimeout(timer);
    }
  });
}

export async function searchCandidates(
  query: string,
): Promise<{ items: Candidate[]; fromCache: boolean }> {
  if (pendingSearches >= MAX_PENDING_SEARCHES) throw new SearchBusyError();
  pendingSearches += 1;
  try {
    const queryNorm = normalizeText(query);
    let searchRes = await runSearch(`${QUERY_PREFIX} ${query}`, 20_000);
    let ranked = rankCandidates(searchRes.items || [], queryNorm);

    const bestScore = ranked.length > 0 ? scoreCandidate(ranked[0].snippet, queryNorm) : 0;
    if (ranked.length > 0 && bestScore < 60) {
      try {
        const retry = await runSearch(query, 15_000);
        const retryRanked = rankCandidates(retry.items || [], queryNorm);
        const retryScore =
          retryRanked.length > 0 ? scoreCandidate(retryRanked[0].snippet, queryNorm) : 0;
        if (retryScore > bestScore) {
          searchRes = retry;
          ranked = retryRanked;
        }
      } catch {
        /* cari ulang gagal: tetap pakai hasil pertama */
      }
    }

    return { items: filterPresetCandidates(ranked), fromCache: !!searchRes.fromCache };
  } finally {
    pendingSearches -= 1;
  }
}
