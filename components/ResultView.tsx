"use client";

import { useState } from "react";
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

export function ResultView({ result }: { result: FindResult }) {
  const presets = result.presetLinks ?? [];
  const stats = result.video?.stats;
  const views = formatCount(stats?.views);
  const likes = formatCount(stats?.likes);
  const comments = formatCount(stats?.comments);
  const description = result.video?.description?.trim();

  return (
    <>
      <section className="video-meta" aria-label="Video data">
        <dl className="meta-grid">
          <div className="meta-item">
            <dt>Account</dt>
            <dd>{result.author || "no account"}</dd>
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
        {description ? <p className="meta-desc">{description}</p> : null}
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
