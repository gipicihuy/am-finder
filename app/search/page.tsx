import type { Metadata } from "next";
import { Finder } from "@/components/Finder";
import { SectionOrnament } from "@/components/Ornament";

// Dinamis supaya kata kunci di alamat dibaca waktu dibuka, bukan waktu build.
// Pencariannya sendiri tetap jalan dari browser — tidak ada panggilan ke
// TikTok/YouTube di server, jadi bot yang membuka link ini tidak menambah beban.
export const dynamic = "force-dynamic";

type SearchParams = { q?: string };

/** Bersihkan kata kunci dari alamat: buang karakter kontrol, batasi panjang. */
function cleanQuery(raw: string | undefined): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 100);
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  const query = cleanQuery(q);
  return {
    title: query
      ? `Preset untuk "${query}" — AM Preset Finder`
      : "Cari Preset — AM Preset Finder",
    robots: { index: false, follow: false },
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { q } = await searchParams;

  return (
    <>
      <h1 className="page-title">
        <span className="section-ornament" aria-hidden="true">
          <SectionOrnament />
        </span>
        Find preset links
      </h1>
      <Finder initialMode="search" initialQuery={cleanQuery(q)} />
    </>
  );
}
