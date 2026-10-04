"use client";

import { useCallback, useEffect, useState } from "react";
import { WhatsAppIcon } from "@/components/ShareIcons";
import { SEARCH_STARTED_EVENT } from "@/lib/promo-events";

const CHANNEL_URL = "https://whatsapp.com/channel/0029Vb6dsXw6xCSY9sn9aD2r";
const EXIT_MS = 250; // durasi animasi keluar (samakan dengan CSS)

/**
 * Toast ajakan gabung saluran WhatsApp di pojok kanan atas.
 * Muncul setelah user memulai pencarian dan bertahan sampai ditutup dengan tombol X.
 * Sekali per page load (tidak muncul lagi setelah ditutup), tanpa localStorage/cookie.
 */
export function WaChannelToast() {
  const [phase, setPhase] = useState<"idle" | "in" | "out" | "gone">("idle");

  useEffect(() => {
    function onSearchStarted() {
      setPhase((current) => (current === "idle" ? "in" : current));
    }
    window.addEventListener(SEARCH_STARTED_EVENT, onSearchStarted);
    return () => window.removeEventListener(SEARCH_STARTED_EVENT, onSearchStarted);
  }, []);

  useEffect(() => {
    if (phase !== "out") return;
    const remove = window.setTimeout(() => setPhase("gone"), EXIT_MS);
    return () => window.clearTimeout(remove);
  }, [phase]);

  const close = useCallback(() => setPhase((current) => (current === "in" ? "out" : current)), []);

  if (phase === "idle" || phase === "gone") return null;

  return (
    <div
      className={phase === "out" ? "wa-toast is-leaving" : "wa-toast"}
      role="group"
      aria-label="Saluran WhatsApp AM Finder"
    >
      <a className="wa-toast-link" href={CHANNEL_URL} target="_blank" rel="noopener noreferrer">
        <span className="wa-toast-head">
          <span className="wa-toast-chip">
            <WhatsAppIcon />
          </span>
          <span>Join saluran wa AM Finder</span>
        </span>
        <span className="wa-toast-body">Agar mendapatkan info update terbaru</span>
      </a>
      <button type="button" className="wa-toast-close" onClick={close} aria-label="Tutup">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
          <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
