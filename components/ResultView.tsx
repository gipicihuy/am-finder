"use client";

import { useState } from "react";
import type { FindResult, PresetLink } from "@/lib/types";
import { SectionOrnament } from "@/components/Ornament";
import { ui } from "@/lib/ui";

function sourceLabel(source?: string): string | null {
  if (!source) return null;
  if (source === "description") return "dari deskripsi";
  if (source === "bio") return "dari bio akun";
  if (source === "bioLink") return "dari link bio";
  if (source.startsWith("comment")) return source.includes("pinned") ? "komentar di-pin" : "komentar";
  if (source === "redirect") return "hasil redirect";
  return source;
}

function formatCount(value?: number | null): string | null {
  if (value === null || value === undefined) return null;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} jt`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} rb`;
  return String(value);
}

function presetLabel(preset: PresetLink): string {
  if (preset.title) return preset.title;
  return preset.type === "5mb" ? "Preset 5MB" : "File XML";
}

function presetTypeLabel(preset: PresetLink): string {
  return preset.type === "5mb" ? "5MB link" : "XML";
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
  const others = result.otherLinks ?? [];
  const stats = result.video?.stats;
  const views = formatCount(stats?.views);
  const likes = formatCount(stats?.likes);
  const comments = formatCount(stats?.comments);
  const description = result.video?.description?.trim();

  return (
    <>
      <section className="video-meta" aria-label="Data video">
        <dl className="meta-grid">
          <div className="meta-item">
            <dt>Akun</dt>
            <dd>{result.author || "tanpa akun"}</dd>
          </div>
          {comments ? (
            <div className="meta-item">
              <dt>Komentar</dt>
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
        <section aria-label="Link preset">
          <div className="section-head">
            <h2 className="section-title">
              <span className="section-ornament" aria-hidden="true">
                <SectionOrnament />
              </span>
              Link preset
            </h2>
            <span className="section-note">{presets.length} link</span>
          </div>

          <div className="preset-list">
            {presets.map((preset) => {
              const source = sourceLabel(preset.source);
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
                      {source ? <span className="badge">{source}</span> : null}
                      {preset.size ? <span className="badge">{preset.size}</span> : null}
                      {preset.pinned ? <span className="badge">di-pin</span> : null}
                      {preset.byAuthor ? <span className="badge">dari akun ini</span> : null}
                    </div>
                    <p className="preset-url">{preset.detail ? `${preset.detail} · ` : ""}{preset.url}</p>
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
        <div className="state">
          <strong>{ui.states.notFound}</strong>
          {others.length > 0 ? (
            <>
              Link lain yang ikut terkumpul:
              <ul>
                {others.map((item) => (
                  <li key={item.url}>
                    <a href={item.url} target="_blank" rel="noopener noreferrer">
                      {item.url}
                    </a>
                    {item.source ? ` (${sourceLabel(item.source) ?? item.source})` : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      )}
    </>
  );
}
