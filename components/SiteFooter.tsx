"use client";

import { ui } from "@/lib/ui";

function followAnchor(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
  if (!href.startsWith("#")) return;
  event.preventDefault();
  const target = document.querySelector<HTMLElement>(href);
  if (!target) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  if (typeof target.focus === "function") target.focus({ preventScroll: true });
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-inner">
        <div className="footer-top">
          <div className="footer-brand">
            <div className="footer-logo">
              <span className="logo-glyph" aria-hidden="true">
                AM
              </span>
              <span className="footer-name">AM Finder</span>
            </div>
            <p className="footer-note">{ui.footer.note}</p>
          </div>

          <div className="footer-cols">
            {ui.footer.columns.map((column) => (
              <div className="footer-col" key={column.title}>
                <p className="footer-col-title">{column.title}</p>
                {column.links.map((link) => (
                  <a
                    key={`${column.title}-${link.href}`}
                    className="footer-link"
                    href={link.href}
                    onClick={(event) => followAnchor(event, link.href)}
                    target={link.href.startsWith("#") ? undefined : "_blank"}
                    rel={link.href.startsWith("#") ? undefined : "noopener noreferrer"}
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="footer-bottom">
          <p>{ui.footer.bottomLeft}</p>
          <p>{ui.footer.bottomRight}</p>
        </div>
      </div>
    </footer>
  );
}
