/**
 * Host yang dikenali sebagai link TikTok (termasuk domain pendek baru tt.site
 * dan subdomain seperti www./vt./vm.). ID video 15+ digit juga diterima.
 */
const TIKTOK_LINK = /(?:^|[/.@])(?:tiktok\.com|tt\.site)(?=[/?#:]|$)/i;

const YOUTUBE_LINK =
  /(?:^|[/.@])(?:youtube\.com|youtu\.be|youtube-nocookie\.com)(?=[/?#:]|$)/i;

/** Pola URL TikTok di dalam teks (dengan skema http/https). */
const TIKTOK_URL_REGEX =
  /https?:\/\/(?:(?:vt|vm|www|m|t)\.)?(?:tiktok\.com|tt\.site)\/[^\s<>"'`]+/i;

/** Pola URL YouTube di dalam teks (dengan skema http/https). */
const YOUTUBE_URL_REGEX =
  /https?:\/\/(?:(?:www|m|music)\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\/[^\s<>"'`]+/i;

/** Pola URL video tanpa skema di dalam teks (mis. vt.tiktok.com/xxx atau youtu.be/xxx). */
const SCHEMELESS_TIKTOK_REGEX =
  /(?:^|\s)((?:(?:vt|vm|www|m|t)\.)?(?:tiktok\.com|tt\.site)\/[^\s<>"'`]+)/i;
const SCHEMELESS_YOUTUBE_REGEX =
  /(?:^|\s)((?:(?:www|m|music)\.)?(?:youtube\.com|youtu\.be)\/[^\s<>"'`]+)/i;

/** ID video TikTok: 19 digit biasanya, dibatesin 15-20. */
const TIKTOK_ID = /^\d{15,20}$/;
/** ID video YouTube: tepat 11 karakter. */
const YOUTUBE_ID = /^[\w-]{11}$/;

/** Bersihkan tanda baca liar di akhir URL hasil regex (titik, koma, tanda petik, dsb). */
function cleanExtractedUrl(raw: string): string {
  let u = raw.trim();
  while (/[.,;:!?'")\]}>]$/.test(u)) {
    u = u.slice(0, -1);
  }
  return u;
}

/**
 * Ekstrak link video TikTok atau YouTube yang bersih dari teks apa pun,
 * termasuk teks pesan campuran, multiline caption, atau teks kotor yang ditempel user.
 * Mengembalikan URL video yang bersih, ID video jika berupa ID murni, atau null jika tidak ada link video.
 */
export function extractVideoUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;

  // Jika input berupa ID video langsung
  if (isBareVideoId(raw)) return raw;

  // Cek apakah ada URL TikTok lengkap
  const ttMatch = raw.match(TIKTOK_URL_REGEX);
  if (ttMatch) {
    const cleaned = cleanExtractedUrl(ttMatch[0]);
    try {
      const u = new URL(cleaned);
      if (u.protocol === "http:" || u.protocol === "https:") {
        return cleaned;
      }
    } catch {
      /* abaikan */
    }
  }

  // Cek apakah ada URL YouTube lengkap
  const ytMatch = raw.match(YOUTUBE_URL_REGEX);
  if (ytMatch) {
    const cleaned = cleanExtractedUrl(ytMatch[0]);
    try {
      const u = new URL(cleaned);
      if (u.protocol === "http:" || u.protocol === "https:") {
        return cleaned;
      }
    } catch {
      /* abaikan */
    }
  }

  // Cek URL TikTok tanpa protokol
  const noSchemeTt = raw.match(SCHEMELESS_TIKTOK_REGEX);
  if (noSchemeTt) {
    const cleaned = cleanExtractedUrl(noSchemeTt[1]);
    try {
      const u = new URL("https://" + cleaned);
      if (u.hostname) return "https://" + cleaned;
    } catch {
      /* abaikan */
    }
  }

  // Cek URL YouTube tanpa protokol
  const noSchemeYt = raw.match(SCHEMELESS_YOUTUBE_REGEX);
  if (noSchemeYt) {
    const cleaned = cleanExtractedUrl(noSchemeYt[1]);
    try {
      const u = new URL("https://" + cleaned);
      if (u.hostname) return "https://" + cleaned;
    } catch {
      /* abaikan */
    }
  }

  return null;
}

export function isTikTokLink(value: string): boolean {
  const extracted = extractVideoUrl(value);
  if (!extracted) return false;
  return TIKTOK_LINK.test(extracted) || /^\d{15,}$/.test(extracted);
}

// Kode pendek di link share TikTok (vt./vm.tiktok.com/xxx). Isinya acak dan
// panjangnya tidak pasti, jadi dibatesin huruf/angka 5-20 karakter.
const TIKTOK_SHORT = /(?:^|\/\/)(?:vt|vm)\.tiktok\.com\/([A-Za-z0-9]{5,20})(?:[/?#]|$)/i;

/** Kode pendek dari link share TikTok, atau null kalau bukan link pendek. */
export function shortCodeOf(value: string): string | null {
  const clean = extractVideoUrl(value) ?? value.trim();
  const m = clean.match(TIKTOK_SHORT);
  return m ? m[1] : null;
}

export function isYoutubeLink(value: string): boolean {
  const extracted = extractVideoUrl(value);
  if (!extracted) return false;
  return YOUTUBE_LINK.test(extracted) || YOUTUBE_ID.test(extracted);
}

/** Link video yang bisa ditempel ke pencari preset (TikTok maupun YouTube). */
export function isVideoLink(value: string): boolean {
  return extractVideoUrl(value) !== null;
}

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
  const v = extractVideoUrl(value) ?? value.trim();
  if (TIKTOK_ID.test(v)) return v;
  return v.match(/\/(?:video|photo)\/(\d{15,20})(?:[/?#]|$)/)?.[1] ?? null;
}

/** Ambil ID video YouTube dari input apa pun (watch, youtu.be, shorts, live, embed, atau ID polos). */
export function youtubeId(value: string): string | null {
  const v = extractVideoUrl(value) ?? value.trim();
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
