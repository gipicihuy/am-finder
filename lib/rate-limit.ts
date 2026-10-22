import { clientIp } from "./ip";

// Rate limiter in-memory, tiga lapis:
//   1. burst      — jendela pendek, biar pemakaian normal (klik, scroll) tetap lega
//   2. sustained  — plafon per menit, nahan flood pelan yang ngelewatin burst
//   3. penalty    — kena strike + cooldown yang makin lama tiap kali (progressive)
//
// Permintaan yang DITOLAK tetap dihitung, jadi nge-spam paralel ga bisa nembus
// cuma dengan ngirim banyak request. DDoS L3/L4 tetap ditahan Cloudflare di
// depan tunnel — ini lapis terakhir sebelum spawn proses berat.
//
// Simpan di globalThis biar tetep sama walau Next nge-bundle tiap route
// terpisah, dan karena cuma ada satu proses `next start` (pm2 fork mode).

const MAX_KEYS = 20_000;
// Strike lama diampuni kalau ga ada pelanggaran selama ini.
const STRIKE_DECAY_MS = 30 * 60_000;
const MAX_STRIKES = 5;
const MAX_COOLDOWN_MS = 15 * 60_000;

type ScopeConfig = {
  burst: number;
  burstMs: number;
  sustained: number;
  sustainedMs: number;
  penaltyAt: number;
  penaltyMs: number;
};

const SCOPES = {
  // Beacon kunjungan: 1x per page load.
  track: { burst: 6, burstMs: 10_000, sustained: 20, sustainedMs: 60_000, penaltyAt: 40, penaltyMs: 30_000 },
  // /api/find nge-spawn lib/amfinder.js — yang paling mahal.
  find: { burst: 6, burstMs: 10_000, sustained: 30, sustainedMs: 60_000, penaltyAt: 60, penaltyMs: 60_000 },
  search: { burst: 6, burstMs: 10_000, sustained: 30, sustainedMs: 60_000, penaltyAt: 60, penaltyMs: 60_000 },
  // Autocomplete dipanggil tiap user berhenti mengetik. Murah (index di memori),
  // jadi plafonnya longgar; kalau tetap kena limit, route balikin list kosong.
  suggest: { burst: 30, burstMs: 10_000, sustained: 200, sustainedMs: 60_000, penaltyAt: 400, penaltyMs: 30_000 },
  // Feed dirender ulang tiap 10 menit, jadi plafonnya lebih ketat.
  rekomen: { burst: 4, burstMs: 10_000, sustained: 10, sustainedMs: 60_000, penaltyAt: 25, penaltyMs: 60_000 },
  // Ambil judul + thumbnail buat pratinjau OG. Ringan (1 request kecil ke
  // oembed/tikwm), tapi tetap dibatasi: alamat /preset bisa sangat banyak dan
  // kuota tikwm cuma 10.000/hari, dipakai bareng pencarian.
  og: { burst: 5, burstMs: 10_000, sustained: 15, sustainedMs: 60_000, penaltyAt: 30, penaltyMs: 60_000 },
  // Unduhan audio: satu klik bisa menarik file beberapa ratus KB. Batasnya
  // lebih ketat dari API biasa; konkurensi global diatur di route /api/audio.
  audio: { burst: 2, burstMs: 10_000, sustained: 5, sustainedMs: 60_000, penaltyAt: 8, penaltyMs: 60_000 },
  // Handshake anti-scrape: mahal di client (HMAC chain), jadi jangan sampai
  // satu IP bisa mengambil challenge tanpa henti.
  handshake: { burst: 8, burstMs: 10_000, sustained: 30, sustainedMs: 60_000, penaltyAt: 50, penaltyMs: 60_000 },
  // Laporan dari client (honeypot / runtime watcher).
  security: { burst: 6, burstMs: 10_000, sustained: 20, sustainedMs: 60_000, penaltyAt: 35, penaltyMs: 60_000 },
} as const satisfies Record<string, ScopeConfig>;

export type Scope = keyof typeof SCOPES;

type Entry = {
  burst: number;
  burstAt: number;
  sustained: number;
  sustainedAt: number;
  blockedUntil: number;
  strikes: number;
  lastStrikeAt: number;
};

