"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { FindResult, PresetLink } from "@/lib/types";
import { cleanSoundTitle, soundCoverUrl, soundFileName, soundUrl } from "@/lib/audio";
import { isYoutubeLink, youtubeId } from "@/lib/tiktok-link";
import { SectionOrnament } from "@/components/Ornament";
import { TelegramIcon, WhatsAppIcon } from "@/components/ShareIcons";
import { useUi } from "@/components/LocaleProvider";
import type { UiTexts } from "@/lib/ui";
import { emitVideoZoom, finishVideoHandoff, peekVideoHandoff, type VideoHandoff } from "@/lib/video-handoff";
import { isTikTokUrlExpired } from "@/lib/video-util";

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
  if (typeof window !== "undefined" && Boolean((window as unknown as { AMFinderNative?: unknown }).AMFinderNative)) {
    return true;
  }
  return typeof navigator !== "undefined" && /AMFinderApp\//i.test(navigator.userAgent);
}

// APK v1.6+ membawa DownloadListener native (UA berisi AMFinderDL/1) atau JS Bridge AMFinderNative.downloadMedia.
function hasNativeDownload(): boolean {
  if (
    typeof window !== "undefined" &&
    typeof (window as unknown as { AMFinderNative?: { downloadMedia?: unknown } }).AMFinderNative?.downloadMedia === "function"
  ) {
    return true;
  }
  return typeof navigator !== "undefined" && /AMFinderDL\/1/i.test(navigator.userAgent);
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

function AlertIcon() {
  return (
    <svg className="btn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="btn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
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

function zoomOutFromScreen(box: HTMLElement, fit: "contain" | "cover"): void {
  if (typeof box.animate !== "function" || prefersReducedMotion()) return;
  const rect = box.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scale =
    fit === "contain" ? Math.min(vw / rect.width, vh / rect.height) : Math.max(vw / rect.width, vh / rect.height);
  const dx = vw / 2 - (rect.left + rect.width / 2);
  const dy = vh / 2 - (rect.top + rect.height / 2);
  const insetX = fit === "contain" ? 0 : Math.max(0, (rect.width - vw / scale) / 2);
  const insetY = fit === "contain" ? 0 : Math.max(0, (rect.height - vh / scale) / 2);
  const radius = getComputedStyle(box).borderTopLeftRadius || "0px";
  box.style.zIndex = "9999";
  emitVideoZoom({ dx, dy, scale, duration: 440, easing: EASE_OPEN });
  if (fit === "contain") {
    const backdrop = document.createElement("div");
    backdrop.style.cssText = "position:fixed;inset:0;z-index:9990;background:#000;pointer-events:none";
    document.body.appendChild(backdrop);
    const fade = backdrop.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 440,
      easing: EASE_OPEN,
      fill: "forwards",
    });
    const remove = () => backdrop.remove();
    fade.finished.then(remove, remove);
  }
  const animation = box.animate(
    [
      {
        transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
        clipPath: `inset(${insetY}px ${insetX}px round 0px)`,
      },
      {
        transform: "translate(0px, 0px) scale(1)",
        clipPath: `inset(0px round ${radius})`,
      },
    ],
    { duration: 440, easing: EASE_OPEN },
  );
  const cleanup = () => {
    box.style.zIndex = "";
    box.style.willChange = "";
  };
  animation.finished.then(cleanup, cleanup);
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const sec = String(total % 60).padStart(2, "0");
  return `${m}:${sec}`;
}

// Cover sound disembunyikan HANYA bila sound itu milik akun pengunggah video ini
// (cover-nya foto akun yang sama, jadi tampil dua kali). Sound dari akun/lagu
// lain, termasuk "suara asli" milik orang lain, tetap menampilkan covernya.
function imageKey(url?: string | null): string {
  if (!url) return "";
  try {
    const u = new URL(url, "https://x.invalid");
    // host CDN berganti-ganti (p16/p19/p77...), jadi bandingkan path sebelum ukuran "~tplv".
    return u.pathname.split("~")[0];
  } catch {
    return url.split("?")[0].split("~")[0];
  }
}

function normName(s?: string | null): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function isOwnSound(
  music: { author?: string; cover?: string | null } | null | undefined,
  avatar: string | null | undefined,
  names: Array<string | null | undefined>,
): boolean {
  if (!music) return false;
  const a = imageKey(avatar);
  if (a.length > 1 && a === imageKey(music.cover)) return true;
  const author = normName(music.author);
  if (author.length < 3) return false;
  return names.some((n) => {
    const x = normName(n);
    return x.length >= 3 && (x === author || x.includes(author) || author.includes(x));
  });
}

type VideoKind = "portrait" | "square" | "landscape";

// Rasio video menentukan ukuran & tata letak thumbnail:
// 9:16 -> sempit & tinggi, 1:1 -> sedang, 16:9 / 4:3 -> lebar penuh di atas info.
function videoKind(width?: number, height?: number): VideoKind {
  if (!width || !height) return "portrait";
  const r = width / height;
  if (r >= 1.15) return "landscape";
  if (r > 0.9) return "square";
  return "portrait";
}

function StatIcon({ name, size = 14 }: { name: "account" | "comments" | "views" | "likes"; size?: number }) {
  const paths = {
    account: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    comments: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
    views: (
      <>
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    likes: <path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z" />,
  } as const;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

// Caption: semua hashtag diwarnai di mana pun posisinya; kumpulan hashtag di
// paling akhir dipisah ke baris sendiri. Pemisah "||" diredupkan.
const HASHTAG = /#[\p{L}\p{N}_]+/gu;

function withTags(text: string) {
  return text.split(/(#[\p{L}\p{N}_]+)/u).map((chunk, i) =>
    i % 2 === 1 ? (
      <span key={i} className="meta-tag">
        {chunk}
      </span>
    ) : (
      chunk
    ),
  );
}

function Caption({ text }: { text: string }) {
  const m = text.match(/(?:\s*#[\p{L}\p{N}_]+)+\s*$/u);
  const tags = m ? (m[0].match(HASHTAG) ?? []) : [];
  const body = (m ? text.slice(0, m.index) : text).trim();
  const parts = body.split("||");
  return (
    <>
      {body ? (
        <p className="meta-desc">
          {parts.map((part, i) => (
            <span key={i}>
              {withTags(part)}
              {i < parts.length - 1 ? <span className="cap-sep" aria-hidden="true">||</span> : null}
            </span>
          ))}
        </p>
      ) : null}
      {tags.length ? <p className="meta-tags">{tags.join(" ")}</p> : null}
    </>
  );
}

function VideoPreview({
  src,
  poster,
  width,
  height,
  allowMotion,
  fallbackSrc,
  onMeasure,
}: {
  src?: string;
  poster?: string;
  width?: number;
  height?: number;
  allowMotion: boolean;
  fallbackSrc?: string;
  onMeasure?: (width: number, height: number) => void;
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
  const handoffRef = useRef<VideoHandoff | null>(null);
  const [currentSrc, setCurrentSrc] = useState(src);

  useEffect(() => {
    setCurrentSrc(src);
  }, [src]);

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
  useLayoutEffect(() => {
    const video = videoRef.current;
    const box = boxRef.current;
    const handoff = peekVideoHandoff();
    if (!handoff || !video || !box || !src || !allowMotion) {
      handoffRef.current = null;
      if (handoff) finishVideoHandoff();
      return undefined;
    }
    handoffRef.current = handoff;
    box.style.opacity = "0";
    box.style.willChange = "transform, clip-path";
    let warm = false;
    if (handoff.muted) {
      video.muted = true;
    } else {
      video.muted = false;
      video.volume = 0;
      warm = video.volume === 0;
      if (!warm) {
        video.volume = 1;
        video.muted = true;
      }
    }
    const source = handoff.source;
    let revealed = false;
    let started = false;
    let attempts = 0;
    let lead = 0.2;

    const span = () => (Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0);
    const wrap = (time: number) => {
      const total = span();
      return total ? ((time % total) + total) % total : Math.max(0, time);
    };
    const gap = (a: number, b: number) => {
      const total = span();
      let value = a - b;
      if (total) {
        if (value > total / 2) value -= total;
        if (value < -total / 2) value += total;
      }
      return value;
    };
    const livePosition = () =>
      source && source.isConnected && !source.paused
        ? source.currentTime
        : handoff.time + (performance.now() - handoff.at) / 1000;

    const reveal = () => {
      if (revealed) return;
      revealed = true;
      box.style.opacity = "";
      if (warm) {
        video.volume = 1;
        autoMutedRef.current = false;
      } else {
        video.volume = 1;
        video.muted = handoff.muted;
        if (!handoff.muted) {
          autoMutedRef.current = false;
          video.play().catch(() => {
            video.muted = true;
            autoMutedRef.current = true;
            video.play().catch(() => undefined);
          });
        }
      }
      zoomOutFromScreen(box, handoff.fit);
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        finishVideoHandoff();
      };
      if (typeof video.requestVideoFrameCallback === "function") video.requestVideoFrameCallback(done);
      window.setTimeout(done, 90);
    };

    const onSeeked = () => {
      if (revealed) return;
      if (typeof video.requestVideoFrameCallback !== "function") {
        reveal();
        return;
      }
      video.requestVideoFrameCallback((_now, meta) => {
        if (revealed) return;
        const drift = gap(livePosition(), meta.mediaTime);
        if (Math.abs(drift) <= 0.035 || attempts >= 4) {
          reveal();
          return;
        }
        lead += drift;
        align();
      });
    };

    const align = () => {
      if (revealed) return;
      attempts += 1;
      video.addEventListener("seeked", onSeeked, { once: true });
      video.currentTime = wrap(livePosition() + lead);
    };

    const start = () => {
      if (started) return;
      started = true;
      video.play().catch(() => {
        if (warm) {
          warm = false;
          video.volume = 1;
          video.muted = true;
          video.play().catch(() => undefined);
        }
      });
      align();
    };

    if (video.readyState >= 1) start();
    else video.addEventListener("loadedmetadata", start, { once: true });
    const timer = window.setTimeout(reveal, 1600);

    return () => {
      window.clearTimeout(timer);
      video.removeEventListener("loadedmetadata", start);
      video.removeEventListener("seeked", onSeeked);
      if (!revealed) {
        box.style.opacity = "";
        box.style.willChange = "";
      }
    };
  }, [src, allowMotion]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || !allowMotion) return undefined;
    if (handoffRef.current) return undefined;
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
  const kind = videoKind(width, height);
  const vr = width && height ? width / height : 9 / 16;
  const boxStyle = { aspectRatio: ratio, "--vr": vr } as CSSProperties;

  return (
    <>
      {expanded ? (
        <div className={`preview-backdrop${closing ? " is-closing" : ""}`} onClick={requestClose} />
      ) : null}
      {expanded ? (
        <div className={`video-preview video-preview-ghost vr-${kind}`} ref={ghostRef} style={boxStyle} aria-hidden="true" />
      ) : null}
      <div
        className={`video-preview vr-${kind}${expanded ? " is-open" : ""}${closing ? " is-closing" : ""}`}
        ref={boxRef}
        style={boxStyle}
      >
      {expanded ? (
        <button type="button" className="video-close" onClick={requestClose} aria-label={ui.result.close}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      ) : null}
      {currentSrc ? (
        <video
          ref={videoRef}
          src={currentSrc}
          poster={poster}
          loop
          playsInline
          disableRemotePlayback
          preload="metadata"
          onError={() => {
            if (fallbackSrc && currentSrc !== fallbackSrc) {
              setCurrentSrc(fallbackSrc);
            }
          }}
          onLoadedMetadata={(event) => {
            const v = event.currentTarget;
            if (v.videoWidth && v.videoHeight) onMeasure?.(v.videoWidth, v.videoHeight);
          }}
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
        <img
          src={poster}
          alt=""
          loading="lazy"
          title={ui.result.openPreview}
          onClick={openPreview}
          onLoad={(event) => {
            const img = event.currentTarget;
            if (img.naturalWidth && img.naturalHeight) onMeasure?.(img.naturalWidth, img.naturalHeight);
          }}
        />
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

// Ukuran dari data TikTok kadang kosong/keliru (video landscape terbaca potret),
// jadi rasio preview mengikuti ukuran asli video setelah metadata terbaca.
function VideoHead({
  src,
  poster,
  width,
  height,
  allowMotion,
  fallbackSrc,
  children,
}: {
  src?: string;
  poster?: string;
  width?: number;
  height?: number;
  allowMotion: boolean;
  fallbackSrc?: string;
  children: ReactNode;
}) {
  const [measured, setMeasured] = useState<{ key: string; w: number; h: number } | null>(null);
  const key = src || poster || "";
  const m = measured && measured.key === key ? measured : null;
  const w = m?.w ?? width;
  const h = m?.h ?? height;
  return (
    <div className={`content-head is-${videoKind(w, h)}`}>
      <VideoPreview
        src={src}
        fallbackSrc={fallbackSrc}
        poster={poster}
        width={w}
        height={h}
        allowMotion={allowMotion}
        onMeasure={(mw, mh) =>
          setMeasured((prev) => (prev && prev.key === key && prev.w === mw && prev.h === mh ? prev : { key, w: mw, h: mh }))
        }
      />
      {children}
    </div>
  );
}

type DownloadState =
  | { status: "idle" }
  | { status: "downloading"; kind: "audio" | "video"; percent?: number }
  | { status: "success"; kind: "audio" | "video"; isApk?: boolean; filename?: string }
  | { status: "error"; kind: "audio" | "video"; message: string };

export function ResultView({ result }: { result: FindResult }) {
  const ui = useUi();
  const [allowMotion, setAllowMotion] = useState(true);
  const [presetLimit, setPresetLimit] = useState(3);
  const [downloadState, setDownloadState] = useState<DownloadState>({ status: "idle" });
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoError, setVideoError] = useState("");
  const [coverFailed, setCoverFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const downloadSeq = useRef(0);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSuccessTimer = useCallback(() => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
  }, []);

  const dismissDownloadState = useCallback(() => {
    clearSuccessTimer();
    setDownloadState({ status: "idle" });
    setAudioError("");
    setVideoError("");
  }, [clearSuccessTimer]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = typeof window !== "undefined" ? (window as any) : null;
    if (!win) return;

    win.onAMFinderDownloadProgress = (
      _id: number,
      kind: "audio" | "video",
      _cur: number,
      _total: number,
      percent: number
    ) => {
      setDownloadState((prev) => {
        if (prev.status === "downloading" && prev.kind === kind) {
          return { ...prev, percent: Math.max(1, Math.min(100, percent)) };
        }
        return prev;
      });
    };

    win.onAMFinderDownloadEvent = (event: {
      id: number;
      kind: "audio" | "video";
      status: "success" | "error";
      filename?: string;
      message?: string;
    }) => {
      clearSuccessTimer();
      if (event.status === "success") {
        setDownloadState({
          status: "success",
          kind: event.kind,
          isApk: true,
          filename: event.filename,
        });
        successTimerRef.current = setTimeout(() => {
          setDownloadState({ status: "idle" });
        }, 5000);
      } else {
        setDownloadState({
          status: "error",
          kind: event.kind,
          message: event.message || (event.kind === "video" ? ui.result.videoFailed : ui.result.audioFailed),
        });
      }
    };

    return () => {
      delete win.onAMFinderDownloadProgress;
      delete win.onAMFinderDownloadEvent;
    };
  }, [clearSuccessTimer, ui]);

  useEffect(() => {
    setAllowMotion(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    setPresetLimit(3);
    downloadSeq.current += 1;
    clearSuccessTimer();
    setDownloadState({ status: "idle" });
    setAudioBusy(false);
    setAudioError("");
    setVideoBusy(false);
    setVideoError("");
    setCoverFailed(false);
    setMenuOpen(false);
  }, [result, clearSuccessTimer]);

  useEffect(() => {
    return () => clearSuccessTimer();
  }, [clearSuccessTimer]);

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
  const videoId = result.videoId || ytId;
  const rawPlay = result.video?.playUrlNoWm || result.video?.playUrl;
  const rawExpired = isTikTokUrlExpired(rawPlay);
  const fallbackVideoSrc = videoId ? `/api/video/${encodeURIComponent(videoId)}` : undefined;
  const playUrl =
    !rawExpired && rawPlay
      ? rawPlay
      : fallbackVideoSrc || (ytId ? `/api/video/${encodeURIComponent(ytId)}` : undefined);
  const stats = result.video?.stats;
  const views = formatCount(stats?.views);
  const likes = formatCount(stats?.likes);
  const comments = formatCount(stats?.comments);
  const description = result.video?.description?.trim();
  const music = result.video?.music;
  const soundTitle = clipText(music?.title || result.video?.title || description || "Sound", 80);
  const soundAuthor = clipText(music?.author || result.author || result.authorDetail?.nickname || "", 60);
  const soundLink = isYt && ytId ? `https://www.youtube.com/watch?v=${ytId}` : soundPageHref(music?.id);
  const videoExternalUrl = isYt && ytId
    ? `https://www.youtube.com/watch?v=${ytId}`
    : videoId
      ? `https://www.tiktok.com/@/video/${videoId}`
      : soundLink;
  const targetExternalUrl = videoExternalUrl || soundLink;

  const handleOpenExternal = (e: React.MouseEvent) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nativeBridge = typeof window !== "undefined" ? (window as any).AMFinderNative : null;
    if (nativeBridge && typeof nativeBridge.openContent === "function") {
      e.preventDefault();
      const platform = isYt ? "youtube" : "tiktok";
      const contentId = isYt ? (ytId || "") : (videoId || "");
      nativeBridge.openContent(targetExternalUrl || "", platform, contentId);
    }
  };
  const soundAudio = soundUrl(music?.playUrl);
  const videoAudio = soundUrl(playUrl);
  const canDownloadAudio = Boolean(videoId && (soundAudio || videoAudio || isYt));
  const soundCover = soundCoverUrl(music?.cover) || (isYt ? cover : null);
  const hasSound = Boolean(soundTitle || soundAuthor || soundLink || canDownloadAudio);
  const showSoundCover = Boolean(soundCover) && !coverFailed && !(!isYt && isOwnSound(music, avatar, [result.author, result.authorDetail?.nickname, result.authorDetail?.uniqueId]));

  async function handleDownload() {
    if (!canDownloadAudio || !videoId || downloadState.status === "downloading") return;

    clearSuccessTimer();
    setMenuOpen(false);

    const rawClean = cleanSoundTitle(soundTitle || "audio", 80)
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\.{2,}/g, "_")
      .replace(/[^a-zA-Z0-9\s-_()]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 50);
    const safeFilename = `${rawClean || `audio-${videoId}`}.mp3`;

    // 1. Native bridge AMFinderNative.downloadMedia di Android APK
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nativeBridge = typeof window !== "undefined" ? (window as any).AMFinderNative : null;
    if (nativeBridge && typeof nativeBridge.downloadMedia === "function") {
      setDownloadState({ status: "downloading", kind: "audio", percent: 0 });
      const fullUrl = `${window.location.origin}/api/audio/${encodeURIComponent(videoId)}?dl=1`;
      try {
        const dlId = nativeBridge.downloadMedia(fullUrl, safeFilename, "audio/mpeg", "audio");
        if (!dlId) {
          setDownloadState({ status: "error", kind: "audio", message: ui.result.audioFailed });
        }
      } catch {
        setDownloadState({ status: "error", kind: "audio", message: ui.result.audioFailed });
      }
      return;
    }

    // 2. APK lama dengan DownloadListener tapi tanpa JS bridge downloadMedia
    if (isAndroidApp() && hasNativeDownload()) {
      setDownloadState({ status: "downloading", kind: "audio" });
      window.location.assign(`/api/audio/${encodeURIComponent(videoId)}?dl=1`);
      return;
    }

    // 3. Web Browser biasa: fetch -> blob -> <a> download
    const requestId = downloadSeq.current + 1;
    downloadSeq.current = requestId;
    setAudioBusy(true);
    setAudioError("");
    setDownloadState({ status: "downloading", kind: "audio" });
    try {
      const res = await fetch(`/api/audio/${encodeURIComponent(videoId)}`, {
        cache: "no-store",
      });
      if (downloadSeq.current !== requestId) return;
      if (!res.ok) {
        const msg = await audioErrorMessage(res, ui);
        setAudioError(msg);
        setDownloadState({ status: "error", kind: "audio", message: msg });
        return;
      }
      const blob = await res.blob();
      if (downloadSeq.current !== requestId) return;
      if (!blob.size) {
        setAudioError(ui.result.audioEmpty);
        setDownloadState({ status: "error", kind: "audio", message: ui.result.audioEmpty });
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

      setDownloadState({ status: "success", kind: "audio", isApk: false });
      successTimerRef.current = setTimeout(() => {
        setDownloadState({ status: "idle" });
      }, 5000);
    } catch (error) {
      if (downloadSeq.current !== requestId) return;
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setAudioError(ui.result.audioFailed);
        setDownloadState({ status: "error", kind: "audio", message: ui.result.audioFailed });
      } else {
        setDownloadState({ status: "idle" });
      }
    } finally {
      if (downloadSeq.current === requestId) setAudioBusy(false);
    }
  }

  const canDownloadVideo = Boolean(videoId && (playUrl || isYt));

  async function handleDownloadVideo() {
    if (!videoId || downloadState.status === "downloading") return;

    clearSuccessTimer();
    setMenuOpen(false);

    const rawClean = cleanSoundTitle(soundTitle || description || `video-${videoId}`, 80)
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\.{2,}/g, "_")
      .replace(/[^a-zA-Z0-9\s-_()]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 50);
    const safeFilename = `${rawClean || `video-${videoId}`}.mp4`;

    // 1. Native bridge AMFinderNative.downloadMedia di Android APK
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nativeBridge = typeof window !== "undefined" ? (window as any).AMFinderNative : null;
    if (nativeBridge && typeof nativeBridge.downloadMedia === "function") {
      setDownloadState({ status: "downloading", kind: "video", percent: 0 });
      const fullUrl = `${window.location.origin}/api/video/${encodeURIComponent(videoId)}?dl=1`;
      try {
        const dlId = nativeBridge.downloadMedia(fullUrl, safeFilename, "video/mp4", "video");
        if (!dlId) {
          setDownloadState({ status: "error", kind: "video", message: ui.result.videoFailed });
        }
      } catch {
        setDownloadState({ status: "error", kind: "video", message: ui.result.videoFailed });
      }
      return;
    }

    // 2. APK lama dengan DownloadListener
    if (isAndroidApp() && hasNativeDownload()) {
      setDownloadState({ status: "downloading", kind: "video" });
      window.location.assign(`/api/video/${encodeURIComponent(videoId)}?dl=1`);
      return;
    }

    // 3. Web Browser biasa: fetch -> blob -> <a> download
    const requestId = downloadSeq.current + 1;
    downloadSeq.current = requestId;
    setVideoBusy(true);
    setVideoError("");
    setDownloadState({ status: "downloading", kind: "video" });
    try {
      const res = await fetch(`/api/video/${encodeURIComponent(videoId)}?dl=1`, {
        cache: "no-store",
      });
      if (downloadSeq.current !== requestId) return;
      if (!res.ok) {
        setVideoError(ui.result.videoFailed);
        setDownloadState({ status: "error", kind: "video", message: ui.result.videoFailed });
        return;
      }
      const blob = await res.blob();
      if (downloadSeq.current !== requestId) return;
      if (!blob.size) {
        setVideoError(ui.result.videoFailed);
        setDownloadState({ status: "error", kind: "video", message: ui.result.videoFailed });
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

      setDownloadState({ status: "success", kind: "video", isApk: false });
      successTimerRef.current = setTimeout(() => {
        setDownloadState({ status: "idle" });
      }, 5000);
    } catch {
      if (downloadSeq.current !== requestId) return;
      setVideoError(ui.result.videoFailed);
      setDownloadState({ status: "error", kind: "video", message: ui.result.videoFailed });
    } finally {
      if (downloadSeq.current === requestId) setVideoBusy(false);
    }
  }

  const downloadBusy = downloadState.status === "downloading" || audioBusy || videoBusy;
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
        <strong className="state-miss-title">
          <svg className="state-miss-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M9 9l6 6M15 9l-6 6" />
          </svg>
          <span>{commentsDisabled ? ui.states.commentsDisabled : missText}</span>
        </strong>
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
        <VideoHead
          src={playUrl}
          fallbackSrc={fallbackVideoSrc}
          poster={cover}
          width={result.video?.width}
          height={result.video?.height}
          allowMotion={allowMotion}
        >
        <div className="content-main">
        {description ? <Caption text={description} /> : null}
        <dl className="meta-grid">
            <div className="meta-item">
              <dt>
                {avatar ? (
                  <img className="meta-chip meta-chip-img" src={avatar} alt="" loading="lazy" />
                ) : (
                  <span className="meta-chip" aria-hidden="true"><StatIcon name="account" size={18} /></span>
                )}
                <span className="meta-label">{ui.result.account}</span>
              </dt>
              <dd className="meta-account">
                <span>{result.author || ui.result.noAccount}</span>
              </dd>
            </div>
          {comments ? (
            <div className="meta-item">
              <dt>
                <span className="meta-chip" aria-hidden="true"><StatIcon name="comments" size={18} /></span>
                <span className="meta-label">{ui.result.comments}</span>
              </dt>
              <dd className="meta-num">{comments}</dd>
            </div>
          ) : null}
          {views ? (
            <div className="meta-item">
              <dt>
                <span className="meta-chip" aria-hidden="true"><StatIcon name="views" size={18} /></span>
                <span className="meta-label">{ui.result.views}</span>
              </dt>
              <dd className="meta-num">{views}</dd>
            </div>
          ) : null}
          {likes ? (
            <div className="meta-item">
              <dt>
                <span className="meta-chip" aria-hidden="true"><StatIcon name="likes" size={18} /></span>
                <span className="meta-label">{ui.result.likes}</span>
              </dt>
              <dd className="meta-num">{likes}</dd>
            </div>
          ) : null}
        </dl>
        </div>
        </VideoHead>
        {hasSound ? (
          <div className="sound-info">
            <div className="sound-row">
              <span
                className={`sound-icon${showSoundCover ? " has-cover" : ""}`}
                aria-hidden="true"
              >
                {showSoundCover ? (
                  <img
                    className="sound-cover"
                    src={soundCover ?? undefined}
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
                <span className="sound-sub-wrap">
                  <span className="sound-sub">
                    {soundAuthor && !soundTitle?.includes(soundAuthor) ? soundAuthor : ui.result.soundOfVideo}
                  </span>
                  <span className="sound-badges" aria-label="Format tersedia">
                    {canDownloadAudio ? <span className="sound-badge is-mp3">MP3</span> : null}
                    {canDownloadVideo ? <span className="sound-badge is-mp4">MP4</span> : null}
                  </span>
                </span>
              </span>
              {targetExternalUrl ? (
                <a
                  className="sound-btn"
                  href={targetExternalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={ui.result.openSound}
                  title={ui.result.openSound}
                  onClick={handleOpenExternal}
                >
                  <OpenIcon />
                </a>
              ) : null}
              {canDownload ? (
                <div className="sound-dl">
                  <button
                    type="button"
                    className={`sound-btn is-primary${
                      downloadState.status === "downloading" ? " is-downloading" : ""
                    }${downloadState.status === "success" ? " is-success" : ""}`}
                    onClick={handleDownloadClick}
                    disabled={downloadState.status === "downloading"}
                    aria-busy={downloadState.status === "downloading"}
                    aria-haspopup={canDownloadAudio && canDownloadVideo ? "menu" : undefined}
                    aria-expanded={canDownloadAudio && canDownloadVideo ? menuOpen : undefined}
                    aria-label={
                      downloadState.status === "downloading"
                        ? downloadState.kind === "audio"
                          ? ui.result.downloadingAudio
                          : ui.result.downloadingVideo
                        : downloadState.status === "success"
                          ? ui.result.downloadSuccess
                          : canDownloadAudio && canDownloadVideo
                            ? ui.result.downloadMenu
                            : canDownloadVideo
                              ? ui.result.downloadVideoLong
                              : ui.result.downloadAudioLong
                    }
                    title={
                      downloadState.status === "success"
                        ? ui.result.downloadSuccess
                        : canDownloadAudio && canDownloadVideo
                          ? `${ui.result.downloadMenu} (MP3 / MP4)`
                          : canDownloadVideo
                            ? ui.result.downloadVideoLong
                            : ui.result.downloadAudioLong
                    }
                  >
                    {downloadState.status === "downloading" ? (
                      <span className="spinner" aria-hidden="true" />
                    ) : downloadState.status === "success" ? (
                      <CheckIcon />
                    ) : (
                      <DownloadIcon />
                    )}
                  </button>
                  {menuOpen ? (
                    <div className="sound-menu" role="menu" aria-label={ui.result.downloadMenu}>
                      <button
                        type="button"
                        role="menuitem"
                        className="sound-menu-item"
                        onClick={() => pickDownload("video")}
                      >
                        <span className="sound-menu-icon is-video">
                          <VideoIcon />
                        </span>
                        <span className="sound-menu-details">
                          <span className="sound-menu-top">
                            <span className="sound-menu-name">{ui.result.downloadVideo}</span>
                            <span className="sound-badge is-mp4">MP4</span>
                          </span>
                          <span className="sound-menu-hint">{ui.result.downloadVideoDesc}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="sound-menu-item"
                        onClick={() => pickDownload("audio")}
                      >
                        <span className="sound-menu-icon is-audio">
                          <MusicIcon />
                        </span>
                        <span className="sound-menu-details">
                          <span className="sound-menu-top">
                            <span className="sound-menu-name">{ui.result.downloadMusic}</span>
                            <span className="sound-badge is-mp3">MP3</span>
                          </span>
                          <span className="sound-menu-hint">{ui.result.downloadAudioDesc}</span>
                        </span>
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {downloadState.status !== "idle" ? (
              <div
                className={`sound-dl-card is-${downloadState.status} is-${downloadState.kind}`}
                role="status"
                aria-live="polite"
              >
                <div className="sound-dl-card-body">
                  <div className="sound-dl-card-icon-wrap">
                    {downloadState.status === "downloading" ? (
                      downloadState.kind === "audio" ? (
                        <div className="sound-dl-equalizer" aria-label="Visualizer musik">
                          <span className="eq-bar bar-1" />
                          <span className="eq-bar bar-2" />
                          <span className="eq-bar bar-3" />
                          <span className="eq-bar bar-4" />
                        </div>
                      ) : (
                        <div className="sound-dl-pulse-icon" aria-label="Video downloading">
                          <VideoIcon />
                        </div>
                      )
                    ) : downloadState.status === "success" ? (
                      <div className="sound-dl-check-icon" aria-label="Berhasil">
                        <CheckIcon />
                      </div>
                    ) : (
                      <div className="sound-dl-error-icon" aria-label="Gagal">
                        <AlertIcon />
                      </div>
                    )}
                  </div>

                  <div className="sound-dl-card-content">
                    <div className="sound-dl-card-title-row">
                      <span className="sound-dl-card-title">
                        {downloadState.status === "downloading"
                          ? downloadState.kind === "audio"
                            ? ui.result.downloadingAudio
                            : ui.result.downloadingVideo
                          : downloadState.status === "success"
                            ? ui.result.downloadSuccess
                            : ui.result.downloadErrorTitle}
                      </span>
                      <span className={`sound-badge is-${downloadState.kind}`}>
                        {downloadState.kind === "audio" ? "MP3" : "MP4"}
                      </span>
                    </div>

                    <p className="sound-dl-card-desc">
                      {downloadState.status === "downloading"
                        ? typeof downloadState.percent === "number" && downloadState.percent > 0
                          ? `${downloadState.percent}% - ${isAndroidApp() ? (downloadState.kind === "audio" ? ui.result.downloadingAudio : ui.result.downloadingVideo) : ui.result.downloadProgressText}`
                          : isAndroidApp()
                            ? ui.result.downloadApkStarting
                            : ui.result.downloadProgressText
                        : downloadState.status === "success"
                          ? downloadState.kind === "audio"
                            ? ui.result.downloadSuccessAudioDesc
                            : ui.result.downloadSuccessVideoDesc
                          : downloadState.message}
                      {downloadState.status === "error" && downloadState.kind === "audio" && soundAudio ? (
                        <>
                          {" "}
                          <a href={soundAudio} target="_blank" rel="noopener noreferrer">
                            {ui.result.openAudio}
                          </a>
                        </>
                      ) : null}
                    </p>

                    {downloadState.status === "downloading" ? (
                      <div className="sound-dl-progress-bar" aria-hidden="true">
                        <div
                          className="sound-dl-progress-fill"
                          style={
                            typeof downloadState.percent === "number" && downloadState.percent > 0
                              ? { width: `${downloadState.percent}%`, animation: "none" }
                              : undefined
                          }
                        />
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    className="sound-dl-card-close"
                    onClick={dismissDownloadState}
                    aria-label={ui.result.close}
                    title={ui.result.close}
                  >
                    <CloseIcon />
                  </button>
                </div>
              </div>
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
              const sourceName =
                preset.source === "saluran WA" || preset.source === "saluran"
                  ? "Saluran WA"
                  : preset.source === "telegram"
                    ? "Telegram"
                    : null;
              const metaBits = [
                sourceName,
                preset.size,
                preset.pinned ? ui.result.pinned : null,
                preset.byAuthor ? ui.result.byAccount : null,
              ].filter(Boolean);
              const metaText = metaBits.join(" · ");

              return (
                <article className="preset-row" key={`${preset.type}-${preset.url}`}>
                  <div className="preset-top">
                    <PresetThumb preset={preset} />

                    <div className="preset-body">
                      <h3 className="preset-title">{presetLabel(preset, ui)}</h3>
                      <div className="preset-meta-line">
                        <span className="badge badge-type">{presetTypeLabel(preset)}</span>
                        {metaText ? <span className="preset-meta-text">{metaText}</span> : null}
                      </div>
                      {preset.detail ? <p className="preset-detail">{preset.detail}</p> : null}

                      <div className="preset-field">
                        <span className="preset-field-url" title={preset.url}>
                          {preset.url}
                        </span>
                        <CopyButton url={preset.url} variant="icon" />
                      </div>
                    </div>
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
