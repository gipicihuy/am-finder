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
            <div className="footer-socials">
              <a
                className="footer-social-btn"
                href="https://www.tiktok.com/@givydev"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="TikTok Givy"
                title="TikTok"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
                  <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
                </svg>
              </a>
              <a
                className="footer-social-btn"
                href="https://t.me/givyo"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Telegram Givy"
                title="Telegram"
              >
                <svg width="22" height="22" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true" focusable="false">
                  <path d="M22.122 10.040c0.006-0 0.014-0 0.022-0 0.209 0 0.403 0.065 0.562 0.177l-0.003-0.002c0.116 0.101 0.194 0.243 0.213 0.403l0 0.003c0.020 0.122 0.031 0.262 0.031 0.405 0 0.065-0.002 0.129-0.007 0.193l0-0.009c-0.225 2.369-1.201 8.114-1.697 10.766-0.21 1.123-0.623 1.499-1.023 1.535-0.869 0.081-1.529-0.574-2.371-1.126-1.318-0.865-2.063-1.403-3.342-2.246-1.479-0.973-0.52-1.51 0.322-2.384 0.221-0.23 4.052-3.715 4.127-4.031 0.004-0.019 0.006-0.040 0.006-0.062 0-0.078-0.029-0.149-0.076-0.203l0 0c-0.052-0.034-0.117-0.053-0.185-0.053-0.045 0-0.088 0.009-0.128 0.024l0.002-0.001q-0.198 0.045-6.316 4.174c-0.445 0.351-1.007 0.573-1.619 0.599l-0.006 0c-0.867-0.105-1.654-0.298-2.401-0.573l0.074 0.024c-0.938-0.306-1.683-0.467-1.619-0.985q0.051-0.404 1.114-0.827 6.548-2.853 8.733-3.761c1.607-0.853 3.47-1.555 5.429-2.010l0.157-0.031zM15.93 1.025c-8.302 0.020-15.025 6.755-15.025 15.060 0 8.317 6.742 15.060 15.060 15.060s15.060-6.742 15.060-15.060c0-8.305-6.723-15.040-15.023-15.060h-0.002q-0.035-0-0.070 0z" />
                </svg>
              </a>
            </div>
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
                      target={/^https?:/.test(item.href) ? "_blank" : undefined}
                      rel={/^https?:/.test(item.href) ? "noopener noreferrer" : undefined}
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
