import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Penyimpanan API key publik + kuota harian.
 *
 * Aturan penting:
 * - Hanya hash SHA-256 yang disimpan. Key asli cuma muncul sekali saat dibuat.
 * - Ada satu proses `next start` (pm2 fork), jadi file JSON aman ditulis dari
 *   proses ini. Script CLI memakai endpoint admin, bukan menulis file langsung.
 * - Counter kuota ada di memori (globalThis) dan di-flush dengan debounce.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "apikeys.json");
const TOKEN_FILE = path.join(DATA_DIR, ".admin-token");
const FLUSH_MS = 5_000;
const KEY_PREFIX = "amf_";
const TIMEZONE = "Asia/Jakarta";
const DEFAULT_GLOBAL_DAILY = 3_000;

export type ApiKeyRecord = {
  id: string;
  name: string;
  contact: string | null;
  hash: string;
  prefix: string;
  dailyLimit: number | null;
  expiresAt: number | null;
  revoked: boolean;
  createdAt: number;
};

export type ApiKeyView = Omit<ApiKeyRecord, "hash">;

type Usage = {
  day: string;
  perKey: Record<string, number>;
  global: number;
};

type Store = {
  keys: ApiKeyRecord[];
  usage: Usage;
  dirty: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

function store(): Store {
  const g = globalThis as typeof globalThis & { __amApiKeyStore?: Store };
  if (!g.__amApiKeyStore) {
    const loaded = load();
    g.__amApiKeyStore = {
      keys: loaded.keys,
      usage: loaded.usage,
      dirty: false,
      timer: null,
    };
  }
  return g.__amApiKeyStore;
}

const DAY_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE });

function dayKey(date = new Date()): string {
  return DAY_FMT.format(date);
}

function emptyUsage(): Usage {
  return { day: dayKey(), perKey: {}, global: 0 };
}

function normalizeUsage(raw: unknown): Usage {
  if (!raw || typeof raw !== "object") return emptyUsage();
  const value = raw as Record<string, unknown>;
  const perKey: Record<string, number> = {};
  if (value.perKey && typeof value.perKey === "object") {
    for (const [key, used] of Object.entries(value.perKey as Record<string, unknown>)) {
      if (typeof used === "number" && Number.isFinite(used) && used >= 0) {
        perKey[key] = Math.floor(used);
      }
    }
  }
  return {
    day: typeof value.day === "string" ? value.day : dayKey(),
    perKey,
    global:
      typeof value.global === "number" && Number.isFinite(value.global) && value.global >= 0
        ? Math.floor(value.global)
        : 0,
  };
}

function normalizeRecord(raw: unknown): ApiKeyRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== "string" || !value.id) return null;
  if (typeof value.hash !== "string" || !/^[a-f0-9]{64}$/i.test(value.hash)) return null;
  if (typeof value.prefix !== "string" || !value.prefix) return null;
  if (typeof value.name !== "string") return null;
  return {
    id: value.id,
    name: value.name,
    contact: typeof value.contact === "string" ? value.contact : null,
    hash: value.hash.toLowerCase(),
    prefix: value.prefix,
    dailyLimit:
      typeof value.dailyLimit === "number" && Number.isFinite(value.dailyLimit)
        ? Math.max(0, Math.floor(value.dailyLimit))
        : null,
    expiresAt:
      typeof value.expiresAt === "number" && Number.isFinite(value.expiresAt)
        ? Math.floor(value.expiresAt)
        : null,
    revoked: value.revoked === true,
    createdAt:
      typeof value.createdAt === "number" && Number.isFinite(value.createdAt)
        ? Math.floor(value.createdAt)
        : Date.now(),
  };
}

function load(): { keys: ApiKeyRecord[]; usage: Usage } {
  try {
    const raw = JSON.parse(readFileSync(FILE, "utf8")) as {
      keys?: unknown;
      usage?: unknown;
    };
    const keys = Array.isArray(raw.keys)
      ? raw.keys.map(normalizeRecord).filter((key): key is ApiKeyRecord => key !== null)
      : [];
    return { keys, usage: normalizeUsage(raw.usage) };
  } catch {
    return { keys: [], usage: emptyUsage() };
  }
}

function persist(s: Store): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify({ version: 1, keys: s.keys, usage: s.usage }));
    renameSync(tmp, FILE);
    s.dirty = false;
  } catch {
    /* data API key bukan jalur kritis request; gagal tulis dicoba lagi nanti */
  }
}

function scheduleSave(s: Store): void {
  s.dirty = true;
  if (s.timer) return;
  s.timer = setTimeout(() => {
    s.timer = null;
    if (s.dirty) persist(s);
  }, FLUSH_MS);
  s.timer.unref?.();
}

