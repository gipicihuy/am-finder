"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
      {done ? ui.buttons.copied : ui.buttons.copy}
    </button>
  );
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
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [expanded]);

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

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }

  if (!src && !poster) return null;

  const ratio = width && height ? `${width} / ${height}` : "9 / 16";

  return (
    <>
      {expanded ? <div className="preview-backdrop" onClick={() => setExpanded(false)} /> : null}
      <div
        className={`video-preview${expanded ? " is-open" : ""}`}
        ref={boxRef}
        style={{ aspectRatio: ratio }}
      >
      {expanded ? (
        <button type="button" className="video-close" onClick={() => setExpanded(false)} aria-label="Close">
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
          aria-label="Video preview"
          title="Open preview"
          onClick={() => {
            if (!expanded) setExpanded(true);
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
        <img src={poster} alt="" loading="lazy" title="Open preview" onClick={() => setExpanded(true)} />
      )}
      {src ? (
        <>
          <div className="video-progress" aria-hidden="true">
            <span ref={fillRef} />
          </div>
          <div className="video-tools">
            <button type="button" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
              {playing ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M7 4.5h3.4v15H7zM13.6 4.5H17v15h-3.4z" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M7.5 4.5 18 12 7.5 19.5z" />
                </svg>
              )}
            </button>
            <button type="button" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 9.5v5h3.2L11 18V6L7.2 9.5H4z" fill="currentColor" stroke="none" />
                {muted ? (
                  <path d="M15 9.5l5 5M20 9.5l-5 5" />
                ) : (
                  <>
                    <path d="M14.5 9.5a3.4 3.4 0 0 1 0 5" />
                    <path d="M17 7.5a6.6 6.6 0 0 1 0 9" />
                  </>
                )}
              </svg>
            </button>
          </div>
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

  useEffect(() => {
    setAllowMotion(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const presets = result.presetLinks ?? [];
  const avatar = result.authorDetail?.avatar;
  const cover = result.video?.cover;
  const playUrl = result.video?.playUrlNoWm || result.video?.playUrl;
  const stats = result.video?.stats;
  const views = formatCount(stats?.views);
  const likes = formatCount(stats?.likes);
  const comments = formatCount(stats?.comments);
  const description = result.video?.description?.trim();

  const missText =
    result.shareLinks?.length || result.checked?.context !== "none"
      ? ui.states.noLink
      : ui.states.notFound;

  if (presets.length === 0) {
    const shares = result.shareLinks ?? [];
    return (
      <div className="state state-miss" role="status">
        <strong>❌ {missText}</strong>
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
            {presets.map((preset) => {
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
                        {preset.type === "5mb" ? ui.buttons.openPreset : ui.buttons.openFile}
                      </a>
                      <CopyButton url={preset.url} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
      </section>
    </>
  );
}
