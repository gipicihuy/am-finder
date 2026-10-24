export function isInAndroidApp(): boolean {
  if (typeof window === "undefined") return false;
  if ("AndroidClipboard" in window) return true;
  if (/AMFinderApp\//i.test(navigator.userAgent)) return true;
  return /(?:^|;\s*)am_app=1(?:;|$)/.test(document.cookie);
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}
