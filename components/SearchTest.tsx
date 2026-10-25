"use client";

import { isVideoLink, presetPathOf } from "@/lib/tiktok-link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { FindResult } from "@/lib/types";
import { ResultView } from "@/components/ResultView";
import BrandScan from "./BrandScan";
import { FoundToast } from "@/components/FoundToast";
import { ArrowRuleOrnament, GridIcon } from "@/components/Ornament";

const VIEW_KEY = "amfinder:view";
const STATE_KEY = "amfinder:search-state";
const STATE_TTL = 30 * 60 * 1000; // hasil pencarian yang disimpan kedaluwarsa setelah 30 menit
import { useUi } from "@/components/LocaleProvider";
import { format } from "@/lib/i18n";
import { HowSteps } from "@/components/HowSteps";
import { getSecurityToken, withSecurityToken } from "@/lib/anti-scrape-client";
import { rememberHistoryLink, rememberHistoryResult } from "@/lib/history";

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

/** Nama unik per kartu supaya browser bisa memorph posisinya saat ganti list/grid. */
function vtName(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) | 0;
  return `cand-${(h >>> 0).toString(36)}`;
}

/** Thumbnail dimorph terpisah supaya gambarnya ikut meluncur, bukan cuma cross-fade. */
function thumbName(url: string): string {
  return `${vtName(url)}-t`;
}

type SearchTestProps = {
  /** Dipakai di dalam Home (tab Cari Preset): tanpa judul/padding sendiri. */
  embedded?: boolean;
  /** Dipanggil kalau user menempel link TikTok di kolom judul. */
  onTikTokLink?: (url: string) => void;
  /** Dipanggil saat halaman detail video dibuka/ditutup. */
  onDetailChange?: (open: boolean) => void;
  /** Kata kunci dari alamat /search?q=... — dipakai buat auto-cari waktu dibuka langsung. */
  initialQuery?: string;
  /** Dipanggil tiap kata kunci berubah, supaya induk bisa menuliskannya di alamat. */
  onQueryChange?: (query: string) => void;
};

