"use client";

import { useEffect, useState } from "react";

const HOLD_MS = 5750; // lama toast terlihat penuh (+ EXIT_MS = total 6 detik)
const EXIT_MS = 250; // durasi animasi keluar (samakan dengan CSS)

/**
 * Notifikasi kecil (toast) di atas-tengah layar saat preset ditemukan.
 * Dirender hanya saat hasil ada, jadi tiap pencarian baru memunculkannya lagi.
 * Tidak menangkap klik dan tidak mengubah layout.
 */
export function FoundToast({ count }: { count: number }) {
  const [phase, setPhase] = useState<"in" | "out" | "gone">("in");

  useEffect(() => {
    const leave = window.setTimeout(() => setPhase("out"), HOLD_MS);
    const remove = window.setTimeout(() => setPhase("gone"), HOLD_MS + EXIT_MS);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(remove);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div className={phase === "out" ? "found-toast is-leaving" : "found-toast"} role="status" aria-live="polite">
      <span className="found-toast-count">{count}</span> preset ditemukan
    </div>
  );
}
