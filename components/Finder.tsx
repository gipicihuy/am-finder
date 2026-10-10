"use client";

import { isTikTokLink } from "@/lib/tiktok-link";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { FindResult } from "@/lib/types";
import { ui } from "@/lib/ui";
import { ResultView } from "@/components/ResultView";
import { FoundToast } from "@/components/FoundToast";
import BrandScan from "./BrandScan";
import SearchTest from "./SearchTest";
import { SEARCH_STARTED_EVENT } from "@/lib/promo-events";

type Phase = "idle" | "running" | "done" | "error";

type Battery = { level: number; charging: boolean };

async function readBattery(): Promise<Battery | null> {
  const nav = navigator as Navigator & {
    getBattery?: () => Promise<{ level: number; charging: boolean }>;
  };
  if (typeof nav.getBattery !== "function") return null;
  try {
    const status = await nav.getBattery();
    return { level: Math.round(status.level * 100), charging: status.charging };
  } catch {
    return null;
  }
}

const HISTORY_KEY = "amfinder:history";
const MODE_KEY = "amfinder:mode";

// Label "NEW" di tab Cari Preset tampil sampai tanggal ini, lalu hilang sendiri.
// Ubah tanggalnya kalau mau diperpanjang, atau hapus konstanta + badge-nya.
const NEW_BADGE_UNTIL = new Date("2026-11-08T00:00:00+07:00").getTime();

type Mode = "url" | "search";

function UrlIcon() {
  return (
    <svg className="mode-tab-icon" viewBox="0 0 48 48" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g transform="scale(2)">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="#f2f2f3" strokeWidth="1.4" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="#05FAA8" strokeWidth="1.4" />
      </g>
    </svg>
  );
}

function SearchPresetIcon() {
  return (
    <svg className="mode-tab-icon" viewBox="0 0 48 48" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="20.5" cy="20.5" r="13.5" stroke="#f2f2f3" strokeWidth="2.8" />
      <path d="M30.1 30.1 43 43" stroke="#f2f2f3" strokeWidth="3.4" />
      <g transform="translate(20.5 20.5) scale(0.62) translate(-24 -24)">
        <g transform="translate(24 24) scale(0.8) translate(-24 -25.7)" stroke="#05FAA8" strokeWidth="3.4">
          <path d="M43.5,28.3294a19.5,19.5,0,0,0-39,0" />
          <path d="M18.4694,32.593a6.9229,6.9229,0,0,0,9.79-9.7905" />
          <path d="M23.25,39.1706a11.2273,11.2273,0,1,0,0-22.4545" />
          <path d="M34.6024,38.2223a14.6374,14.6374,0,1,0-20.7-20.7" />
        </g>
      </g>
    </svg>
  );
}

