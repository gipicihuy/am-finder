"use client";

import { useEffect } from "react";
import { ADS_CONFIG } from "@/config/ads";

const MONETAG_SCRIPT_ID = "monetag-tag-script";

/**
 * AdSlot untuk Monetag:
 * Memuat tag In-Page Push Monetag di latar belakang tanpa merender
 * kotak/frame atau teks "IKLAN" visual apa pun di halaman.
 */
export function AdSlot() {
  useEffect(() => {
    if (!ADS_CONFIG.banner.enabled) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;

    if (!document.getElementById(MONETAG_SCRIPT_ID)) {
      try {
        const script = document.createElement("script");
        script.id = MONETAG_SCRIPT_ID;
        script.dataset.zone = ADS_CONFIG.banner.zoneId;
        script.src = ADS_CONFIG.banner.scriptUrl;
        script.async = true;

        const target = [document.documentElement, document.body].filter(Boolean).pop();
        if (target) {
          target.appendChild(script);
        }
      } catch {
        // Fallback aman jika script gagal dimuat
      }
    }
  }, []);

  return null; // Murni script latar belakang, tanpa kotak atau teks "IKLAN"
}
