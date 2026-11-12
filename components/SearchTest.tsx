"use client";

import { isVideoLink, presetPathOf } from "@/lib/tiktok-link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { FindResult } from "@/lib/types";
import { ResultView } from "@/components/ResultView";
import BrandScan from "./BrandScan";
import { FoundToast } from "@/components/FoundToast";
import { NoticeModal } from "@/components/NoticeModal";
import { ArrowRuleOrnament, GridIcon, ListIcon } from "@/components/Ornament";

const VIEW_KEY = "amfinder:view";
const STATE_KEY = "amfinder:search-state";
const STATE_TTL = 30 * 60 * 1000; // hasil pencarian yang disimpan kedaluwarsa setelah 30 menit
import { useUi } from "@/components/LocaleProvider";
import { format } from "@/lib/i18n";
import { HowSteps } from "@/components/HowSteps";
import { getSecurityToken, withSecurityToken } from "@/lib/anti-scrape-client";
import { rememberHistoryLink, rememberHistoryResult } from "@/lib/history";

const BG = "var(--background)";
const SURFACE = "var(--surface)";
const BORDER = "var(--border)";
const FG = "var(--foreground)";
const MUTED = "var(--muted)";
const ACCENT = "var(--accent)";
const DANGER = "#FF6B6B";

type Candidate = {
  url: string;
  handle?: string;
  kind?: string;
  snippet?: string;
  thumb?: string;
  thumbFallback?: string;
  avatar?: string;
  playUrl?: string;
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
    stroke="currentColor"
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

function PlayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6.5v11l8-5.5z" />
    </svg>
  );
}

function SpeakerMutedIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

// Foto profil kreator. Menggunakan server proxy (/api/avatar) untuk mencegah
// blokir hotlink / CORS dan URL bertanda tangan yang cepat kedaluwarsa.
// Kalau tidak ada atau gagal dimuat, tampilkan huruf awal username sebagai fallback.
function CandAvatar({ src, handle }: { src?: string; handle: string }) {
  const [imgSrc, setImgSrc] = useState<string>("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!src) {
      setImgSrc("");
      setFailed(false);
      return;
    }
    const proxied =
      src.startsWith("/") || src.startsWith("data:")
        ? src
        : `/api/avatar?u=${encodeURIComponent(src)}`;
    setImgSrc(proxied);
    setFailed(false);
  }, [src]);

  const handleError = () => {
    if (src && imgSrc !== src && !src.startsWith("/")) {
      // Coba fallback ke URL asli langsung jika proxy terkendala
      setImgSrc(src);
    } else {
      setFailed(true);
    }
  };

  const initial = handle.replace(/^@/, "").charAt(0).toUpperCase() || "?";

  return (
    <span className="cand-avatar" aria-hidden="true">
      {imgSrc && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imgSrc}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={handleError}
        />
      ) : (
        initial
      )}
    </span>
  );
}

