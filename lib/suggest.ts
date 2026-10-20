import fs from "node:fs";
import path from "node:path";

// Saran pencarian dilayani dari memori, tanpa request keluar.
// Sumber data:
//   - data/suggest.json        -> index hasil build (dari cache tikwm + monitor)
//   - data/monitor.json        -> kata kunci populer + frekuensinya
//   - data/suggest-extras.jsonl -> query baru yang masuk lewat /api/search
// Cache tikwm TIDAK dibaca saat runtime: ukurannya ratusan MB dan file-nya
// sering ditulis ulang, jadi scan dilakukan oleh scripts/build-suggest.mjs.

type Entry = { s: string; w: number };

const DATA_DIR = path.join(process.cwd(), "data");
const MONITOR_FILE = path.join(DATA_DIR, "monitor.json");
const INDEX_FILE = path.join(DATA_DIR, "suggest.json");
const EXTRAS_FILE = path.join(DATA_DIR, "suggest-extras.jsonl");

const CHECK_INTERVAL_MS = 20_000;
const MIN_REBUILD_MS = 2 * 60_000;
const MAX_EXTRAS_BYTES = 4 * 1024 * 1024;

let entries: Entry[] = [];
let weights = new Map<string, number>();
let signature = "";
let lastCheck = 0;
let lastBuild = 0;
let lastCompact = 0;
let building: Promise<void> | null = null;
const appended = new Set<string>();

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function usable(value: string): boolean {
  return value.length >= 3 && !value.startsWith("preset");
}

// --- Pemecah kata tanpa spasi ---------------------------------------------
// Query seperti "duniayang nanti" dirapikan jadi "dunia yang nanti" pakai
// kamus kata dari query lain. Hanya kata yang muncul >= 2x yang dipakai,
// supaya token aneh (mis. "bawaduka") tidak menghalangi pemecahan yang benar.
let runtimeDict: Map<string, number> | null = null;

function buildDictionary(queries: Iterable<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const query of queries) {
    for (const token of query.split(" ")) {
      if (token.length < 2 || !/^[a-z]+$/i.test(token)) continue;
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }
  const dict = new Map<string, number>();
  for (const [token, count] of counts) {
    if (count >= 2) dict.set(token, count);
  }
  return dict;
}

type Segment = { count: number; score: number; parts: string[] };

function segmentToken(token: string, dict: Map<string, number>): string | null {
  if (token.length < 4 || !/^[a-z]+$/.test(token) || dict.has(token)) return null;
  const n = token.length;
  const best: Array<Segment | null> = new Array(n + 1).fill(null);
  best[0] = { count: 0, score: 0, parts: [] };
  if (token[0] === "i" && n > 1) {
    best[1] = { count: 1, score: Math.log(2), parts: ["i"] };
  }

  for (let end = 1; end <= n; end++) {
    for (let start = Math.max(0, end - 12); start <= end - 2; start++) {
      const word = token.slice(start, end);
      if (!dict.has(word)) continue;
      const prev = best[start];
      if (!prev) continue;
      const count = prev.count + 1;
      const score = prev.score + Math.log(1 + (dict.get(word) || 1));
      const current = best[end];
      if (
        !current ||
        count < current.count ||
        (count === current.count && score > current.score)
      ) {
        best[end] = { count, score, parts: [...prev.parts, word] };
      }
    }
  }

  const result = best[n];
  if (!result || result.parts.length < 2) return null;
  return result.parts.join(" ");
}

function prettify(query: string, dict: Map<string, number>): string {
  return query
    .split(" ")
    .filter(Boolean)
    .map((token) => segmentToken(token, dict) ?? token)
    .join(" ");
}

function dictionaryFromCurrent(): Map<string, number> {
  if (runtimeDict) return runtimeDict;
  runtimeDict = buildDictionary(weights.keys());
  return runtimeDict;
}

function fileStat(file: string): { mtimeMs: number; size: number } {
  try {
    const st = fs.statSync(file);
    return { mtimeMs: st.mtimeMs, size: st.size };
  } catch {
    return { mtimeMs: 0, size: 0 };
  }
}

function dataSignature(): string {
  const monitor = fileStat(MONITOR_FILE);
  const extras = fileStat(EXTRAS_FILE);
  return `${monitor.mtimeMs}:${monitor.size}:${extras.mtimeMs}:${extras.size}`;
}

// Index hasil build sebelumnya dibaca langsung saat modul dimuat supaya
// request pertama tidak perlu menunggu apa pun.
try {
  const parsed = JSON.parse(fs.readFileSync(INDEX_FILE, "utf8")) as Entry[];
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (!item || typeof item.s !== "string") continue;
      const text = normalize(item.s);
      if (!usable(text)) continue;
      const weight = Math.max(1, Number(item.w) || 1);
      weights.set(text, Math.max(weight, weights.get(text) || 0));
    }
    entries = [...weights.entries()].map(([s, w]) => ({ s, w }));
  }
} catch {
  /* belum ada index — dibangun saat request pertama */
}
signature = dataSignature();

function readMonitorWeights(): Map<string, number> {
  const map = new Map<string, number>();
  try {
    const parsed = JSON.parse(fs.readFileSync(MONITOR_FILE, "utf8")) as {
      keywords?: Record<string, number>;
    };
    for (const [key, count] of Object.entries(parsed.keywords || {})) {
      const text = normalize(key);
      if (!usable(text)) continue;
      map.set(text, Math.max(1, Number(count) || 1));
    }
  } catch {
    /* monitor sedang ditulis / rusak — pakai data lama */
  }
  return map;
}

