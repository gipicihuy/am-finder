import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

import { isLocale, type Locale } from "@/lib/i18n";

// Catatan pembaruan bisa berupa satu teks (semua bahasa) atau objek per bahasa: { id, en, zh, my }.
export type ReleaseNotes = string | Partial<Record<Locale, string>>;

export type AppUpdateConfig = {
  latest_version: string;
  minimum_version: string;
  update_url: string;
  release_notes: ReleaseNotes;
};

function parseReleaseNotes(value: unknown): ReleaseNotes {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const out: Partial<Record<Locale, string>> = {};
    for (const [key, text] of Object.entries(value as Record<string, unknown>)) {
      if (isLocale(key) && typeof text === "string" && text.trim()) out[key] = text.trim();
    }
    if (Object.keys(out).length > 0) return out;
  }
  if (typeof value === "string" && value.trim()) return value.trim();
  return DEFAULT_UPDATE_CONFIG.release_notes;
}

const CONFIG_FILE = path.join(process.cwd(), "config", "app-update.json");
const GITHUB_RAW_URL =
  "https://raw.githubusercontent.com/gipicihuy/am-finder/main/config/app-update.json";

export const DEFAULT_UPDATE_CONFIG: AppUpdateConfig = {
  latest_version: "1.8",
  minimum_version: "1.8",
  update_url: "https://safelinkid.com/amfinder-apk",
  release_notes:
    "Pembaruan penting untuk meningkatkan kestabilan, performa pencarian preset, dan perbaikan unduhan.",
};

let cachedConfig: AppUpdateConfig | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 20_000; // Cache 20 detik untuk performa tinggi & respon cepat terhadap perubahan di GitHub

function parseConfig(raw: string): AppUpdateConfig | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.minimum_version === "string") {
      return {
        latest_version: String(parsed.latest_version || DEFAULT_UPDATE_CONFIG.latest_version).trim(),
        minimum_version: String(parsed.minimum_version || DEFAULT_UPDATE_CONFIG.minimum_version).trim(),
        update_url: String(parsed.update_url || DEFAULT_UPDATE_CONFIG.update_url).trim(),
        release_notes: parseReleaseNotes(parsed.release_notes),
      };
    }
  } catch {}
  return null;
}

function readLocalConfigFile(): AppUpdateConfig | null {
  if (existsSync(CONFIG_FILE)) {
    try {
      const raw = readFileSync(CONFIG_FILE, "utf8");
      return parseConfig(raw);
    } catch {}
  }
  return null;
}

/**
 * Mengambil konfigurasi update APK.
 * Prioritas:
 * 1. Langsung fetch dari GitHub repo (https://raw.githubusercontent.com/gipicihuy/am-finder/main/config/app-update.json)
 *    sehingga user bisa mengubah versi & link SafelinkU langsung di GitHub web tanpa akses VPS.
 * 2. Fallback membaca file lokal config/app-update.json yang ter-sync di repositori.
 * 3. Fallback nilai default DEFAULT_UPDATE_CONFIG.
 */
export async function getAppUpdateConfig(): Promise<AppUpdateConfig> {
  const now = Date.now();
  if (cachedConfig && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedConfig;
  }

  // 1. Coba ambil versi langsung dari GitHub repo
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${GITHUB_RAW_URL}?t=${now}`, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "AMFinder-Server/1.0",
      },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const text = await res.text();
      const parsed = parseConfig(text);
      if (parsed) {
        cachedConfig = parsed;
        lastFetchTime = now;
        return parsed;
      }
    }
  } catch {
    // Jika fetch GitHub gagal atau timeout, lanjut ke fallback lokal
  }

  // 2. Fallback baca file config/app-update.json lokal dari repo
  const localConfig = readLocalConfigFile();
  if (localConfig) {
    cachedConfig = localConfig;
    lastFetchTime = now;
    return localConfig;
  }

  // 3. Fallback konfigurasi default
  cachedConfig = DEFAULT_UPDATE_CONFIG;
  lastFetchTime = now;
  return cachedConfig;
}
