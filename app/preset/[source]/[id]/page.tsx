import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PresetDetail } from "@/components/PresetDetail";
import { SectionOrnament } from "@/components/Ornament";

// Sengaja force-dynamic: alamat ini bisa sangat banyak (satu per video) dan
// isinya kerangka yang diisi dari browser. Dibiarkan static, Next bakal coba
// merendernya waktu build dan malah menggoda kita untuk mengambil data di server.
export const dynamic = "force-dynamic";

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

type PageProps = { params: Promise<{ source: string; id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { source, id } = await params;
  const parsed = parse(source, id);
  // Judulnya generik: judul video aslinya baru diketahui setelah dicek, dan
  // menariknya di server justru yang dilarang (beban + dibuka bot pratinjau).
  return {
    title: parsed
      ? `${parsed.source === "youtube" ? "Preset YouTube" : "Preset TikTok"} — AM Preset Finder`
      : "Preset — AM Preset Finder",
    robots: { index: false, follow: false },
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
      <PresetDetail source={parsed.source} id={parsed.id} />
    </>
  );
}
