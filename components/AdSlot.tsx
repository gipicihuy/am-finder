"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { ADS_CONFIG, type AdSlotKey } from "@/config/ads";

// Halaman-halaman terlarang yang tidak boleh menampilkan iklan
const BLOCKED_PATHS = ["/monitor-givy", "/terms", "/privacy", "/support-admin"];
const MONETAG_SCRIPT_ID = "monetag-tag-script";

interface AdSlotProps {
  slot: AdSlotKey;
  className?: string;
}

export function AdSlot({ slot, className = "" }: AdSlotProps) {
  const pathname = usePathname();
  const mountedRef = useRef(false);

  // Periksa apakah slot ini diaktifkan di konfigurasi
  const isSlotEnabled = ADS_CONFIG.banner.slots[slot] === true;

  // Periksa apakah halaman termasuk dalam daftar yang dilarang
  const isBlockedPage = Boolean(
    pathname && BLOCKED_PATHS.some((p) => pathname.startsWith(p))
  );

  useEffect(() => {
    if (!isSlotEnabled || isBlockedPage) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;

    // Singleton guard: pastikan script Monetag In-Page Push tidak dimuat berulang kali
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
        // Script injection fallback aman
      }
    }
  }, [isSlotEnabled, isBlockedPage]);

  if (!isSlotEnabled || isBlockedPage) {
    return null;
  }

  return (
    <div
      className={`ad-slot-wrap ${className}`.trim()}
      role="region"
      aria-label="Iklan"
      data-ad-slot={slot}
    >
      <div className="ad-slot-header">
        <span className="ad-slot-label">Iklan</span>
      </div>
      <div
        className="ad-slot-content"
        id={`ad-zone-${ADS_CONFIG.banner.zoneId}-${slot}`}
      />
    </div>
  );
}
