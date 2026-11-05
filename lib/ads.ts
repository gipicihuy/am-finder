import { ADS_CONFIG } from "@/config/ads";

const STORAGE_KEY_WEB = "am_ad_dl_web_ts";
const STORAGE_KEY_APK = "am_ad_dl_apk_ts";

/**
 * Deteksi apakah web sedang dibuka di dalam WebView APK Android AM Finder v1.5.
 * WebView v1.5 menambahkan "AMFinderApp/1.0" ke User Agent dan mendaftarkan interface "AndroidClipboard".
 */
export function isAndroidApk(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return (
    navigator.userAgent.includes("AMFinderApp") ||
    !!(window as unknown as { AndroidClipboard?: unknown }).AndroidClipboard
  );
}

/**
 * Memicu pembukaan Direct Link iklan Monetag dengan frequency capping independen.
 *
 * Aturan:
 * - Web: Dibuka via window.open() di tab baru. Timestamp HANYA diperbarui bila popup TIDAK diblokir.
 * - Android (APK v1.5): Diarahkan ke URL eksternal yang otomatis dicegat oleh shouldOverrideUrlLoading()
 *   dan dilempar ke browser native eksternal via Intent.ACTION_VIEW tanpa mereset state WebView.
 *
 * @returns boolean true jika iklan berhasil dipicu, false jika cooldown / diblokir / nonaktif
 */
export function triggerDirectLink(): boolean {
  if (typeof window === "undefined") return false;

  const isApk = isAndroidApk();
  const config = isApk ? ADS_CONFIG.directLink.android : ADS_CONFIG.directLink.web;

  if (!config.enabled) return false;

  const storageKey = isApk ? STORAGE_KEY_APK : STORAGE_KEY_WEB;
  const cooldownMs = config.cooldownMinutes * 60 * 1000;
  const now = Date.now();

  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const last = parseInt(raw, 10);
      if (!isNaN(last) && now - last < cooldownMs) {
        return false; // Masih dalam masa cooldown
      }
    }
  } catch {
    // localStorage diblokir / private mode, abaikan
  }

  const url = ADS_CONFIG.directLink.url;
  if (!url) return false;

  if (isApk) {
    try {
      // WebView APK v1.5 akan mencegat URL non-amfinder.web.id di shouldOverrideUrlLoading()
      // dan membukanya di browser eksternal via Intent, sementara WebView tetap diam di halaman saat ini.
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      try {
        localStorage.setItem(storageKey, String(now));
      } catch {
        // Abaikan jika localStorage tidak bisa ditulis
      }
      return true;
    } catch {
      return false;
    }
  } else {
    try {
      let opened = false;

      // 1. Coba window.open() tanpa 3rd param 'noopener' agar Chromium tidak otomatis return null
      try {
        const win = window.open(url, "_blank");
        if (win) {
          try {
            win.opener = null;
          } catch {
            // Abaikan jika tidak diizinkan
          }
          opened = true;
        }
      } catch {
        opened = false;
      }

      // 2. Fallback via synthetic anchor click (sangat kompatibel di mobile browser)
      if (!opened) {
        try {
          const a = document.createElement("a");
          a.href = url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          opened = true;
        } catch {
          opened = false;
        }
      }

      if (opened) {
        // Berhasil dibuka -> simpan timestamp cooldown
        try {
          localStorage.setItem(storageKey, String(now));
        } catch {
          // Abaikan jika localStorage tidak bisa ditulis
        }
        return true;
      }

      // Jika popup blocker benar-benar memblokir keduanya, cooldown tidak dihanguskan
      return false;
    } catch {
      return false;
    }
  }
}
