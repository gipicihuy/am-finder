"use client";

import { useEffect, useRef, useState } from "react";
import { AmLogo } from "@/components/AmLogo";
import { ui } from "@/lib/ui";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <header className="site-header" id="top">
      <div className="nav-inner" ref={rootRef}>
        <a className="nav-logo" href="/" aria-label={`${ui.header.brand}, beranda`}>
          <AmLogo size={32} />
        </a>

        <div className="nav-title">
          <span className="nav-name">{ui.header.brand}</span>
          <p className="nav-tagline">{ui.header.tagline}</p>
        </div>

        <button
          ref={buttonRef}
          type="button"
          className="nav-menu-btn"
          aria-label="Menu"
          aria-expanded={open}
          aria-controls="nav-menu"
          onClick={() => setOpen((value) => !value)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="miter" aria-hidden="true" focusable="false">
            <rect x="3.5" y="3.5" width="7" height="7" />
            <rect x="13.5" y="3.5" width="7" height="7" />
            <rect x="3.5" y="13.5" width="7" height="7" />
            <rect x="13.5" y="13.5" width="7" height="7" />
          </svg>
        </button>

        {open ? (
          <nav id="nav-menu" className="nav-panel" aria-label="Menu">
            {ui.footer.columns.map((column) => (
              <div className="nav-group" key={column.title}>
                <p className="nav-group-title">{column.title}</p>
                {column.items.map((item) =>
                  item.href ? (
                    <a
                      key={item.label}
                      className="nav-link"
                      href={item.href}
                      onClick={() => setOpen(false)}
                      target={/^https?:/.test(item.href) ? "_blank" : undefined}
                      rel={/^https?:/.test(item.href) ? "noopener noreferrer" : undefined}
                    >
                      {item.label}
                    </a>
                  ) : null,
                )}
              </div>
            ))}
          </nav>
        ) : null}
      </div>
    </header>
  );
}
