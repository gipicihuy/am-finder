"use client";

import { isVideoLink, shortCodeOf, videoIdOf } from "@/lib/tiktok-link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { FindResult } from "@/lib/types";
import { useUi } from "@/components/LocaleProvider";
import { ResultView } from "@/components/ResultView";
import { FoundToast } from "@/components/FoundToast";
import { HowSteps } from "@/components/HowSteps";
import BrandScan from "./BrandScan";
import SearchTest from "./SearchTest";
import { SEARCH_STARTED_EVENT } from "@/lib/promo-events";
import { getSecurityToken, withSecurityToken } from "@/lib/anti-scrape-client";
import {
  HISTORY_CHIP_LIMIT,
  readHistoryEntries,
  rememberHistoryLink,
  rememberHistoryResult,
  type HistoryEntry,
} from "@/lib/history";

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

// Kolom link disimpan di sini supaya masih terisi waktu tombol Kembali dari
// alamat detail (/preset/...) atau waktu pindah tab — komponennya memang ikut
// di-unmount, jadi state React-nya hilang.
const DRAFT_KEY = "amfinder:draft";

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

export function Finder({
  initialMode,
  initialQuery,
  initialUrl,
}: {
  initialMode?: Mode;
  initialQuery?: string;
  /** Link video yang langsung ditempel ke kolom URL waktu komponen ke-mount. */
  initialUrl?: string;
} = {}) {
  const [value, setValue] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<FindResult | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const ui = useUi();
  const [mode, setMode] = useState<Mode>(initialMode ?? "url");
  const pathname = usePathname();
  const [searchDetailOpen, setSearchDetailOpen] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);
  const detailRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const finishedRef = useRef(false);
  const runRef = useRef(0);
  const batteryRef = useRef<Battery | null>(null);
  // Kata kunci terkini dari tab Cari Preset, dipakai buat menjaga ?q= di alamat.
  const searchQueryRef = useRef("");

  useEffect(() => {
    // App Android nyuntik objek `AndroidClipboard` ke halaman (buat tombol paste).
    // Deteksi itu jalan di SEMUA versi APK yang sudah beredar, jadi monitor bisa
    // membedakan "lewat aplikasi" tanpa perlu rilis aplikasi baru. Tandanya disimpan
    // di cookie, otomatis ikut di tiap permintaan berikutnya.
    try {
      if (typeof window !== "undefined" && "AndroidClipboard" in window) {
        document.cookie = "am_app=1; path=/; max-age=31536000; samesite=lax";
      }
    } catch {
      /* cookie bukan kebutuhan utama */
    }

    setHistory(readHistoryEntries().slice(0, HISTORY_CHIP_LIMIT));
    let cancelled = false;
    void readBattery().then(battery => {
      if (cancelled) return;
      batteryRef.current = battery;
      try {
        void fetch("/api/v1/event", {
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
    // Sumber kebenarannya localStorage, bukan state React. Efek mount di
    // halaman preset bisa memanggil search() di tick yang sama waktu riwayat
    // belum sempat masuk state — state-nya masih [], dan riwayat lama ikut
    // tertimpa kalau cuma mengandalkan state.
    setHistory(rememberHistoryLink(link).slice(0, HISTORY_CHIP_LIMIT));
  }

  async function search(link: string) {
    const target = link.trim();
    if (!target) return;

    const runId = ++runRef.current;
    const looksLikeVideo = isVideoLink(target);
    if (!looksLikeVideo) {
      sourceRef.current?.close();
      finishedRef.current = true;
      setPhase("error");
      setError(ui.finder.errNotVideo);
      return;
    }

    sourceRef.current?.close();
    finishedRef.current = false;
    remember(target);
    setValue(target);
    try {
      localStorage.setItem(DRAFT_KEY, target);
    } catch {
      /* draft bukan kebutuhan utama */
    }
    window.dispatchEvent(new Event(SEARCH_STARTED_EVENT));
    setPhase("running");
    setResult(null);
    setError("");

    let token: string;
    try {
      token = await getSecurityToken();
    } catch {
      if (runId !== runRef.current) return;
      setPhase("error");
      setError(ui.finder.errSecurity);
      return;
    }
    if (runId !== runRef.current) return;

    const battery = batteryRef.current;
    const batteryQuery = battery
      ? `&bat=${battery.level}&chg=${battery.charging ? 1 : 0}`
      : "";
    const source = new EventSource(
      withSecurityToken(`/api/find?url=${encodeURIComponent(target)}${batteryQuery}`, token)
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
          setError(data.error || ui.finder.errScraper);
          return;
        }
        setResult(data);
        setPhase("done");
        const detailPath = openDetailAddress(target, data);
        setHistory(
          rememberHistoryResult(target, data, detailPath).slice(0, HISTORY_CHIP_LIMIT),
        );
      } catch {
        setPhase("error");
        setError(ui.finder.errUnreadable);
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
          setError(JSON.parse(data).message || ui.finder.errGeneric);
        } catch {
          setError(ui.finder.errGeneric);
        }
        return;
      }
      if (source.readyState === EventSource.CLOSED) {
        finishedRef.current = true;
        setPhase("error");
        setError(ui.finder.errClosed);
      }
    });
  }

  useEffect(() => {
    try {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) setValue(draft);
    } catch {
      // storage diblokir — kolom link dibiarkan kosong
    }
  }, []);

  // /preset/<sumber>/<id> nempel Finder di sini supaya tampilannya sama persis
  // dengan beranda, cuma kolom linknya sudah terisi dan pengecekan langsung
  // jalan — jadi tautan yang dibagikan langsung menampilkan hasil.
  // Penanda amfDetail dipasang di awal; tanpa itu, efek pathname di bawah akan
  // menganggap kita baru keluar dari halaman detail lalu menghapus hasilnya.
  useEffect(() => {
    if (!initialUrl) return;
    detailRef.current = true;
    try {
      window.history.replaceState({ ...(window.history.state || {}), amfDetail: true }, "");
    } catch {
      /* history bisa diblokir — pencarian tetap jalan */
    }
    setValue(initialUrl);
    search(initialUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function chooseMode(next: Mode) {
    if (mode === next) return;
    setMode(next);
    // Alamat ikut tab (/ buat URL Video, /search buat Cari Preset). Pakai
    // pushState biasa, bukan router, supaya komponen tetap hidup dan panel yang
    // satunya nggak ke-reset. Next tetap sinkron sendiri lewat ACTION_RESTORE.
    // Kata kunci terakhir dibawa ke alamat supaya pindah tab bolak-balik tidak
    // menghilangkan ?q= dari tautan /search.
    const query = searchQueryRef.current.trim();
    const path =
      next === "search" ? (query ? `/search?q=${encodeURIComponent(query)}` : "/search") : "/";
    const current = window.location.pathname + window.location.search;
    if (current !== path) window.history.pushState({}, "", path);
  }

  // Keluar dari /preset/<sumber>/<id> lewat tombol Kembali/Maju: tutup panel
  // hasil. Kolom link sengaja dibiarkan — itu memang yang diminta.
  // Sengaja CUMA dipasang di listener popstate. Ganti tab (URL Video ↔ Cari
  // Preset) juga mendorong alamat baru, tapi itu bukan berarti keluar dari
  // halaman detail — orang sering bolak-balik sambil mau lihat hasil yang sama.
  const closeDetail = () => {
    if (!detailRef.current || window.history.state?.amfDetail) return;
    detailRef.current = false;
    setPhase("idle");
    setResult(null);
    setError("");
  };

  // Tab mengikuti alamat. Panel hasil sengaja tidak ditutup di sini — lihat
  // catatan di closeDetail.
  useEffect(() => {
    if (pathname === "/search") setMode("search");
    else if (pathname === "/") setMode("url");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    const onPop = closeDetail;
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Alamat berubah ke /preset/<sumber>/<id> begitu pengecekan selesai, jadi
  // satu video selalu punya satu alamat yang bisa dibagiin. Nggak dipanggil
  // lewat router — biar panel hasilnya tidak hilang.
  function openDetailAddress(target: string, data: FindResult): string | null {
    const short = shortCodeOf(target);
    const fromInput = videoIdOf(target);
    const source =
      fromInput?.source ??
      (/youtube|youtu\.be/i.test(data.videoUrl ?? "") ? "youtube" : "tiktok");
    const id = fromInput?.id ?? (typeof data.videoId === "string" ? data.videoId : null);
    if (!id) return null;
    // Link pendek (vt.tiktok.com/xxx) dipertahankan bentuk pendeknya di alamat —
    // jauh lebih enak dilihat daripada ID numerik panjang. Halaman preset memang
    // menerima kode pendek, jadi tautannya tetap bisa dibuka lagi.
    const next =
      short && source === "tiktok"
        ? `/preset/tiktok/${short}`
        : `/preset/${source}/${id}`;
    // Sudah berdiri di alamat yang benar (misalnya halaman preset yang ke-mount
    // dengan link ini): jangan tambah entri riwayat yang isinya sama.
    if (window.location.pathname === next) return next;
    try {
      localStorage.setItem(DRAFT_KEY, target);
    } catch {
      /* draft bukan kebutuhan utama */
    }
    window.history.pushState({ amfDetail: true }, "", next);
    detailRef.current = true;
    return next;
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (phase === "running") return;
    // Pencarian baru sambil masih berada di halaman detail: lepas penandanya
    // dulu supaya alamat bisa berganti ke video berikutnya. URL-nya sendiri
    // menyusul diganti openDetailAddress begitu hasilnya datang.
    detailRef.current = false;
    try {
      window.history.replaceState({}, "", window.location.pathname);
    } catch {
      /* history bisa diblokir — abaikan */
    }
    search(value);
  }

  function clearInput() {
    setValue("");
    // Draft ikut dihapus — kalau tidak, link yang sama balik lagi lewat efek
    // mount waktu halaman di-refresh.
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* draft bukan kebutuhan utama */
    }
    // Kosongkan kolom berarti selesai dengan video ini. Kalau sedang berdiri
    // di halaman preset, alamatnya langsung diganti ke beranda dan hasilnya
    // dibuang — tidak ada lagi yang dicari, jadi tidak ada gunanya tetap
    // menempel di /preset/<sumber>/<id>. Pakai replaceState supaya entri
    // halaman preset ikut terhapus dari riwayat, bukan menumpuk di belakang.
    if (window.location.pathname.startsWith("/preset/")) {
      detailRef.current = false;
      setPhase("idle");
      setResult(null);
      setError("");
      try {
        window.history.replaceState({}, "", "/");
      } catch {
        /* history bisa diblokir — abaikan */
      }
    }
    inputRef.current?.focus();
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
      <div className="mode-tabs" role="tablist" aria-label={ui.finder.tabsLabel}>
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
          {ui.finder.tabUrl}
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
          {ui.finder.tabSearch}
        </button>
      </div>

      {mode === "url" ? (
        <p className="page-sub" data-nosnippet>
          {ui.finder.subUrl}
        </p>
      ) : !searchDetailOpen ? (
        <p className="page-sub" data-nosnippet>
          {ui.finder.subSearch}
        </p>
      ) : null}

      <div id="panel-search" role="tabpanel" aria-labelledby="tab-search" hidden={mode !== "search"}>
        <SearchTest
          embedded
          initialQuery={initialQuery}
          onTikTokLink={(link) => {
            setValue(link);
            chooseMode("url");
          }}
          onDetailChange={setSearchDetailOpen}
          onQueryChange={(next) => {
            searchQueryRef.current = next;
          }}
        />
      </div>

      <div id="panel-url" role="tabpanel" aria-labelledby="tab-url" hidden={mode !== "url"}>
      <div className="search-wrap">
        <form className="search-form" role="search" onSubmit={onSubmit}>
          <label className="sr-only" htmlFor="tt">
            {ui.finder.linkLabel}
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
              placeholder={ui.finder.placeholder}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
            {value ? (
              <button
                type="button"
                className="clear-btn"
                aria-label={ui.finder.clearLink}
                onClick={clearInput}
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
              key={item.url}
              type="button"
              className="chip"
              title={item.url}
              disabled={phase === "running"}
              onClick={() => search(item.url)}
            >
              {item.url}
            </button>
          ))}
        </div>
      </div>

      {phase === "idle" ? (
        <HowSteps title={ui.states.howTitle} steps={ui.states.howSteps} />
      ) : null}

      {phase === "running" ? (
        <div className="run" aria-live="polite">
          <BrandScan />
        </div>
      ) : null}

      {phase === "error" ? (
        <div className="state state-error" role="alert">
          <strong>{ui.finder.searchStopped}</strong>
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
