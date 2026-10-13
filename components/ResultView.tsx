"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FindResult, PresetLink } from "@/lib/types";
import { SectionOrnament } from "@/components/Ornament";
import { TelegramIcon, WhatsAppIcon } from "@/components/ShareIcons";
import { ui } from "@/lib/ui";

type ShareLink = NonNullable<FindResult["shareLinks"]>[number];

function shareLabel(share: ShareLink): string {
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

function ratioBox(ratio?: string) {
  const m = ratio?.match(/^(\d{1,3}):(\d{1,3})$/);
  const max = 60;
  if (!m) return { w: max, h: max };
  const rw = Number(m[1]);
  const rh = Number(m[2]);
  if (rw >= rh) return { w: max, h: Math.max(16, Math.round((max * rh) / rw)) };
  return { w: Math.max(16, Math.round((max * rw) / rh)), h: max };
}

function presetLabel(preset: PresetLink): string {
  if (preset.title) return preset.title;
  return preset.type === "5mb" ? "5MB preset" : "XML file";
}

function presetTypeLabel(preset: PresetLink): string {
  return preset.type === "5mb" ? "5MB" : "XML";
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

function OpenIcon() {
  return (
    <svg className="btn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
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

function CopyButton({ url }: { url: string }) {
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

function flipTransform(from: DOMRect, to: DOMRect) {
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const scale = from.width / to.width;
  return `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${scale})`;
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
  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const firstRectRef = useRef<DOMRect | null>(null);
  const closingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);

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
    const animation = box.animate(
      [{ transform: "translate(-50%, -50%) scale(1)" }, { transform: flipTransform(slot, current) }],
      { duration: 220, easing: EASE_CLOSE, fill: "forwards" },
    );
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
      if (typeof box.getAnimations === "function") box.getAnimations().forEach((animation) => animation.cancel());
      return;
    }
    const first = firstRectRef.current;
    firstRectRef.current = null;
    if (!first || typeof box.animate !== "function" || prefersReducedMotion()) return;
    const last = box.getBoundingClientRect();
    if (!last.width) return;
    box.animate(
      [{ transform: flipTransform(first, last) }, { transform: "translate(-50%, -50%) scale(1)" }],
      { duration: 280, easing: EASE_OPEN },
    );
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

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || !allowMotion) return;
    const attempt = video.play();
    if (attempt && typeof attempt.catch === "function") attempt.catch(() => undefined);
  }, [src, allowMotion]);

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
        className={`video-preview${expanded ? " is-open" : ""}`}
        ref={boxRef}
        style={{ aspectRatio: ratio }}
      >
      {expanded ? (
        <button type="button" className="video-close" onClick={requestClose} aria-label="Close">
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
          autoPlay={allowMotion}
          loop
          playsInline
          disableRemotePlayback
          preload="metadata"
          aria-label={expanded ? (playing ? "Pause video" : "Play video") : "Open preview"}
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
          onTimeUpdate={(event) => {
            const video = event.currentTarget;
            if (fillRef.current && video.duration) {
              fillRef.current.style.width = `${(video.currentTime / video.duration) * 100}%`;
            }
          }}
        />
      ) : (
        <img src={poster} alt="" loading="lazy" title="Open preview" onClick={openPreview} />
      )}
      {src ? (
        <>
          <div className="video-progress" aria-hidden="true">
            <span ref={fillRef} />
          </div>
          {!playing ? (
            <div className="video-center-play" aria-hidden="true">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 4.8 19 12 8 19.2z" />
              </svg>
            </div>
          ) : null}
          {!expanded ? (
            <button type="button" className="video-expand" onClick={openPreview} aria-label="Expand">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 3h6v6" />
                <path d="M9 21H3v-6" />
                <path d="M21 3l-7 7" />
                <path d="M3 21l7-7" />
              </svg>
            </button>
          ) : null}
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
  const [allowMotion, setAllowMotion] = useState(true);
  const [presetLimit, setPresetLimit] = useState(3);

  useEffect(() => {
    setAllowMotion(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    setPresetLimit(3);
  }, [result]);

  const presets = result.presetLinks ?? [];
  const avatar = result.authorDetail?.avatar;
  const cover = result.video?.cover;
  const playUrl = result.video?.playUrlNoWm || result.video?.playUrl;
  const stats = result.video?.stats;
  const views = formatCount(stats?.views);
  const likes = formatCount(stats?.likes);
  const comments = formatCount(stats?.comments);
  const description = result.video?.description?.trim();

  const commentsDisabled = result.checked?.commentsDisabled === true;
  const missText =
    result.shareLinks?.length || result.checked?.context !== "none"
      ? ui.states.noLink
      : ui.states.notFound;

  if (presets.length === 0) {
    const shares = result.shareLinks ?? [];
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
                  <span className="share-label">{shareLabel(share)}</span>
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
      <section className="video-meta" aria-label="Content info">
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
              <dt>Account</dt>
              <dd className="meta-account">
                {avatar ? <img className="meta-avatar" src={avatar} alt="" loading="lazy" /> : null}
                <span>{result.author || "no account"}</span>
              </dd>
            </div>
          {comments ? (
            <div className="meta-item">
              <dt>Comments</dt>
              <dd>{comments}</dd>
            </div>
          ) : null}
          {views ? (
            <div className="meta-item">
              <dt>Views</dt>
              <dd>{views}</dd>
            </div>
          ) : null}
          {likes ? (
            <div className="meta-item">
              <dt>Likes</dt>
              <dd>{likes}</dd>
            </div>
          ) : null}
        </dl>
        </div>
        </div>
      </section>

      <section className="preset-section" aria-label="Preset links">
          <div className="section-head">
            <h2 className="section-title">
              <span className="section-ornament" aria-hidden="true">
                <SectionOrnament />
              </span>
              Preset links
              <span className="badge badge-type section-count">{presets.length}</span>
            </h2>
          </div>

          <div className="preset-list">
            {presets.slice(0, presetLimit).map((preset) => {
              return (
                <article className="preset-row" key={`${preset.type}-${preset.url}`}>
                  <PresetThumb preset={preset} />

                  <div className="preset-body">
                    <h3 className="preset-title">{presetLabel(preset)}</h3>
                    <div className="preset-badges">
                      <span className="badge badge-type">{presetTypeLabel(preset)}</span>
                      {preset.size ? <span className="badge">{preset.size}</span> : null}
                      {preset.pinned ? <span className="badge">pinned</span> : null}
                      {preset.byAuthor ? <span className="badge">by this account</span> : null}
                    </div>
                    {preset.detail ? <p className="preset-detail">{preset.detail}</p> : null}
                    <p className="preset-url">{preset.url}</p>
                    <div className="preset-actions">
                      <a className="btn-open" href={preset.url} target="_blank" rel="noopener noreferrer">
                        {preset.type === "5mb" ? <OpenIcon /> : <DownloadIcon />}
                        {preset.type === "5mb" ? ui.buttons.openPreset : ui.buttons.openFile}
                      </a>
                      <CopyButton url={preset.url} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {presets.length > presetLimit && (
            <button
              type="button"
              onClick={() => setPresetLimit((limit) => limit + 3)}
              style={{
                width: "100%",
                height: 48,
                marginTop: 4,
                borderRadius: 14,
                background: "#17171A",
                border: "1px solid #2C2C33",
                color: "#05FAA8",
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
    </>
  );
}
