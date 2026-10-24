"use client";

import { useEffect, useRef, useState } from "react";
import { LOCALES, type Locale } from "@/lib/i18n";
import { useLocale, useUi } from "@/components/LocaleProvider";

export function LanguageMenu() {
  const ui = useUi();
  const { locale, setLocale } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function choose(code: Locale) {
    setLocale(code);
    setOpen(false);
    buttonRef.current?.focus();
  }

  return (
    <div className="nav-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="nav-menu-btn"
        aria-label={ui.lang.label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <svg width="28" height="28" viewBox="0 0 256 256" aria-hidden="true" focusable="false">
          <g fill="currentColor">
            <rect x="24" y="64" width="208" height="24" rx="12" />
            <rect x="44" y="114" width="188" height="24" rx="12" />
            <rect x="64" y="164" width="168" height="24" rx="12" />
          </g>
        </svg>
      </button>

      {open && (
        <div className="nav-menu-panel" role="menu">
          <p className="nav-menu-heading">{ui.lang.label}</p>
          {LOCALES.map((code) => (
            <button
              key={code}
              type="button"
              role="menuitemradio"
              aria-checked={locale === code}
              lang={code}
              className="nav-menu-item"
              onClick={() => choose(code)}
            >
              <span>{ui.lang[code]}</span>
              {locale === code && (
                <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                  <path
                    d="M4 10.5l4 4 8-9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