function CandThumb({
  url,
  thumb,
  fallback,
  isGrid,
  playUrl,
  isActive,
  isPlaying,
  isMuted,
  userMutedChoice,
  onToggleMute,
  onPlaying,
  onEnded,
  onError,
  onVolumeChange,
  videoRef,
  unmuteLabel,
  muteLabel,
}: {
  url: string;
  thumb?: string;
  fallback?: string;
  isGrid?: boolean;
  playUrl?: string;
  isActive?: boolean;
  isPlaying?: boolean;
  isMuted?: boolean;
  userMutedChoice?: boolean | null;
  onToggleMute?: () => void;
  onPlaying?: () => void;
  onEnded?: () => void;
  onError?: () => void;
  onVolumeChange?: (muted: boolean) => void;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  unmuteLabel?: string;
  muteLabel?: string;
}) {
  const [src, setSrc] = useState(thumb || fallback || "");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSrc(thumb || fallback || "");
    setFailed(false);
  }, [thumb, fallback]);

  const handleError = () => {
    if (fallback && src !== fallback) {
      setSrc(fallback);
    } else {
      setFailed(true);
    }
  };

  return (
    <span className={isGrid ? "cand-thumb is-grid" : "cand-thumb"} style={{ viewTransitionName: thumbName(url) }}>
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={handleError}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: MUTED,
          }}
          aria-hidden="true"
        >
          <PlayIcon />
        </span>
      )}
      {isActive && isGrid && playUrl ? (
        <video
          ref={videoRef}
          src={playUrl}
          playsInline
          autoPlay
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            const shouldMute = userMutedChoice === true;
            v.muted = shouldMute;
            v.play().catch(() => {
              if (!shouldMute) {
                v.muted = true;
                v.play().catch(() => {});
              }
            });
          }}
          onVolumeChange={(e) => {
            onVolumeChange?.(e.currentTarget.muted);
          }}
          onPlaying={onPlaying}
          onEnded={onEnded}
          onError={onError}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: isPlaying ? 1 : 0,
            transition: "opacity 0.15s ease",
            zIndex: 1,
            pointerEvents: "none",
          }}
        />
      ) : null}
      {isActive && isGrid && isPlaying ? (
        <span
          role="button"
          tabIndex={0}
          aria-label={isMuted ? unmuteLabel : muteLabel}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleMute?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onToggleMute?.();
            }
          }}
          style={{
            position: "absolute",
            right: 8,
            bottom: 8,
            zIndex: 3,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: "50%",
            backgroundColor: "rgba(0, 0, 0, 0.65)",
            color: "#ffffff",
            cursor: "pointer",
          }}
        >
          {isMuted ? <SpeakerMutedIcon /> : <SpeakerIcon />}
        </span>
      ) : null}
    </span>
  );
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

