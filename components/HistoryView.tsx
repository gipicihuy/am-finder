"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useUi } from "@/components/LocaleProvider";
import { SectionOrnament } from "@/components/Ornament";
import { format, type Locale } from "@/lib/i18n";
import {
  HISTORY_UPDATED_EVENT,
  readHistoryEntries,
  type HistoryEntry,
} from "@/lib/history";
import { youtubeId } from "@/lib/tiktok-link";

type Filter = "all" | "found" | "missing";
type Status = "found" | "missing" | "unknown";

const INTL_LOCALE: Record<Locale, string> = {
  id: "id-ID",
  en: "en-US",
  zh: "zh-CN",
};

const HISTORY_PAGE_SIZE = 12;

// Intl.DateTimeFormat mahal kalau dibuat ulang untuk tiap kartu. Bikin sekali
// per locale, lalu pakai ulang di semua render.
const CLOCK_FORMAT: Record<Locale, Intl.DateTimeFormat> = {
  id: new Intl.DateTimeFormat(INTL_LOCALE.id, { hour: "2-digit", minute: "2-digit", hour12: false }),
  en: new Intl.DateTimeFormat(INTL_LOCALE.en, { hour: "2-digit", minute: "2-digit", hour12: false }),
  zh: new Intl.DateTimeFormat(INTL_LOCALE.zh, { hour: "2-digit", minute: "2-digit", hour12: false }),
};

const DATE_FORMAT: Record<Locale, Intl.DateTimeFormat> = {
  id: new Intl.DateTimeFormat(INTL_LOCALE.id, { day: "numeric", month: "short" }),
  en: new Intl.DateTimeFormat(INTL_LOCALE.en, { day: "numeric", month: "short" }),
  zh: new Intl.DateTimeFormat(INTL_LOCALE.zh, { day: "numeric", month: "short" }),
};

const DATE_YEAR_FORMAT: Record<Locale, Intl.DateTimeFormat> = {
  id: new Intl.DateTimeFormat(INTL_LOCALE.id, { day: "numeric", month: "short", year: "numeric" }),
  en: new Intl.DateTimeFormat(INTL_LOCALE.en, { day: "numeric", month: "short", year: "numeric" }),
  zh: new Intl.DateTimeFormat(INTL_LOCALE.zh, { day: "numeric", month: "short", year: "numeric" }),
};

function statusOf(entry: HistoryEntry): Status {
  if (entry.found === true) return "found";
  if (entry.found === false) return "missing";
  return "unknown";
}

function dayLabel(entry: HistoryEntry, locale: Locale, ui: ReturnType<typeof useUi>): string {
  if (!entry.at) return ui.history.earlier;
  const date = new Date(entry.at);
  if (Number.isNaN(date.getTime())) return ui.history.earlier;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((today - day) / 86_400_000);

  if (days <= 0) return ui.history.today;
  if (days === 1) return ui.history.yesterday;
  if (days < 7) return format(ui.history.daysAgo, { count: days });

  const sameYear = date.getFullYear() === now.getFullYear();
  return (sameYear ? DATE_FORMAT : DATE_YEAR_FORMAT)[locale].format(date);
}

function clockOf(entry: HistoryEntry, locale: Locale): string {
  if (!entry.at) return "";
  const date = new Date(entry.at);
  if (Number.isNaN(date.getTime())) return "";
  return CLOCK_FORMAT[locale].format(date);
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6.5v11l8-5.5z" />
    </svg>
  );
}

function statusLabel(entry: HistoryEntry, ui: ReturnType<typeof useUi>): string {
  const status = statusOf(entry);
  if (status === "found") return format(ui.history.presetCount, { count: entry.presetCount });
  if (status === "missing") return ui.history.none;
  return ui.history.unknown;
}

function RowThumb({ entry }: { entry: HistoryEntry }) {
  const ytId = entry.videoId && entry.source === "youtube" ? entry.videoId : youtubeId(entry.url);
  const fallbackThumb = ytId ? `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg` : undefined;
  const resolvedThumb = entry.thumb || fallbackThumb;

  const [imgFailed, setImgFailed] = useState(false);

  return (
    <span className="history-thumb">
      {resolvedThumb && !imgFailed ? (
        <img
          src={resolvedThumb}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className="history-thumb-fallback" aria-hidden="true">
          <PlayIcon />
        </span>
      )}
    </span>
  );
}

function RowBody({ entry, locale, ui }: { entry: HistoryEntry; locale: Locale; ui: ReturnType<typeof useUi> }) {
  const status = statusOf(entry);
  const author = entry.author?.replace(/^@/, "");
  const meta = [author ? `@${author}` : "", clockOf(entry, locale)].filter(Boolean).join(" · ");
  return (
    <>
      <RowThumb entry={entry} />
      <span className="history-row-main">
        <span className="history-row-title">{entry.title || entry.url}</span>
        {meta ? <span className="history-row-meta">{meta}</span> : null}
      </span>
      <span className={`history-pill is-${status}`}>{statusLabel(entry, ui)}</span>
    </>
  );
}

