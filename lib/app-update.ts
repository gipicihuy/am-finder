import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

export type AppUpdateConfig = {
  latest_version: string;
  minimum_version: string;
  update_url: string;
  release_notes: string;
};

const DATA_FILE = path.join(process.cwd(), "data", "app-update.json");
const CONFIG_FILE = path.join(process.cwd(), "config", "app-update.json");

export const DEFAULT_UPDATE_CONFIG: AppUpdateConfig = {
  latest_version: "1.8",
  minimum_version: "1.8",
  update_url: "https://safelinkid.com/amfinder-apk",
  release_notes:
    "Pembaruan penting untuk meningkatkan kestabilan, performa pencarian preset, dan perbaikan unduhan.",
};

let cachedConfig: AppUpdateConfig | null = null;
let lastReadTime = 0;
const CACHE_TTL_MS = 2_000; // Cache 2 detik agar perubahan file JSON langsung terbaca tanpa restart

export function getAppUpdateConfig(): AppUpdateConfig {
  const now = Date.now();
  if (cachedConfig && now - lastReadTime < CACHE_TTL_MS) {
    return cachedConfig;
  }

  // 1. Cek file data/app-update.json di server VPS (prioritas utama)
  if (existsSync(DATA_FILE)) {
    try {
      const raw = readFileSync(DATA_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.minimum_version === "string") {
        cachedConfig = {
          latest_version: String(parsed.latest_version || DEFAULT_UPDATE_CONFIG.latest_version).trim(),
          minimum_version: String(parsed.minimum_version || DEFAULT_UPDATE_CONFIG.minimum_version).trim(),
          update_url: String(parsed.update_url || DEFAULT_UPDATE_CONFIG.update_url).trim(),
          release_notes: String(parsed.release_notes || DEFAULT_UPDATE_CONFIG.release_notes).trim(),
        };
        lastReadTime = now;
        return cachedConfig;
      }
    } catch {}
  }

  // 2. Cek file config/app-update.json (fallback bawaan repository)
  if (existsSync(CONFIG_FILE)) {
    try {
      const raw = readFileSync(CONFIG_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.minimum_version === "string") {
        cachedConfig = {
          latest_version: String(parsed.latest_version || DEFAULT_UPDATE_CONFIG.latest_version).trim(),
          minimum_version: String(parsed.minimum_version || DEFAULT_UPDATE_CONFIG.minimum_version).trim(),
          update_url: String(parsed.update_url || DEFAULT_UPDATE_CONFIG.update_url).trim(),
          release_notes: String(parsed.release_notes || DEFAULT_UPDATE_CONFIG.release_notes).trim(),
        };
        lastReadTime = now;
        return cachedConfig;
      }
    } catch {}
  }

  // 3. Fallback default & sinkronkan ke data/app-update.json
  try {
    const dir = path.dirname(DATA_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_UPDATE_CONFIG, null, 2), "utf8");
  } catch {}

  cachedConfig = DEFAULT_UPDATE_CONFIG;
  lastReadTime = now;
  return cachedConfig;
}

export function saveAppUpdateConfig(patch: Partial<AppUpdateConfig>): AppUpdateConfig {
  const current = getAppUpdateConfig();
  const updated: AppUpdateConfig = {
    latest_version: patch.latest_version !== undefined ? String(patch.latest_version).trim() : current.latest_version,
    minimum_version: patch.minimum_version !== undefined ? String(patch.minimum_version).trim() : current.minimum_version,
    update_url: patch.update_url !== undefined ? String(patch.update_url).trim() : current.update_url,
    release_notes: patch.release_notes !== undefined ? String(patch.release_notes).trim() : current.release_notes,
  };

  try {
    const dir = path.dirname(DATA_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(DATA_FILE, JSON.stringify(updated, null, 2), "utf8");
  } catch {}

  cachedConfig = updated;
  lastReadTime = Date.now();
  return updated;
}
