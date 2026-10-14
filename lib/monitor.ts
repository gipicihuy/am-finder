// Statistik monitor admin — sengaja sederhana: satu file JSON di data/,
// di-update di memori, di-flush paling cepat tiap 5 detik. Cuma ada satu
// proses `next start` (pm2 fork mode), jadi nggak perlu kunci antar proses.
//
// PRIVASI: alamat IP TIDAK PERNAH disimpan maupun dikirim ke UI. Yang disimpan
// cuma sid (hash SHA-256 dari IP + salt), dipakai buat ngenalin "orang yang sama"
// biar bisa ngitung pengunjung unik. Salt cuma konstanta internal — sid
// tidak pernah dikirim keluar dari server.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { clientIp } from "./ip";

const TIMEZONE = "Asia/Jakarta";
const FILE = path.join(process.cwd(), "data", "monitor.json");
const RECENT_MAX = 50;
const KEYWORD_MAX = 200;
const DAY_KEEP = 14;
const ACTIVE_MS = 5 * 60_000;
const FLUSH_MS = 5_000;

type DayBucket = {
  visitors: string[];
  searches: number;
  found: number;
  notFound: number;
};

export type RecentEvent = {
  t: number;
  kind: "cari" | "url";
  query?: string;
  url?: string;
  found: boolean;
  presets: number;
  ms?: number;
  device: string;
  app: boolean;
};

type State = {
  days: Record<string, DayBucket>;
  keywords: Record<string, number>;
  recent: RecentEvent[];
  live: Record<string, { last: number; app: boolean }>;
};

const EMPTY: State = { days: {}, keywords: {}, recent: [], live: {} };

type Store = { state: State; dirty: boolean; timer: ReturnType<typeof setTimeout> | null };

function store(): Store {
  const g = globalThis as typeof globalThis & { __amMonitor?: Store };
  if (!g.__amMonitor) g.__amMonitor = { state: load(), dirty: false, timer: null };
  return g.__amMonitor;
}

function load(): State {
  try {
    const raw = JSON.parse(readFileSync(FILE, "utf8")) as Partial<State>;
    return {
      days: raw.days && typeof raw.days === "object" ? raw.days : {},
      keywords: raw.keywords && typeof raw.keywords === "object" ? raw.keywords : {},
      recent: Array.isArray(raw.recent) ? raw.recent.slice(0, RECENT_MAX) : [],
      live: raw.live && typeof raw.live === "object" ? raw.live : {},
    };
  } catch {
    return { ...EMPTY };
  }
}

function flushNow(s: Store): void {
  s.dirty = false;
  try {
    mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(s.state));
    renameSync(tmp, FILE);
  } catch {
    /* data monitor bukan kewajiban, gagal tulis diabaikan */
  }
}

function markDirty(s: Store): void {
  s.dirty = true;
  if (s.timer) return;
  s.timer = setTimeout(() => {
    s.timer = null;
    if (s.dirty) flushNow(s);
  }, FLUSH_MS);
}

function salt(): string {
  return createHash("sha256").update("amfinder-monitor-salt-v1").digest("hex");
}

function sid(headers: Headers): string {
  return createHash("sha256")
    .update(`${salt()}|${clientIp(headers)}`)
    .digest("hex")
    .slice(0, 16);
}

// Penanda Android WebView. App Android di repo ini bungkus WebView polos tanpa
// User-Agent khusus, jadi "; wv)" adalah satu-satunya pembeda yang tersedia.
function isApp(ua: string): boolean {
  return /;\s*wv\)/i.test(ua);
}

function deviceLabel(ua: string): string {
  if (/iPhone|iPad|iPod/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Linux/i.test(ua)) return "Linux";
  return "Lainnya";
}

function dayKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(d);
}

function prune(s: Store): void {
  const now = Date.now();
  const live = s.state.live;
  for (const [k, v] of Object.entries(live)) {
    if (!v || typeof v.last !== "number" || now - v.last > ACTIVE_MS) delete live[k];
  }
  const keys = Object.keys(s.state.days).sort();
  while (keys.length > DAY_KEEP) delete s.state.days[keys.shift() as string];
  const words = Object.entries(s.state.keywords);
  if (words.length > KEYWORD_MAX) {
    words.sort((a, b) => b[1] - a[1]);
    s.state.keywords = Object.fromEntries(words.slice(0, KEYWORD_MAX));
  }
}

function bucket(s: Store): DayBucket {
  const key = dayKey();
  const b = s.state.days[key];
  if (b && Array.isArray(b.visitors)) return b;
  s.state.days[key] = { visitors: [], searches: 0, found: 0, notFound: 0 };
  return s.state.days[key];
}

function touch(headers: Headers): { id: string; app: boolean; device: string } {
  const s = store();
  const id = sid(headers);
  const ua = (headers.get("user-agent") || "").slice(0, 300);
  const app = isApp(ua);
  const now = Date.now();

  s.state.live[id] = { last: now, app };
  const b = bucket(s);
  if (!b.visitors.includes(id)) b.visitors.push(id);

  prune(s);
  markDirty(s);
  return { id, app, device: deviceLabel(ua) };
}

function normalizeQuery(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 100)
    .toLowerCase();
}

