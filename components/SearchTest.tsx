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
  title?: string;
  size?: string;
  source?: string;
};

type VideoRow = Candidate & {
  index: number;
  found?: boolean;
  error?: string;
  presetLinks?: Preset[];
  message?: string;
};

type FinalResult = {
  ok: boolean;
  query: string;
  engine: string;
  fromCache?: boolean;
  candidates: number;
  videos: VideoRow[];
  foundCount: number;
  elapsedMs: number;
};

function presetLabel(p: Preset): string {
  if (p.title) return p.title;
  if (p.size) return p.size;
  return p.type === "xml" ? "XML file" : "5MB preset";
}

function presetType(p: Preset): string {
  if (p.type) return p.type === "xml" ? "XML" : "5MB";
  return /\.xml(\?|$)/i.test(p.url) ? "XML" : "5MB";
}

export default function SearchTest() {
  const [q, setQ] = useState("");
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [status, setStatus] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [cands, setCands] = useState<Candidate[]>([]);
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [result, setResult] = useState<FinalResult | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const sourceRef = useRef<EventSource | null>(null);
  const logBoxRef = useRef<HTMLDivElement | null>(null);
  const totalRef = useRef(0);

  useEffect(() => {
    return () => sourceRef.current?.close();
  }, []);

  useEffect(() => {
    const box = logBoxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [logs]);

  function run() {
    const query = q.trim();
    if (query.length < 3 || phase === "running") return;

    sourceRef.current?.close();
    totalRef.current = 0;
    setPhase("running");
    setStatus("Mencari video TikTok…");
    setLogs([]);
    setCands([]);
    setVideos([]);
    setResult(null);
    setError("");

    const source = new EventSource(`/api/search?q=${encodeURIComponent(query)}`);
    sourceRef.current = source;

    source.addEventListener("log", (event) => {
      const line = (event as MessageEvent).data;
      if (typeof line === "string" && line) {
        setLogs((prev) => [...prev.slice(-199), line]);
      }
    });

    source.addEventListener("candidates", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as {
          items: Candidate[];
          engine: string;
          fromCache: boolean;
        };
        totalRef.current = data.items.length;
        setCands(data.items);
        setStatus(
          data.items.length
            ? `Ketemu ${data.items.length} video (engine ${data.engine}${data.fromCache ? ", cache" : ""}) — mulai cek preset…`
            : "Video tidak ketemu untuk query ini",
        );
      } catch {
        /* payload rusak biar ditangani event result/error */
      }
    });

    source.addEventListener("videoStart", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as { index: number };
        setStatus(`Cek video ${data.index + 1}/${totalRef.current}…`);
      } catch {
        /* abaikan */
      }
    });

    source.addEventListener("videoResult", (event) => {
      try {
        const row = JSON.parse((event as MessageEvent).data) as VideoRow;
        setVideos((prev) => {
          const next = [...prev];
          next[row.index] = row;
          return next;
        });
      } catch {
        /* abaikan */
      }
    });

    source.addEventListener("result", (event) => {
      if (sourceRef.current !== source) return;
      source.close();
      try {
        const data = JSON.parse((event as MessageEvent).data) as FinalResult;
        setResult(data);
        setVideos(data.videos ?? []);
        setPhase("done");
        setStatus("");
      } catch {
        setPhase("error");
        setError("respons server tidak terbaca");
      }
    });

    source.addEventListener("error", (event) => {
      if (sourceRef.current !== source) return;
      const data = (event as MessageEvent).data;
      if (typeof data === "string" && data) {
        source.close();
        setPhase("error");
        try {
          setError(JSON.parse(data).message || "terjadi kesalahan, coba lagi");
        } catch {
          setError("terjadi kesalahan, coba lagi");
        }
        return;
      }
      if (source.readyState === EventSource.CLOSED) {
        setPhase("error");
        setError("koneksi terputus selesai, coba lagi");
      }
    });
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

  const btnStyle: React.CSSProperties = {
    background: ACCENT,
    color: "#06110C",
    border: "none",
    borderRadius: 8,
    padding: "10px 16px",
    fontWeight: 700,
    fontSize: 14,
    cursor: phase === "running" ? "wait" : "pointer",
    opacity: phase === "running" ? 0.6 : 1,
  };

  const ghostBtn: React.CSSProperties = {
    background: "transparent",
    color: FG,
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 12,
    cursor: "pointer",
    textDecoration: "none",
  };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px 64px", color: FG }}>
      <h1 style={{ fontSize: 20, margin: "0 0 6px" }}>Search test — finder by query</h1>
      <p style={{ fontSize: 13, color: MUTED, margin: "0 0 16px" }}>
        Uji coba: kata kunci → 3 video TikTok teratas → cek preset di tiap video. Halaman test, bukan
        bagian dari finder utama.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        style={{ display: "flex", gap: 8, marginBottom: 14 }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="preset velocity"
          aria-label="query pencarian"
          style={{
            flex: 1,
            minWidth: 0,
            background: SURFACE,
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            color: FG,
            padding: "10px 12px",
            fontSize: 14,
          }}
        />
        <button type="submit" style={btnStyle} disabled={phase === "running"}>
          {phase === "running" ? "Jalan…" : "Cari"}
        </button>
      </form>

      {phase === "running" && (
        <div style={{ fontSize: 13, color: ACCENT, marginBottom: 10 }}>{status}</div>
      )}

      {logs.length > 0 && (
        <div
          ref={logBoxRef}
          style={{
            background: SURFACE,
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            padding: "8px 10px",
            maxHeight: 180,
            overflowY: "auto",
            marginBottom: 14,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 11,
            lineHeight: 1.6,
            color: MUTED,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {logs.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {phase === "error" && (
        <div
          style={{
            border: `1px solid ${DANGER}`,
            color: DANGER,
            borderRadius: 8,
            padding: 12,
            fontSize: 13,
            marginBottom: 14,
          }}
        >
          {error}
        </div>
      )}

      {result && (
        <div
          style={{
            border: `1px solid ${BORDER}`,
            background: SURFACE,
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 13,
            marginBottom: 14,
            color: result.foundCount > 0 ? ACCENT : MUTED,
          }}
        >
          {result.foundCount}/{result.candidates} video ada preset · engine {result.engine}
          {result.fromCache ? " (cache)" : ""} · {(result.elapsedMs / 1000).toFixed(1)} dtk
        </div>
      )}

      {videos
        .filter(Boolean)
        .map((v) => {
          const presets = v.found ? v.presetLinks ?? [] : [];
          return (
            <div
              key={v.index}
              style={{
                border: `1px solid ${BORDER}`,
                background: SURFACE,
                borderRadius: 8,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                {v.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={v.thumb}
                    alt=""
                    style={{ width: 42, height: 56, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
                  />
                ) : (
                  <div
                    style={{
                      width: 42,
                      height: 56,
                      background: BG,
                      border: `1px solid ${BORDER}`,
                      borderRadius: 6,
                      flexShrink: 0,
                    }}
                  />
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{v.handle || "(tanpa akun)"}</div>
                  <div style={{ fontSize: 12, color: MUTED, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                    {v.snippet || "—"}
                  </div>
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 12, color: ACCENT, textDecoration: "none" }}
                  >
                    buka video ↗
                  </a>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: 999,
                    border: `1px solid ${v.found ? ACCENT : BORDER}`,
                    color: v.found ? ACCENT : v.error ? DANGER : MUTED,
                    whiteSpace: "nowrap",
                  }}
                >
                  {v.found
                    ? `${presets.length} preset`
                    : v.error
                      ? "error"
                      : "nihil"}
                </div>
              </div>

              {v.error && (
                <div style={{ fontSize: 12, color: DANGER, marginTop: 8 }}>{v.error}</div>
              )}
              {!v.found && !v.error && (
                <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>
                  {v.message || "video ini tidak mengandung link preset"}
                </div>
              )}

              {presets.map((p, j) => {
                const key = `${v.index}-${j}`;
                return (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      marginTop: 10,
                      paddingTop: 10,
                      borderTop: `1px solid ${BORDER}`,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: ACCENT,
                        border: `1px solid ${BORDER}`,
                        borderRadius: 4,
                        padding: "2px 6px",
                        flexShrink: 0,
                      }}
                    >
                      {presetType(p)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {presetLabel(p)}
                      </div>
                      <div style={{ fontSize: 11, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.size ? `${p.size} · ` : ""}
                        {p.url}
                      </div>
                    </div>
                    <button type="button" style={ghostBtn} onClick={() => void copy(p.url, key)}>
                      {copied === key ? "Tersalin!" : "Salin"}
                    </button>
                    <a href={p.url} target="_blank" rel="noopener noreferrer" style={ghostBtn}>
                      Buka
                    </a>
                  </div>
                );
              })}
            </div>
          );
        })}

      {phase === "done" && result && result.foundCount === 0 && (
        <div
          style={{
            border: `1px solid ${BORDER}`,
            background: SURFACE,
            borderRadius: 8,
            padding: 16,
            fontSize: 13,
            color: MUTED,
          }}
        >
          Belum ada preset di {result.candidates} video teratas untuk query ini — coba kata kunci
          lain.
        </div>
      )}
    </div>
  );
}
