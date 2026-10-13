"use client";

import { useEffect, useRef, useState } from "react";

const HOLD_MS = 5750; // lama toast terlihat penuh (+ EXIT_MS = total 6 detik)
const EXIT_MS = 250; // durasi animasi keluar (samakan dengan CSS)
const MIN_AFTER_RELEASE_MS = 2000; // sisa waktu minimal setelah jari/kursor dilepas

/**
 * Notifikasi kecil (toast) di atas-tengah layar saat preset ditemukan.
 * Dirender hanya saat hasil ada, jadi tiap pencarian baru memunculkannya lagi.
 * Bisa diklik: menggulir halus ke section "Preset links" lalu menutup diri.
 * Hitung mundur berhenti selama di-hover / disentuh / difokus, lalu lanjut
 * dengan sisa waktu minimal MIN_AFTER_RELEASE_MS.
 */
export function FoundToast({ count }: { count: number }) {
  const [phase, setPhase] = useState<"in" | "out" | "gone">("in");
  const leaveTimer = useRef<number | undefined>(undefined);
  const removeTimer = useRef<number | undefined>(undefined);
  const deadline = useRef(0);
  const paused = useRef(false);
  const remaining = useRef(HOLD_MS);

  function clearTimers() {
    window.clearTimeout(leaveTimer.current);
    window.clearTimeout(removeTimer.current);
  }

  function dismiss() {
    clearTimers();
    setPhase("out");
    removeTimer.current = window.setTimeout(() => setPhase("gone"), EXIT_MS);
  }

  function schedule(ms: number) {
    clearTimers();
    deadline.current = Date.now() + ms;
    leaveTimer.current = window.setTimeout(dismiss, ms);
  }

  useEffect(() => {
    schedule(HOLD_MS);
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pause() {
    if (paused.current || phase !== "in") return;
    paused.current = true;
    remaining.current = Math.max(0, deadline.current - Date.now());
    clearTimers();
  }

  function resume() {
    if (!paused.current) return;
    paused.current = false;
    schedule(Math.max(MIN_AFTER_RELEASE_MS, remaining.current));
  }

  function goToPresets() {
    const target = Array.from(document.querySelectorAll<HTMLElement>(".preset-section")).find(
      (el) => el.offsetParent !== null,
    );
    dismiss();
    if (!target) return;
    const top = target.getBoundingClientRect().top;
    if (top >= 0 && top < window.innerHeight * 0.5) return; // judul section sudah kelihatan
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: top + window.scrollY - 16, behavior: reduce ? "auto" : "smooth" });
  }

  if (phase === "gone") return null;

  return (
    <button
      type="button"
      className={phase === "out" ? "found-toast is-leaving" : "found-toast"}
      aria-live="polite"
      onClick={goToPresets}
      onPointerEnter={pause}
      onPointerLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
      <span>{count} preset ditemukan</span>
      <span className="found-toast-action" aria-hidden="true">
        Lihat
      </span>
    </button>
  );
}
