"use client";

import { useEffect, useState } from "react";
import { useUi } from "@/components/LocaleProvider";

const THEME_KEY = "amfinder:theme";

type Theme = "dark" | "light";

function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="4.2" fill="currentColor" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 35 35" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M18.44,34.68a18.22,18.22,0,0,1-2.94-.24,18.18,18.18,0,0,1-15-20.86A18.06,18.06,0,0,1,9.59.63,2.42,2.42,0,0,1,12.2.79a2.39,2.39,0,0,1,1,2.41L11.9,3.1l1.23.22A15.66,15.66,0,0,0,23.34,21h0a15.82,15.82,0,0,0,8.47.53A2.44,2.44,0,0,1,34.47,25,18.18,18.18,0,0,1,18.44,34.68ZM10.67,2.89a15.67,15.67,0,0,0-5,22.77A15.66,15.66,0,0,0,32.18,24a18.49,18.49,0,0,1-9.65-.64A18.18,18.18,0,0,1,10.67,2.89Z" />
    </svg>
  );
}

/**
 * Switch tema (gelap/terang) di footer menu samping. Ikon di dalam "thumb"
 * menunjukkan tema yang sedang aktif: matahari saat terang, bulan saat gelap.
 * Pilihan disimpan di localStorage; `data-theme` di <html> dipasang lebih awal
 * oleh skrip kecil di layout supaya tidak berkedip.
 */
export function ThemeToggle() {
  const ui = useUi();
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // storage diblokir — tema tetap berubah untuk sesi ini
    }
  }

  const dark = theme === "dark";

  return (
    <div className="theme-row">
      <button
        type="button"
        role="switch"
        aria-checked={dark}
        className="theme-switch"
        data-theme-state={theme}
        aria-label={dark ? ui.menu.theme.toLight : ui.menu.theme.toDark}
        onClick={toggle}
      >
        <span className="theme-switch-thumb">{dark ? <MoonIcon /> : <SunIcon />}</span>
      </button>
    </div>
  );
}