export function Finder() {
  const [value, setValue] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<FindResult | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("url");
  const [searchDetailOpen, setSearchDetailOpen] = useState(false);
  const [showNewBadge, setShowNewBadge] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const finishedRef = useRef(false);
  const batteryRef = useRef<Battery | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {
      setHistory([]);
    }
    let cancelled = false;
    void readBattery().then(battery => {
      if (cancelled) return;
      batteryRef.current = battery;
      try {
        void fetch("/api/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: location.pathname, battery }),
        });
      } catch {
        /* log visit bukan kebutuhan utama */
      }
    });
    return () => {
      cancelled = true;
      sourceRef.current?.close();
    };
  }, []);

  function remember(link: string) {
    const next = [link, ...history.filter((item) => item !== link)].slice(0, 6);
    setHistory(next);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      /* riwayat lokal bukan kebutuhan utama */
    }
  }

  function search(link: string) {
    const target = link.trim();
    if (!target) return;

    const looksLikeTikTok = isTikTokLink(target);
    if (!looksLikeTikTok) {
      sourceRef.current?.close();
      finishedRef.current = true;
      setPhase("error");
      setError("That link is not from TikTok. Paste a TikTok video link first.");
      return;
    }

    sourceRef.current?.close();
    finishedRef.current = false;
    remember(target);
    setValue(target);
    window.dispatchEvent(new Event(SEARCH_STARTED_EVENT));
    setPhase("running");
    setResult(null);
    setError("");

    const battery = batteryRef.current;
    const batteryQuery = battery
      ? `&bat=${battery.level}&chg=${battery.charging ? 1 : 0}`
      : "";
    const source = new EventSource(
      `/api/find?url=${encodeURIComponent(target)}${batteryQuery}`
    );
    sourceRef.current = source;

    source.addEventListener("result", (event) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      source.close();
      try {
        const data = JSON.parse((event as MessageEvent).data) as FindResult;
        if (data.ok === false) {
          setPhase("error");
          setError(data.error || "the scraper could not process this link");
          return;
        }
        setResult(data);
        setPhase("done");
      } catch {
        setPhase("error");
        setError("unreadable response from server");
      }
    });

    source.addEventListener("error", (event) => {
      if (finishedRef.current) return;
      const data = (event as MessageEvent).data;
      if (typeof data === "string" && data) {
        finishedRef.current = true;
        source.close();
        setPhase("error");
        try {
          setError(JSON.parse(data).message || "something went wrong, try again");
        } catch {
          setError("something went wrong, try again");
        }
        return;
      }
      if (source.readyState === EventSource.CLOSED) {
        finishedRef.current = true;
        setPhase("error");
        setError("connection closed before it finished, try again");
      }
    });
  }

  useEffect(() => {
    try {
      if (localStorage.getItem(MODE_KEY) === "search") setMode("search");
    } catch {
      // storage diblokir — tetap di mode default
    }
  }, []);

  // Panel yang tidak aktif cuma disembunyikan, jadi video di dalamnya harus
  // dihentikan manual. Listener "play" (fase capture) juga menahan autoplay
  // yang baru jalan saat hasil datang ketika panelnya sedang tersembunyi.
  useEffect(() => {
    const panel = document.getElementById(mode === "url" ? "panel-search" : "panel-url");
    if (!panel) return;
    const stop = (event: Event) => {
      if (event.target instanceof HTMLVideoElement) event.target.pause();
    };
    panel.querySelectorAll("video").forEach((video) => video.pause());
    panel.addEventListener("play", stop, true);
    return () => panel.removeEventListener("play", stop, true);
  }, [mode]);

  // Dicek di client supaya tanggalnya nggak "membeku" di hasil build statis.
  useEffect(() => {
    setShowNewBadge(Date.now() < NEW_BADGE_UNTIL);
  }, []);

  function chooseMode(next: Mode) {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // abaikan
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (phase === "running") return;
    search(value);
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setValue(text.trim());
        return;
      }
    } catch {
      // WebView (APK) nolak clipboard-read permission — fallback ke bridge native
    }
    try {
      const bridge = (window as { AndroidClipboard?: { read?: () => string } })
        .AndroidClipboard;
      const text = bridge?.read?.();
      if (text) {
        setValue(text.trim());
        return;
      }
    } catch {
      // bridge gak ada (buka via browser biasa)
    }
    inputRef.current?.focus();
  }

  return (
    <>
      <div className="mode-tabs" role="tablist" aria-label="Mode pencarian">
        <button
          type="button"
          role="tab"
          id="tab-url"
          aria-selected={mode === "url"}
          aria-controls="panel-url"
          className="mode-tab"
          onClick={() => chooseMode("url")}
        >
          <UrlIcon />
          URL Video
        </button>
        <button
          type="button"
          role="tab"
          id="tab-search"
          aria-selected={mode === "search"}
          aria-controls="panel-search"
          className="mode-tab"
          onClick={() => chooseMode("search")}
        >
          <SearchPresetIcon />
          Cari Preset
          {showNewBadge ? <span className="mode-tab-badge">NEW</span> : null}
        </button>
      </div>

      {mode === "url" ? (
        <p className="page-sub" data-nosnippet>
          Masukkan link video TikTok untuk mencari link preset di deskripsi, bio, komentar, dan
          balasannya.
        </p>
      ) : !searchDetailOpen ? (
        <p className="page-sub" data-nosnippet>
          Cari pakai nama lagu atau kata kunci, lalu pilih video untuk mencari link preset di
          deskripsi, bio, komentar, dan balasannya.
        </p>
      ) : null}

      <div id="panel-search" role="tabpanel" aria-labelledby="tab-search" hidden={mode !== "search"}>
        <SearchTest
          embedded
          onTikTokLink={(link) => {
            setValue(link);
            chooseMode("url");
          }}
          onDetailChange={setSearchDetailOpen}
        />
      </div>

      <div id="panel-url" role="tabpanel" aria-labelledby="tab-url" hidden={mode !== "url"}>
      <div className="search-wrap">
        <form className="search-form" role="search" onSubmit={onSubmit}>
          <label className="sr-only" htmlFor="tt">
            TikTok video link
          </label>
          <span className="search-field">
            <span className="search-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.6-3.6" />
              </svg>
            </span>
            <input
              id="tt"
              ref={inputRef}
              className="search-input"
              type="url"
              name="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://vt.tiktok.com/xxx"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
            {value ? (
              <button
                type="button"
                className="clear-btn"
                aria-label="Clear link"
                onClick={() => {
                  setValue("");
                  inputRef.current?.focus();
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                className="clear-btn"
                aria-label={ui.buttons.paste}
                title={ui.buttons.paste}
                onClick={pasteFromClipboard}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="8" y="2" width="8" height="4" rx="1" />
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                </svg>
              </button>
            )}
          </span>
          <button className="btn-primary" type="submit" disabled={phase === "running"}>
            {phase === "running" ? ui.buttons.searching : ui.buttons.search}
          </button>
        </form>
        <div className="chips">
          {history.map((item) => (
            <button
              key={item}
              type="button"
              className="chip"
              title={item}
              disabled={phase === "running"}
              onClick={() => search(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {phase === "idle" ? (
        <section className="how" data-nosnippet>
          <h2 className="how-title">{ui.states.howTitle}</h2>
          <ol className="how-list">
            {ui.states.howSteps.map((step, index) => (
              <li key={step}>
                <span className="how-num" aria-hidden="true">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {phase === "running" ? (
        <div className="run" aria-live="polite">
          <BrandScan />
        </div>
      ) : null}

      {phase === "error" ? (
        <div className="state state-error" role="alert">
          <strong>Search stopped.</strong>
          {error}
        </div>
      ) : null}

      {phase === "done" && result ? <ResultView result={result} /> : null}

      {phase === "done" && result && (result.presetLinks?.length ?? 0) > 0 ? (
        <FoundToast count={result.presetLinks?.length ?? 0} />
      ) : null}
      </div>
    </>
  );
}
