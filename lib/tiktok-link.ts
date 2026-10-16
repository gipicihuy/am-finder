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

// Kode pendek di link share TikTok (vt./vm.tiktok.com/xxx). Isinya acak dan
// panjangnya tidak pasti, jadi dibatesin huruf/angka 5-20 karakter.
const TIKTOK_SHORT = /(?:^|\/\/)(?:vt|vm)\.tiktok\.com\/([A-Za-z0-9]{5,20})(?:[/?#]|$)/i;

/** Kode pendek dari link share TikTok, atau null kalau bukan link pendek. */
export function shortCodeOf(value: string): string | null {
  const m = value.trim().match(TIKTOK_SHORT);
  return m ? m[1] : null;
}

export function isYoutubeLink(value: string): boolean {
  return YOUTUBE_LINK.test(value.trim());
}

/** Link video yang bisa ditempel ke pencari preset (TikTok maupun YouTube). */
export function isVideoLink(value: string): boolean {
  return isTikTokLink(value) || isYoutubeLink(value);
}

/** ID video TikTok: 19 digit biasanya, dibatesin 15-20. */
const TIKTOK_ID = /^\d{15,20}$/;
/** ID video YouTube: tepat 11 karakter. */
const YOUTUBE_ID = /^[\w-]{11}$/;

/** Angka polos yang memang ID video (bukan URL, bukan kata kunci). */
export function isBareVideoId(value: string): boolean {
  const v = value.trim();
  return TIKTOK_ID.test(v) || YOUTUBE_ID.test(v);
}

/**
 * Ambil ID video TikTok dari input apa pun: ID polos, link panjang, atau link
 * pendek yang sudah di-resolve. Link pendek (vt./vm./tt.site) balikin null —
 * ID-nya baru bisa diketahui setelah redirect diikuti.
 */
export function tiktokId(value: string): string | null {
  const v = value.trim();
  if (TIKTOK_ID.test(v)) return v;
  return v.match(/\/(?:video|photo)\/(\d{15,20})(?:[/?#]|$)/)?.[1] ?? null;
}

/** Ambil ID video YouTube dari input apa pun (watch, youtu.be, shorts, live, embed, atau ID polos). */
export function youtubeId(value: string): string | null {
  const v = value.trim();
  if (YOUTUBE_ID.test(v)) return v;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(v) ? v : "https://" + v);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\.|^music\./, "");
  if (host === "youtu.be") {
    const id = u.pathname.split("/")[1];
    return id && YOUTUBE_ID.test(id) ? id : null;
  }
  if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    const q = u.searchParams.get("v");
    if (q && YOUTUBE_ID.test(q)) return q;
    return u.pathname.match(/^\/(?:shorts|live|embed|v|e)\/([\w-]{11})(?:[/?#]|$)/)?.[1] ?? null;
  }
  return null;
}

/**
 * Sumber + ID video yang bisa dipakai buat alamat /preset/<sumber>/<id>.
 * Null kalau ID-nya belum bisa diketahui dari input (link pendek belum resolve).
 */
export function videoIdOf(value: string): { source: "tiktok" | "youtube"; id: string } | null {
  const yt = youtubeId(value);
  if (yt) return { source: "youtube", id: yt };
  const tt = tiktokId(value);
  if (tt) return { source: "tiktok", id: tt };
  return null;
}

/** Susun alamat /preset/<sumber>/<id>. Null kalau ID-nya belum bisa dibaca dari input. */
export function presetPathOf(value: string): string | null {
  const id = videoIdOf(value);
  return id ? `/preset/${id.source}/${id.id}` : null;
}
