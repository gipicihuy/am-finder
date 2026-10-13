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

/**
 * Kartu top donor — struktur .top-donation-card di sankanime.web.id:
 * vertikal rata tengah, avatar bulat di atas, lalu nama, tanggal, nominal.
 * Peringkat pertama mendapat mahkota melayang, border emas, dan baris "⭐ Donasi Teratas".
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

/**
 * Tabel donatur — tata letak grid [1fr auto auto] dengan header sticky,
 * identik dengan tabel bulanan di sankanime.web.id. Pesan donatur diletakkan
 * sebagai baris kecil di bawah nama supaya kolomnya tetap tiga.
 */
function DonaturTable({
  items,
  emptyText,
}: {
  items: Donatur[];
  emptyText?: React.ReactNode;
}) {
  if (!items.length) {
    return <div className="dt-table-empty">{emptyText}</div>;
  }

  return (
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
  );
}

export function DonaturBoard({
  summary,
  listHref = "/donatur",
}: {
  summary: DonaturSummary;
  listHref?: string;
}) {
  const { donators, top, monthly, monthLabel, totalAmount, totalPeople } = summary;
  const shown = Math.min(TOP_VISIBLE, top.length);

  return (
    <div className="dt-board">
      <div className="dt-stats">
        <StatCard value={formatRupiah(totalAmount)} label={text.totalLabel} />
        <StatCard value={String(totalPeople)} label={text.peopleLabel} />
      </div>

      <section className="dt-section" aria-labelledby="dt-monthly-title">
        <div className="dt-section-head">
          <h2 className="dt-section-title" id="dt-monthly-title">
            {text.monthlyTitle}
          </h2>
          <Link className="dt-see-all" href={listHref}>
            {text.seeAll} ›
          </Link>
        </div>
        <DonaturTable
          items={monthly}
          emptyText={
            <p>
              {text.emptyMonthly} <strong>{text.emptyMonthlyCta}</strong>
            </p>
          }
        />
      </section>

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
        <DonaturTable items={donators} emptyText={text.empty} />
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