function isUrlExpired(url?: string): boolean {
  if (!url) return false;
  const m = url.match(/[?&]x-expires=(\d+)/);
  if (!m) return false;
  return Number(m[1]) * 1000 <= Date.now() + 60_000;
}

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
  const [missNotice, setMissNotice] = useState<{ title: string; text: string } | null>(null);
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

  const [activePlayUrl, setActivePlayUrl] = useState<string>("");
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const activePlayUrlRef = useRef("");
  const isVideoPlayingRef = useRef(false);
  const isMutedRef = useRef(false);
  const userMutedChoiceRef = useRef<boolean | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const failedUrlsRef = useRef<Set<string>>(new Set());
  const viewRef = useRef<"list" | "grid">(view);
  const candsRef = useRef<Candidate[]>(cands);
  const candLimitRef = useRef(candLimit);
  const missNoticeRef = useRef(missNotice);
  const detailsRef = useRef(details);

  useEffect(() => {
    activePlayUrlRef.current = activePlayUrl;
  }, [activePlayUrl]);

  useEffect(() => {
    isVideoPlayingRef.current = isVideoPlaying;
  }, [isVideoPlaying]);

  useEffect(() => {
    isMutedRef.current = isMuted;
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    candsRef.current = cands;
  }, [cands]);

  useEffect(() => {
    candLimitRef.current = candLimit;
  }, [candLimit]);

  useEffect(() => {
    missNoticeRef.current = missNotice;
  }, [missNotice]);

  useEffect(() => {
    detailsRef.current = details;
  }, [details]);

  const canAutoPlay = () => {
    if (typeof window === "undefined") return false;
    if (viewRef.current !== "grid") return false;
    if (openUrlRef.current) return false;
    if (missNoticeRef.current !== null) return false;
    if (document.hidden) return false;
    const panel = document.getElementById("panel-search");
    if (panel && panel.hidden) return false;
    if (deckRef.current && deckRef.current.closest("[hidden]")) return false;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    if (Boolean(nav.connection?.saveData)) return false;
    return true;
  };

  const isCardInZone = (url: string): boolean => {
    if (!url) return false;
    const c = candsRef.current.find((item) => item.url === url);
    if (!c || !c.playUrl || isUrlExpired(c.playUrl)) return false;
    if (missTag(url)) return false;
    if (failedUrlsRef.current.has(url)) return false;

    const el = cardRefs.current[url];
    if (!el || el.offsetParent === null) return false;

    const rect = el.getBoundingClientRect();
    if (rect.height <= 0 || rect.width <= 0) return false;

    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (vh <= 0) return false;

    const visibleTop = Math.max(0, rect.top);
    const visibleBottom = Math.min(vh, rect.bottom);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    if (visibleHeight / rect.height < 0.75) return false;

    const midY = rect.top + rect.height / 2;
    if (midY < 0.15 * vh || midY > 0.65 * vh) return false;

    return true;
  };

  type QualifyingCard = {
    url: string;
    rect: DOMRect;
    midY: number;
  };

  const getQualifyingCardsInZone = (): QualifyingCard[] => {
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (vh <= 0) return [];

    const displayed = candsRef.current.slice(0, candLimitRef.current);
    const list: QualifyingCard[] = [];

    for (let i = 0; i < displayed.length; i++) {
      const c = displayed[i];
      if (!c.playUrl || isUrlExpired(c.playUrl)) continue;
      if (missTag(c.url)) continue;
      if (failedUrlsRef.current.has(c.url)) continue;

      const el = cardRefs.current[c.url];
      if (!el || el.offsetParent === null) continue;

      const rect = el.getBoundingClientRect();
      if (rect.height <= 0 || rect.width <= 0) continue;

      const visibleTop = Math.max(0, rect.top);
      const visibleBottom = Math.min(vh, rect.bottom);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);
      if (visibleHeight / rect.height < 0.75) continue;

      const midY = rect.top + rect.height / 2;
      if (midY < 0.15 * vh || midY > 0.65 * vh) continue;

      list.push({ url: c.url, rect, midY });
    }

    return list;
  };

  const evaluateFocus = () => {
    if (!canAutoPlay()) {
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
      return;
    }

    if (activePlayUrlRef.current && isCardInZone(activePlayUrlRef.current)) {
      if (videoRef.current && videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
      }
      return;
    }

    const qualifying = getQualifyingCardsInZone();
    if (qualifying.length === 0) {
      if (activePlayUrlRef.current) {
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
        }
        setActivePlayUrl("");
        setIsVideoPlaying(false);
      }
      return;
    }

    const vh = window.innerHeight || document.documentElement.clientHeight;
    const targetY = 0.40 * vh;
    qualifying.sort((a, b) => {
      const distA = Math.abs(a.midY - targetY);
      const distB = Math.abs(b.midY - targetY);
      if (Math.abs(distA - distB) < 10) {
        return a.rect.left - b.rect.left;
      }
      return distA - distB;
    });

    const winner = qualifying[0].url;
    if (winner === activePlayUrlRef.current) {
      if (videoRef.current && videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
      }
    } else {
      setActivePlayUrl(winner);
      setIsVideoPlaying(false);
    }
  };

  const advanceNextCard = () => {
    if (maxPlayTimerRef.current) {
      clearTimeout(maxPlayTimerRef.current);
      maxPlayTimerRef.current = null;
    }

    if (!canAutoPlay()) {
      if (activePlayUrlRef.current) {
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
        }
        setActivePlayUrl("");
        setIsVideoPlaying(false);
      }
      return;
    }

    const qualifying = getQualifyingCardsInZone();
    if (qualifying.length === 0) {
      if (activePlayUrlRef.current) {
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
        }
        setActivePlayUrl("");
        setIsVideoPlaying(false);
      }
      return;
    }

    qualifying.sort((a, b) => {
      if (Math.abs(a.rect.top - b.rect.top) > 10) {
        return a.rect.top - b.rect.top;
      }
      return a.rect.left - b.rect.left;
    });

    const currentUrl = activePlayUrlRef.current;
    if (qualifying.length === 1 && qualifying[0].url === currentUrl) {
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(() => {});
        if (maxPlayTimerRef.current) clearTimeout(maxPlayTimerRef.current);
        maxPlayTimerRef.current = setTimeout(() => {
          advanceNextCard();
        }, 15000);
      }
      return;
    }

    const currentIndex = qualifying.findIndex((q) => q.url === currentUrl);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % qualifying.length : 0;
    const nextUrl = qualifying[nextIndex].url;

    if (nextUrl === currentUrl) {
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(() => {});
        if (maxPlayTimerRef.current) clearTimeout(maxPlayTimerRef.current);
        maxPlayTimerRef.current = setTimeout(() => {
          advanceNextCard();
        }, 15000);
      }
    } else {
      setActivePlayUrl(nextUrl);
      setIsVideoPlaying(false);
    }
  };

  const handleVideoPlaying = () => {
    if (playTimeoutRef.current) {
      clearTimeout(playTimeoutRef.current);
      playTimeoutRef.current = null;
    }
    setIsVideoPlaying(true);
    if (maxPlayTimerRef.current) {
      clearTimeout(maxPlayTimerRef.current);
    }
    maxPlayTimerRef.current = setTimeout(() => {
      advanceNextCard();
    }, 15000);
  };

  const handleVideoError = (failedUrl: string) => {
    if (playTimeoutRef.current) {
      clearTimeout(playTimeoutRef.current);
      playTimeoutRef.current = null;
    }
    if (maxPlayTimerRef.current) {
      clearTimeout(maxPlayTimerRef.current);
      maxPlayTimerRef.current = null;
    }
    failedUrlsRef.current.add(failedUrl);
    if (activePlayUrlRef.current === failedUrl) {
      setActivePlayUrl("");
      setIsVideoPlaying(false);
    }
    requestAnimationFrame(() => {
      advanceNextCard();
    });
  };

  const handleToggleMute = () => {
    if (!videoRef.current) return;
    const currentMuted = videoRef.current.muted;
    const targetMuted = !currentMuted;
    userMutedChoiceRef.current = targetMuted;
    videoRef.current.muted = targetMuted;
    setIsMuted(targetMuted);
    if (!targetMuted) {
      videoRef.current.play().catch(() => {
        if (videoRef.current) {
          videoRef.current.muted = true;
          userMutedChoiceRef.current = true;
          setIsMuted(true);
          videoRef.current.play().catch(() => {});
        }
      });
    }
  };

  useEffect(() => {
    if (playTimeoutRef.current) {
      clearTimeout(playTimeoutRef.current);
      playTimeoutRef.current = null;
    }
    if (maxPlayTimerRef.current) {
      clearTimeout(maxPlayTimerRef.current);
      maxPlayTimerRef.current = null;
    }
    setIsVideoPlaying(false);

    if (activePlayUrl) {
      const currentUrl = activePlayUrl;
      playTimeoutRef.current = setTimeout(() => {
        handleVideoError(currentUrl);
      }, 8000);

      const shouldMute = userMutedChoiceRef.current === true;
      setIsMuted(shouldMute);
      if (videoRef.current) {
        videoRef.current.muted = shouldMute;
        videoRef.current.play().catch((err: unknown) => {
          if (!shouldMute && videoRef.current) {
            videoRef.current.muted = true;
            videoRef.current.play().catch(() => {});
          }
        });
      }
    }

    return () => {
      if (playTimeoutRef.current) {
        clearTimeout(playTimeoutRef.current);
        playTimeoutRef.current = null;
      }
      if (maxPlayTimerRef.current) {
        clearTimeout(maxPlayTimerRef.current);
        maxPlayTimerRef.current = null;
      }
    };
  }, [activePlayUrl]);

  useEffect(() => {
    const checkActiveCardDuringScroll = () => {
      scrollRafRef.current = null;
      if (!canAutoPlay()) {
        if (activePlayUrlRef.current) {
          if (videoRef.current && !videoRef.current.paused) {
            videoRef.current.pause();
          }
          setActivePlayUrl("");
          setIsVideoPlaying(false);
        }
        return;
      }
      const currentUrl = activePlayUrlRef.current;
      if (currentUrl) {
        if (!isCardInZone(currentUrl)) {
          if (videoRef.current && !videoRef.current.paused) {
            videoRef.current.pause();
          }
          setActivePlayUrl("");
          setIsVideoPlaying(false);
        }
      }
    };

    const onScroll = () => {
      if (viewRef.current !== "grid") return;

      if (scrollRafRef.current === null) {
        scrollRafRef.current = requestAnimationFrame(checkActiveCardDuringScroll);
      }

      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => {
        evaluateFocus();
      }, 250);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
        }
      } else {
        if (canAutoPlay()) {
          evaluateFocus();
        }
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    const panel = document.getElementById("panel-search");
    if (!panel) return;
    const observer = new MutationObserver(() => {
      if (panel.hidden) {
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
        }
        setActivePlayUrl("");
        setIsVideoPlaying(false);
      } else {
        if (canAutoPlay()) {
          evaluateFocus();
        }
      }
    });
    observer.observe(panel, { attributes: true, attributeFilter: ["hidden", "style"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (missNotice) {
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
    } else {
      if (canAutoPlay()) {
        evaluateFocus();
      }
    }
  }, [missNotice]);

  useEffect(() => {
    if (openUrl) {
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
      setActivePlayUrl("");
      setIsVideoPlaying(false);
    } else {
      setIsMuted(userMutedChoiceRef.current ?? false);
      if (canAutoPlay()) {
        evaluateFocus();
      }
    }
  }, [openUrl]);

  useEffect(() => {
    if (activePlayUrl && missTag(activePlayUrl)) {
      setActivePlayUrl("");
      setIsVideoPlaying(false);
      evaluateFocus();
    }
  }, [details]);

  const [searchRunRefCurrent, setSearchRunRefCurrent] = useState(0);
  const [searchStartTime, setSearchStartTime] = useState<number | null>(null);
  const [searchDuration, setSearchDuration] = useState<string | null>(null);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRec =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRec) {
      setVoiceSupported(true);
      const rec = new SpeechRec();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = "id-ID";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onresult = (event: any) => {
        const text = event.results?.[0]?.[0]?.transcript || "";
        if (text) {
          changeQuery(text);
          search(text);
        }
        setVoiceListening(false);
      };
      rec.onerror = () => setVoiceListening(false);
      rec.onend = () => setVoiceListening(false);
      recognitionRef.current = rec;
    }
  }, []);

  function toggleVoice() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = recognitionRef.current as any;
    if (!rec) return;
    if (voiceListening) {
      rec.stop();
      setVoiceListening(false);
    } else {
      try {
        rec.lang = "id-ID";
        rec.start();
        setVoiceListening(true);
      } catch {
        setVoiceListening(false);
      }
    }
  }

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
      const cleaned = (saved.cands as Candidate[]).map((c) => {
        if (c.playUrl && isUrlExpired(c.playUrl)) {
          const next = { ...c };
          delete next.playUrl;
          return next;
        }
        return c;
      });
      setCands(cleaned);
      sugSuppressRef.current = (saved.q || "").trim();
      setQ(saved.q || "");
      setSearchedQuery(saved.query || "");
      setCandLimit(Math.max(saved.limit || 3, saved.cands.length));
      setLastUrl(saved.last || "");
      const last: string = saved.last || "";
      const y: number = saved.y || 0;
      let tries = 0;
      const tick = () => {
        if (last) {
          const el = cardRefs.current[last];
          if (el && el.offsetParent !== null) {
            el.scrollIntoView({ block: "center" });
            requestAnimationFrame(() => evaluateFocus());
            return;
          }
        } else {
          const section = document.querySelector<HTMLElement>('section[data-results="search"]');
          if (section && section.offsetParent !== null) {
            window.scrollTo({ top: y });
            requestAnimationFrame(() => evaluateFocus());
            return;
          }
        }
        if (++tries < 90) requestAnimationFrame(tick);
        else requestAnimationFrame(() => evaluateFocus());
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

  function toggleView(next: "list" | "grid") {
    if (next === view) return;
    viewRef.current = next;
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

    if (next === "grid") {
      if (window.scrollY > 20) {
        requestAnimationFrame(() => evaluateFocus());
      } else {
        const displayed = candsRef.current.slice(0, candLimitRef.current);
        const first = displayed.find((c) => c.playUrl && !isUrlExpired(c.playUrl) && !missTag(c.url) && !failedUrlsRef.current.has(c.url));
        if (first && canAutoPlay()) {
          setActivePlayUrl(first.url);
          setIsVideoPlaying(false);
        } else {
          requestAnimationFrame(() => evaluateFocus());
        }
      }
    } else {
      setActivePlayUrl("");
      setIsVideoPlaying(false);
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
    setActivePlayUrl("");
    setIsVideoPlaying(false);
    failedUrlsRef.current.clear();
    userMutedChoiceRef.current = null;
    setIsMuted(false);
    isMutedRef.current = false;
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
    const t0 = Date.now();
    setSearchStartTime(t0);
    setSearchDuration(null);
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
      setSearchStartTime(null);
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
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1) + "s";
      setSearchDuration(elapsed);
      setSearchStartTime(null);
      if (!items.length) {
        setCands([]);
        setError(ui.search.errNoVideos);
        return;
      }
      failedUrlsRef.current.clear();
      userMutedChoiceRef.current = null;
      setIsMuted(false);
      isMutedRef.current = false;
      setCands(items);
      setLastUrl("");
      const limit = items.length;
      setCandLimit(limit);
      setSearchedQuery(query);
      setDetails({});
      if (view === "grid") {
        if (window.scrollY > 20) {
          requestAnimationFrame(() => evaluateFocus());
        } else {
          const first = items.find((c) => c.playUrl && !isUrlExpired(c.playUrl) && !missTag(c.url));
          if (first && canAutoPlay()) {
            setActivePlayUrl(first.url);
            setIsVideoPlaying(false);
          } else {
            setActivePlayUrl("");
            setIsVideoPlaying(false);
          }
        }
      }
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
    if (videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
    }
    setActivePlayUrl("");
    setIsVideoPlaying(false);
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
    setIsMuted(userMutedChoiceRef.current ?? false);
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
    setIsMuted(userMutedChoiceRef.current ?? false);
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

  useEffect(() => {
    if (!openUrl || current?.state !== "done" || !current.result) return;
    if ((current.result.presetLinks?.length ?? 0) > 0) return;
    const commentsDisabled = current.result.checked?.commentsDisabled === true;
    setMissNotice(
      commentsDisabled
        ? { title: ui.search.commentsOffTag, text: ui.states.commentsDisabled }
        : { title: ui.search.missModalTitle, text: ui.search.missModalText },
    );
    closeVideo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openUrl, current?.state]);

  function missTag(url: string): string {
    const d = details[url];
    if (d?.state !== "done" || !d.result) return "";
    if ((d.result.presetLinks?.length ?? 0) > 0) return "";
    return d.result.checked?.commentsDisabled === true ? ui.search.commentsOffTag : ui.search.noPresetTag;
  }

  const missPill: React.CSSProperties = {
    alignSelf: "flex-start",
    display: "inline-block",
    marginTop: 6,
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    color: "#E0A030",
    background: "rgba(224, 160, 48, 0.14)",
  };
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
      {missNotice ? <NoticeModal title={missNotice.title} text={missNotice.text} onClose={() => setMissNotice(null)} /> : null}
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
                <span className="search-actions">
                  {q ? (
                    <button type="button" className="clear-btn" aria-label={ui.search.clear} onClick={clearSearch}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  ) : null}
                  {voiceSupported ? (
                    <button
                      type="button"
                      className={`mic-btn${voiceListening ? " is-listening" : ""}`}
                      aria-label={voiceListening ? "Mendengarkan suara..." : "Cari dengan suara (VN)"}
                      title={voiceListening ? "Mendengarkan suara..." : "Cari dengan suara (VN)"}
                      onClick={toggleVoice}
                    >
                      <MicIcon />
                    </button>
                  ) : null}
                </span>
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
                color: "var(--accent-ink)",
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
              <BrandScan title={ui.scan.videos} startTime={searchStartTime || undefined} />
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
                  {searchDuration ? <span className="result-time">({searchDuration})</span> : null}
                </h2>
                <div className="view-toggle" role="group" aria-label={ui.search.viewMode}>
                  <button
                    type="button"
                    className="view-toggle-btn"
                    aria-label={ui.search.listView}
                    aria-pressed={view === "list"}
                    onClick={() => toggleView("list")}
                  >
                    <ListIcon />
                  </button>
                  <button
                    type="button"
                    className="view-toggle-btn"
                    aria-label={ui.search.gridView}
                    aria-pressed={view === "grid"}
                    onClick={() => toggleView("grid")}
                  >
                    <GridIcon />
                  </button>
                </div>
              </div>
              <div
                ref={deckRef}
                className={view === "grid" ? "cand-deck is-grid" : "cand-deck"}
              >
              {cands.slice(0, candLimit).map((c) => {
                const miss = missTag(c.url);
                const isGrid = view === "grid";
                const cls = [isGrid ? "cand-tile" : "cand-row", c.url === lastUrl ? "is-last" : "", miss ? "is-missing" : ""]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <button
                    key={c.url}
                    ref={(el) => {
                      cardRefs.current[c.url] = el;
                    }}
                    type="button"
                    className={cls}
                    aria-label={format(ui.search.checkFrom, { name: c.handle || ui.search.thisVideo })}
                    aria-disabled={miss ? true : undefined}
                    onClick={() => {
                      if (!miss) openVideo(c.url);
                    }}
                    style={{ viewTransitionName: vtName(c.url) }}
                  >
                    <CandThumb
                      url={c.url}
                      thumb={c.thumb}
                      fallback={c.thumbFallback}
                      isGrid={isGrid}
                      playUrl={c.playUrl}
                      isActive={isGrid && activePlayUrl === c.url}
                      isPlaying={isVideoPlaying}
                      isMuted={isMuted}
                      userMutedChoice={userMutedChoiceRef.current}
                      onToggleMute={handleToggleMute}
                      onPlaying={handleVideoPlaying}
                      onEnded={advanceNextCard}
                      onError={() => handleVideoError(c.url)}
                      onVolumeChange={(muted) => setIsMuted(muted)}
                      videoRef={videoRef}
                      unmuteLabel={ui.search.unmuteVideo}
                      muteLabel={ui.search.muteVideo}
                    />
                    <span className="cand-body">
                      <span className="cand-name">
                        <CandAvatar src={c.avatar} handle={c.handle || ""} />
                        <span className="cand-handle">{c.handle || ui.search.videoFallback}</span>
                      </span>
                      <span className="cand-desc">{c.snippet || ui.search.noCaption}</span>
                      {miss ? <span style={missPill}>{miss}</span> : null}
                    </span>
                    {isGrid ? null : <ChevronRight />}
                  </button>
                );
              })}
              </div>
              {cands.length > candLimit && (
                <button
                  type="button"
                  className="btn-show-more"
                  onClick={() => setCandLimit((limit) => limit + (view === "grid" ? 4 : 3))}
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
              data-theme="dark"
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
