"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const SUPPORT_URL = "https://sociabuzz.com/givyo/tribe";
const SILENT_PATHS = new Set(["/terms", "/privacy"]);

/**
 * Modal dukungan. Muncul sekali setiap page load (state di memori saja, tanpa
 * localStorage/cookie), jadi kunjungan/reload berikutnya tampil lagi.
 * Tidak dirender di server, hanya setelah hydrate, supaya tidak masuk HTML awal.
 * Halaman /terms dan /privacy tidak pernah menampilkan modal ini.
 */
export function SupportModal() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLAnchorElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  const pathname = usePathname();
  const openedOnce = useRef(false);

  useEffect(() => {
    if (SILENT_PATHS.has(pathname)) {
      setOpen(false);
      return;
    }
    if (!openedOnce.current) {
      openedOnce.current = true;
      setOpen(true);
    }
  }, [pathname]);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    lastFocused.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    primaryRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      lastFocused.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="support-overlay"
      data-nosnippet
    >
      <div
        ref={dialogRef}
        className="support-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-title"
        aria-describedby="support-desc"
      >
        <button type="button" className="support-close" onClick={close} aria-label="Tutup">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        <h2 id="support-title" className="support-title">
          ❤️ Suka AM Finder?
        </h2>
        <p id="support-desc" className="support-desc">
          Kalau AM Finder membantu kamu menemukan preset dengan cepat, kamu bisa ikut mendukung pengembangannya agar
          web ini tetap aktif dan terus bisa digunakan.
        </p>

        <div className="support-actions">
          <a
            ref={primaryRef}
            className="btn-primary support-primary"
            href={SUPPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={close}
          >
            ☕ Beri Dukungan
          </a>
          <button type="button" className="support-later" onClick={close}>
            Nanti aja
          </button>
        </div>
      </div>
    </div>
  );
}
