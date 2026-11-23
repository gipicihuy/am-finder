export type ApkVersionInfo = {
  isApk: boolean;
  version: string | null;
};

/**
 * Membandingkan dua string versi semver (mis. "1.6" vs "1.8", "2.0.1" vs "2.0").
 * Mengembalikan:
 *  1 jika v1 > v2
 * -1 jika v1 < v2
 *  0 jika v1 === v2
 */
export function compareVersions(v1?: string | null, v2?: string | null): number {
  const clean1 = (v1 || "").replace(/^v/i, "").trim();
  const clean2 = (v2 || "").replace(/^v/i, "").trim();
  if (!clean1 && !clean2) return 0;
  if (!clean1) return -1;
  if (!clean2) return 1;

  const parts1 = clean1.split(".").map((n) => parseInt(n, 10) || 0);
  const parts2 = clean2.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < len; i++) {
    const p1 = parts1[i] ?? 0;
    const p2 = parts2[i] ?? 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

/**
 * Mendeteksi apakah web sedang dibuka di dalam APK AM Finder Android,
 * dan mengekstrak versi aplikasi yang sedang aktif.
 */
export function detectApkVersion(): ApkVersionInfo {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { isApk: false, version: null };
  }

  // 1. Parameter URL untuk pengujian atau simulasi (mis. ?simulate_apk=1.5 atau ?test_apk=1.7)
  try {
    const params = new URLSearchParams(window.location.search);
    const sim = params.get("simulate_apk") || params.get("test_apk");
    if (sim) {
      return { isApk: true, version: sim.trim() };
    }
  } catch {}

  // 2. Bridge native JavascriptInterface (AMFinderNative)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const native = (window as any).AMFinderNative;
    if (native) {
      let v: any = null;
      if (typeof native.getVersion === "function") {
        v = native.getVersion();
      } else if (typeof native.getVersion === "string") {
        v = native.getVersion;
      } else if (typeof native.version === "string") {
        v = native.version;
      }
      if (v != null) {
        const str = String(v).trim();
        if (str && str !== "undefined" && str !== "null") {
          return { isApk: true, version: str };
        }
      }
    }
  } catch {}

  const ua = navigator.userAgent || "";

  // 3. User-Agent eksplisit AMFinderVer/x.x (mis. AMFinderVer/1.8)
  const matchVer = ua.match(/AMFinderVer\/([0-9]+(?:\.[0-9]+)*)/i);
  if (matchVer && matchVer[1]) {
    return { isApk: true, version: matchVer[1].trim() };
  }

  // 4. User-Agent AMFinderApp/x.x (bukan 1.0)
  const matchApp = ua.match(/AMFinderApp\/([0-9]+(?:\.[0-9]+)*)/i);
  if (matchApp && matchApp[1]) {
    const ver = matchApp[1].trim();
    if (ver !== "1.0") {
      return { isApk: true, version: ver };
    }
  }

  // 5. Cek marker AMFinderDL/1 (hadir pada APK v1.6 ke atas)
  // APK v1.8 bawaan release mengirim penanda ini
  if (/AMFinderDL\/1/i.test(ua)) {
    return { isApk: true, version: "1.8" };
  }

  // 6. Cek jika UA memiliki penanda AMFinderApp/1.0 atau AMFinder umum tanpa DownloadListener
  if (/AMFinderApp\/1\.0/i.test(ua) || /AMFinder/i.test(ua)) {
    return { isApk: true, version: "1.5" };
  }

  // 7. Cek AndroidClipboard bridge (hadir sejak APK v1.5)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (Boolean((window as any).AndroidClipboard)) {
    if (/AMFinderDL\/1/i.test(ua)) {
      return { isApk: true, version: "1.8" };
    }
    return { isApk: true, version: "1.5" };
  }

  // Bukan aplikasi APK (browser web biasa)
  return { isApk: false, version: null };
}
