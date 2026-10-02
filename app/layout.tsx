import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { AmLogo } from "@/components/AmLogo";
import { ui } from "@/lib/ui";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

const siteTitle = "AM Preset Finder · Alight Motion preset links from TikTok";
const siteDescription =
  "Paste a TikTok video link and get the Alight Motion preset links from its description, bio, comments and link in bio.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: siteTitle,
  description: siteDescription,
  openGraph: {
    type: "website",
    siteName: "AM Preset Finder",
    title: siteTitle,
    description: siteDescription,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "AM Preset Finder" }],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/og-image.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className="min-h-screen antialiased">
        <header className="site-header" id="top">
          <span className="hud-corner hud-tl" aria-hidden="true" />
          <span className="hud-corner hud-br" aria-hidden="true" />
          <div className="brand-row">
            <span className="brand-mark">
              <AmLogo size={34} />
            </span>
            <span className="brand-name">{ui.header.brand}</span>
          </div>
          <p className="brand-tagline">{ui.header.tagline}</p>
          <p className="brand-byline">{ui.header.byline}</p>
        </header>
        <main className="shell main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
