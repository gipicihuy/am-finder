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

function historyTime(entry: HistoryEntry, locale: Locale, ui: ReturnType<typeof useUi>): string {
  if (!entry.at) return ui.history.earlier;
  const date = new Date(entry.at);
  if (Number.isNaN(date.getTime())) return ui.history.earlier;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((today - day) / 86_400_000);
  const clock = CLOCK_FORMAT[locale].format(date);

  if (days === 0) return `${ui.history.today} · ${clock}`;
  if (days === 1) return `${ui.history.yesterday} · ${clock}`;
  if (days > 1 && days < 7) return `${format(ui.history.daysAgo, { count: days })} · ${clock}`;

  const sameYear = date.getFullYear() === now.getFullYear();
  const dateStr = (sameYear ? DATE_FORMAT : DATE_YEAR_FORMAT)[locale].format(date);

  return `${dateStr} · ${clock}`;
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
  if (status === "missing") return ui.history.notFound;
  return ui.history.unknown;
}

function CardThumb({
  entry,
  status,
  ui,
  locale,
}: {
  entry: HistoryEntry;
  status: Status;
  ui: ReturnType<typeof useUi>;
  locale: Locale;
}) {
  const ytId = entry.videoId && entry.source === "youtube" ? entry.videoId : youtubeId(entry.url);
  const fallbackThumb = ytId ? `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg` : undefined;
  const resolvedThumb = entry.thumb || fallbackThumb;

  const [imgFailed, setImgFailed] = useState(false);

  return (
    <span className={`history-thumb is-${status}`}>
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
      <span className="history-thumb-shade" aria-hidden="true" />
      <span className={`history-badge is-${status}`}>{statusLabel(entry, ui)}</span>
      <span className="history-time">
        <ClockIcon />
        <span>{historyTime(entry, locale, ui)}</span>
      </span>
    </span>
  );
}

function CardBody({ entry, locale, ui }: { entry: HistoryEntry; locale: Locale; ui: ReturnType<typeof useUi> }) {
  const status = statusOf(entry);
  const author = entry.author?.replace(/^@/, "");
  return (
    <>
      <CardThumb entry={entry} status={status} ui={ui} locale={locale} />
      <span className="history-card-title">{entry.title || entry.url}</span>
      {author ? <span className="history-card-sub">@{author}</span> : null}
    </>
  );
}

function HistoryCard({ entry, locale, ui }: { entry: HistoryEntry; locale: Locale; ui: ReturnType<typeof useUi> }) {
  const isMissing = entry.found === false;
  const href = isMissing ? null : entry.detailPath || entry.url;
  const label = format(ui.history.openLabel, { title: entry.title || entry.url });
  const body = <CardBody entry={entry} locale={locale} ui={ui} />;

  // Video yang presetnya tidak ketemu tetap disimpan di histori, tapi jangan
  // bisa diklik ke halaman detail. Tidak ada yang perlu dibuka di sana.
  if (!href) {
    return <div className="history-card is-disabled">{body}</div>;
  }

  if (href.startsWith("/")) {
    return (
      <Link className="history-card" href={href} aria-label={label}>
        {body}
      </Link>
    );
  }
  return (
    <a className="history-card" href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
      {body}
    </a>
  );
}

function HistorySkeleton() {
  return (
    <div className="history-grid" aria-hidden="true">
      {[0, 1, 2, 3].map((item) => (
        <div className="history-card history-card-skeleton" key={item}>
          <span className="history-thumb history-thumb-skeleton" />
          <span className="history-line history-line-title" />
          <span className="history-line history-line-sub" />
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

  const filtered = useMemo(() => {
    if (filter === "found") return entries.filter((entry) => entry.found === true);
    if (filter === "missing") return entries.filter((entry) => entry.found === false);
    return entries;
  }, [entries, filter]);
  const shown = filtered.slice(0, visible);

  useEffect(() => {
    setVisible(HISTORY_PAGE_SIZE);
  }, [filter]);

  return (
    <section className="history-page" aria-labelledby="history-title">
      <div className="history-head">
        <div className="history-head-main">
          <h1 className="page-title history-title" id="history-title">
            <span className="section-ornament" aria-hidden="true">
              <SectionOrnament />
            </span>
            {ui.history.title}
          </h1>
          <p className="history-tagline">{ui.history.tagline}</p>
        </div>
        <span className="history-count">{format(ui.history.count, { count: entries.length })}</span>
      </div>

      <div className="history-filters" role="group" aria-label={ui.history.filtersLabel}>
        {([
          ["all", ui.history.all],
          ["found", ui.history.found],
          ["missing", ui.history.notFound],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`history-filter${filter === value ? " is-active" : ""}`}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
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
        <div className="history-grid">
          {shown.map((entry) => (
            <HistoryCard key={entry.url} entry={entry} locale={locale} ui={ui} />
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
