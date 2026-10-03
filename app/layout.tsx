import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { AmLogo } from "@/components/AmLogo";
import { ui } from "@/lib/ui";
import "./globals.css";

// Domain utama. amfinder.cc.cd dan www.amfinder.web.id juga mengarah ke situs ini.
const siteUrl = "https://amfinder.web.id";

const siteTitle = "AM Preset Finder · Alight Motion preset links from TikTok";
const siteDescription =
  "Paste a TikTok video link and get the Alight Motion preset links from its description, bio, comments and link in bio.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: siteTitle,
  description: siteDescription,
  // Favicon eksplisit untuk Google: harus kelipatan 48px (48x48 dan 192x192), bukan 16x16.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon-48x48.png", type: "image/png", sizes: "48x48" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
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
      <head>
        {/* Ditulis manual: Next menghapus trailing slash pada canonical root. */}
        <link rel="canonical" href={`${siteUrl}/`} />
      </head>
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
