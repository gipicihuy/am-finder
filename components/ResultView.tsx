"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FindResult, PresetLink } from "@/lib/types";
import { soundCoverUrl, soundFileName, soundUrl } from "@/lib/audio";
import { isYoutubeLink, youtubeId } from "@/lib/tiktok-link";
import { SectionOrnament } from "@/components/Ornament";
import { TelegramIcon, WhatsAppIcon } from "@/components/ShareIcons";
import { useUi } from "@/components/LocaleProvider";
import type { UiTexts } from "@/lib/ui";

type ShareLink = NonNullable<FindResult["shareLinks"]>[number];

function shareLabel(share: ShareLink, ui: UiTexts): string {
  if (share.kind === "chat") return ui.states.shareChat;
  if (share.kind === "telegram") {
    return share.username
      ? `${ui.states.shareTelegram} (${share.username})`
      : ui.states.shareTelegram;
  }
  const base = share.kind === "group" ? ui.states.shareGroup : ui.states.shareChannel;
  return share.title ? `${base} (${share.title})` : base;
}

function ShareIcon({ share }: { share: ShareLink }) {
  const [imgFailed, setImgFailed] = useState(false);

  if (share.kind === "telegram") return <TelegramIcon />;
  if (share.avatar && !imgFailed) {
    return <img src={share.avatar} alt="" onError={() => setImgFailed(true)} />;
  }
  return <WhatsAppIcon />;
}

function formatCount(value?: number | null): string | null {
  if (value === null || value === undefined) return null;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} K`;
  return String(value);
}

function clipText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function soundPageHref(id: unknown): string | null {
  const raw = typeof id === "string" ? id.trim() : "";
  return /^\d{5,25}$/.test(raw)
    ? `https://www.tiktok.com/music/original-sound-${raw}`
    : null;
}

function isAndroidApp(): boolean {
  return typeof navigator !== "undefined" && /AMFinderApp\/1\.0/i.test(navigator.userAgent);
}

function filenameFromDisposition(value: string | null): string | null {
  if (!value) return null;
  const utf8 = value.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1].trim().replace(/^"|"$/g, ""));
    } catch {
      /* pakai fallback di bawah */
    }
  }
  const quoted = value.match(/filename\s*=\s*"([^"]+)"/i);
  if (quoted) return quoted[1];
  const plain = value.match(/filename\s*=\s*([^;]+)/i);
  return plain ? plain[1].trim() : null;
}

async function audioErrorMessage(res: Response, ui: UiTexts): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string" &&
      body.error.trim()
    ) {
      return body.error.trim();
    }
  } catch {
    /* respons bukan JSON */
  }
  if (res.status === 429) return ui.result.audioTooMany;
  if (res.status === 413) return ui.result.audioTooLarge;
  return ui.result.audioFailed;
}

function ratioBox(ratio?: string) {
  const m = ratio?.match(/^(\d{1,3}):(\d{1,3})$/);
  const max = 60;
  if (!m) return { w: max, h: max };
  const rw = Number(m[1]);
  const rh = Number(m[2]);
  if (rw >= rh) return { w: max, h: Math.max(16, Math.round((max * rh) / rw)) };
  return { w: Math.max(16, Math.round((max * rw) / rh)), h: max };
}

function presetLabel(preset: PresetLink, ui: UiTexts): string {
  if (preset.title) return preset.title;
  if (preset.type === "5mb") return ui.result.preset5mb;
  if (preset.type === "xml") return ui.result.fileXml;
  if (preset.type === "sound") return "Sound / Musik";
  if (preset.type === "font") return "Font";
  if (preset.type === "bahan") return "Bahan / Overlay";
  return "Link File";
}

function presetTypeLabel(preset: PresetLink): string {
  if (preset.type === "5mb") return "5MB";
  if (preset.type === "xml") return "XML";
  if (preset.type === "sound") return "Musik";
  if (preset.type === "font") return "Font";
  if (preset.type === "bahan") return "Bahan";
  return String(preset.type).toUpperCase();
}

