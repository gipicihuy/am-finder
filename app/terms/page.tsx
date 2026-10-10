import type { Metadata } from "next";
import Link from "next/link";
import { SectionOrnament } from "@/components/Ornament";

export const metadata: Metadata = {
  title: "Ketentuan Layanan | AM Preset Finder",
  description:
    "Ketentuan penggunaan AM Preset Finder, alat pencari link preset Alight Motion dari TikTok.",
};

export default function TermsPage() {
  return (
    <article className="legal-page">
      <Link className="legal-back" href="/">
        <span aria-hidden="true">←</span> Kembali
      </Link>
      <h1 className="page-title">
        <span className="section-ornament" aria-hidden="true">
          <SectionOrnament />
        </span>
        Ketentuan Layanan
      </h1>
      <p className="legal-updated">Terakhir diperbarui: 10 Oktober 2026</p>

      <section className="legal-section">
        <h2>Tentang layanan</h2>
        <p>
          AM Preset Finder (amfinder.web.id) adalah alat gratis untuk mencari link
          preset Alight Motion yang dibagikan kreator di video TikTok. Ada dua cara:
          tempel link video, atau cari lewat kata kunci. Tanpa akun dan tanpa biaya.
        </p>
      </section>

      <section className="legal-section">
        <h2>Pemakaian hasil pencarian</h2>
        <p>
          Link preset di hasil pencarian berasal dari kreator yang mengunggahnya.
          Pakai untuk editanmu sendiri dan tetap kredit kreatornya. Kami tidak punya
          hubungan resmi dengan kreator maupun pemilik preset.
        </p>
      </section>

      <section className="legal-section">
        <h2>Batas tanggung jawab</h2>
        <ul>
          <li>
            Hasil dicari dari data publik di TikTok. Kalau kreator menghapus video
            atau komentarnya, link ikut hilang dan hasil bisa tidak ditemukan.
          </li>
          <li>
            Situs ini tidak menyimpan file preset. Link mengarah ke layanan pihak
            ketiga seperti TikTok, Alight Motion, dan host file yang di luar kendali
            kami.
          </li>
          <li>
            Situs ini tidak berafiliasi dengan TikTok maupun Alight Motion (Alight
            Creative Inc). Nama dan merek dagang milik pemiliknya masing-masing.
          </li>
        </ul>
      </section>

      <section className="legal-section">
        <h2>Larangan</h2>
        <p>
          Jangan pakai layanan ini buat spam, menyerang server, atau melanggar hak
          pihak lain maupun ketentuan TikTok dan Alight Motion. Kami bisa memblokir
          aksi yang merugikan pengguna lain.
        </p>
      </section>

      <section className="legal-section">
        <h2>Perubahan ketentuan</h2>
        <p>
          Ketentuan ini bisa berubah sewaktu-waktu. Tanggal pembaruan selalu tertulis
          di bagian atas halaman.
        </p>
      </section>

      <section className="legal-section">
        <h2>Kontak</h2>
        <p>
          Ada pertanyaan soal ketentuan ini? DM TikTok{" "}
          <a href="https://www.tiktok.com/@givydev" target="_blank" rel="noopener noreferrer">
            @givydev
          </a>
          .
        </p>
      </section>

      <p className="legal-cross">
        Baca juga: <Link href="/privacy">Kebijakan Privasi</Link>
      </p>
    </article>
  );
}
