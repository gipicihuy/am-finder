"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WhatsAppIcon } from "@/components/ShareIcons";
import { SUPPORT_DISMISSED_EVENT } from "@/lib/promo-events";

const CHANNEL_URL = "https://whatsapp.com/channel/0029Vb6dsXw6xCSY9sn9aD2r";
const DELAY_MS = 3000; // jeda setelah modal dukungan ditutup
const HOLD_MS = 8000; // lama toast terlihat penuh (berhenti saat di-hover/disentuh)
const EXIT_MS = 250; // durasi animasi keluar (samakan dengan CSS)

/**
 * Toast ajakan gabung saluran WhatsApp di pojok kanan atas.
 * Muncul sekali per page load, beberapa detik setelah modal dukungan ditutup
 * tanpa klik "Beri Dukungan". Tanpa localStorage/cookie.
 */
export function WaChannelToast() {
  const [phase, setPhase] = useState<"idle" | "in" | "out" | "gone">("idle");
  const holdTimer = useRef<number | null>(null);
  const holdStartedAt = useRef(0);
  const remaining = useRef(HOLD_MS);

  // Tunggu modal dukungan ditutup, lalu munculkan setelah jeda (hanya sekali).
  useEffect(() => {
    let delayTimer: number | undefined;
    function onDismissed() {
      delayTimer = window.setTimeout(() => setPhase("in"), DELAY_MS);
    }
    window.addEventListener(SUPPORT_DISMISSED_EVENT, onDismissed, { once: true });
    return () => {
      window.removeEventListener(SUPPORT_DISMISSED_EVENT, onDismissed);
      window.clearTimeout(delayTimer);
    };
  }, []);

  const startHold = useCallback(() => {
    if (holdTimer.current !== null) return;
    holdStartedAt.current = Date.now();
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      setPhase("out");
    }, remaining.current);
  }, []);

  const pauseHold = useCallback(() => {
    if (holdTimer.current === null) return;
    window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
    remaining.current = Math.max(0, remaining.current - (Date.now() - holdStartedAt.current));
  }, []);

  const leave = useCallback(() => {
    pauseHold();
    setPhase((current) => (current === "in" ? "out" : current));
  }, [pauseHold]);

  useEffect(() => {
    if (phase === "in") {
      startHold();
      return () => {
        if (holdTimer.current !== null) {
          window.clearTimeout(holdTimer.current);
          holdTimer.current = null;
        }
      };
    }
    if (phase === "out") {
      const remove = window.setTimeout(() => setPhase("gone"), EXIT_MS);
      return () => window.clearTimeout(remove);
    }
  }, [phase, startHold]);

  if (phase === "idle" || phase === "gone") return null;

  return (
    <div
      className={phase === "out" ? "wa-toast is-leaving" : "wa-toast"}
      role="group"
      aria-label="Saluran WhatsApp AM Finder"
      onMouseEnter={pauseHold}
      onMouseLeave={startHold}
      onFocus={pauseHold}
      onBlur={startHold}
      onTouchStart={pauseHold}
      onTouchEnd={startHold}
    >
      <a className="wa-toast-link" href={CHANNEL_URL} target="_blank" rel="noopener noreferrer" onClick={leave}>
        <span className="wa-toast-icon">
          <WhatsAppIcon />
        </span>
        <span className="wa-toast-text">
          <span className="wa-toast-title">Join saluran wa AM Finder</span>
          <span className="wa-toast-sub">Agar mendapatkan info update terbaru</span>
        </span>
      </a>
      <button type="button" className="wa-toast-close" onClick={leave} aria-label="Tutup">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
          <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