function ensureDay(s: Store): void {
  const today = dayKey();
  if (s.usage.day === today) return;
  s.usage = { day: today, perKey: {}, global: 0 };
  s.dirty = true;
  scheduleSave(s);
}

// ---------------------------------------------------------------------------
// Kuota
// ---------------------------------------------------------------------------

export function apiGlobalDailyLimit(): number {
  const raw = Number(process.env.AMF_API_GLOBAL_DAILY);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_GLOBAL_DAILY;
  return Math.floor(raw);
}

/** Awal hari berikutnya (00:00 WIB) dalam epoch milidetik. WIB = UTC+7 tanpa DST. */
function nextResetMs(now = Date.now()): number {
  const wib = new Date(now + 7 * 3_600_000);
  return (
    Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate() + 1) -
    7 * 3_600_000
  );
}

export type QuotaSnapshot = {
  limit: number;
  used: number;
  remaining: number;
  reset: number;
  globalLimit: number;
  globalUsed: number;
};

export function quotaSnapshot(record: ApiKeyRecord): QuotaSnapshot {
  const s = store();
  ensureDay(s);
  const globalLimit = apiGlobalDailyLimit();
  const used = s.usage.perKey[record.id] || 0;
  const globalUsed = s.usage.global;
  const dailyLimit = record.dailyLimit;
  const limit = dailyLimit ?? globalLimit;
  const remaining =
    dailyLimit === null
      ? Math.max(0, globalLimit - globalUsed)
      : Math.max(0, Math.min(dailyLimit - used, globalLimit - globalUsed));
  return {
    limit,
    used,
    remaining,
    reset: Math.floor(nextResetMs() / 1000),
    globalLimit,
    globalUsed,
  };
}

export function quotaHeaders(record: ApiKeyRecord): Record<string, string> {
  const snapshot = quotaSnapshot(record);
  return {
    "Cache-Control": "no-store",
    "X-RateLimit-Limit": String(snapshot.limit),
    "X-RateLimit-Remaining": String(snapshot.remaining),
    "X-RateLimit-Reset": String(snapshot.reset),
  };
}

export type QuotaCheck =
  | { ok: true }
  | {
      ok: false;
      status: 429 | 503;
      code: "daily_quota_exceeded" | "global_daily_cap";
      error: string;
    };

export function checkDailyQuota(record: ApiKeyRecord): QuotaCheck {
  const s = store();
  ensureDay(s);
  const used = s.usage.perKey[record.id] || 0;
  if (record.dailyLimit !== null && used >= record.dailyLimit) {
    return {
      ok: false,
      status: 429,
      code: "daily_quota_exceeded",
      error: "kuota harian API key sudah habis",
    };
  }
  const globalLimit = apiGlobalDailyLimit();
  if (s.usage.global >= globalLimit) {
    return {
      ok: false,
      status: 503,
      code: "global_daily_cap",
      error: "plafon global request API harian sudah tercapai",
    };
  }
  return { ok: true };
}

export function reserveQuota(record: ApiKeyRecord): void {
  const s = store();
  ensureDay(s);
  s.usage.perKey[record.id] = (s.usage.perKey[record.id] || 0) + 1;
  s.usage.global += 1;
  scheduleSave(s);
}

/** Kembalikan kuota yang sudah direservasi saat request gagal di upstream. */
export function refundQuota(record: ApiKeyRecord): void {
  const s = store();
  // Kalau hari sudah berganti di tengah request, jangan mengurangi counter hari baru.
  if (s.usage.day !== dayKey()) return;
  const used = s.usage.perKey[record.id] || 0;
  if (used > 0) s.usage.perKey[record.id] = used - 1;
  else delete s.usage.perKey[record.id];
  s.usage.global = Math.max(0, s.usage.global - 1);
  scheduleSave(s);
}

// ---------------------------------------------------------------------------
// Key
// ---------------------------------------------------------------------------

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function publicView(record: ApiKeyRecord): ApiKeyView {
  const { hash: _hash, ...rest } = record;
  return rest;
}

export function createApiKey(input: {
  name: string;
  contact?: string | null;
  dailyLimit?: number | null;
  expiresAt?: number | null;
}): { key: string; record: ApiKeyView } {
  const s = store();
  const key = `${KEY_PREFIX}${randomBytes(16).toString("hex")}`;
  const record: ApiKeyRecord = {
    id: randomBytes(8).toString("hex"),
    name: String(input.name || "").trim().slice(0, 80) || "API key",
    contact:
      typeof input.contact === "string" && input.contact.trim()
        ? input.contact.trim().slice(0, 200)
        : null,
    hash: hashKey(key),
    prefix: key.slice(0, 8),
    dailyLimit:
      typeof input.dailyLimit === "number" && Number.isFinite(input.dailyLimit)
        ? Math.max(0, Math.floor(input.dailyLimit))
        : null,
    expiresAt:
      typeof input.expiresAt === "number" && Number.isFinite(input.expiresAt)
        ? Math.floor(input.expiresAt)
        : null,
    revoked: false,
    createdAt: Date.now(),
  };
  s.keys.push(record);
  persist(s);
  return { key, record: publicView(record) };
}

