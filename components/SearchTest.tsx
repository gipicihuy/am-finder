"use client";

import { isTikTokLink } from "@/lib/tiktok-link";
import { useEffect, useRef, useState } from "react";
import type { FindResult } from "@/lib/types";
import { ResultView } from "@/components/ResultView";
import BrandScan from "./BrandScan";
import { ui } from "@/lib/ui";

const BG = "#0F0F10";
const SURFACE = "#17171A";
const BORDER = "#2C2C33";
const FG = "#F2F2F3";
const MUTED = "#9B9BA3";
const ACCENT = "#05FAA8";
const DANGER = "#FF6B6B";

type Candidate = {
  url: string;
  handle?: string;
  kind?: string;
  snippet?: string;
  thumb?: string;
};

type Detail = {
  state: "running" | "done" | "error";
  result?: FindResult;
  message?: string;
};

const ChevronLeft = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12.5 4.5 7 10l5.5 5.5" />
  </svg>
);

const ChevronRight = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    stroke={MUTED}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M7.5 4.5 13 10l-5.5 5.5" />
  </svg>
);

type SearchTestProps = {
  /** Dipakai di dalam Home (tab Cari Preset): tanpa judul/padding sendiri. */
  embedded?: boolean;
  /** Dipanggil kalau user menempel link TikTok di kolom judul. */
  onTikTokLink?: (url: string) => void;
  /** Dipanggil saat halaman detail video dibuka/ditutup. */
  onDetailChange?: (open: boolean) => void;
};

