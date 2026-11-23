export type ApkVersionSource =
  | "simulate"
  | "bridge"
  | "ua-ver"
  | "ua-app"
  | "legacy-dl"
  | "legacy-clipboard"
  | "header"
  | "none";

export type ApkVersionInfo = {
  isApk: boolean;
  version: string | null;
  exact: boolean;
  source: ApkVersionSource;
};

export type UpdateDecision = "force" | "optional" | "none";

export type ApkSignals = {
  ua: string;
  search: string;
  nativeVersion: string | null;
  hasClipboardBridge: boolean;
};

export const APK_PACKAGE_NAME = "com.givy.amfinder";
export const LEGACY_DL_VERSION = "1.6";
export const LEGACY_CLIPBOARD_VERSION = "1.5";
export const LEGACY_FLOOR_VERSION = "1.0";

const VERSION_PATTERN = /^\d+(?:\.\d+)*$/;

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

export function decideUpdate(
  version: string | null,
  minimum: string,
  latest: string,
): UpdateDecision {
  if (!version) return "none";
  if (compareVersions(version, minimum) < 0) return "force";
  if (compareVersions(version, latest) < 0) return "optional";
  return "none";
}

export function isLikelyAndroidWebView(ua: string): boolean {
  return /Android/i.test(ua) && /;\s*wv\)/i.test(ua);
}

type HeaderReader = { get(name: string): string | null };

export function isApkRequest(headers: HeaderReader): boolean {
  const requestedWith = (headers.get("x-requested-with") || "").trim();
  if (requestedWith === APK_PACKAGE_NAME) return true;
  const ua = headers.get("user-agent") || "";
  return /AMFinder(?:App|Ver|DL)\//i.test(ua);
}

export function resolveApkVersion(signals: ApkSignals): ApkVersionInfo {
  const sim = new URLSearchParams(signals.search).get("simulate_apk")
    || new URLSearchParams(signals.search).get("test_apk");
  if (sim && sim.trim()) {
    return { isApk: true, version: sim.trim(), exact: true, source: "simulate" };
  }

  const bridge = (signals.nativeVersion || "").trim();
  if (VERSION_PATTERN.test(bridge)) {
    return { isApk: true, version: bridge, exact: true, source: "bridge" };
  }

  const ua = signals.ua || "";

  const matchVer = ua.match(/AMFinderVer\/(\d+(?:\.\d+)*)/i);
  if (matchVer && matchVer[1]) {
    return { isApk: true, version: matchVer[1], exact: true, source: "ua-ver" };
  }

  const matchApp = ua.match(/AMFinderApp\/(\d+(?:\.\d+)*)/i);
  if (matchApp && matchApp[1] && matchApp[1] !== "1.0") {
    return { isApk: true, version: matchApp[1], exact: true, source: "ua-app" };
  }

  if (/AMFinderApp\/1\.0/i.test(ua) || /AMFinderDL\/1/i.test(ua) || /AMFinder/i.test(ua)) {
    return { isApk: true, version: LEGACY_DL_VERSION, exact: false, source: "legacy-dl" };
  }

  if (signals.hasClipboardBridge) {
    return { isApk: true, version: LEGACY_CLIPBOARD_VERSION, exact: true, source: "legacy-clipboard" };
  }

  return { isApk: false, version: null, exact: false, source: "none" };
}

function readNativeVersion(): string | null {
  try {
    const native = (window as unknown as { AMFinderNative?: Record<string, unknown> }).AMFinderNative;
    if (!native) return null;
    const getter = native.getVersion;
    const raw = typeof getter === "function" ? (getter as () => unknown).call(native) : getter ?? native.version;
    return raw == null ? null : String(raw);
  } catch {
    return null;
  }
}

export function detectApkVersion(): ApkVersionInfo {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { isApk: false, version: null, exact: false, source: "none" };
  }

  let hasClipboardBridge = false;
  try {
    hasClipboardBridge = Boolean((window as unknown as { AndroidClipboard?: unknown }).AndroidClipboard);
  } catch {
    hasClipboardBridge = false;
  }

  return resolveApkVersion({
    ua: navigator.userAgent || "",
    search: window.location.search || "",
    nativeVersion: readNativeVersion(),
    hasClipboardBridge,
  });
}
