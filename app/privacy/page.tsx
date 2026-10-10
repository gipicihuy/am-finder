import type { Metadata } from "next";
import Link from "next/link";
import { SectionOrnament } from "@/components/Ornament";

export const metadata: Metadata = {
  title: "Kebijakan Privasi | AM Preset Finder",
  description:
    "Kebijakan privasi AM Preset Finder: data apa yang diproses saat kamu memakai situs ini.",
};

export default function PrivacyPage() {
  return (
    <article className="legal-page">
      <Link className="legal-back" href="/">
        <span aria-hidden="true">←</span> Kembali
      </Link>
      <h1 className="page-title">
        <span className="section-ornament" aria-hidden="true">
          <SectionOrnament />
        </span>
        Kebijakan Privasi
      </h1>
      <p className="legal-updated">Terakhir diperbarui: 10 Oktober 2026</p>

      <section className="legal-section">
        <h2>Data yang diproses</h2>
        <p>
          Link video atau kata kunci yang kamu masukkan diproses server untuk
          menghasilkan pencarian. Setiap request biasa juga otomatis membawa alamat IP
          dan user agent perangkat, seperti layaknya situs web pada umumnya.
        </p>
        <p>
          Tidak ada akun, tidak ada formulir pendaftaran, dan tidak ada cookie iklan.
        </p>
      </section>

      <section className="legal-section">
        <h2>Ingat link di browser</h2>
        <p>
          Kalau fitur ingat link aktif, link terakhir disimpan di browser kamu lewat
          localStorage. Data itu tinggal di perangkatmu dan bisa dihapus kapan saja
          lewat pengaturan browser.
        </p>
      </section>

      <section className="legal-section">
        <h2>Layanan pihak ketiga</h2>
        <p>
          Untuk mengambil hasil pencarian, server memanggil layanan pihak ketiga
          termasuk TikTok. Situs ini tidak mengontrol bagaimana mereka memperlakukan
          datamu, jadi kebijakan masing-masing pihak yang berlaku untuk bagian itu.
        </p>
      </section>

      <section className="legal-section">
        <h2>Penjualan data</h2>
        <p>Data pencarianmu tidak dijual ke pihak mana pun.</p>
      </section>

      <section className="legal-section">
        <h2>Perubahan kebijakan</h2>
        <p>
          Kebijakan ini bisa berubah sewaktu-waktu. Tanggal pembaruan selalu tertulis
          di bagian atas halaman.
        </p>
      </section>

      <section className="legal-section">
        <h2>Kontak</h2>
        <p>
          Ada pertanyaan soal privasi? DM TikTok{" "}
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