function PresetThumb({ preset }: { preset: PresetLink }) {
  const sources = useMemo(
    () => [...new Set([preset.thumb, ...(preset.thumbs ?? [])].filter(Boolean) as string[])],
    [preset],
  );
  const [index, setIndex] = useState(0);

  if (index < sources.length) {
    return (
      <img
        className="preset-thumb"
        src={sources[index]}
        alt=""
        loading="lazy"
        onError={() => setIndex((i) => i + 1)}
      />
    );
  }
  if (preset.type === "sound") {
    return (
      <span className="preset-thumb preset-thumb-ph preset-thumb-file" aria-hidden="true">
        <MusicIcon />
      </span>
    );
  }
  if (preset.type === "font") {
    return (
      <span className="preset-thumb preset-thumb-ph preset-thumb-file" aria-hidden="true">
        <FontIcon />
      </span>
    );
  }
  if (preset.type === "bahan") {
    return (
      <span className="preset-thumb preset-thumb-ph preset-thumb-file" aria-hidden="true">
        <BoxIcon />
      </span>
    );
  }
  if (preset.type === "xml") {
    return (
      <span className="preset-thumb preset-thumb-ph preset-thumb-file" aria-hidden="true">
        <RatioFrame ratio={preset.ratio} />
      </span>
    );
  }
  return (
    <span className="preset-thumb preset-thumb-ph" aria-hidden="true">
      5MB
    </span>
  );
}

function FontIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function MusicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18V6l11-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
    </svg>
  );
}

function OpenIcon() {
  return (
    <svg className="btn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="m16 10 5.5-3.2v10.4L16 14" />
    </svg>
  );
}

function VolumeIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      {muted ? (
        <>
          <path d="m22 9-6 6" />
          <path d="m16 9 6 6" />
        </>
      ) : (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M19 5a10 10 0 0 1 0 14" />
        </>
      )}
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="btn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg className="btn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="btn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CopyButton({ url, variant = "text" }: { url: string; variant?: "text" | "icon" }) {
  const ui = useUi();
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const field = document.createElement("textarea");
      field.value = url;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1600);
  }

  if (variant === "icon") {
    const label = done ? ui.buttons.copied : ui.buttons.copy;
    return (
      <button
        type="button"
        className={`preset-copy${done ? " is-done" : ""}`}
        onClick={copy}
        aria-label={label}
        title={label}
      >
        {done ? <CheckIcon /> : <CopyIcon />}
      </button>
    );
  }

  return (
    <button type="button" className={`text-btn${done ? " is-done" : ""}`} onClick={copy}>
      {done ? <CheckIcon /> : <CopyIcon />}
      {done ? ui.buttons.copied : ui.buttons.copy}
    </button>
  );
}

