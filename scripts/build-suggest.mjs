import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const MONITOR_FILE = path.join(DATA_DIR, "monitor.json");
const EXTRAS_FILE = path.join(DATA_DIR, "suggest-extras.jsonl");
const INDEX_FILE = path.join(DATA_DIR, "suggest.json");
const PUBLIC_FILE = path.join(process.cwd(), "public", "suggest.json");

const MIN_LENGTH = 3;
const MAX_LENGTH = 60;
// Monitor itu sumber luas (banyak sekali frasa sekali lewat), jadi minta >= 2x.
// /api/search adalah user benar-benar mengetik di kolom pencarian, 1x sudah cukup.
const MIN_MONITOR_HITS = 2;
const MIN_SEARCH_HITS = 1;

function normalize(value) {
  return String(value)
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const URL_RE =
  /(?:https?:\/\/|www\.|wa\.me|t\.me|drive\.google|alight(?:creative)?|vt\.tiktok|tiktok\.com)/i;
const DOMAIN_RE = /\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/i;

// Alasan sebuah teks tidak layak jadi saran. Null = layak.
function rejectReason(text) {
  if (text.length < MIN_LENGTH) return "terlalu pendek";
  if (text.length > MAX_LENGTH) return "terlalu panjang";
  if (text.startsWith("preset am")) return "awalan preset am";
  if (text.includes("@")) return "@handle/email";
  if (URL_RE.test(text) || DOMAIN_RE.test(text)) return "url/domain";
  if (/\d{5,}/.test(text)) return "deret angka";
  if ((text.match(/\d/g) || []).length >= 8) return "terlalu banyak angka";

  const chars = [...text].filter((ch) => !/\s/.test(ch));
  const letters = chars.filter((ch) => /\p{L}/u.test(ch)).length;
  if (letters < 3) return "tanpa huruf";
  if (letters / chars.length < 0.6) return "mayoritas simbol";
  return null;
}

function safeSample(text) {
  return (
    text
      .replace(/(?:https?:\/\/|www\.)\S+/gi, "<url>")
      .replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b\S*/gi, "<domain>")
      .replace(/@\S+/g, "@***")
      .replace(/\d/g, "#")
      .slice(0, MAX_LENGTH) || "-"
  );
}

// Beberapa user mengetik tanpa spasi ("duniayang nanti"). Saat membangun
// index, token yang belum jadi kata utuh dipecah lagi pakai kamus kata yang
// diambil dari query lain, supaya saran tampil rapi.
function buildDictionary(queries) {
  const counts = new Map();
  for (const query of queries) {
    for (const token of String(query).split(" ")) {
      if (token.length < 2 || !/^[a-z]+$/i.test(token)) continue;
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }
  // Cuma kata yang muncul minimal 2x yang dipercaya sebagai potongan kata.
  // Token aneh yang cuma sekali (mis. "bawaduka") jangan sampai menghalangi
  // pemecahan "cinta bawa duka".
  const dict = new Map();
  for (const [token, count] of counts) {
    if (count >= 2) dict.set(token, count);
  }
  return dict;
}

function segmentToken(token, dict) {
  if (token.length < 4 || !/^[a-z]+$/.test(token) || dict.has(token)) return null;
  const n = token.length;
  const best = new Array(n + 1).fill(null);
  best[0] = { count: 0, score: 0, parts: [] };
  // "i love you" yang digabung jadi "iloveyou" — izinkan huruf "i" di awal.
  if (token[0] === "i" && n > 1) best[1] = { count: 1, score: Math.log(2), parts: ["i"] };

  for (let end = 1; end <= n; end++) {
    for (let start = Math.max(0, end - 12); start <= end - 2; start++) {
      const word = token.slice(start, end);
      if (!dict.has(word)) continue;
      const prev = best[start];
      if (!prev) continue;
      const count = prev.count + 1;
      const score = prev.score + Math.log(1 + (dict.get(word) || 1));
      const current = best[end];
      if (!current || count < current.count || (count === current.count && score > current.score)) {
        best[end] = { count, score, parts: [...prev.parts, word] };
      }
    }
  }

  const result = best[n];
  if (!result || result.parts.length < 2) return null;
  return result.parts.join(" ");
}

function prettify(query, dict) {
  return String(query)
    .split(" ")
    .filter(Boolean)
    .map((token) => segmentToken(token, dict) ?? token)
    .join(" ");
}

function readMonitor() {
  const counts = new Map();
  try {
    const parsed = JSON.parse(fs.readFileSync(MONITOR_FILE, "utf8"));
    for (const [key, value] of Object.entries(parsed.keywords || {})) {
      const text = normalize(key);
      if (!text) continue;
      const n = Math.max(1, Number(value) || 1);
      counts.set(text, (counts.get(text) || 0) + n);
    }
  } catch {
    /* monitor belum ada */
  }
  return counts;
}

// Menghitung frekuensi query /api/search. Format lama cuma { q }, format baru
// { q, n }. Duplikat baris tetap dihitung supaya ambang bisa dipakai.
function readExtras() {
  const counts = new Map();
  try {
    const raw = fs.readFileSync(EXTRAS_FILE, "utf8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line);
        const text = normalize(item.q || "");
        if (!text) continue;
        const n = Math.max(1, Number(item.n) || 1);
        counts.set(text, (counts.get(text) || 0) + n);
      } catch {
        /* baris setengah tertulis — abaikan */
      }
    }
  } catch {
    /* file belum ada */
  }
  return counts;
}

