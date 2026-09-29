import type { Metadata } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import { SiteFooter } from "@/components/SiteFooter";
import { ui } from "@/lib/ui";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
  display: "swap",
});

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AM Finder · link preset Alight Motion dari TikTok",
  description:
    "Tempel link video TikTok, lalu ambil link preset atau file XML Alight Motion dari deskripsi, bio, komentar, dan link-in-bio kreator.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className={`${sans.variable} ${display.variable} min-h-screen antialiased`}>
        <header className="site-header" id="top">
          <div className="shell header-inner">
            <a href="/" className="logo" aria-label={`${ui.header.brand}, halaman utama`}>
              <span className="logo-dot" aria-hidden="true" />
              {ui.header.brand}
            </a>
            <nav className="header-links" aria-label="Tautan situs">
              {ui.header.links.map((link) => (
                <a
                  key={link.href}
                  className="header-link"
                  href={link.href}
                  target={link.href.startsWith("#") ? undefined : "_blank"}
                  rel={link.href.startsWith("#") ? undefined : "noopener noreferrer"}
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </div>
        </header>
        <main className="shell main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
