import type { Metadata } from "next";
import Link from "next/link";
import { SectionOrnament } from "@/components/Ornament";

export const metadata: Metadata = {
  title: "Ketentuan Layanan | AM Preset Finder",
  description:
    "Ketentuan layanan AM Preset Finder, layanan pencari tautan preset Alight Motion dari TikTok.",
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

export default function TermsPage() {
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
        Ketentuan Layanan
      </h1>
      <p className="legal-updated">Terakhir diperbarui: 10 Oktober 2026</p>

      <section className="legal-section">
        <h2>1. Tentang Layanan</h2>
        <p className="legal-intro">
          AM Preset Finder di{" "}
          <Link className="legal-site" href="/">
            amfinder.web.id
          </Link>{" "}
          adalah layanan pencarian gratis yang membantu Anda menemukan tautan preset
          Alight Motion yang dibagikan kreator melalui video TikTok. Tersedia dua
          metode pencarian: menempelkan tautan video dan mencari dengan kata kunci.
          Layanan ini tidak memerlukan pendaftaran akun dan tidak dipungut biaya.
        </p>
      </section>

      <section className="legal-section">
        <h2>2. Penggunaan Hasil Pencarian</h2>
        <p>
          Seluruh tautan preset pada hasil pencarian berasal dari kreator yang
          mengunggahnya. Anda dipersilakan menggunakan tautan tersebut untuk keperluan
          penyuntingan pribadi dan wajib mencantumkan kredit kepada kreator pemiliknya.
        </p>
      </section>

      <section className="legal-section">
        <h2>3. Batas Tanggung Jawab</h2>
        <ul>
          <li>
            Hasil pencarian diambil dari data publik di TikTok. Apabila kreator
            menghapus video atau komentar aslinya, tautan terkait ikut tidak berlaku
            dan tidak lagi dapat ditemukan.
          </li>
          <li>
            Layanan ini tidak menyimpan berkas preset. Setiap tautan mengarah ke
            layanan pihak ketiga, termasuk TikTok, Alight Motion, dan penyedia hosting
            berkas, yang berada di luar kendali kami.
          </li>
          <li>
            Layanan ini tidak berafiliasi dengan TikTok maupun Alight Motion (Alight
            Creative Inc). Seluruh nama dan merek dagang merupakan milik pemiliknya
            masing-masing.
          </li>
        </ul>
      </section>

      <section className="legal-section">
        <h2>4. Larangan</h2>
        <p>
          Anda dilarang menggunakan layanan ini untuk spam, serangan terhadap server,
          atau pelanggaran hak pihak lain maupun ketentuan TikTok dan Alight Motion.
          Kami berhak membatasi akses bagi pihak yang merugikan pengguna lain.
        </p>
      </section>

      <section className="legal-section">
        <h2>5. Perubahan Ketentuan</h2>
        <p>
          Ketentuan ini dapat diubah sewaktu-waktu tanpa pemberitahuan sebelumnya.
          Tanggal pembaruan terakhir ditampilkan di bagian atas halaman.
        </p>
      </section>

      <section className="legal-section">
        <h2>6. Kontak</h2>
        <p>
          Pertanyaan mengenai ketentuan ini dapat disampaikan melalui pesan langsung di
          TikTok{" "}
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
