"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { FindResult } from "@/lib/types";
import { ResultView } from "@/components/ResultView";

type Phase = "idle" | "running" | "done" | "error";

const HISTORY_KEY = "amfinder:history";

export function Finder() {
  const [value, setValue] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<FindResult | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const sourceRef = useRef<EventSource | null>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {
      setHistory([]);
    }
    return () => sourceRef.current?.close();
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

    const looksLikeTikTok = /tiktok\.com/i.test(target) || /^\d{15,}$/.test(target);
    if (!looksLikeTikTok) {
      sourceRef.current?.close();
      finishedRef.current = true;
      setPhase("error");
      setError("Linknya bukan dari TikTok. Tempel link video, biasanya berakhiran /video/1234567890.");
      return;
    }

    sourceRef.current?.close();
    finishedRef.current = false;
    remember(target);
    setValue(target);
    setPhase("running");
    setLogs([]);
    setResult(null);
    setError("");

    const source = new EventSource(`/api/find?url=${encodeURIComponent(target)}`);
    sourceRef.current = source;

    source.addEventListener("log", (event) => {
      if (finishedRef.current) return;
      try {
        const text = JSON.parse((event as MessageEvent).data);
        if (typeof text === "string") setLogs((prev) => [...prev, text]);
      } catch {
        /* baris rusak dilewati */
      }
    });

    source.addEventListener("result", (event) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      source.close();
      try {
        const data = JSON.parse((event as MessageEvent).data) as FindResult;
        if (data.ok === false) {
          setPhase("error");
          setError(data.error || "scraper tidak bisa memproses link ini");
          return;
        }
        setResult(data);
        setPhase("done");
      } catch {
        setPhase("error");
        setError("balasan server tidak terbaca");
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
          setError(JSON.parse(data).message || "proses gagal");
        } catch {
          setError("proses gagal");
        }
        return;
      }
      if (source.readyState === EventSource.CLOSED) {
        finishedRef.current = true;
        setPhase("error");
        setError("koneksi terputus sebelum selesai, coba lagi");
      }
    });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (phase === "running") return;
    search(value);
  }

  return (
    <>
      <div className="search-wrap">
        <form className="search-form" role="search" onSubmit={onSubmit}>
          <label className="sr-only" htmlFor="tt">
            Link video TikTok
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
              className="search-input"
              type="url"
              name="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://www.tiktok.com/@akun/video/1234567890"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </span>
          <button className="btn-primary" type="submit" disabled={phase === "running"}>
            {phase === "running" ? "Sedang mencari" : "Cari preset"}
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
        <div className="state">
          <strong>Belum ada pencarian.</strong>
          Link preset dicari di tempat yang memang bisa dibuka dari satu link video:
          <ul>
            <li>deskripsi video</li>
            <li>bio akun dan link yang terpasang di bio</li>
            <li>komentar, termasuk yang di-pin dan balasannya</li>
          </ul>
        </div>
      ) : null}

      {phase === "running" ? (
        <div className="run" aria-live="polite">
          <div className="run-head">
            <span className="spinner" aria-hidden="true" />
            Membuka link video dan mencari preset
          </div>
          <ul className="run-list">
            {logs.map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {phase === "error" ? (
        <div className="state state-error" role="alert">
          <strong>Pencarian berhenti.</strong>
          {error}
        </div>
      ) : null}

      {phase === "done" && result ? <ResultView result={result} /> : null}
    </>
  );
}
