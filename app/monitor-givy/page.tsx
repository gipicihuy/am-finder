import type { Metadata } from "next";
import { MonitorPanel } from "@/components/MonitorPanel";
import { SectionOrnament } from "@/components/Ornament";

export const dynamic = "force-dynamic";

// Halaman admin: nggak ditautkan dari mana pun, nggak masuk sitemap, dan
// mesin pencari dilarang mengindeks. Keamanannya dari namanya yang tidak
// diketahui siapa pun — tanpa sandi, tanpa cookie.
export const metadata: Metadata = {
  title: "Monitor | AM Preset Finder",
  robots: { index: false, follow: false },
};

export default function MonitorGivyPage() {
  return (
    <article className="mon-page">
      <p className="mon-credit">
        Web ini dibuat oleh{" "}
        <a
          className="mon-credit-link"
          href="https://www.tiktok.com/@givydev"
          target="_blank"
          rel="noopener noreferrer"
        >
          givy
        </a>
        😈🔥
      </p>

      <div className="mon-title-row">
        <h1 className="page-title mon-title">
          <span className="section-ornament" aria-hidden="true">
            <SectionOrnament />
          </span>
          Monitor
        </h1>
        <span className="mon-live">
          <span className="mon-live-dot" aria-hidden="true" />
          Live
        </span>
      </div>

      <MonitorPanel />
    </article>
  );
}
