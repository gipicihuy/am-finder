import type { Metadata } from "next";
import Link from "next/link";
import { SectionOrnament } from "@/components/Ornament";

export const metadata: Metadata = {
  title: "Kebijakan Privasi | AM Preset Finder",
  description:
    "Kebijakan privasi AM Preset Finder: data yang diproses saat Anda menggunakan layanan ini.",
};

function ChevronLeftIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12.5 4.5 7 10l5.5 5.5" />
    </svg>
  );
}

export default function PrivacyPage() {
  return (
    <article className="legal-page">
      <Link className="legal-back" href="/">
        <ChevronLeftIcon />
        Kembali ke Beranda
      </Link>
      <h1 className="page-title">
        <span className="section-ornament" aria-hidden="true">
          <SectionOrnament />
        </span>
        Kebijakan Privasi
      </h1>
      <p className="legal-updated">Terakhir diperbarui: 10 Oktober 2026</p>

      <section className="legal-section">
        <h2>Data yang Diproses</h2>
        <p>
          Saat Anda menggunakan layanan ini, tautan video atau kata kunci yang Anda
          masukkan diproses oleh server untuk menghasilkan pencarian. Setiap
          permintaan secara otomatis membawa alamat IP dan user agent perangkat,
          sebagaimana berlaku pada situs web pada umumnya.
        </p>
        <p>
          Layanan ini tidak memiliki akun pengguna, tidak memiliki formulir
          pendaftaran, dan tidak menggunakan cookie iklan.
        </p>
      </section>

      <section className="legal-section">
        <h2>Penyimpanan Lokal</h2>
        <p>
          Apabila fitur ingat tautan diaktifkan, tautan terakhir disimpan di peramban
          Anda melalui localStorage. Data tersebut berada di perangkat Anda dan dapat
          dihapus sewaktu-waktu melalui pengaturan peramban.
        </p>
      </section>

      <section className="legal-section">
        <h2>Layanan Pihak Ketiga</h2>
        <p>
          Untuk mengambil hasil pencarian, server memanggil layanan pihak ketiga,
          termasuk TikTok. Kami tidak mengontrol cara pihak ketiga memperlakukan data
          Anda, sehingga kebijakan masing-masing pihak yang berlaku untuk bagian
          tersebut.
        </p>
      </section>

      <section className="legal-section">
        <h2>Penjualan Data</h2>
        <p>Data pencarian Anda tidak dijual kepada pihak mana pun.</p>
      </section>

      <section className="legal-section">
        <h2>Perubahan Kebijakan</h2>
        <p>
          Kebijakan ini dapat diubah sewaktu-waktu. Tanggal pembaruan terakhir
          ditampilkan di bagian atas halaman.
        </p>
      </section>

      <section className="legal-section">
        <h2>Kontak</h2>
        <p>
          Pertanyaan mengenai kebijakan privasi ini dapat disampaikan melalui pesan
          langsung di TikTok{" "}
          <a href="https://www.tiktok.com/@givydev" target="_blank" rel="noopener noreferrer">
            @givydev
          </a>
          .
        </p>
      </section>

      <p className="legal-cross">
        Baca juga: <Link href="/terms">Ketentuan Layanan</Link>
      </p>
    </article>
  );
}