export default function SearchTest({
  embedded = false,
  onTikTokLink,
  onDetailChange,
  initialQuery = "",
  onQueryChange,
}: SearchTestProps = {}) {
  const ui = useUi();
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [suggests, setSuggests] = useState<string[]>([]);
  const [sugOpen, setSugOpen] = useState(false);
  const [sugActive, setSugActive] = useState(-1);
  const sugAbort = useRef<AbortController | null>(null);
  const sugSuppressRef = useRef("");
  const sugFocusedRef = useRef(false);
  const sugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sugBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [indexReady, setIndexReady] = useState(false);
  const sugIndex = useRef<Array<{ s: string; w: number }> | null>(null);
  const sugIndexLoading = useRef<Promise<void> | null>(null);
  const [cands, setCands] = useState<Candidate[]>([]);
  const [candLimit, setCandLimit] = useState(3);
  const [view, setView] = useState<"list" | "grid">("list");
  const [lastUrl, setLastUrl] = useState("");
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const deckRef = useRef<HTMLDivElement | null>(null);
  const prevOpen = useRef("");
  const openUrlRef = useRef("");
  const listYRef = useRef(0);
  const doCloseRef = useRef<() => void>(() => {});
  const snapRef = useRef({ q: "", query: "", cands: [] as Candidate[], limit: 3, last: "" });
  const [searchedQuery, setSearchedQuery] = useState("");
  const [openUrl, setOpenUrl] = useState("");
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const searchRef = useRef<EventSource | null>(null);
  const checkRef = useRef<EventSource | null>(null);
  const searchRunRef = useRef(0);
  const checkRunRef = useRef(0);

  useEffect(() => {
    return () => {
      searchRef.current?.close();
      checkRef.current?.close();
    };
  }, []);

  useEffect(() => {
    openUrlRef.current = openUrl;
  }, [openUrl]);

  const queryRef = useRef(q);
  queryRef.current = q;

  function loadSuggestIndex(): Promise<void> {
    if (sugIndex.current) return Promise.resolve();
    if (sugIndexLoading.current) return sugIndexLoading.current;
    sugIndexLoading.current = fetch("/suggest.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Array<{ s?: string; w?: number }> | null) => {
        if (!Array.isArray(data)) return;
        sugIndex.current = data
          .filter((item) => item && typeof item.s === "string")
          .map((item) => ({ s: item.s as string, w: Math.max(1, Number(item.w) || 1) }));
        setIndexReady(true);
      })
      .catch(() => {
        /* fallback ke /api/suggest */
      })
      .finally(() => {
        sugIndexLoading.current = null;
      });
    return sugIndexLoading.current;
  }

  function localSuggest(query: string, limit = 8): string[] {
    const index = sugIndex.current;
    if (!index) return [];
    const needle = query.toLowerCase();
    const scored: Array<{ s: string; score: number; w: number }> = [];
    for (const entry of index) {
      const at = entry.s.indexOf(needle);
      if (at < 0) continue;
      const starts = at === 0;
      const exact = starts && entry.s.length === needle.length;
      const spaced = starts && entry.s[needle.length] === " ";
      const boundary = starts || entry.s[at - 1] === " ";
      scored.push({
        s: entry.s,
        score: exact ? 0 : spaced ? 1 : starts ? 2 : boundary ? 3 : 4,
        w: entry.w,
      });
    }
    scored.sort(
      (a, b) =>
        a.score - b.score ||
        b.w - a.w ||
        a.s.length - b.s.length ||
        a.s.localeCompare(b.s),
    );
    return scored.slice(0, limit).map((item) => item.s);
  }

  // Saran pencarian: index statis (/suggest.json) difilter langsung di browser,
  // jadi tidak ada round-trip waktu mengetik. /api/suggest tetap dipanggil di
  // latar belakang buat menambah query baru yang belum masuk index.
  useEffect(() => {
    const query = q.trim();
    // Jangan buka saran lagi untuk kata kunci yang baru saja dicari — panelnya
    // bakal nutupin hasil. User harus mengetik lagi untuk memunculkan saran.
    if (openUrl || query.length < 2 || query === sugSuppressRef.current) {
      setSuggests([]);
      setSugOpen(false);
      setSugActive(-1);
      return;
    }

    void loadSuggestIndex();
    const local = localSuggest(query);
    if (local.length) {
      setSuggests(local);
      setSugOpen(sugFocusedRef.current);
      setSugActive(-1);
    } else {
      setSuggests([]);
      setSugOpen(false);
      setSugActive(-1);
    }

    if (sugTimer.current) clearTimeout(sugTimer.current);
    sugTimer.current = setTimeout(
      () => {
        const controller = new AbortController();
        sugAbort.current = controller;
        fetch(`/api/suggest?q=${encodeURIComponent(query)}`, { signal: controller.signal })
          .then((res) => (res.ok ? res.json() : null))
          .then((data: { items?: string[] } | null) => {
            if (!data?.items?.length) return;
            // Respons lama boleh selesai, tapi jangan menimpa query terkini.
            if (queryRef.current.trim() !== query) return;
            const merged = [...localSuggest(query)];
            for (const item of data.items) {
              if (!merged.includes(item)) merged.push(item);
            }
            setSuggests(merged.slice(0, 8));
            setSugOpen(merged.length > 0 && sugFocusedRef.current);
            setSugActive(-1);
          })
          .catch(() => {
            /* autocomplete gagal bukan masalah besar — biarkan kosong */
          });
      },
      query.length <= 2 ? 0 : 60,
    );

    return () => {
      if (sugTimer.current) clearTimeout(sugTimer.current);
    };
  }, [q, openUrl, indexReady]);

  // Panaskan index sekali setelah halaman tenang, biar ketikan pertama instan.
  useEffect(() => {
    const timer = setTimeout(() => void loadSuggestIndex(), 1200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => () => sugAbort.current?.abort(), []);

  function onSuggestFocus() {
    sugFocusedRef.current = true;
    const query = q.trim();
    if (openUrl || query.length < 2 || query === sugSuppressRef.current) return;
    if (sugBlurTimer.current) clearTimeout(sugBlurTimer.current);
    void loadSuggestIndex();
    const local = localSuggest(query);
    const items = local.length ? local : suggests;
    if (items.length) {
      setSuggests(items);
      setSugOpen(true);
      setSugActive(-1);
    }
  }

  function onSuggestBlur() {
    sugFocusedRef.current = false;
    if (sugBlurTimer.current) clearTimeout(sugBlurTimer.current);
    sugBlurTimer.current = setTimeout(() => setSugOpen(false), 80);
  }

  // Beritahu induk (Finder) kata kunci terkini supaya saat pindah tab, alamat
  // /search?q=... tidak kehilangan kata kuncinya.
  const onQueryChangeRef = useRef(onQueryChange);
  useEffect(() => {
    onQueryChangeRef.current = onQueryChange;
  });
  useEffect(() => {
    onQueryChangeRef.current?.(q);
  }, [q]);

  function persistState() {
    const snap = snapRef.current;
    if (!snap.cands.length) return;
    try {
      sessionStorage.setItem(
        STATE_KEY,
        JSON.stringify({ t: Date.now(), ...snap, y: openUrlRef.current ? listYRef.current : window.scrollY }),
      );
    } catch {
      // storage penuh / diblokir — abaikan
    }
  }

  // Simpan keadaan pencarian ke sessionStorage supaya selamat dari reload
  // (browser HP sering membuang tab di latar belakang).
  useEffect(() => {
    snapRef.current = { q, query: searchedQuery, cands, limit: candLimit, last: lastUrl };
    persistState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, searchedQuery, cands, candLimit, lastUrl]);

  useEffect(() => {
    const save = () => persistState();
    const onHide = () => {
      if (document.visibilityState === "hidden") persistState();
    };
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", onHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "grid") setView("grid");
    } catch {
      // storage diblokir — tetap tampilan daftar
    }
  }, []);

  // Pulihkan hasil pencarian terakhir (maks 30 menit) lalu gulir ke tempatnya.
  // Kalau tidak ada yang tersimpan, jalankan kata kunci dari alamat — itulah yang
  // bikin link /search?q=... yang dibagiin nunjukkin hasil yang sama.
  useEffect(() => {
    let restored = false;
    try {
      const raw = sessionStorage.getItem(STATE_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      if (
        saved &&
        Date.now() - saved.t <= STATE_TTL &&
        Array.isArray(saved.cands) &&
        saved.cands.length
      ) {
        restored = true;
      } else if (raw) {
        sessionStorage.removeItem(STATE_KEY);
      }
      if (!restored) {
        const query = initialQuery.trim();
        if (query.length >= 3) {
          setQ(query);
          search(query);
        }
        return;
      }
      setCands(saved.cands);
      sugSuppressRef.current = (saved.q || "").trim();
      setQ(saved.q || "");
      setSearchedQuery(saved.query || "");
      setCandLimit(saved.limit || 3);
      setLastUrl(saved.last || "");
      const last: string = saved.last || "";
      const y: number = saved.y || 0;
      let tries = 0;
      const tick = () => {
        if (last) {
          const el = cardRefs.current[last];
          if (el && el.offsetParent !== null) {
            el.scrollIntoView({ block: "center" });
            return;
          }
        } else {
          const section = document.querySelector<HTMLElement>('section[data-results="search"]');
          if (section && section.offsetParent !== null) {
            window.scrollTo({ top: y });
            return;
          }
        }
        // tunggu daftar tampil & panel tab terlihat (maks ~1,5 detik)
        if (++tries < 90) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch {
      // data rusak — abaikan
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detail video = entri riwayat dengan alamat /preset/tiktok/<id>, jadi bisa
  // dibagiin. Swipe/tombol back bawaan HP tetap menutup detail dan kembali ke
  // daftar, bukan keluar dari halaman — Next kembali lewat tree yang tersimpan.
  useEffect(() => {
    const onPop = () => {
      if (!window.history.state?.amfDetail && openUrlRef.current) doCloseRef.current();
    };
    window.addEventListener("popstate", onPop);
    if (window.history.state?.amfDetail) {
      // sisa penanda detail setelah reload: detailnya sudah nggak ada, bersihkan
      window.history.replaceState({}, "");
    }
    return () => window.removeEventListener("popstate", onPop);
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

  function toggleView() {
    const next = view === "grid" ? "list" : "grid";
    const apply = () => {
      setView(next);
      // grid tampil per 4 kartu: bulatkan jumlah yang sedang tampil ke atas
      if (next === "grid") setCandLimit((limit) => Math.ceil(limit / 4) * 4);
    };
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // abaikan
    }

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { finished: Promise<void> };
    };

    if (!reduce && typeof doc.startViewTransition === "function") {
      // morph halus list <-> grid lewat View Transitions API
      doc.startViewTransition(apply);
      return;
    }

    apply();
    // fallback buat browser tanpa View Transitions API
    if (!reduce) {
      deckRef.current?.animate(
        [
          { opacity: 0, transform: "translateY(6px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 240, easing: "ease-out" }
      );
    }
  }

  function changeQuery(value: string) {
    sugSuppressRef.current = "";
    if (embedded && isVideoLink(value)) {
      onTikTokLink?.(value.trim());
      setQ("");
      return;
    }
    setQ(value);
  }

  // Tombol X mengosongkan kolom SEKALIGUS membuang hasil pencarian lama.
  // Tanpa ini, "bekas" hasil tetap tampil dan ikut dipulihkan dari sessionStorage
  // setiap kali halaman dibuka ulang / pindah tab.
  function clearSearch() {
    searchRef.current?.close();
    searchRef.current = null;
    setSearching(false);
    setError("");
    setQ("");
    setCands([]);
    setSearchedQuery("");
    setLastUrl("");
    setCandLimit(3);
    setDetails({});
    snapRef.current = { q: "", query: "", cands: [], limit: 3, last: "" };
    try {
      sessionStorage.removeItem(STATE_KEY);
    } catch {
      // storage diblokir — abaikan
    }
    // Buang ?q= dari alamat supaya refresh tidak menjalankan ulang pencarian lama.
    if (window.location.pathname === "/search" && window.location.search) {
      try {
        window.history.replaceState(window.history.state, "", "/search");
      } catch {
        // history bisa diblokir — abaikan
      }
    }
  }

  function pickSuggestion(value: string) {
    sugSuppressRef.current = value;
    setSugOpen(false);
    setSugActive(-1);
    setSuggests([]);
    setQ(value);
    search(value);
  }

  function onSuggestKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!sugOpen || !suggests.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSugActive((prev) => (prev + 1) % suggests.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSugActive((prev) => (prev <= 0 ? suggests.length - 1 : prev - 1));
    } else if (event.key === "Enter" && sugActive >= 0) {
      event.preventDefault();
      pickSuggestion(suggests[sugActive]);
    } else if (event.key === "Escape") {
      setSugOpen(false);
      setSugActive(-1);
    }
  }

  async function search(override?: string) {
    const query = (override ?? q).trim();
    if (query.length < 3 || searching) return;
    const runId = ++searchRunRef.current;
    sugSuppressRef.current = query;
    setSugOpen(false);
    setSugActive(-1);
    searchRef.current?.close();
    checkRef.current?.close();
    checkRunRef.current += 1;
    setSearching(true);
    setError("");
    setOpenUrl("");

    let token: string;
    try {
      token = await getSecurityToken();
    } catch {
      if (runId !== searchRunRef.current) return;
      setSearching(false);
      setError(ui.finder.errSecurity);
      return;
    }
    if (runId !== searchRunRef.current) return;

    const source = new EventSource(
      withSecurityToken(`/api/search?mode=pick&q=${encodeURIComponent(query)}`, token),
    );
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
        setError(ui.search.errNoVideos);
        return;
      }
      setCands(items);
      setLastUrl("");
      const limit = view === "grid" ? 4 : 3;
      setCandLimit(limit);
      setSearchedQuery(query);
      setDetails({});
      // Hasil ditulis dulu ke sessionStorage, baru alamatnya diganti — kalau
      // urutannya kebalik, tampilan bisa ke-reset duluan waktu /search dirender ulang.
      snapRef.current = { q: query, query, cands: items, limit, last: "" };
      try {
        sessionStorage.setItem(
          STATE_KEY,
          JSON.stringify({ t: Date.now(), q: query, query, cands: items, limit, last: "", y: 0 }),
        );
      } catch {
        // storage penuh / diblokir — abaikan
      }
      // Alamat ikut kata kunci: /search?q=... Supaya panel dan posisi scroll tidak
      // ikut ter-reset, pakai replaceState — Next cuma sinkron useSearchParams-nya.
      const nextPath = "/search";
      const nextSearch = `?q=${encodeURIComponent(query)}`;
      if (window.location.pathname !== nextPath || window.location.search !== nextSearch) {
        window.history.replaceState(window.history.state, "", nextPath + nextSearch);
      }
    });

    source.addEventListener("error", (event) => {
      if (searchRef.current !== source) return;
      const data = (event as MessageEvent).data;
      if (typeof data === "string" && data) {
        try {
          fail(JSON.parse(data).message || ui.search.errGeneric);
        } catch {
          fail(ui.search.errGeneric);
        }
        return;
      }
      if (source.readyState === EventSource.CLOSED) fail(ui.search.errConnection);
    });
  }

  // Balik dari detail: gulir ke kartu video yang terakhir dibuka (bukan ke atas).
  useEffect(() => {
    if (prevOpen.current !== "" && openUrl === "" && lastUrl) {
      const target = cardRefs.current[lastUrl];
      // tunggu layout settle (paragraf di atas muncul lagi) sebelum menggulir
      requestAnimationFrame(() =>
        requestAnimationFrame(() => target?.scrollIntoView({ block: "center" })),
      );
    }
    prevOpen.current = openUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openUrl]);

  async function openVideo(url: string) {
    listYRef.current = window.scrollY;
    setLastUrl(url);
    setOpenUrl(url);
    rememberHistoryLink(url);
    // Alamat detail yang bisa dibagiin (/preset/tiktok/<id>). ID-nya diambil dari
    // URL kandidat yang memang selalu berbentuk tiktok.com/@user/video/<id>, jadi
    // tidak perlu nunggu pengecekan selesai. Kalau ID-nya tidak terbaca, alamat
    // dibiarkan seperti semula supaya tombol Kembali tetap bekerja.
    const detailPath = presetPathOf(url);
    if (!window.history.state?.amfDetail) {
      window.history.pushState({ amfDetail: true }, "", detailPath ?? "");
    }
    window.scrollTo({ top: 0 });
    if (details[url]?.state === "done") {
      const cached = details[url].result;
      if (cached) rememberHistoryResult(url, cached, detailPath);
      return;
    }

    checkRef.current?.close();
    const runId = ++checkRunRef.current;
    setDetails((prev) => ({ ...prev, [url]: { state: "running" } }));

    let token: string;
    try {
      token = await getSecurityToken();
    } catch {
      if (runId === checkRunRef.current) {
        setDetails((prev) => ({ ...prev, [url]: { state: "error", message: ui.search.errSecurityShort } }));
      }
      return;
    }
    if (runId !== checkRunRef.current) return;

    const source = new EventSource(
      withSecurityToken(`/api/find?url=${encodeURIComponent(url)}`, token),
    );
    checkRef.current = source;

    const finish = (next: Detail) => {
      source.close();
      if (checkRef.current === source) checkRef.current = null;
      setDetails((prev) => ({ ...prev, [url]: next }));
    };

    source.addEventListener("result", (event) => {
      try {
        const res = JSON.parse((event as MessageEvent).data) as FindResult;
        finish({ state: "done", result: res });
        rememberHistoryResult(url, res, detailPath);
      } catch {
        finish({ state: "error", message: ui.search.errUnreadable });
      }
    });

    source.addEventListener("error", (event) => {
      const data = (event as MessageEvent).data;
      if (typeof data === "string" && data) {
        let msg: string = ui.search.errWrong;
        try {
          msg = JSON.parse(data).message || msg;
        } catch {
          /* pakai pesan default */
        }
        finish({ state: "error", message: msg });
        return;
      }
      if (source.readyState === EventSource.CLOSED) finish({ state: "error", message: ui.search.errLost });
    });
  }

  function closeVideo() {
    // tombol Kembali: mundur satu entri riwayat (popstate yang menutup detail)
    if (window.history.state?.amfDetail) {
      window.history.back();
      return;
    }
    doClose();
  }

  function doClose() {
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
  doCloseRef.current = doClose;

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
  const suggestQuery = q.trim();
  const suggestPanel =
    sugOpen && suggests.length > 0 ? (
      <div className="suggest-panel" role="listbox" aria-label={ui.search.suggestionsLabel}>
        {suggests.map((item, index) => {
          const at = item.toLowerCase().indexOf(suggestQuery.toLowerCase());
          const label =
            at < 0 ? (
              item
            ) : (
              <>
                {item.slice(0, at)}
                <b>{item.slice(at, at + suggestQuery.length)}</b>
                {item.slice(at + suggestQuery.length)}
              </>
            );
          return (
            <button
              key={item}
              type="button"
              role="option"
              aria-selected={index === sugActive}
              className="suggest-item"
              data-active={index === sugActive}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pickSuggestion(item)}
            >
              {/* satu span: kalau teks + <b> jadi item flex terpisah, spasi di tepinya hilang */}
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    ) : null;

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
          <h1 style={{ fontSize: 30, lineHeight: 1.1, margin: "0 0 10px" }}>{ui.search.title}</h1>
          <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.5, margin: "0 0 22px" }}>
            {ui.search.intro}
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
                  placeholder={ui.search.placeholder}
                  aria-label={ui.search.keywordLabel}
                  value={q}
                  onChange={(e) => changeQuery(e.target.value)}
                  onKeyDown={onSuggestKeyDown}
                  onFocus={onSuggestFocus}
                  onBlur={onSuggestBlur}
                />
                {q ? (
                  <button type="button" className="clear-btn" aria-label={ui.search.clear} onClick={clearSearch}>
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
            {suggestPanel}
          </div>
          ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <div style={{ position: "relative", marginBottom: 12 }}>
              <input
                value={q}
                onChange={(e) => changeQuery(e.target.value)}
                onKeyDown={onSuggestKeyDown}
                onFocus={onSuggestFocus}
                onBlur={onSuggestBlur}
                placeholder={ui.search.placeholder}
                aria-label={ui.search.keywordLabel}
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
                }}
              />
              {suggestPanel}
            </div>
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
              {searching ? `${ui.buttons.searching}…` : ui.buttons.search}
            </button>
          </form>
          )}
          {error && (
            <div role="alert" style={{ color: DANGER, fontSize: 14, marginTop: 14 }}>
              {error}
            </div>
          )}

          {embedded && !searching && !error && !searchedQuery && cands.length === 0 && (
            <HowSteps title={ui.states.howTitle} steps={ui.states.searchHowSteps} />
          )}

          {embedded && searching && (
            <div className="run" aria-live="polite">
              <BrandScan title={ui.scan.videos} />
            </div>
          )}

          {cands.length > 0 && !(embedded && searching) && (
            <section aria-label={ui.search.resultsLabel} data-results="search" style={{ marginTop: 26, opacity: searching ? 0.5 : 1 }}>
              <div className="result-head">
                <h2 className="result-count">
                  <span className="result-count-ornament" aria-hidden="true">
                    <ArrowRuleOrnament />
                  </span>
                  {cands.length} video
                </h2>
                <button
                  type="button"
                  className="view-toggle"
                  aria-label={ui.search.gridView}
                  aria-pressed={view === "grid"}
                  onClick={toggleView}
                >
                  <GridIcon />
                </button>
              </div>
              <div
                ref={deckRef}
                className="cand-deck"
                style={view === "grid" ? { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginBottom: 10 } : undefined}
              >
              {cands.slice(0, candLimit).map((c) => view === "grid" ? (
                <button
                  key={c.url}
                  ref={(el) => {
                    cardRefs.current[c.url] = el;
                  }}
                  type="button"
                  aria-label={format(ui.search.checkFrom, { name: c.handle || ui.search.thisVideo })}
                  onClick={() => openVideo(c.url)}
                  style={{
                    viewTransitionName: vtName(c.url),
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    minWidth: 0,
                    textAlign: "left",
                    padding: 8,
                    background: SURFACE,
                    border: `1px solid ${c.url === lastUrl ? ACCENT : BORDER}`,
                    borderRadius: 14,
                    color: "inherit",
                    font: "inherit",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      viewTransitionName: thumbName(c.url),
                      position: "relative",
                      width: "100%",
                      aspectRatio: "9 / 16",
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
                  <span style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.handle || ui.search.videoFallback}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: MUTED,
                      lineHeight: 1.4,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {c.snippet || ui.search.noCaption}
                  </span>
                </button>
              ) : (
                <button
                  key={c.url}
                  ref={(el) => {
                    cardRefs.current[c.url] = el;
                  }}
                  type="button"
                  aria-label={format(ui.search.checkFrom, { name: c.handle || ui.search.thisVideo })}
                  onClick={() => openVideo(c.url)}
                  style={{
                    viewTransitionName: vtName(c.url),
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    textAlign: "left",
                    padding: 12,
                    marginBottom: 10,
                    background: SURFACE,
                    border: `1px solid ${c.url === lastUrl ? ACCENT : BORDER}`,
                    borderRadius: 16,
                    color: "inherit",
                    font: "inherit",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      viewTransitionName: thumbName(c.url),
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
                      {c.handle || ui.search.videoFallback}
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
                      {c.snippet || ui.search.noCaption}
                    </span>
                  </span>
                  <ChevronRight />
                </button>
              ))}
              </div>
              {cands.length > candLimit && (
                <button
                  type="button"
                  onClick={() => setCandLimit((limit) => limit + (view === "grid" ? 4 : 3))}
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
                  {ui.search.showMore}
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
            aria-label={ui.search.backLabel}
            style={{ ...linkBtn, display: "flex", alignItems: "center", gap: 2, marginLeft: -4 }}
            onClick={closeVideo}
          >
            <ChevronLeft />
            {ui.search.back}
          </button>
          {candidate && searchedQuery && (
            <div style={{ fontSize: 15, fontWeight: 700 }}>{ui.search.titleLabel} {searchedQuery}</div>
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
              {current.message || ui.search.errWrong}
            </div>
          )}
          {current?.state === "done" && current.result && <ResultView result={current.result} />}
          {current?.state === "done" && (current.result?.presetLinks?.length ?? 0) > 0 ? (
            <FoundToast count={current.result?.presetLinks?.length ?? 0} />
          ) : null}
        </>
      )}
    </div>
  );
}
