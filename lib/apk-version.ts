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
    if (native && typeof native.getVersion === "function") {
      const v = native.getVersion();
      if (typeof v === "string" && v.trim()) {
        return { isApk: true, version: v.trim() };
      }
    }
  } catch {}

  const ua = navigator.userAgent || "";

  // 3. User-Agent eksplisit AMFinderVer/x.x
  const matchVer = ua.match(/AMFinderVer\/(\d+(?:\.\d+)*)/i);
  if (matchVer && matchVer[1]) {
    return { isApk: true, version: matchVer[1] };
  }

  // 4. User-Agent AMFinderApp/x.x
  const matchApp = ua.match(/AMFinderApp\/(\d+(?:\.\d+)*)/i);
  if (matchApp && matchApp[1]) {
    const ver = matchApp[1];
    // Jika versinya bukan "1.0", maka itu versi dinamis aktual
    if (ver !== "1.0") {
      return { isApk: true, version: ver };
    }
    // Jika "1.0" (default pada APK v1.5 s/d v1.8):
    if (/AMFinderDL\/1/i.test(ua)) {
      // APK v1.6 - v1.8 (DownloadListener native aktif)
      return { isApk: true, version: "1.8" };
    }
    // APK v1.5
    return { isApk: true, version: "1.5" };
  }

  // 5. Cek AndroidClipboard bridge (hadir sejak APK v1.5)
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
