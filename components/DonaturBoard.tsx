import { SectionOrnament } from "@/components/Ornament";
import { ui } from "@/lib/ui";
import { formatDate, formatRupiah, type DonaturSummary } from "@/lib/donatur";

const text = ui.donatur;

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="donatur-stat">
      <span className="donatur-stat-value">{value}</span>
      <span className="donatur-stat-label">{label}</span>
    </div>
  );
}

function TopCard({ donator, rank }: { donator: DonaturSummary["top"][number]; rank: number }) {
  return (
    <li className={`donatur-card donatur-card--rank${rank <= 3 ? " is-podium" : ""}`}>
      <span className="donatur-rank" aria-hidden="true">
        {rank}
      </span>
      <div className="donatur-body">
        <div className="donatur-head">
          <span className="donatur-name">{donator.name}</span>
          <span className="donatur-amount">{formatRupiah(donator.amount)}</span>
        </div>
        {donator.message ? <p className="donatur-message">{donator.message}</p> : null}
        {donator.date ? <time className="donatur-date">{formatDate(donator.date)}</time> : null}
      </div>
    </li>
  );
}

function RowCard({ donator }: { donator: DonaturSummary["donators"][number] }) {
  return (
    <li className="donatur-card donatur-card--row">
      <div className="donatur-body">
        <div className="donatur-head">
          <span className="donatur-name">{donator.name}</span>
          <span className="donatur-amount">{formatRupiah(donator.amount)}</span>
        </div>
        {donator.message ? <p className="donatur-message">{donator.message}</p> : null}
        <div className="donatur-meta">
          {donator.date ? <time className="donatur-date">{formatDate(donator.date)}</time> : null}
          {donator.source === "sociabuzz" ? <span className="donatur-source">Sociabuzz</span> : null}
        </div>
      </div>
    </li>
  );
}

export function DonaturBoard({ summary }: { summary: DonaturSummary }) {
  const { donators, top, totalAmount, totalPeople } = summary;

  return (
    <div className="donatur-board">
      <div className="donatur-stats">
        <StatCard value={formatRupiah(totalAmount)} label={text.totalLabel} />
        <StatCard value={String(totalPeople)} label={text.peopleLabel} />
      </div>

      <section className="donatur-section" aria-labelledby="donatur-top-title">
        <h2 className="donatur-section-title" id="donatur-top-title">
          {text.topTitle}
        </h2>
        {top.length ? (
          <ol className="donatur-grid">
            {top.map((donator, index) => (
              <TopCard key={donator.id} donator={donator} rank={index + 1} />
            ))}
          </ol>
        ) : (
          <p className="donatur-empty">{text.emptyTop}</p>
        )}
      </section>

      <section className="donatur-section" aria-labelledby="donatur-list-title">
        <h2 className="donatur-section-title" id="donatur-list-title">
          {text.listTitle}
        </h2>
        {donators.length ? (
          <ul className="donatur-list">
            {donators.map((donator) => (
              <RowCard key={donator.id} donator={donator} />
            ))}
          </ul>
        ) : (
          <p className="donatur-empty">{text.empty}</p>
        )}
      </section>

      <div className="donatur-cta">
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
