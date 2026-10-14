/**
 * Host yang dikenali sebagai link TikTok (termasuk domain pendek baru tt.site
 * dan subdomain seperti www./vt./vm.). ID video 15+ digit juga diterima.
 */
const TIKTOK_LINK = /(?:^|[/.@])(?:tiktok\.com|tt\.site)(?=[/?#:]|$)/i;

const YOUTUBE_LINK =
  /(?:^|[/.@])(?:youtube\.com|youtu\.be|youtube-nocookie\.com)(?=[/?#:]|$)/i;

export function isTikTokLink(value: string): boolean {
  const v = value.trim();
  return TIKTOK_LINK.test(v) || /^\d{15,}$/.test(v);
}

export function isYoutubeLink(value: string): boolean {
  return YOUTUBE_LINK.test(value.trim());
}

/** Link video yang bisa ditempel ke pencari preset (TikTok maupun YouTube). */
export function isVideoLink(value: string): boolean {
  return isTikTokLink(value) || isYoutubeLink(value);
}
