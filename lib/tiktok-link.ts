/**
 * Host yang dikenali sebagai link TikTok (termasuk domain pendek baru tt.site
 * dan subdomain seperti www./vt./vm.). ID video 15+ digit juga diterima.
 */
const TIKTOK_LINK = /(?:^|[/.@])(?:tiktok\.com|tt\.site)(?=[/?#:]|$)/i;

export function isTikTokLink(value: string): boolean {
  const v = value.trim();
  return TIKTOK_LINK.test(v) || /^\d{15,}$/.test(v);
}