function readExtras(): string[] {
  const out: string[] = [];
  try {
    const stat = fs.statSync(EXTRAS_FILE);
    if (stat.size === 0 || stat.size > MAX_EXTRAS_BYTES) return out;
    const raw = fs.readFileSync(EXTRAS_FILE, "utf8");
    for (const line of raw.split("\n")) {
      if (!line) continue;
      try {
        const item = JSON.parse(line) as { q?: string };
        if (typeof item.q !== "string") continue;
        const text = normalize(item.q);
        if (usable(text)) out.push(text);
      } catch {
        /* baris setengah tertulis — abaikan */
      }
    }
  } catch {
    /* file belum ada */
  }
  return out;
}

async function build(): Promise<void> {
  const monitor = readMonitorWeights();
  const extras = readExtras();
  const dict = buildDictionary([...weights.keys(), ...monitor.keys(), ...extras]);
  const next = new Map<string, number>();
  const add = (raw: string, weight: number) => {
    const text = prettify(normalize(raw), dict);
    if (!usable(text)) return;
    next.set(text, Math.max(weight, next.get(text) || 0));
  };
  for (const [key, weight] of weights) add(key, weight);
  for (const [key, weight] of monitor) add(key, weight);
  for (const key of extras) add(key, 1);

  weights = next;
  runtimeDict = null;
  entries = [...next.entries()]
    .map(([s, w]) => ({ s, w }))
    .sort((a, b) => b.w - a.w || a.s.length - b.s.length || a.s.localeCompare(b.s));
  lastBuild = Date.now();
  persist();
}

function persist(): void {
  const temp = `${INDEX_FILE}.tmp`;
  fs.promises
    .writeFile(temp, JSON.stringify(entries))
    .then(() => fs.promises.rename(temp, INDEX_FILE))
    .catch(() => {
      /* index di memori tetap jalan walau gagal menyimpan */
    });
}

function scheduleRebuild(nextSignature: string): Promise<void> {
  signature = nextSignature;
  building = build()
    .catch(() => {
      /* biarkan index lama tetap dipakai */
    })
    .finally(() => {
      building = null;
    });
  return building;
}

async function refresh(): Promise<void> {
  const now = Date.now();
  if (entries.length && now - lastCheck < CHECK_INTERVAL_MS) return;
  lastCheck = now;

  const nextSignature = dataSignature();
  if (!entries.length) {
    await scheduleRebuild(nextSignature);
    return;
  }
  if (
    nextSignature !== signature &&
    !building &&
    now - lastBuild >= MIN_REBUILD_MS
  ) {
    void scheduleRebuild(nextSignature);
  }
}

async function compactExtras(): Promise<void> {
  if (Date.now() - lastCompact < 60_000) return;
  lastCompact = Date.now();
  if (fileStat(EXTRAS_FILE).size <= MAX_EXTRAS_BYTES) return;
  const unique = [...new Set(readExtras())].slice(-20_000);
  const temp = `${EXTRAS_FILE}.tmp`;
  try {
    await fs.promises.writeFile(
      temp,
      unique.map((q) => JSON.stringify({ q })).join("\n") + (unique.length ? "\n" : ""),
    );
    await fs.promises.rename(temp, EXTRAS_FILE);
  } catch {
    /* biarkan file lama; coba lagi nanti */
  }
}

/** Catat kata kunci baru dari /api/search supaya ikut jadi saran berikutnya. */
export function rememberQuery(raw: string): void {
  const query = normalize(raw);
  if (!usable(query)) return;
  const pretty = prettify(query, dictionaryFromCurrent());
  if (!usable(pretty) || appended.has(pretty)) return;
  appended.add(pretty);
  if (appended.size > 5000) appended.clear();

  if (!weights.has(pretty)) {
    weights.set(pretty, 1);
    entries.push({ s: pretty, w: 1 });
  }
  fs.promises
    .appendFile(EXTRAS_FILE, `${JSON.stringify({ q: pretty })}\n`)
    .then(() => compactExtras())
    .catch(() => {
      /* gagal mencatat bukan blocker pencarian */
    });
}

export async function getSuggestions(raw: string, limit = 8): Promise<string[]> {
  const query = normalize(raw);
  if (query.length < 2) return [];

  try {
    await refresh();
  } catch {
    /* kalau gagal, tetap pakai index yang ada */
  }
  if (!entries.length) return [];

  const scored: Array<{ s: string; score: number; w: number }> = [];
  for (const entry of entries) {
    const index = entry.s.indexOf(query);
    if (index < 0) continue;
    const starts = index === 0;
    const exact = starts && entry.s.length === query.length;
    // "about you" harus menang dari "aboutyou": setelah kata yang diketik,
    // utamakan yang lanjutannya diawali spasi.
    const spaced = starts && entry.s[query.length] === " ";
    const boundary = starts || entry.s[index - 1] === " ";
    const score = exact ? 0 : spaced ? 1 : starts ? 2 : boundary ? 3 : 4;
    scored.push({ s: entry.s, score, w: entry.w });
  }

  scored.sort(
    (a, b) =>
      a.score - b.score ||
      b.w - a.w ||
      a.s.length - b.s.length ||
      a.s.localeCompare(b.s),
  );

  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of scored) {
    if (seen.has(item.s)) continue;
    seen.add(item.s);
    result.push(item.s);
    if (result.length >= limit) break;
  }
  return result;
}
