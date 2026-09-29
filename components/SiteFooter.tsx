"use client";

import { Fragment } from "react";
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
  const links = ui.footer.links;

  return (
    <footer className="site-footer">
      <div className="shell footer-inner">
        <div className="footer-colophon">
          <p className="footer-note">{ui.footer.note}</p>
          <p className="footer-links">
            {links.map((link, index) => (
              <Fragment key={link.href}>
                {index > 0 && (
                  <span className="footer-sep" aria-hidden="true">
                    ·
                  </span>
                )}
                <a
                  className="footer-link"
                  href={link.href}
                  onClick={(event) => followAnchor(event, link.href)}
                  target={link.href.startsWith("#") ? undefined : "_blank"}
                  rel={link.href.startsWith("#") ? undefined : "noopener noreferrer"}
                >
                  {link.label}
                </a>
              </Fragment>
            ))}
          </p>
        </div>

        <p className="footer-mark" aria-hidden="true">
          {ui.footer.wordmark}
        </p>

        <p className="footer-legal">{ui.footer.copyright}</p>
      </div>
    </footer>
  );
}
