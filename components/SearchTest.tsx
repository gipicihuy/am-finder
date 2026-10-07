"use client";

import { useEffect, useRef, useState } from "react";

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

type Preset = {
  url: string;
  type?: string;
  size?: string;
  source?: string;
};

type VideoState = {
  state: "running" | "done" | "error";
  presets: Preset[];
  message?: string;
};

type Step = "search" | "pick" | "results";

function presetType(p: Preset): string {
  if (p.type) return p.type.toLowerCase() === "xml" ? "XML" : "5MB";
  return /\.xml(\?|$)/i.test(p.url) ? "XML" : "5MB";
}

function videoId(c: Candidate): string | null {
  if (c.kind === "photo") return null;
  const m = c.url.match(/\/video\/(\d{10,})/);
  return m ? m[1] : null;
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const OpenIcon = () => (
  <Icon>
    <path d="M10 3h5v5M15 3l-7 7M13 11v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3" />
  </Icon>
);
const CopyIcon = () => (
  <Icon>
    <rect x="6" y="6" width="9" height="9" rx="2" />
    <path d="M12 6V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" />
  </Icon>
);
const CheckIcon = () => (
  <Icon>
    <path d="M3.5 9.5l3.5 3.5 7.5-8" />
  </Icon>
);
const PlayIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="#fff" aria-hidden="true">
    <path d="M3 1.5v11l9-5.5z" />
  </svg>
);