function HistoryRow({ entry, locale, ui }: { entry: HistoryEntry; locale: Locale; ui: ReturnType<typeof useUi> }) {
  const isMissing = entry.found === false;
  const href = isMissing ? null : entry.detailPath || entry.url;
  const label = format(ui.history.openLabel, { title: entry.title || entry.url });
  const body = <RowBody entry={entry} locale={locale} ui={ui} />;

  // Video yang presetnya tidak ketemu tetap disimpan di histori, tapi jangan
  // bisa diklik ke halaman detail. Tidak ada yang perlu dibuka di sana.
  if (!href) {
    return <div className="history-row is-disabled">{body}</div>;
  }

  if (href.startsWith("/")) {
    return (
      <Link className="history-row" href={href} aria-label={label}>
        {body}
      </Link>
    );
  }
  return (
    <a className="history-row" href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
      {body}
    </a>
  );
}

function HistorySkeleton() {
  return (
    <div className="history-list" aria-hidden="true">
      {[0, 1, 2, 3].map((item) => (
        <div className="history-row history-row-skeleton" key={item}>
          <span className="history-thumb history-skeleton-block" />
          <span className="history-row-main">
            <span className="history-line history-line-title" />
            <span className="history-line history-line-sub" />
          </span>
          <span className="history-pill history-skeleton-block history-pill-skeleton" />
        </div>
      ))}
    </div>
  );
}

export function HistoryView() {
  const ui = useUi();
  const { locale } = useLocale();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [visible, setVisible] = useState(HISTORY_PAGE_SIZE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const sync = () => setEntries(readHistoryEntries());
    sync();
    setLoaded(true);
    window.addEventListener("storage", sync);
    window.addEventListener(HISTORY_UPDATED_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(HISTORY_UPDATED_EVENT, sync);
    };
  }, []);

  const counts = useMemo(
    () => ({
      all: entries.length,
      found: entries.filter((entry) => entry.found === true).length,
      missing: entries.filter((entry) => entry.found === false).length,
    }),
    [entries],
  );

  const filtered = useMemo(() => {
    if (filter === "found") return entries.filter((entry) => entry.found === true);
    if (filter === "missing") return entries.filter((entry) => entry.found === false);
    return entries;
  }, [entries, filter]);
  const shown = filtered.slice(0, visible);

  // Kelompokkan per hari (entri sudah urut terbaru dulu).
  const groups: { label: string; items: HistoryEntry[] }[] = [];
  for (const entry of shown) {
    const label = dayLabel(entry, locale, ui);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(entry);
    else groups.push({ label, items: [entry] });
  }

  useEffect(() => {
    setVisible(HISTORY_PAGE_SIZE);
  }, [filter]);

  return (
    <section className="history-page" aria-labelledby="history-title">
      <h1 className="page-title history-title" id="history-title">
        <span className="section-ornament" aria-hidden="true">
          <SectionOrnament />
        </span>
        {ui.history.title}
        {loaded && counts.all > 0 ? (
          <span className="history-title-count" aria-label={format(ui.history.count, { count: counts.all })}>
            {counts.all}
          </span>
        ) : null}
      </h1>

      <div className="history-filters" role="group" aria-label={ui.history.filtersLabel}>
        {([
          ["all", ui.history.all, counts.all],
          ["found", ui.history.found, counts.found],
          ["missing", ui.history.none, counts.missing],
        ] as const).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            className={`history-filter${filter === value ? " is-active" : ""}`}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label} {count}
          </button>
        ))}
      </div>

      {!loaded ? <HistorySkeleton /> : null}

      {loaded && filtered.length === 0 ? (
        <div className="history-empty">
          <span className="history-empty-icon" aria-hidden="true">
            <ClockIcon />
          </span>
          <strong>{ui.history.emptyTitle}</strong>
          <p>{ui.history.emptyText}</p>
          <Link className="btn-primary" href="/">
            {ui.history.emptyAction}
          </Link>
        </div>
      ) : null}

      {loaded && filtered.length > 0 ? (
        <div className="history-list">
          {groups.map((group) => (
            <section className="history-group" key={group.label} aria-label={group.label}>
              <h2 className="history-group-label">{group.label}</h2>
              {group.items.map((entry) => (
                <HistoryRow key={entry.url} entry={entry} locale={locale} ui={ui} />
              ))}
            </section>
          ))}
        </div>
      ) : null}

      {loaded && filtered.length > visible ? (
        <div className="history-more">
          <button
            type="button"
            className="btn-show-more"
            onClick={() => setVisible((current) => current + HISTORY_PAGE_SIZE)}
          >
            {ui.history.showMore}
          </button>
        </div>
      ) : null}
    </section>
  );
}
