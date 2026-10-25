import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { SectionOrnament } from "@/components/Ornament";
import type { LegalBundle, LegalDoc } from "@/lib/legal";

function ChevronLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12.5 4.5 7 10l5.5 5.5" />
    </svg>
  );
}

function rich(text: string): ReactNode {
  return text.split(/(\{site\}|\{tiktok\})/).map((part, i) => {
    if (part === "{site}") {
      return (
        <Link key={i} className="legal-site" href="/">
          amfinder.web.id
        </Link>
      );
    }
    if (part === "{tiktok}") {
      return (
        <a key={i} href="https://www.tiktok.com/@givydev" target="_blank" rel="noopener noreferrer">
          @givydev
        </a>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function LegalPage({ bundle, doc }: { bundle: LegalBundle; doc: LegalDoc }) {
  return (
    <article className="legal-page">
      <Link className="legal-back" href="/">
        <ChevronLeftIcon />
        {bundle.back}
      </Link>
      <h1 className="page-title">
        <span className="section-ornament" aria-hidden="true">
          <SectionOrnament />
        </span>
        {doc.title}
      </h1>
      <p className="legal-updated">{bundle.updated}</p>

      {doc.sections.map((s, i) => (
        <section className="legal-section" key={s.h}>
          <h2>{doc.numbered ? `${i + 1}. ${s.h}` : s.h}</h2>
          {s.p?.map((t) => (
            <p key={t} className={s.intro ? "legal-intro" : undefined}>
              {rich(t)}
            </p>
          ))}
          {s.ul && (
            <ul>
              {s.ul.map((t) => (
                <li key={t}>{rich(t)}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <p className="legal-cross">
        {bundle.crossPrefix} <Link href={doc.crossHref}>{doc.crossText}</Link>
      </p>
    </article>
  );
}