const EASE_OPEN = "cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_CLOSE = "cubic-bezier(0.4, 0, 0.2, 1)";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Keyframe posisi + ukuran kotak (titik tengah, lebar, tinggi). Dianimasikan
// langsung, bukan lewat scale, supaya kotak berubah bentuk dari layar penuh
// (tegak) ke thumbnail (melebar) secara mulus dan tombol di dalamnya tetap
// menempel di pojok dengan ukuran normal.
function morphFrame(rect: DOMRect): Keyframe {
  return {
    left: `${rect.left + rect.width / 2}px`,
    top: `${rect.top + rect.height / 2}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const sec = String(total % 60).padStart(2, "0");
  return `${m}:${sec}`;
}

function VideoPreview({
  src,
  poster,
  width,
  height,
  allowMotion,
}: {
  src?: string;
  poster?: string;
  width?: number;
  height?: number;
  allowMotion: boolean;
}) {
  const ui = useUi();
  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const seekRef = useRef<HTMLInputElement>(null);
  const curTimeRef = useRef<HTMLSpanElement>(null);
  const durTimeRef = useRef<HTMLSpanElement>(null);
  const draggingRef = useRef(false);
  const ghostRef = useRef<HTMLDivElement>(null);
  const firstRectRef = useRef<DOMRect | null>(null);
  const closingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const [muted, setMuted] = useState(false);
  const autoMutedRef = useRef(false);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    const box = boxRef.current;
    const ghost = ghostRef.current;
    if (!box || !ghost || typeof box.animate !== "function" || prefersReducedMotion()) {
      setExpanded(false);
      return;
    }
    closingRef.current = true;
    setClosing(true);
    const current = box.getBoundingClientRect();
    const slot = ghost.getBoundingClientRect();
    const animation = box.animate([morphFrame(current), morphFrame(slot)], {
      duration: 240,
      easing: EASE_CLOSE,
      fill: "forwards",
    });
    const finish = () => {
      closingRef.current = false;
      setClosing(false);
      setExpanded(false);
    };
    animation.finished.then(finish, finish);
  }, []);

  function openPreview() {
    const box = boxRef.current;
    if (box) firstRectRef.current = box.getBoundingClientRect();
    setExpanded(true);
  }

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    if (!expanded) {
      if (typeof box.getAnimations === "function") {
        let running: Animation[];
        try {
          running = box.getAnimations({ subtree: true });
        } catch {
          running = box.getAnimations();
        }
        running.forEach((animation) => animation.cancel());
      }
      return;
    }
    const first = firstRectRef.current;
    firstRectRef.current = null;
    if (!first || typeof box.animate !== "function" || prefersReducedMotion()) return;
    const last = box.getBoundingClientRect();
    if (!last.width) return;
    box.animate([morphFrame(first), morphFrame(last)], { duration: 280, easing: EASE_OPEN });
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [expanded, requestClose]);

  // Sinkronkan slider seek dengan posisi video selama preview terbuka. Pakai
  // requestAnimationFrame supaya geraknya mulus (timeupdate cuma ~4x/detik).
  useEffect(() => {
    if (!expanded) return undefined;
    const video = videoRef.current;
    const input = seekRef.current;
    if (!video || !input) return undefined;
    let raf = 0;
    const paint = () => {
      const duration = video.duration;
      if (Number.isFinite(duration) && duration > 0) {
        if (!draggingRef.current) {
          const ratio = Math.min(1, video.currentTime / duration);
          input.value = String(Math.round(ratio * 1000));
          input.style.setProperty("--p", `${ratio * 100}%`);
          if (curTimeRef.current) curTimeRef.current.textContent = formatTime(video.currentTime);
        }
        if (durTimeRef.current) durTimeRef.current.textContent = formatTime(duration);
      }
      raf = requestAnimationFrame(paint);
    };
    const stopDrag = () => {
      draggingRef.current = false;
    };
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    raf = requestAnimationFrame(paint);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
      draggingRef.current = false;
    };
  }, [expanded, src]);

  function handleSeek(event: React.ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current;
    const input = event.currentTarget;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const ratio = Number(input.value) / 1000;
    video.currentTime = ratio * video.duration;
    input.style.setProperty("--p", `${ratio * 100}%`);
    if (curTimeRef.current) curTimeRef.current.textContent = formatTime(video.currentTime);
  }

  // Coba putar dengan suara dulu. Kalau browser/WebView menolak autoplay
  // bersuara, putar muted sebagai cadangan dan tandai supaya suara dinyalakan
  // begitu pengguna menyentuh video atau tombol suara.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || !allowMotion) return undefined;
    let cancelled = false;
    video.muted = false;
    autoMutedRef.current = false;
    const attempt = video.play();
    if (attempt && typeof attempt.catch === "function") {
      attempt.catch(() => {
        if (cancelled) return;
        video.muted = true;
        autoMutedRef.current = true;
        video.play().catch(() => undefined);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [src, allowMotion]);

  function unmuteIfAutoMuted() {
    const video = videoRef.current;
    if (!video || !autoMutedRef.current) return;
    autoMutedRef.current = false;
    video.muted = false;
  }

  function toggleMute(event: React.MouseEvent) {
    event.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    autoMutedRef.current = false;
    video.muted = !video.muted;
    if (video.paused) video.play().catch(() => undefined);
  }

  function handleExpandClick() {
    openPreview();
    unmuteIfAutoMuted();
    const video = videoRef.current;
    if (video && video.paused) video.play().catch(() => undefined);
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => undefined);
    else video.pause();
  }

  function handleVideoClick() {
    if (closingRef.current) return;
    if (!expanded) {
      openPreview();
      unmuteIfAutoMuted();
      const video = videoRef.current;
      if (video && video.paused) video.play().catch(() => undefined);
      return;
    }
    togglePlay();
  }

  if (!src && !poster) return null;

  const ratio = width && height ? `${width} / ${height}` : "9 / 16";

  return (
    <>
      {expanded ? (
        <div className={`preview-backdrop${closing ? " is-closing" : ""}`} onClick={requestClose} />
      ) : null}
      {expanded ? (
        <div className="video-preview video-preview-ghost" ref={ghostRef} style={{ aspectRatio: ratio }} aria-hidden="true" />
      ) : null}
      <div
        className={`video-preview${expanded ? " is-open" : ""}${closing ? " is-closing" : ""}`}
        ref={boxRef}
        style={{ aspectRatio: ratio }}
      >
      {expanded ? (
        <button type="button" className="video-close" onClick={requestClose} aria-label={ui.result.close}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      ) : null}
      {src ? (
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          loop
          playsInline
          disableRemotePlayback
          preload="metadata"
          aria-label={expanded ? (playing ? ui.result.pause : ui.result.play) : ui.result.openPreview}
          tabIndex={0}
          onClick={handleVideoClick}
          onKeyDown={(event) => {
            if (event.key === " " || event.key === "Enter") {
              event.preventDefault();
              handleVideoClick();
            }
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
          onTimeUpdate={(event) => {
            const video = event.currentTarget;
            if (fillRef.current && video.duration) {
              fillRef.current.style.width = `${(video.currentTime / video.duration) * 100}%`;
            }
          }}
        />
      ) : (
        <img src={poster} alt="" loading="lazy" title={ui.result.openPreview} onClick={openPreview} />
      )}
      {src ? (
        <>
          <div className="video-progress" aria-hidden="true">
            <span ref={fillRef} />
          </div>
          {expanded ? (
            <div className="video-seek">
              <span className="video-time" ref={curTimeRef}>0:00</span>
              <input
                ref={seekRef}
                className="video-range"
                type="range"
                min={0}
                max={1000}
                step={1}
                defaultValue={0}
                aria-label={ui.result.seek}
                onChange={handleSeek}
                onPointerDown={() => {
                  draggingRef.current = true;
                }}
              />
              <span className="video-time" ref={durTimeRef}>0:00</span>
            </div>
          ) : null}
          {!playing ? (
            <div className="video-center-play" aria-hidden="true">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 4.8 19 12 8 19.2z" />
              </svg>
            </div>
          ) : null}
          <button
            type="button"
            className={`video-mute${muted ? " is-muted" : ""}`}
            onClick={toggleMute}
            aria-label={muted ? ui.result.unmute : ui.result.mute}
            title={muted ? ui.result.unmute : ui.result.mute}
          >
            <VolumeIcon muted={muted} />
          </button>
          <button type="button" className="video-expand" onClick={handleExpandClick} aria-label={ui.result.expand}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 3h6v6" />
              <path d="M9 21H3v-6" />
              <path d="M21 3l-7 7" />
              <path d="M3 21l7-7" />
            </svg>
          </button>
        </>
      ) : null}
      </div>
    </>
  );
}

function RatioFrame({ ratio }: { ratio?: string }) {
  const { w, h } = ratioBox(ratio);
  const L = Math.max(8, Math.round(Math.min(w, h) * 0.3));
  const fs = Math.max(11, Math.min(16, Math.round(Math.min(w * 0.36, h * 0.44))));
  return (
    <svg className="ratio-frame" width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <g stroke="currentColor" strokeWidth={1.6} strokeLinecap="square">
        <path d={`M0 ${L}L0 0L${L} 0`} />
        <path d={`M${w - L} 0L${w} 0L${w} ${L}`} />
        <path d={`M${w} ${h - L}L${w} ${h}L${w - L} ${h}`} />
        <path d={`M${L} ${h}L0 ${h}L0 ${h - L}`} />
      </g>
      <text
        x={w / 2}
        y={h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fs}
        fontWeight={800}
        letterSpacing="-0.03em"
        fill="var(--foreground)"
      >
        {ratio || "XML"}
      </text>
    </svg>
  );
}

export function ResultView({ result }: { result: FindResult }) {
  const ui = useUi();
  const [allowMotion, setAllowMotion] = useState(true);
  const [presetLimit, setPresetLimit] = useState(3);
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoError, setVideoError] = useState("");
  const [coverFailed, setCoverFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const downloadSeq = useRef(0);

  useEffect(() => {
    setAllowMotion(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    setPresetLimit(3);
    downloadSeq.current += 1;
    setAudioBusy(false);
    setAudioError("");
    setVideoBusy(false);
    setVideoError("");
    setCoverFailed(false);
    setMenuOpen(false);
  }, [result]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const isYt = Boolean(
    isYoutubeLink(result.input || "") ||
    isYoutubeLink(result.video?.url || "") ||
    (result.videoId && result.videoId.length === 11)
  );
  const ytId = isYt
    ? youtubeId(result.input || "") || youtubeId(result.video?.url || "") || result.videoId
    : null;

  const presets = result.presetLinks ?? [];
  const avatar = result.authorDetail?.avatar;
  const cover = result.video?.cover;
  const playUrl =
    result.video?.playUrlNoWm ||
    result.video?.playUrl ||
    (ytId ? `/api/video/${encodeURIComponent(ytId)}` : undefined);
  const stats = result.video?.stats;
  const views = formatCount(stats?.views);
  const likes = formatCount(stats?.likes);
  const comments = formatCount(stats?.comments);
  const description = result.video?.description?.trim();
  const music = result.video?.music;
  const videoId = result.videoId || ytId;
  const soundTitle = clipText(music?.title || result.video?.title || description || "Sound", 80);
  const soundAuthor = clipText(music?.author || result.author || result.authorDetail?.nickname || "", 60);
  const soundLink = isYt && ytId ? `https://www.youtube.com/watch?v=${ytId}` : soundPageHref(music?.id);
  const soundAudio = soundUrl(music?.playUrl);
  const videoAudio = soundUrl(playUrl);
  const canDownloadAudio = Boolean(videoId && (soundAudio || videoAudio || isYt));
  const soundCover = soundCoverUrl(music?.cover) || (isYt ? cover : null);
  const hasSound = Boolean(soundTitle || soundAuthor || soundLink || canDownloadAudio);

  async function handleDownload() {
    if (!canDownloadAudio || !videoId || audioBusy) return;

    // WebView APK v1.5 belum punya DownloadListener. Buka link CDN di browser
    // (perilaku lama) sampai APK v1.6 membawa handler unduhan native.
    if (isAndroidApp() && soundAudio) {
      const link = document.createElement("a");
      link.href = soundAudio;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }

    const requestId = downloadSeq.current + 1;
    downloadSeq.current = requestId;
    setAudioBusy(true);
    setAudioError("");
    try {
      const res = await fetch(`/api/audio/${encodeURIComponent(videoId)}`, {
        cache: "no-store",
      });
      if (downloadSeq.current !== requestId) return;
      if (!res.ok) {
        setAudioError(await audioErrorMessage(res, ui));
        return;
      }
      const blob = await res.blob();
      if (downloadSeq.current !== requestId) return;
      if (!blob.size) {
        setAudioError(ui.result.audioEmpty);
        return;
      }
      const type = res.headers.get("content-type") || blob.type || "audio/mpeg";
      const name =
        filenameFromDisposition(res.headers.get("content-disposition")) ||
        soundFileName(soundTitle, videoId, type);
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = name;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 30_000);
    } catch (error) {
      if (downloadSeq.current !== requestId) return;
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setAudioError(ui.result.audioFailed);
      }
    } finally {
      if (downloadSeq.current === requestId) setAudioBusy(false);
    }
  }

  const canDownloadVideo = Boolean(videoId && (playUrl || isYt));

  async function handleDownloadVideo() {
    if (!videoId || videoBusy) return;
    const requestId = downloadSeq.current + 1;
    downloadSeq.current = requestId;
    setVideoBusy(true);
    setVideoError("");
    try {
      const res = await fetch(`/api/video/${encodeURIComponent(videoId)}?dl=1`, {
        cache: "no-store",
      });
      if (downloadSeq.current !== requestId) return;
      if (!res.ok) {
        setVideoError(ui.result.videoFailed);
        return;
      }
      const blob = await res.blob();
      if (downloadSeq.current !== requestId) return;
      if (!blob.size) {
        setVideoError(ui.result.videoFailed);
        return;
      }
      const name =
        filenameFromDisposition(res.headers.get("content-disposition")) ||
        `${soundTitle || videoId}.mp4`;
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = name;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 30_000);
    } catch {
      if (downloadSeq.current !== requestId) return;
      setVideoError(ui.result.videoFailed);
    } finally {
      if (downloadSeq.current === requestId) setVideoBusy(false);
    }
  }

  const downloadBusy = audioBusy || videoBusy;
  const canDownload = canDownloadAudio || canDownloadVideo;

  function handleDownloadClick() {
    if (downloadBusy) return;
    if (canDownloadAudio && canDownloadVideo) {
      setMenuOpen((open) => !open);
      return;
    }
    if (canDownloadVideo) void handleDownloadVideo();
    else void handleDownload();
  }

  function pickDownload(kind: "video" | "audio") {
    setMenuOpen(false);
    if (kind === "video") void handleDownloadVideo();
    else void handleDownload();
  }

  const commentsDisabled = result.checked?.commentsDisabled === true;
  // Kalau tidak ada link preset: kalau kata kunci preset terdeteksi (konteks !=
  // "none") tapi linknya tidak ketemu, pesannya "link tidak ditemukan". Kalau
  // konteks preset tidak terdeteksi sama sekali, berarti video memang tidak
  // mengandung preset — walaupun ada sumber lain seperti Chat WA.
  const missText = result.checked?.context !== "none" ? ui.states.noLink : ui.states.notFound;
  const shares = result.shareLinks ?? [];

  if (presets.length === 0) {
    return (
      <div className="state state-miss" role="status">
        <strong>❌ {commentsDisabled ? ui.states.commentsDisabled : missText}</strong>
        {shares.length ? (
          <div className="miss-sources">
            <p className="miss-sources-title">{ui.states.shareSources}</p>
            <div className="miss-sources-list">
              {shares.map((share) => (
                <a
                  key={share.url}
                  className="share-row"
                  href={share.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="share-icon">
                    <ShareIcon share={share} />
                  </span>
                  <span className="share-label">{shareLabel(share, ui)}</span>
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      {result.video ? (
      <section className="video-meta" aria-label={ui.result.contentInfo}>
        <div className="content-head">
        <VideoPreview
          src={playUrl}
          poster={cover}
          width={result.video?.width}
          height={result.video?.height}
          allowMotion={allowMotion}
        />
        <div className="content-main">
        {description ? <p className="meta-desc">{description}</p> : null}
        <dl className="meta-grid">
            <div className="meta-item">
              <dt>{ui.result.account}</dt>
              <dd className="meta-account">
                {avatar ? <img className="meta-avatar" src={avatar} alt="" loading="lazy" /> : null}
                <span>{result.author || ui.result.noAccount}</span>
              </dd>
            </div>
          {comments ? (
            <div className="meta-item">
              <dt>{ui.result.comments}</dt>
              <dd>{comments}</dd>
            </div>
          ) : null}
          {views ? (
            <div className="meta-item">
              <dt>{ui.result.views}</dt>
              <dd>{views}</dd>
            </div>
          ) : null}
          {likes ? (
            <div className="meta-item">
              <dt>{ui.result.likes}</dt>
              <dd>{likes}</dd>
            </div>
          ) : null}
        </dl>
        </div>
        </div>
        {hasSound ? (
          <div className="sound-info">
            <div className="sound-row">
              <span
                className={`sound-icon${soundCover && !coverFailed ? " has-cover" : ""}`}
                aria-hidden="true"
              >
                {soundCover && !coverFailed ? (
                  <img
                    className="sound-cover"
                    src={soundCover}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={() => setCoverFailed(true)}
                  />
                ) : null}
                <span className="sound-icon-glyph">
                  <MusicIcon />
                </span>
              </span>
              <span className="sound-text">
                <span className="sound-title">{soundTitle || ui.result.soundFallback}</span>
                <span className="sound-sub">
                  {soundAuthor && !soundTitle?.includes(soundAuthor) ? soundAuthor : ui.result.soundOfVideo}
                </span>
              </span>
              {soundLink ? (
                <a
                  className="sound-btn"
                  href={soundLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={ui.result.openSound}
                  title={ui.result.openSound}
                >
                  <OpenIcon />
                </a>
              ) : null}
              {canDownload ? (
                <div className="sound-dl">
                  <button
                    type="button"
                    className="sound-btn is-primary"
                    onClick={handleDownloadClick}
                    disabled={downloadBusy}
                    aria-busy={downloadBusy}
                    aria-haspopup={canDownloadAudio && canDownloadVideo ? "menu" : undefined}
                    aria-expanded={canDownloadAudio && canDownloadVideo ? menuOpen : undefined}
                    aria-label={
                      audioBusy
                        ? ui.result.downloadingAudio
                        : videoBusy
                          ? ui.result.downloadingVideo
                          : canDownloadAudio && canDownloadVideo
                            ? ui.result.downloadMenu
                            : canDownloadVideo
                              ? ui.result.downloadVideoLong
                              : ui.result.downloadAudioLong
                    }
                    title={ui.result.downloadMenu}
                  >
                    {downloadBusy ? <span className="spinner" aria-hidden="true" /> : <DownloadIcon />}
                  </button>
                  {menuOpen ? (
                    <div className="sound-menu" role="menu" aria-label={ui.result.downloadMenu}>
                      <button type="button" role="menuitem" className="sound-menu-item" onClick={() => pickDownload("video")}>
                        <VideoIcon />
                        <span>{ui.result.downloadVideo}</span>
                      </button>
                      <button type="button" role="menuitem" className="sound-menu-item" onClick={() => pickDownload("audio")}>
                        <MusicIcon />
                        <span>{ui.result.downloadMusic}</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            {videoError ? (
              <p className="sound-error" role="status">
                {videoError}
              </p>
            ) : null}
            {audioError ? (
              <p className="sound-error" role="status">
                {audioError}
                {soundAudio ? (
                  <>
                    {" "}
                    <a href={soundAudio} target="_blank" rel="noopener noreferrer">
                      {ui.result.openAudio}
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
      ) : null}

      <section className="preset-section" aria-label={ui.result.presetLinks}>
          <div className="section-head">
            <h2 className="section-title">
              <span className="section-ornament" aria-hidden="true">
                <SectionOrnament />
              </span>
              {ui.result.presetLinks}
              <span className="badge badge-type section-count">{presets.length}</span>
            </h2>
          </div>

          <div className="preset-list">
            {presets.slice(0, presetLimit).map((preset) => {
              return (
                <article className="preset-row" key={`${preset.type}-${preset.url}`}>
                  <div className="preset-top">
                    <PresetThumb preset={preset} />

                    <div className="preset-body">
                      <h3 className="preset-title">{presetLabel(preset, ui)}</h3>
                      <div className="preset-badges">
                        <span className="badge badge-type">{presetTypeLabel(preset)}</span>
                        {preset.source === "saluran WA" || preset.source === "saluran" ? (
                          <span className="badge">Saluran WA</span>
                        ) : preset.source === "telegram" ? (
                          <span className="badge">Telegram</span>
                        ) : null}
                        {preset.size ? <span className="badge">{preset.size}</span> : null}
                        {preset.pinned ? <span className="badge">{ui.result.pinned}</span> : null}
                        {preset.byAuthor ? <span className="badge">{ui.result.byAccount}</span> : null}
                      </div>
                      {preset.detail ? <p className="preset-detail">{preset.detail}</p> : null}
                    </div>
                  </div>

                  <div className="preset-field">
                    <span className="preset-field-url" title={preset.url}>
                      {preset.url}
                    </span>
                    <CopyButton url={preset.url} variant="icon" />
                  </div>

                  <a className="btn-open" href={preset.url} target="_blank" rel="noopener noreferrer">
                    {preset.type === "5mb" ? <OpenIcon /> : <DownloadIcon />}
                    {preset.type === "5mb"
                      ? ui.buttons.openPreset
                      : preset.type === "sound"
                        ? "Unduh Audio"
                        : preset.type === "font"
                          ? "Unduh Font"
                          : preset.type === "bahan"
                            ? "Unduh Bahan"
                            : ui.buttons.openFile}
                  </a>
                </article>
              );
            })}
          </div>

          {presets.length > presetLimit && (
            <button
              type="button"
              className="btn-show-more"
              onClick={() => setPresetLimit((limit) => limit + 3)}
            >
              {ui.result.showMore}
            </button>
          )}
      </section>
    </>
  );
}
