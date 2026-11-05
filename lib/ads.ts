export function isAndroidApk(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return (
    navigator.userAgent.includes("AMFinderApp") ||
    !!(window as unknown as { AndroidClipboard?: unknown }).AndroidClipboard
  );
}

export function triggerDirectLink(): boolean {
  return false;
}
