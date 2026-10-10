"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FindResult, RekomenFeed } from "@/lib/types";
import { ResultView } from "@/components/ResultView";
import BrandScan from "@/components/BrandScan";
import { SectionOrnament } from "@/components/Ornament";

type Detail = {
  state: "running" | "done" | "error";
  result?: FindResult;
  message?: string;
};

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(value);
}

function timeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export default function RekomendasiPreset() {
  const [feed, setFeed] = useState<RekomenFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const findRef = useRef<EventSource | null>(null);

  const load = useCallback(async (refresh: boolean) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/rekomen-preset${refresh ? "?refresh=1" : ""}`);
      const data = (await res.json()) as RekomenFeed & { error?: string };
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setFeed(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat rekomendasi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    return () => findRef.current?.close();
  }, [load]);

  function openVideo(url: string) {
    findRef.current?.close();
    setSelected(url);
    setDetail({ state: "running" });
    window.scrollTo({ top: 0 });

    const source = new EventSource(`/api/find?url=${encodeURIComponent(url)}`);
    findRef.current = source;

    const finish = (next: Detail) => {
      source.close();
      if (findRef.current === source) findRef.current = null;
      setDetail(next);
    };

    source.addEventListener("result", (event) => {
      try {
        finish({ state: "done", result: JSON.parse((event as MessageEvent).data) as FindResult });
      } catch {
        finish({ state: "error", message: "Couldn't read the response." });
      }
    });

    source.addEventListener("error", (event) => {
      const data = (event as MessageEvent).data;
      if (typeof data === "string" && data) {
        let msg = "Something went wrong.";
        try {
          msg = JSON.parse(data).message || msg;
        } catch {
          /* pakai pesan default */
        }
        finish({ state: "error", message: msg });
        return;
      }
      if (source.readyState === EventSource.CLOSED) finish({ state: "error", message: "Connection lost." });
    });
  }

  function closeVideo() {
    findRef.current?.close();
    findRef.current = null;
    setSelected("");
    setDetail(null);
  }

  const items = feed?.items ?? [];
  const okSources = feed?.sources.filter((s) => s.ok).length ?? 0;
  const totalSources = feed?.sources.length ?? 0;
  const engineNames = Array.from(
    new Set((feed?.sources ?? []).map((s) => s.engine).filter((name): name is string => !!name)),
  );

  if (selected) {
    return (
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "24px 16px 64px" }}>
        <button
          type="button"
          className="text-btn"
          onClick={closeVideo}
          style={{ marginBottom: 16 }}
        >
          Kembali ke rekomendasi
        </button>
        {detail?.state === "running" && (
          <div className="run" aria-live="polite">
            <BrandScan title="Mencari link preset" />
          </div>
        )}
        {detail?.state === "error" && (
          <div className="state state-error" role="alert">
            <strong>Gagal cek video ini.</strong>
            <span>{detail.message || "Something went wrong."}</span>
          </div>
        )}
        {detail?.state === "done" && detail.result && <ResultView result={detail.result} />}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 0 64px" }}>
      <h1 className="page-title">
        <span className="section-ornament" aria-hidden="true">
          <SectionOrnament />
        </span>
        Rekomendasi Preset
      </h1>
      <p className="page-sub">
        Halaman uji feed rekomendasi: video preset dari pencarian TikTok, diurutkan dari yang paling
        banyak ditonton. Ketuk kartu untuk langsung cek link presetnya.
      </p>

      <div className="section-head">
        <h2 className="section-title">Rekomendasi Preset</h2>
        {items.length > 4 && (
          <button type="button" className="text-btn" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Tampilkan sedikit" : "Lihat Semua"}
          </button>
        )}
      </div>

      {loading && (
        <div className="run" aria-live="polite">
          <BrandScan title="Menyiapkan rekomendasi" />
        </div>
      )}

      {!loading && error && (
        <div className="state state-error" role="alert">
          <strong>Rekomendasi belum tersedia.</strong>
          <span>{error}</span>
          <button type="button" className="text-btn" onClick={() => load(true)}>
            Coba lagi
          </button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="state">
          <strong>Belum ada rekomendasi.</strong>
          <span>Semua seed pencarian gagal. Coba muat ulang.</span>
          <button type="button" className="text-btn" onClick={() => load(true)}>
            Muat ulang
          </button>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <>
          <div
            style={
              showAll
                ? { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 14 }
                : {
                    display: "flex",
                    gap: 12,
                    overflowX: "auto",
                    paddingBottom: 8,
                    scrollbarWidth: "thin",
                  }
            }
          >
            {items.map((item) => (
              <button
                key={item.url}
                type="button"
                aria-label={`Cek preset dari ${item.handle || "video ini"}`}
                onClick={() => openVideo(item.url)}
                style={{
                  flex: showAll ? "none" : "0 0 154px",
                  width: showAll ? "100%" : 154,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: 0,
                  background: "none",
                  border: "none",
                  color: "inherit",
                  font: "inherit",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    position: "relative",
                    display: "block",
                    width: "100%",
                    aspectRatio: "9 / 16",
                    borderRadius: "var(--radius)",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    overflow: "hidden",
                  }}
                >
                  {item.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumb}
                      alt=""
                      loading="lazy"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : null}
                  {typeof item.views === "number" && item.views > 0 ? (
                    <span
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "3px 7px",
                        borderRadius: 999,
                        background: "rgba(0,0,0,0.72)",
                        color: "#f2f2f3",
                        fontSize: 11,
                        fontWeight: 700,
                        lineHeight: 1.2,
                      }}
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true">
                        <path d="M1 0.5 7 4 1 7.5Z" />
                      </svg>
                      {formatCount(item.views)}
                    </span>
                  ) : null}
                </span>
                <span style={{ display: "block", fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>
                  {item.handle || "TikTok video"}
                </span>
                <span
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    fontSize: 12.5,
                    lineHeight: 1.45,
                    color: "var(--muted)",
                  }}
                >
                  {item.snippet || "No caption"}
                </span>
              </button>
            ))}
          </div>

          <p
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 10,
              margin: "16px 0 0",
              fontSize: 12.5,
              color: "var(--muted)",
            }}
          >
            <span>
              {items.length} video · {okSources}/{totalSources} seed berhasil
              {engineNames.length ? ` · ${engineNames.join(", ")}` : ""} · {timeLabel(feed!.generatedAt)}
            </span>
            <button type="button" className="text-btn" onClick={() => load(true)}>
              Muat ulang
            </button>
          </p>
        </>
      )}
    </div>
  );
}