export default function SearchTest() {
  const [step, setStep] = useState<Step>("search");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [cands, setCands] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [playing, setPlaying] = useState("");
  const [rows, setRows] = useState<Record<string, VideoState>>({});
  const [copied, setCopied] = useState("");
  const searchRef = useRef<EventSource | null>(null);
  const checksRef = useRef<Set<EventSource>>(new Set());
  const runRef = useRef(0);

  function stopChecks() {
    runRef.current += 1;
    checksRef.current.forEach((s) => s.close());
    checksRef.current.clear();
  }

  useEffect(() => {
    const checks = checksRef.current;
    return () => {
      searchRef.current?.close();
      checks.forEach((s) => s.close());
    };
  }, []);

  function search() {
    const query = q.trim();
    if (query.length < 3 || searching) return;
    searchRef.current?.close();
    setSearching(true);
    setError("");

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
        setError("No videos found. Try different keywords.");
        return;
      }
      setCands(items);
      setSelected([]);
      setPlaying("");
      setStep("pick");
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

  function checkVideo(url: string, runId: number) {
    const source = new EventSource(`/api/find?url=${encodeURIComponent(url)}`);
    checksRef.current.add(source);

    const finish = (next: VideoState) => {
      source.close();
      checksRef.current.delete(source);
      if (runRef.current !== runId) return;
      setRows((prev) => ({ ...prev, [url]: next }));
    };

    source.addEventListener("result", (event) => {
      try {
        const d = JSON.parse((event as MessageEvent).data) as {
          presetLinks?: Preset[];
          message?: string;
        };
        finish({
          state: "done",
          presets: Array.isArray(d.presetLinks) ? d.presetLinks : [],
          message: d.message,
        });
      } catch {
        finish({ state: "error", presets: [], message: "Couldn't read the response." });
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
        finish({ state: "error", presets: [], message: msg });
        return;
      }
      if (source.readyState === EventSource.CLOSED) {
        finish({ state: "error", presets: [], message: "Connection lost." });
      }
    });
  }

  function checkSelected() {
    if (!selected.length) return;
    stopChecks();
    const runId = runRef.current;
    const urls = [...selected];
    setPlaying("");
    setRows(Object.fromEntries(urls.map((u) => [u, { state: "running", presets: [] } as VideoState])));
    setStep("results");
    urls.forEach((u) => checkVideo(u, runId));
  }

  function backToPick() {
    stopChecks();
    setStep("pick");
  }

  function toggle(url: string) {
    setSelected((prev) => (prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]));
  }

  async function copy(url: string, key: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      setTimeout(() => setCopied(""), 1200);
    } catch {
      /* clipboard ditolak browser */
    }
  }

  const primaryBtn: React.CSSProperties = {
    width: "100%",
    height: 52,
    border: "none",
    borderRadius: 14,
    background: ACCENT,
    color: "#06110C",
    fontWeight: 700,
    fontSize: 16,
    cursor: "pointer",
  };

  const iconBtn: React.CSSProperties = {
    width: 44,
    height: 44,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    border: `1px solid ${BORDER}`,
    background: "transparent",
    color: FG,
    cursor: "pointer",
    padding: 0,
    textDecoration: "none",
  };

  const card: React.CSSProperties = {
    border: `1.5px solid ${BORDER}`,
    background: SURFACE,
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  };

  const linkBtn: React.CSSProperties = {
    background: "none",
    border: "none",
    color: ACCENT,
    fontSize: 15,
    padding: "8px 0",
    marginBottom: 8,
    cursor: "pointer",
  };

  function renderThumb(c: Candidate) {
    const id = videoId(c);
    const box: React.CSSProperties = {
      position: "relative",
      width: 76,
      height: 100,
      borderRadius: 10,
      background: BG,
      border: `1px solid ${BORDER}`,
      flexShrink: 0,
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    };
    return (
      <div style={box}>
        {c.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={c.thumb}
            alt=""
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : null}
        {id ? (
          <button
            type="button"
            aria-label={playing === c.url ? "Close player" : "Play video"}
            onClick={() => setPlaying(playing === c.url ? "" : c.url)}
            style={{
              position: "relative",
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: "none",
              background: "rgba(0,0,0,.65)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              cursor: "pointer",
            }}
          >
            {playing === c.url ? <span style={{ color: "#fff", fontSize: 16 }}>×</span> : <PlayIcon />}
          </button>
        ) : null}
      </div>
    );
  }

  function renderPlayer(c: Candidate) {
    const id = videoId(c);
    if (!id) {
      return (
        <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ color: ACCENT, fontSize: 14 }}>
          Open in TikTok
        </a>
      );
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <iframe
          src={`https://www.tiktok.com/player/v1/${id}?autoplay=1&rel=0`}
          title="TikTok player"
          allow="fullscreen; autoplay"
          style={{ width: "100%", maxWidth: 270, aspectRatio: "9 / 16", border: "none", borderRadius: 12, background: BG }}
        />
        <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ color: ACCENT, fontSize: 13 }}>
          Not loading? Open in TikTok
        </a>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "24px 16px 96px", color: FG }}>
      {step === "search" && (
        <>
          <h1 style={{ fontSize: 30, lineHeight: 1.1, margin: "0 0 10px" }}>Find preset links</h1>
          <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.5, margin: "0 0 22px" }}>
            Search a keyword, pick the video you want, then we check it for Alight Motion presets.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="velocity edit preset"
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
              style={{ ...primaryBtn, opacity: searching ? 0.6 : 1, cursor: searching ? "wait" : "pointer" }}
              disabled={searching}
            >
              {searching ? "Searching…" : "Search"}
            </button>
          </form>
          {error && (
            <div role="alert" style={{ color: DANGER, fontSize: 14, marginTop: 14 }}>
              {error}
            </div>
          )}
        </>
      )}

      {step === "pick" && (
        <>
          <button type="button" style={linkBtn} onClick={() => setStep("search")}>
            ← New search
          </button>
          <h2 style={{ fontSize: 24, margin: "0 0 6px" }}>Pick a video</h2>
          <p style={{ fontSize: 14, color: MUTED, margin: "0 0 18px" }}>
            Tap the thumbnail to watch. Tap the circle to choose.
          </p>
          {cands.map((c) => {
            const on = selected.includes(c.url);
            return (
              <div key={c.url} style={{ ...card, border: `1.5px solid ${on ? ACCENT : BORDER}` }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  {renderThumb(c)}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{c.handle || "TikTok video"}</div>
                    <div
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
                    </div>
                  </div>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-label={on ? "Unselect video" : "Select video"}
                    onClick={() => toggle(c.url)}
                    style={{
                      width: 44,
                      height: 44,
                      margin: -9,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: "50%",
                        boxSizing: "border-box",
                        border: on ? "none" : "2px solid #3A3D42",
                        background: on ? ACCENT : "transparent",
                        color: "#06110C",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {on ? <CheckIcon /> : null}
                    </span>
                  </button>
                </div>
                {playing === c.url && (
                  <div style={{ marginTop: 12 }}>
                    {renderPlayer(c)}
                  </div>
                )}
              </div>
            );
          })}
          <div
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: 0,
              padding: "12px 16px calc(16px + env(safe-area-inset-bottom, 0px))",
              background: `linear-gradient(to top, ${BG} 70%, transparent)`,
            }}
          >
            <div style={{ maxWidth: 520, margin: "0 auto" }}>
              <button
                type="button"
                onClick={checkSelected}
                disabled={!selected.length}
                style={{ ...primaryBtn, height: 54, opacity: selected.length ? 1 : 0.4, cursor: selected.length ? "pointer" : "not-allowed" }}
              >
                {selected.length
                  ? `Check presets · ${selected.length} video${selected.length > 1 ? "s" : ""}`
                  : "Select a video to check"}
              </button>
            </div>
          </div>
        </>
      )}

      {step === "results" && (
        <>
          <button type="button" style={linkBtn} onClick={backToPick}>
            ← Back to videos
          </button>
          {cands
            .filter((c) => rows[c.url])
            .map((c) => {
              const r = rows[c.url];
              return (
                <div key={c.url} style={card}>
                  <div style={{ marginBottom: 12 }}>
                    {renderPlayer(c)}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{c.handle || "TikTok video"}</div>

                  {r.state === "running" && (
                    <div style={{ fontSize: 14, color: ACCENT }}>Checking this video…</div>
                  )}
                  {r.state === "error" && (
                    <div role="alert" style={{ fontSize: 14, color: DANGER }}>
                      {r.message || "Something went wrong."}
                    </div>
                  )}
                  {r.state === "done" && r.presets.length === 0 && (
                    <div style={{ fontSize: 14, color: MUTED }}>No preset links found in this video.</div>
                  )}
                  {r.state === "done" && r.presets.length > 0 && (
                    <>
                      <h2 style={{ fontSize: 20, margin: "0 0 10px" }}>
                        {r.presets.length} preset{r.presets.length > 1 ? "s" : ""} found
                      </h2>
                      {r.presets.map((p, j) => {
                        const key = `${c.url}-${j}`;
                        return (
                          <div
                            key={key}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              padding: 12,
                              borderRadius: 14,
                              border: `1px solid ${BORDER}`,
                              background: BG,
                              marginBottom: 10,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: ACCENT,
                                border: `1.5px solid ${ACCENT}`,
                                borderRadius: 8,
                                padding: "4px 8px",
                                flexShrink: 0,
                              }}
                            >
                              {presetType(p)}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {p.url}
                              </div>
                              {(p.size || p.source) && (
                                <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>
                                  {[p.size, p.source].filter(Boolean).join(" · ")}
                                </div>
                              )}
                            </div>
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label="Open link"
                              style={iconBtn}
                            >
                              <OpenIcon />
                            </a>
                            <button
                              type="button"
                              aria-label={copied === key ? "Copied" : "Copy link"}
                              onClick={() => void copy(p.url, key)}
                              style={{ ...iconBtn, color: copied === key ? ACCENT : FG, borderColor: copied === key ? ACCENT : BORDER }}
                            >
                              {copied === key ? <CheckIcon /> : <CopyIcon />}
                            </button>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              );
            })}
          <button
            type="button"
            onClick={backToPick}
            style={{
              width: "100%",
              height: 50,
              marginTop: 4,
              borderRadius: 14,
              border: `1px solid ${BORDER}`,
              background: "transparent",
              color: FG,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Check another video
          </button>
        </>
      )}
    </div>
  );
}