export function listApiKeys(): ApiKeyView[] {
  return store().keys.map(publicView);
}

export type ApiKeyPatch = {
  dailyLimit?: number | null;
  expiresAt?: number | null;
  revoked?: boolean;
};

export function updateApiKey(id: string, patch: ApiKeyPatch): ApiKeyView | null {
  const s = store();
  const record = s.keys.find((item) => item.id === id);
  if (!record) return null;

  if (Object.prototype.hasOwnProperty.call(patch, "dailyLimit")) {
    record.dailyLimit =
      typeof patch.dailyLimit === "number" && Number.isFinite(patch.dailyLimit)
        ? Math.max(0, Math.floor(patch.dailyLimit))
        : null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "expiresAt")) {
    record.expiresAt =
      typeof patch.expiresAt === "number" && Number.isFinite(patch.expiresAt)
        ? Math.floor(patch.expiresAt)
        : null;
  }
  if (typeof patch.revoked === "boolean") record.revoked = patch.revoked;

  persist(s);
  return publicView(record);
}

export function deleteApiKey(id: string): boolean {
  const s = store();
  const index = s.keys.findIndex((item) => item.id === id);
  if (index < 0) return false;
  s.keys.splice(index, 1);
  persist(s);
  return true;
}

export type ApiAuthResult =
  | { ok: true; record: ApiKeyRecord }
  | {
      ok: false;
      status: 401;
      code: "missing_key" | "invalid_key" | "key_revoked" | "key_expired";
      error: string;
    };

export function authenticateApiKey(headers: Headers, queryKey?: string | null): ApiAuthResult {
  const authorization = headers.get("authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
  // Urutan: header Authorization, lalu X-API-Key, lalu parameter ?apikey=
  // (parameter dipakai supaya gampang dites langsung dari browser).
  const raw = bearer || headers.get("x-api-key")?.trim() || queryKey?.trim() || "";

  if (!raw) {
    return { ok: false, status: 401, code: "missing_key", error: "API key wajib dikirim" };
  }
  if (!/^amf_[A-Za-z0-9_-]{32}$/.test(raw)) {
    return { ok: false, status: 401, code: "invalid_key", error: "API key tidak valid" };
  }

  const s = store();
  ensureDay(s);

  const incoming = Buffer.from(hashKey(raw), "hex");
  let matched: ApiKeyRecord | null = null;
  for (const record of s.keys) {
    const stored = Buffer.from(record.hash, "hex");
    if (stored.length === incoming.length && timingSafeEqual(stored, incoming)) {
      matched = record;
    }
  }

  if (!matched) {
    return { ok: false, status: 401, code: "invalid_key", error: "API key tidak valid" };
  }
  if (matched.revoked) {
    return { ok: false, status: 401, code: "key_revoked", error: "API key sudah dicabut" };
  }
  if (matched.expiresAt !== null && Date.now() >= matched.expiresAt) {
    return { ok: false, status: 401, code: "key_expired", error: "API key sudah kedaluwarsa" };
  }
  return { ok: true, record: matched };
}

// ---------------------------------------------------------------------------
// Token admin
// ---------------------------------------------------------------------------

let cachedAdminToken: string | null = null;

function adminToken(): string {
  const fromEnv = process.env.AMF_ADMIN_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  if (cachedAdminToken) return cachedAdminToken;

  try {
    const saved = readFileSync(TOKEN_FILE, "utf8").trim();
    if (saved) {
      try {
        chmodSync(TOKEN_FILE, 0o600);
      } catch {
        /* permission lama mungkin tidak bisa diubah */
      }
      cachedAdminToken = saved;
      return saved;
    }
  } catch {
    /* belum ada file token */
  }

  // 24 byte = 48 karakter hex.
  const token = randomBytes(24).toString("hex");
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
    try {
      chmodSync(TOKEN_FILE, 0o600);
    } catch {
      /* best effort */
    }
  } catch {
    /* tetap pakai token di memori kalau file tidak bisa ditulis */
  }
  cachedAdminToken = token;
  return token;
}

/** Dipanggil saat server mulai supaya data/.admin-token sudah ada. */
export function ensureAdminToken(): void {
  adminToken();
}

export function verifyAdminToken(headers: Headers): boolean {
  const authorization = headers.get("authorization") || "";
  const token =
    authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ||
    headers.get("x-admin-token")?.trim() ||
    "";
  if (!token) return false;
  return safeEqual(token, adminToken());
}
