// Metadata pratinjau Open Graph buat halaman /preset/<sumber>/<id>.
//
// Kenapa dipisah: halaman preset itu kerangka kosong yang diisi dari browser.
// Judul videonya baru diketahui dari luar, dan tariknya di server cuma boleh
  // dilakukan buat bot pratinjau (WhatsApp/Telegram/Facebook/dll) — bukan buat
  // tiap pengunjung. Jadi fetch-nya dibatasi ketat: satu kali coba (TikTok boleh
  // ulang kalau kena kuota), total waktunya dibatasi, dan hasilnya di-cache 7
  // hari (judul/penulis video jarang berubah, sementara kuota tikwm cuma
  // 10.000/hari dan dipakai bareng sama pencarian & scraper).
//
// Sumber per sumber video (satu request kecil, TIDAK PERNAH spawn amfinder.js,
// tidak mengambil komentar):
//   YouTube — oembed resmi. Thumbnail i.ytimg.com tidak pernah kedaluwarsa,
//             jadi langsung dipakai sebagai URL, tanpa disimpan.
//   TikTok  — tikwm. Satu-satunya yang tembus dari VPS ini (oembed TikTok
//             diblokir). Thumbnail-nya bertanda tangan CDN dan mati sekitar
//             1 hari, jadi diunduh sekali lalu disimpan di data/og-img/.
//
// Gagal fetch bukan masalah: yang dapat preview generik ber-brand, halaman
// tetap 200. Kegagalan diingat 1 jam supaya bot yang bolak-balik nyoba video
// yang sama nggak mengulang request yang sia-sia.

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { limitHeaders } from "./rate-limit";

export type OgSource = "tiktok" | "youtube";

export type OgMeta = {
  title: string | null;
  author: string | null;
  // URL absolut (YouTube) atau path lokal /og-img/<id>.jpg (TikTok).
  image: string | null;
};

// Timeout sengaja pendek. Kalau lambat, yang penting bot tetap dapat
// preview — bukan nunggu sampai dia nyerah sendiri.
const ATTEMPT_TIMEOUT_MS = 2000;
// TikTok lewat tikwm, dan kuota tikwm cuma 1 request/detik — dipakai bareng
// pencarian di situs ini. Wajar kalau permintaan pertama dibalas "code -1";
// karena itu dicoba ulang, tapi tetap dibatasi supaya bot nggak nunggu lama.
const FETCH_BUDGET_MS = 6000;
const LIMIT_SLEEP_MS = 1100;
const LIMIT_RETRIES = 2;
  // Kuota tikwm harian (10.000/hari) dipakai bareng sama pencarian dan
  // scraper. Selama kuota habis, setiap percuma tetap dihitung tikwm — jadi
  // begitu terdeteksi habis, tahan dulu semua request keluar sampai cooldown
  // selesai. Tanpa ini, tiap bot pratinjau yang datang membakar kuota sia-sia.
  const QUOTA_COOLDOWN_MS = 15 * 60_000;
  let quotaUntil = 0;
  // Isi: { until: <epoch ms>, dur: <ms> }. Dideklarasikan setelah DATA_DIR.
  let QUOTA_FILE = "";
  // File bersama yang ditulis scraper (lib/amfinder.js) dan pencarian
  // (lib/ttsearch.js). Kalau mereka duluan tahu kuota harian habis, preview OG
  // ikut berhenti tanpa perlu membuang satu request lagi buat membuktikannya.
  function sharedQuotaBlocked(): number {
    try {
      const s = JSON.parse(readFileSync(QUOTA_FILE, "utf8")) as { until?: unknown };
      return typeof s?.until === "number" ? Math.max(0, s.until - Date.now()) : 0;
    } catch {
      return 0;
    }
  }
  const quotaExhausted = () => Date.now() < quotaUntil || sharedQuotaBlocked() > 0;
  function noteQuotaExhausted(): void {
    quotaUntil = Date.now() + QUOTA_COOLDOWN_MS;
  }
  const isDailyQuotaMsg = (m: string) => /request\s*\/\s*\d+\s*day/i.test(m);

  const SUCCESS_TTL_MS = 7 * 24 * 60 * 60_000;
  const FAIL_TTL_MS = 60 * 60_000;
const MAX_ENTRIES = 200;
const IMG_MAX_BYTES = 400_000;
const IMG_MIN_BYTES = 200;

  const DATA_DIR = path.join(process.cwd(), "data");
  const CACHE_FILE = path.join(DATA_DIR, "og-meta.json");
  const IMG_DIR = path.join(DATA_DIR, "og-img");
  const FLUSH_MS = 5_000;
  QUOTA_FILE = path.join(DATA_DIR, "tikwm-quota.json");

// UA netral buat request keluar. tikwm kadang nolak kalau UA-nya kosong.
const OUTBOUND_UA = "Mozilla/5.0 (compatible; AMPresetFinder/1.0)";

type Entry = { meta: OgMeta | null; at: number; ok: boolean };
type Cache = Record<string, Entry>;

type Store = { cache: Cache; dirty: boolean; timer: ReturnType<typeof setTimeout> | null };

