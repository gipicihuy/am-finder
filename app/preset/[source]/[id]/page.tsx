import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Finder } from "@/components/Finder";
import { SectionOrnament } from "@/components/Ornament";
import { getOgMeta, isPreviewBot } from "@/lib/og-meta";

// Sengaja force-dynamic: alamat ini bisa sangat banyak (satu per video) dan
// isinya kerangka yang diisi dari browser. Dibiarkan static, Next bakal coba
// merendernya waktu build dan malah menggoda kita untuk mengambil data di server.
export const dynamic = "force-dynamic";

const SITE_URL = "https://amfinder.web.id";
const SITE_NAME = "AM Preset Finder";
const OG_DESCRIPTION = "Cari link preset Alight Motion dari video ini";
// Jaring pengaman kalau fetch metadata gagal: tetap preview ber-brand.
const FALLBACK_IMAGE = "/og-image.png";

const SOURCES = ["tiktok", "youtube"] as const;
type Source = (typeof SOURCES)[number];

// Bentuk ID per sumber — sengaja ketat supaya alamat sampah langsung 404,
// bukan diteruskan ke scraper cuma buang-buang jatah rate limit.
const ID_PATTERN: Record<Source, RegExp> = {
  tiktok: /^\d{15,20}$/,
  youtube: /^[\w-]{11}$/,
};

function parse(source: string, id: string): { source: Source; id: string } | null {
  if (!SOURCES.includes(source as Source)) return null;
  if (!ID_PATTERN[source as Source].test(id)) return null;
  return { source: source as Source, id };
}

// Link video yang ditempel ke kolom pencari. Sengaja URL lengkap, bukan ID
// polos, supaya kelihatan seperti tempelan biasa di beranda. Scraper sudah
// mengenali ID yang tertanam di dalamnya, jadi tidak ada request tambahan.
function videoUrlOf({ source, id }: { source: Source; id: string }): string {
  return source === "youtube"
    ? `https://www.youtube.com/watch?v=${id}`
    : `https://www.tiktok.com/@/video/${id}`;
}

// Caption TikTok biasanya nempel hashtag dan tautan di belakangnya. Dibuang
// dulu biar judul preview rapi, lalu dipotong — platform punya batas panjang
// sendiri dan judul kepanjangan justru dipotong pakai "…".
function clipTitle(raw: string): string {
  const t = raw
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/#[^\s#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";
  return t.length > 80 ? `${t.slice(0, 79).trimEnd()}…` : t;
}

type PageProps = { params: Promise<{ source: string; id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { source, id } = await params;
  const parsed = parse(source, id);
  const generic = parsed
    ? `${parsed.source === "youtube" ? "Preset YouTube" : "Preset TikTok"} — ${SITE_NAME}`
    : "Preset — AM Preset Finder";
  const robots = { index: false as const, follow: false as const };
  if (!parsed) return { title: generic, robots };

  // Yang bikin server mengambil judul + thumbnail cuma bot pratinjau
  // (WhatsApp/Telegram/Facebook/dll). Pengunjung manusia dapat preview
  // generik — nol request keluar, nol delay buka halaman.
  let meta = null;
  try {
    const h = await headers();
    if (isPreviewBot(h.get("user-agent") || "")) meta = await getOgMeta(parsed.source, parsed.id, h);
  } catch {
    /* metadata bukan kewajiban — biarkan yang generik */
  }

  const title = (meta?.title && clipTitle(meta.title)) || generic;
  const description = OG_DESCRIPTION;
  const url = `${SITE_URL}/preset/${parsed.source}/${parsed.id}`;
  const image = meta?.image || FALLBACK_IMAGE;
  const alt = meta?.title ? clipTitle(meta.title) || title : title;

  return {
    title,
    description,
    robots,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url,
      images: [{ url: image, alt }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function PresetPage({ params }: PageProps) {
  const { source, id } = await params;
  const parsed = parse(source, id);
  if (!parsed) notFound();

  return (
    <>
      <h1 className="page-title">
        <span className="section-ornament" aria-hidden="true">
          <SectionOrnament />
        </span>
        Find preset links
      </h1>
      {/* Sama persis dengan beranda, cuma kolom linknya sudah terisi dan
          pengecekannya langsung jalan. Tombol tab di dalam Finder juga yang
          bikin orang bisa langsung nyari preset lain tanpa harus balik dulu. */}
      <Finder initialMode="url" initialUrl={videoUrlOf(parsed)} />
    </>
  );
}