const monitor = readMonitor();
const extras = readExtras();

const monitorHits = [...monitor].filter(([, n]) => n >= MIN_MONITOR_HITS);
const searchHits = [...extras].filter(([, n]) => n >= MIN_SEARCH_HITS);

const dictionary = buildDictionary(
  [...monitorHits, ...searchHits]
    .map(([query]) => query)
    .filter((query) => !rejectReason(query)),
);
const weights = new Map();
const dropped = new Map();

function noteDrop(reason, text) {
  const bucket = dropped.get(reason) || { count: 0, samples: new Set() };
  bucket.count += 1;
  if (bucket.samples.size < 3) bucket.samples.add(safeSample(text));
  dropped.set(reason, bucket);
}

function add(raw, weight) {
  const text = prettify(raw, dictionary);
  const reason = rejectReason(text);
  if (reason) {
    noteDrop(reason, text);
    return;
  }
  weights.set(text, Math.max(weight, weights.get(text) || 0));
}

for (const [raw, count] of monitorHits) add(raw, count);
for (const [raw, count] of searchHits) add(raw, count);

const entries = [...weights.entries()]
  .map(([s, w]) => ({ s, w }))
  .sort((a, b) => b.w - a.w || a.s.length - b.s.length || a.s.localeCompare(b.s));

const payload = JSON.stringify(entries);
const temp = `${INDEX_FILE}.tmp`;
fs.writeFileSync(temp, payload);
fs.renameSync(temp, INDEX_FILE);
// Versi statis buat dibaca langsung oleh browser (autocomplete instan).
fs.mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
const publicTemp = `${PUBLIC_FILE}.tmp`;
fs.writeFileSync(publicTemp, payload);
fs.renameSync(publicTemp, PUBLIC_FILE);

console.log(
  `sumber: monitor ${monitor.size} (lolos ${MIN_MONITOR_HITS}x: ${monitorHits.length}), ` +
    `/api/search ${extras.size} (lolos ${MIN_SEARCH_HITS}x: ${searchHits.length})`,
);
const belowMonitor = monitor.size - monitorHits.length;
const belowSearch = extras.size - searchHits.length;
if (belowMonitor || belowSearch) {
  console.log(`di bawah ambang: monitor ${belowMonitor}, /api/search ${belowSearch}`);
}
const totalDropped = [...dropped.values()].reduce((sum, bucket) => sum + bucket.count, 0);
console.log(`dibuang filter: ${totalDropped}`);
for (const [reason, bucket] of [...dropped].sort((a, b) => b[1].count - a[1].count)) {
  console.log(`  - ${reason}: ${bucket.count} — ${[...bucket.samples].join(" | ")}`);
}
console.log(
  `suggest.json: ${entries.length} entries (${Math.round(Buffer.byteLength(payload) / 1024)} KB)`,
);