function store(): Store {
  const g = globalThis as typeof globalThis & { __amOgMeta?: Store };
  if (!g.__amOgMeta) g.__amOgMeta = { cache: load(), dirty: false, timer: null };
  return g.__amOgMeta;
}

function load(): Cache {
  try {
    const raw = JSON.parse(readFileSync(CACHE_FILE, "utf8")) as { entries?: Cache };
    return raw.entries && typeof raw.entries === "object" ? raw.entries : {};
  } catch {
    return {};
  }
}

function flushNow(s: Store): void {
  s.dirty = false;
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${CACHE_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify({ entries: s.cache }));
    renameSync(tmp, CACHE_FILE);
  } catch {
    /* cache pratinjau bukan kewajiban — gagal tulis diabaikan */
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

function key(source: OgSource, id: string): string {
  return `${source}:${id}`;
}

// Thumbnail lokal dihapus bareng entri cache-nya, biar data/og-img nggak
// numpuk video yang sudah lama nggak dilihat siapa-siapa.
function forgetImage(meta: OgMeta | null): void {
  const image = meta?.image;
  if (!image || !image.startsWith("/og-img/")) return;
  const id = image.slice("/og-img/".length).replace(/\.jpg$/, "");
  if (!/^\d{15,20}$/.test(id)) return;
  try {
    rmSync(path.join(IMG_DIR, `${id}.jpg`), { force: true });
  } catch {
    /* file sisa bukan masalah */
  }
}

function prune(s: Store): void {
  const keys = Object.keys(s.cache).sort((a, b) => (s.cache[a].at || 0) - (s.cache[b].at || 0));
  while (keys.length > MAX_ENTRIES) {
    const k = keys.shift() as string;
    forgetImage(s.cache[k]?.meta ?? null);
    delete s.cache[k];
    s.dirty = true;
  }
}

// true = entri masih berlaku (nilainya di meta, bisa null artinya "pernah
// gagal, jangan diulang"). false = tidak ada atau sudah kedaluwarsa.
function readFresh(s: Store, k: string): { hit: boolean; meta: OgMeta | null } {
  const e = s.cache[k];
  if (!e || typeof e.at !== "number") return { hit: false, meta: null };
  const ttl = e.ok ? SUCCESS_TTL_MS : FAIL_TTL_MS;
  if (Date.now() - e.at > ttl) {
    delete s.cache[k];
    s.dirty = true;
    return { hit: false, meta: null };
  }
  // Sentuh biar entri yang dipakai terus nggak kena buang duluan.
  e.at = Date.now();
  return { hit: true, meta: e.meta };
}

function write(s: Store, k: string, meta: OgMeta | null): void {
  s.cache[k] = { meta, at: Date.now(), ok: meta !== null };
  prune(s);
  markDirty(s);
}

// ---------------------------------------------------------------------------
// Deteksi bot pratinjau
// ---------------------------------------------------------------------------

// Daftar ini harus tetap murah — dijalankan tiap request halaman preset.
// Bukan berarti semua bot ketangkep; kalau UA-nya nggak dikenal, yang dapat
// preview generik ber-brand. Itu sudah cukup.
const PREVIEW_BOT =
  /facebookexternalhit|facebot|twitterbot|telegrambot|whatsapp|discordbot|slackbot|pinterest|linkedinbot|skypeuripreview|kakaotalk|redditbot|vkshare|snapchat|quora|embedly|iframely|outbrain|googlebot|applebot|preview/i;

export function isPreviewBot(ua: string): boolean {
  return PREVIEW_BOT.test(ua.slice(0, 400));
}

// ---------------------------------------------------------------------------
// Fetch per sumber
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, Math.max(0, ms)));
}

async function fetchJson(url: string, referer?: string, timeoutMs = ATTEMPT_TIMEOUT_MS): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": OUTBOUND_UA, ...(referer ? { referer } : {}) },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

