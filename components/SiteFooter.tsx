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
