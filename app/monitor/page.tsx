import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AmLogo } from "@/components/AmLogo";
import { MonitorPanel } from "@/components/MonitorPanel";
import { SectionOrnament } from "@/components/Ornament";
import {
  AUTH_COOKIE,
  checkPassword,
  hasPassword,
  verifyAuth,
} from "@/lib/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Halaman admin: nggak ditautkan dari mana pun, nggak masuk sitemap, dan
// mesin pencari dilarang mengindeks. Tanpa password yang benar, halaman ini
// pura-pura 404 biar kelihatan seperti halaman yang tidak ada.
export const metadata: Metadata = {
  title: "Monitor | AM Preset Finder",
  robots: { index: false, follow: false },
};

export default async function MonitorPage({
  searchParams,
}: {
  searchParams: Promise<{ pw?: string | string[] }>;
}) {
  if (!hasPassword()) notFound();

  const params = await searchParams;
  const pw = typeof params.pw === "string" ? params.pw : null;
  const ok = pw ? checkPassword(pw) : false;

  if (pw) {
    if (!ok) notFound();
  } else {
    const cookieStore = await import("next/headers").then(m => m.cookies());
    if (!verifyAuth(cookieStore.get(AUTH_COOKIE)?.value)) notFound();
  }

  return (
    <article className="mon-page">
      <header className="mon-top">
        <span className="mon-brand">
          <AmLogo size={28} />
          <span className="mon-brand-name">AM Preset Finder</span>
        </span>
        <span className="mon-live">
          <span className="mon-live-dot" aria-hidden="true" />
          Live
        </span>
      </header>

      <h1 className="page-title mon-title">
        <span className="section-ornament" aria-hidden="true">
          <SectionOrnament />
        </span>
        Monitor
      </h1>

      <MonitorPanel loginPw={ok && pw ? pw : undefined} />
    </article>
  );
}