// Kadang user nempel link di kolom judul. Tetap dihitung sebagai pencarian,
// tapi jangan masuk daftar "paling sering dicari" — isinya harus kata kunci.
function looksLikeUrl(q: string): boolean {
  return /^(https?:\/\/|www\.|[a-z0-9.-]+\.[a-z]{2,}[/?#])/i.test(q);
}

function pushRecent(s: Store, e: RecentEvent): void {
  s.state.recent.unshift(e);
  if (s.state.recent.length > RECENT_MAX) s.state.recent.length = RECENT_MAX;
}

export function recordVisit(headers: Headers): void {
  try {
    touch(headers);
  } catch {
    /* jangan pernah ganggu request */
  }
}

export function recordCari(
  headers: Headers,
  info: { query: string; foundCount: number; ms: number },
): void {
  try {
    const { app, device } = touch(headers);
    const s = store();
    const q = normalizeQuery(info.query);
    if (!q) return;
    s.state.days[dayKey()].searches += 1;
    const noise = looksLikeUrl(q);
    if (!noise) {
      s.state.keywords[q] = (s.state.keywords[q] || 0) + 1;
      pushRecent(s, {
        t: Date.now(),
        kind: "cari",
        query: q,
        found: info.foundCount > 0,
        presets: info.foundCount,
        ms: info.ms,
        device,
        app,
      });
    }
    prune(s);
    markDirty(s);
  } catch {
    /* jangan pernah ganggu request */
  }
}

export function recordUrl(
  headers: Headers,
  info: { url: string; found: boolean; presets: number; ms: number },
): void {
  try {
    const { app, device } = touch(headers);
    const s = store();
    const b = bucket(s);
    if (info.found) b.found += 1;
    else b.notFound += 1;
    pushRecent(s, {
      t: Date.now(),
      kind: "url",
      url: info.url.slice(0, 300),
      found: info.found,
      presets: info.presets,
      ms: info.ms,
      device,
      app,
    });
    prune(s);
    markDirty(s);
  } catch {
    /* jangan pernah ganggu request */
  }
}

// ---------------------------------------------------------------------------
// Ringkasannya buat halaman monitor
// ---------------------------------------------------------------------------

// Nama hari dari tanggal versi zona waktu situs (Jakarta), bukan zona server.
const DAY_BY_EN: Record<string, string> = {
  Sun: "Min",
  Mon: "Sen",
  Tue: "Sel",
  Wed: "Rab",
  Thu: "Kam",
  Fri: "Jum",
  Sat: "Sab",
};
const WEEKDAY_FMT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  timeZone: TIMEZONE,
});

function shortUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    const tail = u.pathname.split("/").filter(Boolean).pop() || "";
    if (host.includes("tiktok") || host === "tt.site") {
      const at = u.pathname.match(/@([^/]+)/);
      if (at) return `@${at[1]}`;
      return tail ? `${host}/${tail.slice(0, 12)}` : host;
    }
    return tail ? `${host}/${tail.slice(0, 12)}` : host;
  } catch {
    return raw.slice(0, 24);
  }
}

function agoLabel(t: number): string {
  const diff = Math.max(0, Date.now() - t);
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec} detik lalu`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} menit lalu`;
  const hour = Math.round(min / 60);
  if (hour < 24) return `${hour} jam lalu`;
  return `${Math.round(hour / 24)} hari lalu`;
}

export type MonitorSnapshot = {
  active: { total: number; browser: number; app: number };
  today: { visitors: number; searches: number; found: number; notFound: number };
  week: { label: string; count: number; isToday: boolean }[];
  keywords: { word: string; count: number }[];
  recent: {
    ago: string;
    title: string;
    found: boolean;
    presets: number;
    ms: string | null;
    device: string;
    source: string;
  }[];
};

export function snapshot(): MonitorSnapshot {
  const s = store();
  prune(s);
  const now = Date.now();

  let browser = 0;
  let app = 0;
  for (const v of Object.values(s.state.live)) {
    if (!v || typeof v.last !== "number" || now - v.last > ACTIVE_MS) continue;
    if (v.app) app += 1;
    else browser += 1;
  }

  const today = s.state.days[dayKey()] || { visitors: [], searches: 0, found: 0, notFound: 0 };

  const week: MonitorSnapshot["week"] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now - i * 86_400_000);
    const b = s.state.days[dayKey(d)];
    const isToday = i === 0;
    week.push({
      label: isToday ? "Hari ini" : DAY_BY_EN[WEEKDAY_FMT.format(d)] || "",
      count: b?.visitors?.length || 0,
      isToday,
    });
  }

  const keywords = Object.entries(s.state.keywords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word, count]) => ({ word, count }));

  const recent = s.state.recent.slice(0, 5).map(e => ({
    ago: agoLabel(e.t),
    title: e.kind === "cari" ? `Cari Preset: ${e.query || "-"}` : `URL Video: ${shortUrl(e.url || "")}`,
    found: e.found,
    presets: e.presets,
    ms:
      typeof e.ms === "number" && Number.isFinite(e.ms)
        ? (e.ms / 1000).toLocaleString("id-ID", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })
        : null,
    device: e.device,
    source: e.app ? "Aplikasi" : "Browser",
  }));

  return {
    active: { total: browser + app, browser, app },
    today: {
      visitors: today.visitors?.length || 0,
      searches: today.searches || 0,
      found: today.found || 0,
      notFound: today.notFound || 0,
    },
    week,
    keywords,
    recent,
  };
}
