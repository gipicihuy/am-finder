import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SupportModal } from "@/components/SupportModal";
import { WaChannelToast } from "@/components/WaChannelToast";
import { AntiScrapeGuard } from "@/components/AntiScrapeGuard";
import { LocaleProvider } from "@/components/LocaleProvider";
import { getLocale } from "@/lib/locale-server";
import { getUi } from "@/lib/ui";
import type { Locale } from "@/lib/i18n";
import "./globals.css";

// Domain utama. amfinder.cc.cd dan www.amfinder.web.id juga mengarah ke situs ini.
const siteUrl = "https://amfinder.web.id";

// Cache-bust icon: Chrome sempat menyimpan hasil favicon negatif waktu situs pernah 404,
// jadi URL baru memaksa dia fetch ulang.
const iconVer = "?v=2";
const icon = (path: string) => `${path}${iconVer}`;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const { meta } = getUi(locale);
  const siteTitle = meta.title;
  const siteDescription = meta.description;
  return {
    metadataBase: new URL(siteUrl),
    title: siteTitle,
    description: siteDescription,
    authors: [{ name: "Givy", url: "https://www.tiktok.com/@givydev" }],
    creator: "Givy",
    // Favicon eksplisit untuk Google: harus kelipatan 48px (48x48 dan 192x192), bukan 16x16.
    // ?v= dipakai buat cache-bust: Chrome nyimpan hasil favicon negatif waktu situs pernah 404,
    // jadi URL baru bikin dia fetch ulang.
    icons: {
      icon: [
        { url: icon("/favicon.ico"), sizes: "48x48" },
        { url: icon("/favicon-48x48.png"), type: "image/png", sizes: "48x48" },
        { url: icon("/icon-192.png"), type: "image/png", sizes: "192x192" },
        { url: icon("/icon.svg"), type: "image/svg+xml", sizes: "any" },
      ],
      shortcut: icon("/favicon.ico"),
      apple: [{ url: icon("/apple-icon.png"), type: "image/png", sizes: "180x180" }],
    },
    openGraph: {
      type: "website",
      siteName: "AM Preset Finder",
      locale: locale === "id" ? "id_ID" : "en_US",
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
}

// Structured data: membantu Google memahami nama situs (WebSite).
const creatorJsonLd = {
  "@type": "Person",
  name: "Givy",
  alternateName: "givydev",
  jobTitle: "Vibe coder",
  nationality: { "@type": "Country", name: "Indonesia" },
  sameAs: ["https://www.tiktok.com/@givydev"],
};

function buildWebsiteJsonLd(locale: Locale) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "AM Preset Finder",
    // Cadangan kalau Google nggak memilih nama utama.
    alternateName: ["AM Finder"],
    url: `${siteUrl}/`,
    inLanguage: locale,
    creator: creatorJsonLd,
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <head>
        {/* Ditulis manual: Next menghapus trailing slash pada canonical/og:url root. */}
        <link rel="canonical" href={`${siteUrl}/`} />
        <meta property="og:url" content={`${siteUrl}/`} />
      </head>
      <body className="min-h-screen antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(buildWebsiteJsonLd(locale)).replace(/</g, "\\u003c") }}
        />
        <LocaleProvider initialLocale={locale}>
          <SiteHeader />
          <main className="shell main">{children}</main>
          <SiteFooter />
          <SupportModal />
          <WaChannelToast />
          <AntiScrapeGuard />
        </LocaleProvider>
      </body>
    </html>
  );
}