async function fetchYoutube(id: string): Promise<OgMeta | null> {
  const watch = `https://www.youtube.com/watch?v=${id}`;
  // oembed YouTube nggak punya batas 1 request/detik, jadi sekali coba saja.
  const j = (await fetchJson(
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`,
    undefined,
    FETCH_BUDGET_MS,
  )) as { title?: unknown; author_name?: unknown; thumbnail_url?: unknown } | null;
  if (!j || typeof j !== "object") return null;

  const title = str(j.title);
  const thumb = str(j.thumbnail_url);
  // i.ytimg.com tidak pakai tanda tangan — URL-nya tidak pernah kedaluwarsa,
  // jadi aman dikirim langsung tanpa disimpan.
  const image = thumb && /^https:\/\/[\w.-]+\.(?:ytimg|ggpht)\.com\//.test(thumb) ? thumb : null;
  if (!title && !image) return null;
  return { title, author: str(j.author_name), image };
}

// Unduh thumbnail sekali, simpan sebagai file statis. Bukan proxy: file dibaca
// dari disk, bukan ditarik ulang dari CDN tiap kali bot minta.
async function saveTiktokCover(id: string, url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      headers: { "user-agent": OUTBOUND_UA, referer: "https://tikwm.com/" },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < IMG_MIN_BYTES || buf.length > IMG_MAX_BYTES) return null;
    // Cek penanda JPEG beneran — jawaban error sering berupa HTML/JSON yang
    // kalau disimpan bikin gambar pecah di preview.
    if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) return null;
    mkdirSync(IMG_DIR, { recursive: true });
    const file = path.join(IMG_DIR, `${id}.jpg`);
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, buf);
    renameSync(tmp, file);
    return `/og-img/${id}.jpg`;
  } catch {
    return null;
  }
}

type TiktokPayload = {
  code?: unknown;
  msg?: unknown;
  data?: { id?: unknown; title?: unknown; cover?: unknown; author?: { nickname?: unknown } } | null;
} | null;

async function fetchTiktok(id: string): Promise<OgMeta | null> {
  // ID numerik dikirim sebagai URL tonton; kode pendek (vt.tiktok.com/xxx)
  // dikirim apa adanya — tikwm yang me-resolve redirect-nya.
  const watch = /^\d{15,}$/.test(id)
    ? `https://www.tiktok.com/@/video/${id}`
    : `https://vt.tiktok.com/${id}/`;
  const url = `https://tikwm.com/api/?url=${encodeURIComponent(watch)}`;
  const started = Date.now();

  let j: TiktokPayload = null;
  for (let attempt = 0; ; attempt += 1) {
    const left = FETCH_BUDGET_MS - (Date.now() - started);
    if (left <= 0) return null;
    const raw = (await fetchJson(url, "https://tikwm.com/", Math.min(ATTEMPT_TIMEOUT_MS, left))) as TiktokPayload;
    if (raw && raw.code === 0 && raw.data) {
      j = raw;
      break;
    }
    // Kuota harian habis: berhenti mencoba dan tahan semua request berikutnya.
    if (raw && raw.code === -1 && isDailyQuotaMsg(String(raw.msg || ""))) {
      noteQuotaExhausted();
      return null;
    }
    // code -1 = kuota tikwm (1 request/detik) keburu dipakai pencarian.
    // Tunggu sebentar lalu ulang, sampai jatah waktunya habis.
    if (raw && raw.code === -1 && attempt < LIMIT_RETRIES) {
      await sleep(Math.min(LIMIT_SLEEP_MS, FETCH_BUDGET_MS - (Date.now() - started)));
      continue;
    }
    return null;
  }
  if (!j || !j.data || typeof j.data !== "object") return null;

  const d = j.data;
  const nickname = str(d.author?.nickname);
  const title = str(d.title);
  // Pilih cover JPEG-nya, bukan origin_cover — yang terakhir berformat WebP dan
  // nggak andal ditampilkan WhatsApp/Facebook.
  const cover = str(d.cover);
  // Nama file thumbnail harus ID numerik: route /og-img/ menolak selain angka.
  // Kalau yang diminta kode pendek, angka aslinya diambil dari payload.
  const fromPayload = str(d.id);
  const numericId = fromPayload && /^\d{15,}$/.test(fromPayload) ? fromPayload : id;
  const left = FETCH_BUDGET_MS - (Date.now() - started);
  const image =
    cover && /^https:\/\//.test(cover) && left > 0 && /^\d{15,}$/.test(numericId)
      ? await saveTiktokCover(numericId, cover)
      : null;
  if (!title && !image) return null;
  return { title, author: nickname, image };
}

// ---------------------------------------------------------------------------
// Antarmuka buat halaman preset
// ---------------------------------------------------------------------------

// Penanda supaya belasan bot yang datang bersamaan buat video yang sama cuma
// memicu SATU request keluar. Tanpa ini, kuota tikwm bisa habis cuma karena
// satu link dibagikan ke banyak grup.
const inflight = new Map<string, Promise<OgMeta | null>>();

async function loadRemote(source: OgSource, id: string): Promise<OgMeta | null> {
  const k = key(source, id);
  const running = inflight.get(k);
  if (running) return running;

  const job = (source === "youtube" ? fetchYoutube(id) : fetchTiktok(id))
    .catch(() => null)
    .finally(() => {
      inflight.delete(k);
    });
  inflight.set(k, job);
  return job;
}

export async function getOgMeta(
  source: OgSource,
  id: string,
  headers: Headers,
): Promise<OgMeta | null> {
  const s = store();
  const k = key(source, id);
  const cached = readFresh(s, k);
  if (cached.hit) return cached.meta;

  // Kuota harian habis: jangan buang request — langsung kasih preview generik.
  // Sengaja tidak menulis entri gagal, supaya begitu cooldown lewat video ini
  // bisa langsung dicoba lagi.
  if (quotaExhausted()) return null;

  // Batasi per IP baru setelah cache dicek — yang sudah ada di cache tidak
  // mengeluarkan request apa pun, jadi nggak perlu dibatasi. Tanpa batas ini
  // orang bisa nge-spam /preset/tiktok/<id-acak> dan menghabiskan kuota
  // tikwm harian yang dipakai bareng pencarian.
  if (!limitHeaders(headers, "og").ok) return null;

  const meta = await loadRemote(source, id);
  write(s, k, meta);
  return meta;
}
