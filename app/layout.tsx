import type { Metadata } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
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
        <header className="site-header">
          <div className="shell header-inner">
            <a href="/" className="logo" aria-label="AM Finder, halaman utama">
              <span className="logo-glyph" aria-hidden="true">
                AM
              </span>
              <span>AM Finder</span>
            </a>
          </div>
        </header>
        <main className="shell main">{children}</main>
      </body>
    </html>
  );
}
