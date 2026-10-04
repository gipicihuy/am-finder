"use client";

import { ui } from "@/lib/ui";
import { AmLogo } from "@/components/AmLogo";

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
              <span className="footer-logo-mark">
                <AmLogo size={30} />
              </span>
              <span className="footer-name">{ui.footer.brand}</span>
            </div>
            <p className="footer-note">{ui.footer.note}</p>
            <a
              className="footer-social"
              href="https://www.tiktok.com/@givydev"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="TikTok Givy (@givydev)"
              title="TikTok @givydev"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
                <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
              </svg>
              <span>@givydev</span>
            </a>
          </div>

          <div className="footer-cols">
            {ui.footer.columns.map((column) => (
              <div className="footer-col" key={column.title}>
                <p className="footer-col-title">{column.title}</p>
                {column.items.map((item) =>
                  item.href ? (
                    <a
                      key={item.label}
                      className="footer-link"
                      href={item.href}
                      onClick={(event) => followAnchor(event, item.href!)}
                      target={item.href.startsWith("#") ? undefined : "_blank"}
                      rel={item.href.startsWith("#") ? undefined : "noopener noreferrer"}
                    >
                      {item.label}
                    </a>
                  ) : (
                    <p className="footer-line" key={item.label}>
                      {item.label}
                    </p>
                  ),
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="footer-bottom">
          <p>{ui.footer.copyright}</p>
          <p>{ui.footer.disclaimer}</p>
        </div>
      </div>
    </footer>
  );
}
