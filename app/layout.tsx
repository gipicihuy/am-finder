import type { Metadata } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import { SiteFooter } from "@/components/SiteFooter";
import { AmLogo } from "@/components/AmLogo";
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
  title: "AM Finder · Alight Motion preset links from TikTok",
  description:
    "Paste a TikTok video link and get the Alight Motion preset links from its description, bio, comments and link in bio.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className={`${sans.variable} ${display.variable} min-h-screen antialiased`}>
        <header className="site-header" id="top">
          <span className="hud-corner hud-tl" aria-hidden="true" />
          <span className="hud-corner hud-br" aria-hidden="true" />
          <div className="brand-row">
            <span className="brand-mark">
              <AmLogo size={26} />
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
