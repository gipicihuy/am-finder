import type { Metadata } from "next";
import Link from "next/link";
import { DonaturBoard, DonaturHeading } from "@/components/DonaturBoard";
import { loadDonatur, summarizeDonatur } from "@/lib/donatur";

// Halaman percobaan: sengaja dibuat terpisah supaya tampilan donatur bisa
// ditinjau tanpa menyentuh beranda, footer, maupun /donatur yang asli.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Donatur (Percobaan) | AM Preset Finder",
  description: "Halaman percobaan tampilan daftar donatur.",
  robots: { index: false, follow: false },
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

export default function DonaturTestPage() {
  const summary = summarizeDonatur(loadDonatur());

  return (
    <article className="legal-page donatur-page">
      <Link className="legal-back" href="/">
        <ChevronLeftIcon />
        Kembali ke Beranda
      </Link>

      <p className="dt-preview-note">
        Halaman percobaan — tidak ditautkan dari mana pun dan tidak diindeks mesin
        pencari.
      </p>

      <DonaturHeading />
      <DonaturBoard summary={summary} />
    </article>
  );
}
