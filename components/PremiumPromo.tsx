"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const WA_URL =
  "https://wa.me/6283182725011?text=" + encodeURIComponent("Halo, saya mau beli Alight Motion Premium");
const SHOW_DELAY_MS = 2500; // jeda setelah halaman dimuat sebelum bar muncul
const EXIT_MS = 250; // durasi animasi keluar (samakan dengan CSS)

function CrownIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5L3 8z" />
    </svg>
  );
}

/**
 * Bar promo Alight Motion Premium: melayang di dekat bawah layar (tetap terlihat
 * saat scroll), ada tombol tutup. Tampil lagi setiap halaman dimuat ulang
 * (tanpa localStorage/cookie), seperti modal dukungan.
 */
export function PremiumPromo() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<"idle" | "in" | "out" | "gone">("idle");

  useEffect(() => {
    const show = window.setTimeout(() => setPhase((p) => (p === "idle" ? "in" : p)), SHOW_DELAY_MS);
    return () => window.clearTimeout(show);
  }, []);

  useEffect(() => {
    if (phase !== "out") return;
    const remove = window.setTimeout(() => setPhase("gone"), EXIT_MS);
    return () => window.clearTimeout(remove);
  }, [phase]);

  if (phase === "idle" || phase === "gone") return null;
  if (pathname.startsWith("/monitor-givy")) return null;

  return (
    <aside
      className={phase === "out" ? "promo-bar is-leaving" : "promo-bar"}
      aria-label="Promo Alight Motion Premium"
    >
      <span className="promo-icon" aria-hidden="true">
        <CrownIcon />
      </span>
      <span className="promo-text">
        <span className="promo-title">Alight Motion Premium</span>
        <span className="promo-sub">
          <b className="promo-tag">PROMO</b> Beli lewat WhatsApp
        </span>
      </span>
      <a className="promo-cta" href={WA_URL} target="_blank" rel="noopener noreferrer">
        Beli
      </a>
      <button type="button" className="promo-close" aria-label="Tutup promo" onClick={() => setPhase("out")}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </aside>
  );
}
