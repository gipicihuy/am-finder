export function isTikTokUrlExpired(url?: string): boolean {
  if (!url || typeof url !== "string") return false;
  if (url.startsWith("/")) return false;
  const qm = url.match(/[?&](?:x-expires|expire)=(\d+)/i);
  if (qm) {
    const sec = Number(qm[1]);
    if (!Number.isNaN(sec) && sec > 0) {
      return sec * 1000 <= Date.now() + 60_000;
    }
  }
  const pm = url.match(/\/([a-f0-9]{32})\/([a-f0-9]{8})\//i);
  if (pm) {
    const expiresSec = parseInt(pm[2], 16);
    if (!Number.isNaN(expiresSec) && expiresSec > 1_000_000_000) {
      return expiresSec * 1000 <= Date.now() + 60_000;
    }
  }
  return false;
}

export function extractTikTokId(url?: string): string | null {
  if (!url || typeof url !== "string") return null;
  const m = url.match(/\/video\/(\d{15,20})/i) || url.match(/^(\d{15,20})$/);
  return m ? m[1] : null;
}
