import type { Metadata } from "next";
import { SupportAdminView } from "@/components/SupportAdminView";

const siteUrl = "https://amfinder.web.id";

export const metadata: Metadata = {
  title: "Dukungan Admin | AM Preset Finder",
  description: "Donasi seikhlasnya via QRIS untuk biaya server & kelangsungan layanan AM Preset Finder.",
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: `${siteUrl}/support-admin`,
  },
  openGraph: {
    type: "website",
    siteName: "AM Preset Finder",
    title: "Dukungan Admin | AM Preset Finder",
    description: "Donasi seikhlasnya via QRIS untuk biaya server & kelangsungan layanan AM Preset Finder.",
    url: `${siteUrl}/support-admin`,
    images: [
      {
        url: `${siteUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Dukungan Admin AM Preset Finder",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Dukungan Admin | AM Preset Finder",
    description: "Donasi seikhlasnya via QRIS untuk biaya server & kelangsungan layanan AM Preset Finder.",
    images: [`${siteUrl}/og-image.png`],
  },
};

export default function SupportAdminPage() {
  return <SupportAdminView />;
}
