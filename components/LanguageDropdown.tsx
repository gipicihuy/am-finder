"use client";

import { useEffect, useRef, useState } from "react";
import { LOCALES, LOCALE_CODES } from "@/lib/i18n";
import { useLocale, useUi } from "@/components/LocaleProvider";

export function LanguageDropdown() {
  const ui = useUi();
  const { locale, setLocale } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      optionRefs.current[LOCALES.indexOf(locale)]?.focus();
    });

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const items = optionRefs.current.filter((item): item is HTMLButtonElement => item !== null);
      if (!items.length) return;
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(current + step + items.length) % items.length].focus();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, locale]);

  function choose(code: (typeof LOCALES)[number]) {
    setLocale(code);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className="lang-dd" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="lang-trigger"
        aria-label={ui.lang.label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{LOCALE_CODES[locale]}</span>
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="lang-panel" role="menu" aria-label={ui.lang.label}>
          {LOCALES.map((code, index) => (
            <button
              key={code}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={locale === code}
              lang={code}
              className="lang-option"
              onClick={() => choose(code)}
            >
              <span>{ui.lang[code]}</span>
              <span className="lang-code" aria-hidden="true">
                {LOCALE_CODES[code]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
