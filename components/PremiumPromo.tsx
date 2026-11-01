"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const WA_URL =
  "https://wa.me/6283182725011?text=" + encodeURIComponent("Halo, saya mau beli Alight Motion Premium");
const SHOW_DELAY_MS = 2500; // jeda setelah halaman dimuat sebelum bar muncul
const EXIT_MS = 250; // durasi animasi keluar (samakan dengan CSS)

/** Logo Alight Motion (empat lengkung spiral). */
function AlightMotionIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M43.5 28.33a19.5 19.5 0 0 0-39 0" />
      <path d="M18.47 32.593a6.923 6.923 0 0 0 9.79-9.79" />
      <path d="M23.25 39.17a11.227 11.227 0 1 0 0-22.454" />
      <path d="M34.602 38.222a14.637 14.637 0 1 0-20.7-20.7" />
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
        <AlightMotionIcon />
      </span>
      <span className="promo-text">
        <span className="promo-title">Alight Motion Premium</span>
        <span className="promo-sub">
          <b>5k</b> » Hanya Rp5.000🔥
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
