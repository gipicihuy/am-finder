import Link from "next/link";
import { SectionOrnament } from "@/components/Ornament";
import { ui } from "@/lib/ui";
import {
  donorColor,
  donorInitials,
  formatDate,
  formatRupiah,
  type Donatur,
  type DonaturSummary,
} from "@/lib/donatur";

const text = ui.donatur;
const TOP_VISIBLE = 8;

function Avatar({ name }: { name: string }) {
  return (
    <span
      className="dt-avatar"
      style={{ ["--dt-avatar-bg" as string]: donorColor(name) }}
      aria-hidden="true"
    >
      {donorInitials(name)}
    </span>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="dt-stat">
      <span className="dt-stat-value">{value}</span>
      <span className="dt-stat-label">{label}</span>
    </div>
  );
}

function ChevronRight() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7.5 4.5 13 10l-5.5 5.5" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className="dt-heart"
    >
      <path d="M12 21s-7.5-4.7-9.6-9A5.4 5.4 0 0 1 12 6.2 5.4 5.4 0 0 1 21.6 12c-2.1 4.3-9.6 9-9.6 9z" />
    </svg>
  );
}

/**
 * Kartu top donor — struktur .top-donation-card di sankanime.web.id:
 * vertikal rata tengah, avatar bulat di atas, lalu nama, tanggal, nominal.
 * Peringkat pertama mendapat mahkota melayang, border emas, dan "⭐ Donasi Teratas".
 */
function TopCard({ donator, rank, showCrown }: { donator: Donatur; rank: number; showCrown: boolean }) {
  return (
    <li className={`dt-card${showCrown ? " is-winner" : ""}`}>
      {showCrown ? (
        <span className="dt-crown" aria-hidden="true">
          👑
        </span>
      ) : null}
      <Avatar name={donator.name} />
      <div className="dt-card-text">
        <p className="dt-card-name">{donator.name}</p>
        {donator.date ? <time className="dt-card-date">{formatDate(donator.date)}</time> : null}
        <p className="dt-card-amount">{formatRupiah(donator.amount)}</p>
        {showCrown ? <p className="dt-card-star">{text.topDonation}</p> : null}
      </div>
      <span className="dt-card-rank" aria-hidden="true">
        {rank}
      </span>
    </li>
  );
}

/** Tabel donatur: grid [1fr auto auto] dengan header sticky, sama seperti sankanime. */
function DonaturTable({ items, empty }: { items: Donatur[]; empty: React.ReactNode }) {
  if (!items.length) {
    return (
      <div className="dt-table-empty">
        <HeartIcon />
        <span>
          {text.emptyMonthly} <strong>{text.emptyMonthlyCta}</strong>
        </span>
      </div>
    );
  }

  return (
    <div className="dt-table-scroll">
      <div className="dt-table">
        <div className="dt-table-head">
          <span>{text.colName}</span>
          <span className="dt-num">{text.colAmount}</span>
          <span className="dt-num">{text.colDate}</span>
        </div>
        {items.map((donator) => (
          <div className="dt-table-row" key={donator.id}>
            <div className="dt-table-name-cell">
              <span className="dt-table-name">{donator.name}</span>
              {donator.message ? <p className="dt-table-message">{donator.message}</p> : null}
            </div>
            <span className="dt-num dt-table-amount">{formatRupiah(donator.amount)}</span>
            <span className="dt-num dt-table-date">{formatDate(donator.date)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Kartu progress bulanan: terkumpul, target, bar, dan persentase tercapai. */
function MonthlyProgress({ total, target }: { total: number; target: number }) {
  const pct = target > 0 ? Math.min(100, (total / target) * 100) : 0;
  const done = pct >= 100;

  return (
    <div className="dt-progress">
      <div className="dt-progress-top">
        <div>
          <p className="dt-progress-label">{text.collectedLabel}</p>
          <p className="dt-progress-value">{formatRupiah(total)}</p>
        </div>
        <div className="dt-progress-target">
          <p className="dt-progress-label">
            {text.targetLabel} {formatRupiah(target)}
          </p>
        </div>
      </div>

      <div className="dt-progress-track">
        <div
          className={`dt-progress-fill${done ? " is-done" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className={`dt-progress-pct${done ? " is-done" : ""}`}>
        {pct.toFixed(1)}% {text.reachedLabel}
        {done ? ` ${text.targetExceeded}` : ""}
      </p>
    </div>
  );
}

export function DonaturBoard({
  summary,
  listHref = "/donatur",
}: {
  summary: DonaturSummary;
  listHref?: string;
}) {
  const { donators, top, monthly, monthlyTotal, monthLabel, totalAmount, totalPeople } = summary;
  const shown = Math.min(TOP_VISIBLE, top.length);

  return (
    <div className="dt-board">
      <div className="dt-stats">
        <StatCard value={formatRupiah(totalAmount)} label={text.totalLabel} />
        <StatCard value={String(totalPeople)} label={text.peopleLabel} />
      </div>

      {/* Donatur bulan ini — dibatasi lebar seperti max-w-2xl di sankanime */}
      <section className="dt-monthly" aria-labelledby="dt-monthly-title">
        <div className="dt-monthly-head">
          <h2 className="dt-section-title" id="dt-monthly-title">
            {text.monthlyTitle}
          </h2>
          <Link className="dt-see-all" href={listHref}>
            {text.seeAll} <ChevronRight />
          </Link>
        </div>

        <MonthlyProgress total={monthlyTotal} target={text.monthlyTarget} />

        <DonaturTable items={monthly} empty={null} />
      </section>

      {/* Top donatur — lebar penuh */}
      <section className="dt-section" aria-labelledby="dt-top-title">
        <h2 className="dt-section-title" id="dt-top-title">
          {text.topTitle} {monthLabel}
        </h2>

        {top.length ? (
          <div className="dt-top">
            <ul className="dt-top-group">
              {top.slice(0, 3).map((donator, index) => (
                <TopCard
                  key={donator.id}
                  donator={donator}
                  rank={index + 1}
                  showCrown={index === 0}
                />
              ))}
            </ul>

            {top.length > 3 ? (
              <ul className="dt-top-group dt-top-group--rest">
                {top.slice(3, TOP_VISIBLE).map((donator, index) => (
                  <TopCard
                    key={donator.id}
                    donator={donator}
                    rank={index + 4}
                    showCrown={false}
                  />
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="dt-empty">{text.emptyTop}</p>
        )}

        {top.length ? (
          <p className="dt-counter">
            {text.counterBefore} {shown} {text.counterMiddle} {top.length} {text.counterAfter}
          </p>
        ) : null}
      </section>

      <section className="dt-section" aria-labelledby="dt-list-title">
        <h2 className="dt-section-title" id="dt-list-title">
          {text.listTitle}
        </h2>
        <DonaturTable items={donators} empty={text.empty} />
      </section>

      <div className="dt-cta">
        <a className="btn-primary" href={text.donateHref} target="_blank" rel="noopener noreferrer">
          {text.donate}
        </a>
      </div>
    </div>
  );
}

export function DonaturHeading() {
  return (
    <>
      <h1 className="page-title">
        <span className="section-ornament" aria-hidden="true">
          <SectionOrnament />
        </span>
        {text.title}
      </h1>
      <p className="page-sub">{text.intro}</p>
    </>
  );
}