type Store = { entries: Map<string, Entry>; lastPrune: number };

function store(): Store {
  const g = globalThis as typeof globalThis & { __amRateLimitV2?: Store };
  if (!g.__amRateLimitV2) g.__amRateLimitV2 = { entries: new Map(), lastPrune: 0 };
  return g.__amRateLimitV2;
}

function isStale(e: Entry, now: number): boolean {
  if (now < e.blockedUntil || now < e.burstAt || now < e.sustainedAt) return false;
  return e.strikes === 0 || now - e.lastStrikeAt > STRIKE_DECAY_MS;
}

function prune(s: Store, now: number) {
  s.lastPrune = now;
  for (const [key, entry] of s.entries) {
    if (isStale(entry, now)) s.entries.delete(key);
  }
  // Jaga-jaga kalau key-nya kebanyakan (lonjakan IP unik): buang semua.
  // Gagal terbuka sementara lebih baik daripada makan memori.
  if (s.entries.size > MAX_KEYS) s.entries.clear();
}

function cooldownFor(strikes: number, baseMs: number): number {
  const ms = baseMs * 2 ** Math.min(strikes - 1, MAX_STRIKES - 1);
  return Math.min(ms, MAX_COOLDOWN_MS);
}

export type LimitResult = { ok: boolean; retryAfterSec: number };

export function checkLimit(key: string, cfg: ScopeConfig, now = Date.now()): LimitResult {
  const s = store();
  if (s.entries.size > MAX_KEYS || now - s.lastPrune > 60_000) prune(s, now);

  let e = s.entries.get(key);
  if (!e) {
    e = {
      burst: 0,
      burstAt: now + cfg.burstMs,
      sustained: 0,
      sustainedAt: now + cfg.sustainedMs,
      blockedUntil: 0,
      strikes: 0,
      lastStrikeAt: 0,
    };
    s.entries.set(key, e);
  }

  if (e.strikes > 0 && now - e.lastStrikeAt > STRIKE_DECAY_MS) {
    e.strikes = 0;
  }

  if (now < e.blockedUntil) {
    return { ok: false, retryAfterSec: Math.ceil((e.blockedUntil - now) / 1000) };
  }

  if (now >= e.burstAt) {
    e.burst = 0;
    e.burstAt = now + cfg.burstMs;
  }
  if (now >= e.sustainedAt) {
    e.sustained = 0;
    e.sustainedAt = now + cfg.sustainedMs;
  }

  e.burst += 1;
  e.sustained += 1;

  // Lewat ambang penalty: kasih strike + cooldown yang makin lama.
  if (e.sustained >= cfg.penaltyAt) {
    e.strikes = Math.min(e.strikes + 1, MAX_STRIKES);
    e.lastStrikeAt = now;
    const cooldown = cooldownFor(e.strikes, cfg.penaltyMs);
    e.blockedUntil = now + cooldown;
    e.sustained = 0;
    e.sustainedAt = now + cfg.sustainedMs;
    e.burst = 0;
    e.burstAt = now + cfg.burstMs;
    return { ok: false, retryAfterSec: Math.ceil(cooldown / 1000) };
  }

  if (e.burst > cfg.burst) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((e.burstAt - now) / 1000)) };
  }
  if (e.sustained > cfg.sustained) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((e.sustainedAt - now) / 1000)) };
  }

  return { ok: true, retryAfterSec: 0 };
}

// Cek limit berdasarkan IP klien. Panggil sebelum kerja berat (spawn, antrian, dsb)
// biar permintaan yang kelewat langsung ditolak tanpa makan slot.
export function limitByIp(request: Request, scope: Scope): LimitResult {
  return limitHeaders(request.headers, scope);
}

// Versi yang nerima Headers langsung — dipakai generateMetadata, yang cuma punya
// Headers dari next/headers dan nggak punya objek Request.
export function limitHeaders(headers: Headers, scope: Scope): LimitResult {
  return checkLimit(`${scope}:${clientIp(headers)}`, SCOPES[scope]);
}

export function tooManyRequests(retryAfterSec: number): Response {
  return Response.json(
    { ok: false, error: "kebanyakan permintaan, coba lagi sebentar lagi" },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSec),
        "Cache-Control": "no-store",
      },
    }
  );
}
