"use client";

import { useEffect, useRef, useState } from "react";
import type { FindResult, PresetLink } from "@/lib/types";
import { SectionOrnament } from "@/components/Ornament";
import { ui } from "@/lib/ui";

function formatCount(value?: number | null): string | null {
  if (value === null || value === undefined) return null;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} K`;
  return String(value);
}

function presetLabel(preset: PresetLink): string {
  if (preset.title) return preset.title;
  return preset.type === "5mb" ? "5MB preset" : "XML file";
}

function presetTypeLabel(preset: PresetLink): string {
  return preset.type === "5mb" ? "5MB" : "XML";
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
      {src ? (
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          autoPlay={allowMotion}
          loop
          playsInline
          preload="metadata"
          aria-label="Video preview"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
      ) : (
        <img src={poster} alt="" loading="lazy" />
      )}
      <div className="video-tools">
        {src ? (
          <>
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
                  <path d="M15 9a4.5 4.5 0 0 1 0 6" />
                )}
              </svg>
            </button>
            {expanded ? (
              <button type="button" onClick={() => setExpanded(false)} aria-label="Close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            ) : (
              <button type="button" onClick={() => setExpanded(true)} aria-label="Expand">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
                </svg>
              </button>
            )}
          </>
        ) : null}
        </div>
      </div>
    </>
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
  const playUrl = result.video?.playUrl;
  const stats = result.video?.stats;
  const views = formatCount(stats?.views);
  const likes = formatCount(stats?.likes);
  const comments = formatCount(stats?.comments);
  const description = result.video?.description?.trim();

  return (
    <>
      <section className="video-meta" aria-label="Content info">
        <VideoPreview
          src={playUrl}
          poster={cover}
          width={result.video?.width}
          height={result.video?.height}
          allowMotion={allowMotion}
        />
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
      </section>

      {presets.length > 0 ? (
        <section aria-label="Preset links">
          <div className="section-head">
            <h2 className="section-title">
              <span className="section-ornament" aria-hidden="true">
                <SectionOrnament />
              </span>
              Preset links ({presets.length})
            </h2>
          </div>

          <div className="preset-list">
            {presets.map((preset) => {
              return (
                <article className="preset-row" key={`${preset.type}-${preset.url}`}>
                  {preset.thumb ? (
                    <img className="preset-thumb" src={preset.thumb} alt="" loading="lazy" />
                  ) : (
                    <span className="preset-thumb preset-thumb-ph" aria-hidden="true">
                      {preset.type === "5mb" ? "5MB" : "XML"}
                    </span>
                  )}

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
      ) : (
        <div className="state state-miss" role="status">
          <strong>❌ {ui.states.notFound}</strong>
        </div>
      )}
    </>
  );
}
