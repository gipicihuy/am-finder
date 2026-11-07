import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isPrivateIp } from "./ip";
import { sendDiscordEmbed } from "./discord";
import { quickActionUrl } from "./security";

export type BlockEntry = {
  ip: string;
  reason: string;
  createdAt: number;
  expiresAt: number | null; // null = permanen
  hits: number;
  lastHitAt?: number;
};

type Store = {
  entries: Map<string, BlockEntry>;
  lastBlockedAlert: Map<string, number>;
  dirty: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

const FILE = path.join(process.cwd(), "data", "blocklist.json");
const FLUSH_DELAY_MS = 2_000;
const BLOCKED_ALERT_INTERVAL_MS = 10 * 60_000; // Maksimal 1 alert per 10 menit per IP yang diblokir

function getStore(): Store {
  const g = globalThis as typeof globalThis & { __amBlocklistStore?: Store };
  if (!g.__amBlocklistStore) {
    g.__amBlocklistStore = {
      entries: load(),
      lastBlockedAlert: new Map(),
      dirty: false,
      timer: null,
    };
  }
  return g.__amBlocklistStore;
}

function load(): Map<string, BlockEntry> {
  const map = new Map<string, BlockEntry>();
  try {
    const raw = readFileSync(FILE, "utf8");
    const list = JSON.parse(raw);
    if (Array.isArray(list)) {
      const now = Date.now();
      for (const item of list) {
        if (item && typeof item.ip === "string") {
          // Buang yang sudah kedaluwarsa saat dimuat
          if (typeof item.expiresAt === "number" && item.expiresAt <= now) continue;
          map.set(item.ip, {
            ip: item.ip,
            reason: typeof item.reason === "string" ? item.reason : "manual block",
            createdAt: typeof item.createdAt === "number" ? item.createdAt : now,
            expiresAt: typeof item.expiresAt === "number" ? item.expiresAt : null,
            hits: typeof item.hits === "number" ? item.hits : 0,
            lastHitAt: typeof item.lastHitAt === "number" ? item.lastHitAt : undefined,
          });
        }
      }
    }
  } catch {
    /* file belum ada atau kosong */
  }
  return map;
}

function flushNow(s: Store): void {
  s.dirty = false;
  try {
    mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    const arr = Array.from(s.entries.values());
    writeFileSync(tmp, JSON.stringify(arr, null, 2), "utf8");
    renameSync(tmp, FILE);
  } catch (err) {
    console.warn("[blocklist] gagal menulis data/blocklist.json:", (err as Error).message);
  }
}

function markDirty(s: Store, immediate = false): void {
  s.dirty = true;
  if (immediate) {
    if (s.timer) clearTimeout(s.timer);
    s.timer = null;
    flushNow(s);
    return;
  }
  if (s.timer) return;
  s.timer = setTimeout(() => {
    s.timer = null;
    if (s.dirty) flushNow(s);
  }, FLUSH_DELAY_MS);
}

function isValidIp(ip: string): boolean {
  if (!ip || typeof ip !== "string") return false;
  const clean = ip.trim();
  if (clean.length < 3 || clean.length > 64) return false;
  // Pola sederhana IPv4 dan IPv6
  const isIpv4 = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(clean);
  const isIpv6 = /^[0-9a-fA-F:]+$/.test(clean) && clean.includes(":");
  return isIpv4 || isIpv6;
}

/** Inisialisasi awal agar data terbaca saat start */
export function ensureBlocklist(): void {
  getStore();
}

/** Cek apakah IP masuk dalam daftar blokir aktif */
export function isBlocked(ip: string): boolean {
  if (!ip || isPrivateIp(ip)) return false;
  const s = getStore();
  const entry = s.entries.get(ip);
  if (!entry) return false;

  const now = Date.now();
  if (entry.expiresAt !== null && entry.expiresAt <= now) {
    s.entries.delete(ip);
    markDirty(s);
    return false;
  }

  return true;
}

/** Ambil info blokir untuk satu IP */
export function getBlockEntry(ip: string): BlockEntry | undefined {
  if (!ip || isPrivateIp(ip)) return undefined;
  const s = getStore();
  const entry = s.entries.get(ip);
  if (!entry) return undefined;

  const now = Date.now();
  if (entry.expiresAt !== null && entry.expiresAt <= now) {
    s.entries.delete(ip);
    markDirty(s);
    return undefined;
  }

  return entry;
}

/** Catat bahwa IP yang terblokir mencoba melakukan request */
export function recordBlockedHit(ip: string): void {
  if (!ip || isPrivateIp(ip)) return;
  const s = getStore();
  const entry = s.entries.get(ip);
  if (!entry) return;

  const now = Date.now();
  entry.hits = (entry.hits || 0) + 1;
  entry.lastHitAt = now;
  markDirty(s);

  // Ringkasan alert berkala: paling sering 10 menit per IP
  const lastAlert = s.lastBlockedAlert.get(ip) || 0;
  if (now - lastAlert >= BLOCKED_ALERT_INTERVAL_MS) {
    s.lastBlockedAlert.set(ip, now);
    sendDiscordEmbed("security", {
      title: "🛡️ Request dari IP Terblokir Ditahan",
      color: 0xe74c3c,
      fields: [
        { name: "🌐 IP", value: `\`${ip}\``, inline: true },
        { name: "📊 Total Hits", value: `${entry.hits} request`, inline: true },
        { name: "Alasan Blokir", value: entry.reason || "Manual", inline: false },
        {
          name: "Kedaluwarsa",
          value: entry.expiresAt ? new Date(entry.expiresAt).toISOString() : "Permanen",
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
    });
  }
}

const GOOD_BOT_REGEX =
  /googlebot|bingbot|duckduckbot|slurp|yandexbot|baiduspider|facebookexternalhit|twitterbot|linkedinbot|applebot|petalbot|semrushbot|ahrefsbot/i;

/** Blokir IP baru (permanen bila ttlMinutes tidak diisi / null) */
export function blockIp(
  ip: string,
  reason = "Aktivitas mencurigakan / flood",
  ttlMinutes?: number | null,
  ua?: string,
): { ok: boolean; entry?: BlockEntry; error?: string } {
  const cleanIp = (ip || "").trim();
  if (!isValidIp(cleanIp)) {
    return { ok: false, error: "Format alamat IP tidak valid" };
  }
  if (isPrivateIp(cleanIp)) {
    return { ok: false, error: "Alamat IP privat atau lokal tidak boleh diblokir" };
  }
  if (ua && GOOD_BOT_REGEX.test(ua)) {
    return { ok: false, error: "Crawler / good bot terverifikasi tidak boleh diblokir" };
  }

  const s = getStore();
  const now = Date.now();
  const expiresAt =
    typeof ttlMinutes === "number" && ttlMinutes > 0 ? now + ttlMinutes * 60_000 : null;

  const existing = s.entries.get(cleanIp);
  const entry: BlockEntry = {
    ip: cleanIp,
    reason: (reason || "").trim() || "Manual block",
    createdAt: existing ? existing.createdAt : now,
    expiresAt,
    hits: existing?.hits || 0,
    lastHitAt: existing?.lastHitAt,
  };

  s.entries.set(cleanIp, entry);
  markDirty(s, true);

  console.warn(`[blocklist] IP ${cleanIp} diblokir. Alasan: ${entry.reason}. Exp: ${expiresAt ? `${ttlMinutes}m` : "permanen"}`);
  return { ok: true, entry };
}

/** Lepas blokir IP */
export function unblockIp(ip: string): { ok: boolean; error?: string } {
  const cleanIp = (ip || "").trim();
  if (!cleanIp) return { ok: false, error: "IP diperlukan" };

  const s = getStore();
  if (!s.entries.has(cleanIp)) {
    return { ok: false, error: "IP tidak ditemukan dalam daftar blokir" };
  }

  s.entries.delete(cleanIp);
  s.lastBlockedAlert.delete(cleanIp);
  markDirty(s, true);

  console.log(`[blocklist] IP ${cleanIp} dilepas dari blokir`);
  return { ok: true };
}

/** Daftar semua IP yang sedang aktif diblokir */
export function listBlocked(): BlockEntry[] {
  const s = getStore();
  const now = Date.now();
  const list: BlockEntry[] = [];
  let pruned = false;

  for (const [ip, entry] of s.entries) {
    if (entry.expiresAt !== null && entry.expiresAt <= now) {
      s.entries.delete(ip);
      pruned = true;
    } else {
      list.push(entry);
    }
  }

  if (pruned) markDirty(s);
  return list;
}

/**
 * Mekanisme Auto-block opsional:
 * Aktif jika env AUTO_BLOCK=1.
 */
export function checkAutoBlock(
  ip: string,
  reason: string,
  extra: { strikes?: number; score?: number; ua?: string } = {},
): boolean {
  if (process.env.AUTO_BLOCK !== "1") return false;
  if (!ip || isPrivateIp(ip)) return false;

  if (extra.ua && GOOD_BOT_REGEX.test(extra.ua)) return false;

  const ttlMinutes = Number(process.env.AUTO_BLOCK_MINUTES) || 60;
  const res = blockIp(ip, `[Auto-Block] ${reason}`, ttlMinutes, extra.ua);
  if (!res.ok || !res.entry) return false;

  // Kirim security embed pemberitahuan auto-block
  const unblockUrl = quickActionUrl("unblock", ip, 0);

  sendDiscordEmbed(
    "security",
    {
      title: "🚨 IP Diblokir Otomatis (Auto-Block)",
      color: 0xff0000,
      fields: [
        { name: "🌐 IP", value: `\`${ip}\``, inline: true },
        { name: "⏱️ Durasi", value: `${ttlMinutes} menit`, inline: true },
        { name: "Alasan", value: reason, inline: false },
        {
          name: "⚡ Aksi Cepat 1-Klik (Buka Blokir)",
          value: `👉 [✅ Buka Blokir (Unblock) IP Ini Sekarang](${unblockUrl})\n*(Atau tap tombol hijau di bawah)*`,
          inline: false,
        },
        {
          name: "Catatan Keamanan",
          value: "Serangan volumetrik besar harus ditahan di tingkat jaringan (Cloudflare / ufw), bukan hanya di aplikasi.",
          inline: false,
        },
      ],
      timestamp: new Date().toISOString(),
    },
    undefined,
    [
      {
        type: 1,
        components: [
          { type: 2, style: 5, label: "✅ Buka Blokir Sekarang", url: unblockUrl },
        ],
      },
    ],
  );

  return true;
}