export default function SearchTest({ embedded = false, onTikTokLink, onDetailChange }: SearchTestProps = {}) {
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [cands, setCands] = useState<Candidate[]>([]);
  const [candLimit, setCandLimit] = useState(3);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [openUrl, setOpenUrl] = useState("");
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const searchRef = useRef<EventSource | null>(null);
  const checkRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => {
      searchRef.current?.close();
      checkRef.current?.close();
    };
  }, []);

  // Selama loading full-screen: kunci scroll (posisi halaman dipegang),
  // dilepas otomatis begitu pencarian selesai / komponen unmount.
  useEffect(() => {
    const running = openUrl !== "" && details[openUrl]?.state === "running";
    if (!running) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [openUrl, details]);

  useEffect(() => {
    onDetailChange?.(openUrl !== "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openUrl]);

  function changeQuery(value: string) {
    if (embedded && isTikTokLink(value)) {
      onTikTokLink?.(value.trim());
      setQ("");
      return;
    }
    setQ(value);
  }

  function search() {
    const query = q.trim();
    if (query.length < 3 || searching) return;
    searchRef.current?.close();
    checkRef.current?.close();
    setSearching(true);
    setError("");
    setOpenUrl("");

    const source = new EventSource(`/api/search?mode=pick&q=${encodeURIComponent(query)}`);
    searchRef.current = source;
    let items: Candidate[] = [];

    const fail = (msg: string) => {
      source.close();
      setSearching(false);
      setError(msg);
    };

    source.addEventListener("candidates", (event) => {
      try {
        items = (JSON.parse((event as MessageEvent).data) as { items: Candidate[] }).items ?? [];
      } catch {
        items = [];
      }
    });

    source.addEventListener("result", () => {
      if (searchRef.current !== source) return;
      source.close();
      setSearching(false);
      if (!items.length) {
        setCands([]);
        setError("No videos found. Try different keywords.");
        return;
      }
      setCands(items);
      setCandLimit(3);
      setSearchedQuery(query);
      setDetails({});
    });

    source.addEventListener("error", (event) => {
      if (searchRef.current !== source) return;
      const data = (event as MessageEvent).data;
      if (typeof data === "string" && data) {
        try {
          fail(JSON.parse(data).message || "Something went wrong. Try again.");
        } catch {
          fail("Something went wrong. Try again.");
        }
        return;
      }
      if (source.readyState === EventSource.CLOSED) fail("Connection lost. Try again.");
    });
  }

  function openVideo(url: string) {
    setOpenUrl(url);
    window.scrollTo({ top: 0 });
    if (details[url]?.state === "done") return;

    checkRef.current?.close();
    setDetails((prev) => ({ ...prev, [url]: { state: "running" } }));
    const source = new EventSource(`/api/find?url=${encodeURIComponent(url)}`);
    checkRef.current = source;

    const finish = (next: Detail) => {
      source.close();
      if (checkRef.current === source) checkRef.current = null;
      setDetails((prev) => ({ ...prev, [url]: next }));
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
    checkRef.current?.close();
    checkRef.current = null;
    setDetails((prev) => {
      const cur = prev[openUrl];
      if (cur?.state !== "running") return prev;
      const next = { ...prev };
      delete next[openUrl];
      return next;
    });
    setOpenUrl("");
  }

  const linkBtn: React.CSSProperties = {
    background: "none",
    border: "none",
    color: ACCENT,
    fontSize: 15,
    padding: "12px 0",
    minHeight: 44,
    marginBottom: 4,
    cursor: "pointer",
  };

  const current = openUrl ? details[openUrl] : undefined;
  const candidate = cands.find((c) => c.url === openUrl);

  return (
    <div
      style={
        embedded
          ? { color: FG }
          : { maxWidth: 520, margin: "0 auto", padding: "24px 16px 64px", color: FG }
      }
    >
      {!openUrl && (
        <>
          {!embedded && (
            <>
          <h1 style={{ fontSize: 30, lineHeight: 1.1, margin: "0 0 10px" }}>Cari preset</h1>
          <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.5, margin: "0 0 22px" }}>
            Ketik nama lagu atau kata kunci, lalu pilih video untuk mencari link presetnya.
          </p>
            </>
          )}
          {embedded ? (
          <div className="search-wrap">
            <form
              className="search-form"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                search();
              }}
            >
              <span className="search-field">
                <span className="search-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.6-3.6" />
                  </svg>
                </span>
                <input
                  className="search-input"
                  type="text"
                  inputMode="search"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Cari nama lagu atau kata kunci..."
                  aria-label="Search keyword"
                  value={q}
                  onChange={(e) => changeQuery(e.target.value)}
                />
                {q ? (
                  <button type="button" className="clear-btn" aria-label="Clear" onClick={() => setQ("")}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                ) : null}
              </span>
              <button className="btn-primary" type="submit" disabled={searching}>
                {searching ? ui.buttons.searching : ui.buttons.search}
              </button>
            </form>
          </div>
          ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <input
              value={q}
              onChange={(e) => changeQuery(e.target.value)}
              placeholder="Cari nama lagu atau kata kunci..."
              aria-label="Search keyword"
              style={{
                width: "100%",
                boxSizing: "border-box",
                height: 52,
                background: SURFACE,
                border: `1px solid ${BORDER}`,
                borderRadius: 14,
                color: FG,
                padding: "0 16px",
                fontSize: 16,
                marginBottom: 12,
              }}
            />
            <button
              type="submit"
              disabled={searching}
              style={{
                width: "100%",
                height: 52,
                border: "none",
                borderRadius: 14,
                background: ACCENT,
                color: "#06110C",
                fontWeight: 700,
                fontSize: 16,
                opacity: searching ? 0.6 : 1,
                cursor: searching ? "wait" : "pointer",
              }}
            >
              {searching ? "Searching…" : "Search"}
            </button>
          </form>
          )}
          {error && (
            <div role="alert" style={{ color: DANGER, fontSize: 14, marginTop: 14 }}>
              {error}
            </div>
          )}

          {embedded && searching && (
            <div className="run" aria-live="polite">
              <BrandScan title="Mencari video" />
            </div>
          )}

          {cands.length > 0 && !(embedded && searching) && (
            <section aria-label="Search results" style={{ marginTop: 26, opacity: searching ? 0.5 : 1 }}>
              <h2 style={{ fontSize: 18, margin: "0 0 12px" }}>
                {cands.length} video{cands.length > 1 ? "s" : ""}
              </h2>
              {cands.slice(0, candLimit).map((c) => (
                <button
                  key={c.url}
                  type="button"
                  aria-label={`Check presets from ${c.handle || "this video"}`}
                  onClick={() => openVideo(c.url)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    textAlign: "left",
                    padding: 12,
                    marginBottom: 10,
                    background: SURFACE,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 16,
                    color: "inherit",
                    font: "inherit",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      position: "relative",
                      width: 64,
                      height: 86,
                      flexShrink: 0,
                      borderRadius: 10,
                      background: BG,
                      border: `1px solid ${BORDER}`,
                      overflow: "hidden",
                    }}
                  >
                    {c.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.thumb}
                        alt=""
                        loading="lazy"
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : null}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 15, fontWeight: 700, marginBottom: 5 }}>
                      {c.handle || "TikTok video"}
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        color: MUTED,
                        lineHeight: 1.45,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {c.snippet || "No caption"}
                    </span>
                  </span>
                  <ChevronRight />
                </button>
              ))}
              {cands.length > candLimit && (
                <button
                  type="button"
                  onClick={() => setCandLimit((limit) => limit + 3)}
                  style={{
                    width: "100%",
                    height: 48,
                    marginTop: 4,
                    borderRadius: 14,
                    background: SURFACE,
                    border: `1px solid ${BORDER}`,
                    color: ACCENT,
                    font: "inherit",
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Tampilkan lebih banyak
                </button>
              )}
            </section>
          )}
        </>
      )}

      {openUrl && (
        <>
          <button
            type="button"
            aria-label="Kembali ke daftar video"
            style={{ ...linkBtn, display: "flex", alignItems: "center", gap: 2, marginLeft: -4 }}
            onClick={closeVideo}
          >
            <ChevronLeft />
            Kembali
          </button>
          {candidate && searchedQuery && (
            <div style={{ fontSize: 15, fontWeight: 700 }}>Judul : {searchedQuery}</div>
          )}
          {current?.state === "running" && (
            <div
              role="status"
              aria-live="polite"
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 9999,
                background: "#000000",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <BrandScan />
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 18,
                  textAlign: "center",
                  fontSize: 11,
                  color: "#5C5C63",
                }}
              >
                {ui.footer.copyright}
              </div>
            </div>
          )}
          {current?.state === "error" && (
            <div role="alert" style={{ fontSize: 14, color: DANGER, marginTop: 16 }}>
              {current.message || "Something went wrong."}
            </div>
          )}
          {current?.state === "done" && current.result && <ResultView result={current.result} />}
        </>
      )}
    </div>
  );
}
