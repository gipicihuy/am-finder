import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const DATA_DIR = path.join(process.cwd(), "data");
const MONITOR_FILE = path.join(DATA_DIR, "monitor.json");
const SEARCH_CACHE = path.join(DATA_DIR, "ttsearch.cache.json");
const INDEX_FILE = path.join(DATA_DIR, "suggest.json");
const PUBLIC_FILE = path.join(process.cwd(), "public", "suggest.json");
const PREFIX = '  "preset am ';
const SUFFIX = '": {';

function normalize(value) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function usable(value) {
  return value.length >= 3 && !value.startsWith("preset");
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

function readKeywords() {
  const map = new Map();
  try {
    const parsed = JSON.parse(fs.readFileSync(MONITOR_FILE, "utf8"));
    for (const [key, count] of Object.entries(parsed.keywords || {})) {
      const text = normalize(key);
      if (!usable(text)) continue;
      map.set(text, Math.max(1, Number(count) || 1));
    }
  } catch {
    /* monitor belum ada */
  }
  return map;
}

async function readCachedQueries() {
  const out = [];
  try {
    const rl = readline.createInterface({
      input: fs.createReadStream(SEARCH_CACHE, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line.startsWith(PREFIX) || !line.endsWith(SUFFIX)) continue;
      const query = line.slice(PREFIX.length, -SUFFIX.length);
      if (query) out.push(query);
    }
  } catch {
    /* cache belum ada */
  }
  return out;
}

function cacheSignature() {
  const st = fs.statSync(SEARCH_CACHE);
  return `${st.mtimeMs}:${st.size}`;
}

function tailComplete() {
  const fd = fs.openSync(SEARCH_CACHE, "r");
  try {
    const { size } = fs.fstatSync(fd);
    const length = Math.min(256, size);
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, size - length);
    return /\}\s*\}$/.test(buffer.toString("utf8"));
  } finally {
    fs.closeSync(fd);
  }
}

// File cache ditulis ulang setiap ada pencarian. Ambil snapshot yang utuh:
// ukuran/mtime harus sama sebelum & sesudah scan, dan ujung JSON valid.
let cached = [];
for (let attempt = 0; attempt < 6; attempt++) {
  const before = cacheSignature();
  cached = await readCachedQueries();
  const after = cacheSignature();
  if (before === after && cached.length > 100 && tailComplete()) break;
  console.log(`cache sedang ditulis ulang, ulangi (${attempt + 1}/6)…`);
  cached = [];
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
if (!cached.length) {
  console.error("Gagal membaca cache secara utuh. Coba lagi saat sepi.");
  process.exit(1);
}

const monitor = readKeywords();
const dictionary = buildDictionary([...monitor.keys(), ...cached]);
const weights = new Map();

function add(raw, weight) {
  const text = prettify(normalize(raw), dictionary);
  if (!usable(text)) return;
  weights.set(text, Math.max(weight, weights.get(text) || 0));
}

for (const [raw, weight] of monitor) add(raw, weight);
for (const raw of cached) add(raw, 1);

const entries = [...weights.entries()]
  .map(([s, w]) => ({ s, w }))
  .sort((a, b) => b.w - a.w || a.s.length - b.s.length || a.s.localeCompare(b.s));

const payload = JSON.stringify(entries);
const temp = `${INDEX_FILE}.tmp`;
fs.writeFileSync(temp, payload);
fs.renameSync(temp, INDEX_FILE);
// Versi statis buat dibaca langsung oleh browser (autocomplete instan).
fs.mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
fs.writeFileSync(PUBLIC_FILE, payload);
console.log(
  `suggest.json: ${entries.length} entries (${Math.round(Buffer.byteLength(payload) / 1024)} KB)`,
);
