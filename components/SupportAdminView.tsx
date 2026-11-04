"use client";

import { useEffect, useId, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  STATIC_QRIS_PAYLOAD,
  MERCHANT_NAME,
  MERCHANT_CITY,
  MIN_DONATION,
  MAX_DONATION,
  NOMINAL_PRESETS,
  generateDynamicQris,
  formatRupiah,
  parseCleanNumber,
} from "@/lib/qris";
import { SectionOrnament } from "@/components/Ornament";

export function SupportAdminView() {
  const inputId = useId();
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customInput, setCustomInput] = useState<string>("");
  const [svgHtml, setSvgHtml] = useState<string>("");
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  // Hitung nominal aktif: prioritas ke custom input jika ada nilainya, atau ke chip yang dipilih
  const activeAmount = useMemo(() => {
    if (customInput.trim().length > 0) {
      const parsed = parseCleanNumber(customInput);
      return parsed >= MIN_DONATION && parsed <= MAX_DONATION ? parsed : null;
    }
    return selectedPreset;
  }, [customInput, selectedPreset]);

  // Payload QRIS: dinamis jika ada nominal valid, statis jika nominal bebas
  const currentPayload = useMemo(() => {
    if (activeAmount) {
      try {
        return generateDynamicQris(activeAmount);
      } catch {
        return STATIC_QRIS_PAYLOAD;
      }
    }
    return STATIC_QRIS_PAYLOAD;
  }, [activeAmount]);

  const isDynamic = currentPayload !== STATIC_QRIS_PAYLOAD;

  // Render SVG QR secara reaktif di client
  useEffect(() => {
    let canceled = false;
    QRCode.toString(currentPayload, {
      type: "svg",
      margin: 4,
      errorCorrectionLevel: "M",
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    })
      .then((svg) => {
        if (!canceled) setSvgHtml(svg);
      })
      .catch((err) => {
        console.error("Gagal generate QR SVG:", err);
      });
    return () => {
      canceled = true;
    };
  }, [currentPayload]);

  // Handler klik chip nominal
  const handleSelectPreset = (amount: number) => {
    if (selectedPreset === amount && !customInput) {
      setSelectedPreset(null);
    } else {
      setSelectedPreset(amount);
      setCustomInput("");
    }
  };

  // Handler input custom
  const handleCustomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawDigits = parseCleanNumber(e.target.value);
    if (!rawDigits) {
      setCustomInput("");
      return;
    }
    const capped = Math.min(rawDigits, MAX_DONATION);
    setCustomInput(formatRupiah(capped));
    setSelectedPreset(null);
  };

  // Reset ke nominal bebas
  const handleReset = () => {
    setSelectedPreset(null);
    setCustomInput("");
  };

  // Unduh PNG 1024px dengan quiet zone
  const handleDownloadPng = async () => {
    try {
      setIsDownloading(true);
      const dataUrl = await QRCode.toDataURL(currentPayload, {
        width: 1024,
        margin: 4,
        errorCorrectionLevel: "M",
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      });

      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "amfinder-qris.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("Gagal unduh QRIS:", err);
      alert("Gagal mengunduh gambar QR. Silakan gunakan tangkapan layar (screenshot).");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="support-admin-page">
      {/* Header Halaman */}
      <div className="sa-head">
        <div className="sa-badges" role="list" aria-label="Karakteristik layanan">
          <span className="sa-pill" role="listitem">
            <span className="sa-dot" aria-hidden="true" />
            Bebas Iklan
          </span>
          <span className="sa-pill" role="listitem">
            <span className="sa-dot" aria-hidden="true" />
            Tanpa Langganan
          </span>
          <span className="sa-pill" role="listitem">
            <span className="sa-dot" aria-hidden="true" />
            100% Sukarela
          </span>
        </div>

        <h1 className="sa-title">
          Dukung <em>AM Preset Finder.</em>
        </h1>
        <p className="sa-subtitle">
          AM Preset Finder gratis untuk semua orang tanpa iklan dan tanpa biaya langganan. Kalau kamu terbantu dan ingin traktir admin untuk biaya sewa server & domain, silakan scan QRIS di bawah ini. Nominal bebas dan sepenuhnya sukarela.
        </p>
      </div>

      {/* Frame Kartu QR Berornamen Khas AM Finder */}
      <div className="sa-qr-frame-container">
        <div className="sa-tech-frame">
          {/* 4 Corner Ornaments Khas Tema */}
          <span className="sa-corner sa-corner-tl" aria-hidden="true" />
          <span className="sa-corner sa-corner-tr" aria-hidden="true" />
          <span className="sa-corner sa-corner-bl" aria-hidden="true" />
          <span className="sa-corner sa-corner-br" aria-hidden="true" />

          {/* Header Hiasan Frame */}
          <div className="sa-frame-top" aria-hidden="true">
            <span className="sa-frame-title">AM PRESET FINDER • QRIS</span>
            <span className="sa-frame-ornament">
              <SectionOrnament />
            </span>
          </div>

          {/* Kartu Putih QR */}
          <article className="sa-qr-card" aria-label="Kode QRIS Donasi">
            <div className="sa-qr-header">
              <span className="sa-qr-brand">QRIS PEMBAYARAN</span>
              <span className={`sa-qr-type-badge ${isDynamic ? "is-dynamic" : ""}`}>
                {isDynamic ? "Nominal Terkunci" : "Nominal Bebas"}
              </span>
            </div>

            <div
              className="sa-qr-box"
              aria-label={`QR Code QRIS ${isDynamic && activeAmount ? `Rp${formatRupiah(activeAmount)}` : "Nominal Bebas"}`}
              dangerouslySetInnerHTML={{ __html: svgHtml }}
            />

            <div className="sa-qr-footer">
              <p className="sa-merchant-name">{MERCHANT_NAME}</p>
              <p className="sa-merchant-sub">
                Nama merchant ini yang akan muncul di aplikasi e-wallet / m-banking kamu.
              </p>
              <div className="sa-amount-tag">
                {isDynamic && activeAmount ? (
                  <span>Rp{formatRupiah(activeAmount)}</span>
                ) : (
                  <span>Nominal Bebas (Ketik Sendiri)</span>
                )}
              </div>
            </div>
          </article>

          {/* Tombol Simpan QR di Dalam Frame */}
          <div className="sa-frame-actions">
            <button
              type="button"
              className="sa-btn-download"
              onClick={handleDownloadPng}
              disabled={isDownloading}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {isDownloading ? "Menyiapkan QR..." : "Unduh QRIS (PNG)"}
            </button>
          </div>
        </div>
      </div>

      {/* Kontrol Pilihan Nominal */}
      <section className="sa-controls" aria-label="Pilihan Nominal Donasi">
        <div className="sa-controls-head">
          <h2 className="sa-section-label">Pilih Nominal</h2>
          <span className="sa-min-tag">Mulai dari Rp1.000</span>
        </div>

        <div className="sa-chip-grid" role="group" aria-label="Nominal preset">
          {NOMINAL_PRESETS.map((preset) => {
            const isSelected = selectedPreset === preset && !customInput;
            return (
              <button
                key={preset}
                type="button"
                className="sa-chip"
                aria-pressed={isSelected}
                onClick={() => handleSelectPreset(preset)}
              >
                Rp{formatRupiah(preset)}
              </button>
            );
          })}
        </div>

        <div className="sa-custom-amount-wrapper">
          <label htmlFor={inputId} className="sa-section-label">
            Atau Ketik Nominal Sendiri
          </label>
          <div className="sa-input-row">
            <span className="sa-input-prefix" aria-hidden="true">
              Rp
            </span>
            <input
              id={inputId}
              type="text"
              inputMode="numeric"
              className="sa-amount-input"
              placeholder="Contoh: 3.000 atau 15.000"
              value={customInput}
              onChange={handleCustomInputChange}
              aria-describedby={`${inputId}-hint`}
            />
          </div>
          <div id={`${inputId}-hint`} className="sa-input-hint">
            <span>Min. Rp1.000</span>
            <span>Maks. Rp10.000.000</span>
          </div>
        </div>

        {isDynamic && (
          <button type="button" className="sa-reset-btn" onClick={handleReset}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Kembali ke QR nominal bebas
          </button>
        )}
      </section>

      {/* Petunjuk 3 Langkah */}
      <section className="sa-guide-card" aria-label="Cara Pembayaran QRIS">
        <h2 className="sa-section-label">Cara Pembayaran (3 Langkah)</h2>
        <div className="sa-guide-list">
          <div className="sa-guide-item">
            <span className="sa-step-num">1</span>
            <p className="sa-step-text">
              Buka aplikasi e-wallet (<strong>DANA, GoPay, OVO, ShopeePay</strong>) atau <strong>m-Banking</strong> bank apa pun.
            </p>
          </div>
          <div className="sa-guide-item">
            <span className="sa-step-num">2</span>
            <p className="sa-step-text">
              Pilih menu <strong>Bayar / Scan QR</strong> (arahkan kamera ke layar atau unggah gambar QR yang sudah kamu unduh).
            </p>
          </div>
          <div className="sa-guide-item">
            <span className="sa-step-num">3</span>
            <p className="sa-step-text">
              Pastikan nama merchant yang muncul adalah <strong>Azein</strong>, konfirmasi nominal, lalu masukkan PIN.
            </p>
          </div>
        </div>
      </section>

      {/* Catatan Terima Kasih */}
      <footer className="sa-thank-you">
        <p className="font-semibold text-[var(--foreground)]">Makasih banyak atas traktirannya! ❤️</p>
        <p>Setiap rupiah bantuanmu sangat berarti untuk menjaga server AM Preset Finder tetap online dan bebas dinikmati semua orang.</p>
      </footer>
    </div>
  );
}
