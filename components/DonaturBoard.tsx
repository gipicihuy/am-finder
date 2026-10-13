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

function Avatar({ name, size }: { name: string; size: "lg" | "sm" }) {
  return (
    <span
      className={`dt-avatar dt-avatar--${size}`}
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
 * Kartu donatur teratas: vertikal, rata tengah, avatar bulat di atas,
 * dengan mahkota untuk peringkat pertama — mengikuti pola tampilan
 * top donor di sankanime.web.id, disesuaikan dengan palet AM Finder.
 */
function TopCard({ donator, rank }: { donator: Donatur; rank: number }) {
  const isWinner = rank === 1;
  return (
    <li className={`dt-card${isWinner ? " is-winner" : ""}`}>
      {isWinner ? (
        <span className="dt-crown" aria-hidden="true">
          👑
        </span>
      ) : null}
      <span className="dt-rank" aria-hidden="true">
        {rank}
      </span>
      <Avatar name={donator.name} size="lg" />
      <div className="dt-text">
        <p className="dt-name">{donator.name}</p>
        <p className="dt-amount">{formatRupiah(donator.amount)}</p>
        {donator.date ? <time className="dt-date">{formatDate(donator.date)}</time> : null}
      </div>
    </li>
  );
}

/** Baris daftar lengkap: tetap lebar supaya pesan donatur muat dibaca. */
function RowCard({ donator }: { donator: Donatur }) {
  return (
    <li className="dt-row">
      <Avatar name={donator.name} size="sm" />
      <div className="dt-row-body">
        <div className="dt-row-head">
          <span className="dt-name">{donator.name}</span>
          <span className="dt-amount">{formatRupiah(donator.amount)}</span>
        </div>
        {donator.message ? <p className="dt-message">{donator.message}</p> : null}
        <div className="dt-row-meta">
          {donator.date ? <time className="dt-date">{formatDate(donator.date)}</time> : null}
          {donator.source === "sociabuzz" ? <span className="dt-source">Sociabuzz</span> : null}
        </div>
      </div>
    </li>
  );
}

export function DonaturBoard({ summary }: { summary: DonaturSummary }) {
  const { donators, top, totalAmount, totalPeople } = summary;

  return (
    <div className="dt-board">
      <div className="dt-stats">
        <StatCard value={formatRupiah(totalAmount)} label={text.totalLabel} />
        <StatCard value={String(totalPeople)} label={text.peopleLabel} />
      </div>

      <section className="dt-section" aria-labelledby="dt-top-title">
        <h2 className="dt-section-title" id="dt-top-title">
          {text.topTitle}
        </h2>
        {top.length ? (
          <ul className="dt-cards">
            {top.map((donator, index) => (
              <TopCard key={donator.id} donator={donator} rank={index + 1} />
            ))}
          </ul>
        ) : (
          <p className="dt-empty">{text.emptyTop}</p>
        )}
      </section>

      <section className="dt-section" aria-labelledby="dt-list-title">
        <h2 className="dt-section-title" id="dt-list-title">
          {text.listTitle}
        </h2>
        {donators.length ? (
          <ul className="dt-list">
            {donators.map((donator) => (
              <RowCard key={donator.id} donator={donator} />
            ))}
          </ul>
        ) : (
          <p className="dt-empty">{text.empty}</p>
        )}
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
