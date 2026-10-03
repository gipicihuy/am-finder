"use client";

import { useEffect, useState } from "react";

const VISIBLE_MS = 3600;

/**
 * Notifikasi kecil (toast) di atas layar saat preset ditemukan.
 * Dirender hanya saat hasil ada, jadi tiap pencarian baru memunculkannya lagi.
 * Hilang sendiri, tidak menangkap klik, dan tidak mengubah layout.
 */
export function FoundToast({ count }: { count: number }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="found-toast" role="status" aria-live="polite">
      <span aria-hidden="true">✅</span> Ditemukan {count} preset
    </div>
  );
}
