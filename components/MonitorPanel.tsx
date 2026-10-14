"use client";

import { useEffect, useRef, useState } from "react";

type Snapshot = {
  active: { total: number; browser: number; app: number };
  today: { visitors: number; searches: number; found: number; notFound: number };
  week: { label: string; count: number; isToday: boolean }[];
  keywords: { word: string; count: number }[];
  recent: {
    ago: string;
    title: string;
    found: boolean;
    presets: number;
    ms: string | null;
    device: string;
    source: string;
  }[];
};

const POLL_MS = 5_000;

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="mon-stat">
      <span className="mon-stat-num">{value.toLocaleString("id-ID")}</span>
      <span className="mon-stat-label">{label}</span>
    </div>
  );
}

export function MonitorPanel({ loginPw }: { loginPw?: string }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    let alive = true;

    // Sekali aja: tukar password di URL jadi cookie, biar polling berikutnya
    // nggak bawa password.
    if (loginPw && !started.current) {
      started.current = true;
      void fetch(`/api/monitor/login?pw=${encodeURIComponent(loginPw)}`, {
        credentials: "same-origin",
      }).catch(() => {});
    }

    const load = async () => {
      try {
        const res = await fetch("/api/monitor/stats", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) throw new Error("gagal");
        const json = (await res.json()) as Snapshot;
        if (alive) {
          setData(json);
          setFailed(false);
        }
      } catch {
        if (alive) setFailed(true);
      }
    };

    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [loginPw]);

  const max = Math.max(1, ...(data?.week.map(d => d.count) || [1]));

  return (
    <>
      <section className="mon-card">
        <div className="mon-card-head">
          <h2 className="mon-card-title">Pengguna aktif sekarang</h2>
        </div>
        {data ? (
          <>
            <div className="mon-active-num">{data.active.total.toLocaleString("id-ID")}</div>
            <div className="mon-split">
              <div className="mon-split-box">
                <span className="mon-split-num">{data.active.browser.toLocaleString("id-ID")}</span>
                <span className="mon-split-label">lewat browser</span>
              </div>
              <div className="mon-split-box">
                <span className="mon-split-num">{data.active.app.toLocaleString("id-ID")}</span>
                <span className="mon-split-label">lewat aplikasi</span>
              </div>
            </div>
          </>
        ) : (
          <div className="mon-empty">{failed ? "Data belum bisa dimuat." : "Memuat…"}</div>
        )}
      </section>

      <section className="mon-card">
        <div className="mon-stats">
          <Stat value={data?.today.visitors ?? 0} label="Pengunjung hari ini" />
          <Stat value={data?.today.searches ?? 0} label="Kali mencari hari ini" />
          <Stat value={data?.today.found ?? 0} label="Preset ketemu" />
          <Stat value={data?.today.notFound ?? 0} label="Tidak ketemu" />
        </div>
      </section>

      <section className="mon-card">
        <div className="mon-card-head">
          <h2 className="mon-card-title">Pengunjung 7 hari terakhir</h2>
        </div>
        <div className="mon-chart">
          {(data?.week || []).map((d, i) => (
            <div className="mon-bar-col" key={`${d.label}-${i}`}>
              <span className="mon-bar-num">{d.count.toLocaleString("id-ID")}</span>
              <div className="mon-bar-track">
                <div
                  className={`mon-bar${d.isToday ? " is-today" : ""}`}
                  style={{ height: `${Math.max(4, Math.round((d.count / max) * 100))}%` }}
                />
              </div>
              <span className={`mon-bar-label${d.isToday ? " is-today" : ""}`}>{d.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mon-card">
        <div className="mon-card-head">
          <h2 className="mon-card-title">Paling sering dicari</h2>
        </div>
        {(data?.keywords.length ?? 0) > 0 ? (
          <div className="mon-table">
            <div className="mon-row is-head">
              <span>Kata kunci</span>
              <span>Berapa kali</span>
            </div>
            {data?.keywords.map(k => (
              <div className="mon-row" key={k.word}>
                <span className="mon-word">{k.word}</span>
                <span className="mon-count">{k.count.toLocaleString("id-ID")}×</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mon-empty">Belum ada pencarian.</div>
        )}
      </section>

      <section className="mon-card mon-act">
        <div className="mon-act-head">
          <h2 className="mon-act-title">Aktivitas terbaru</h2>
          <span className="mon-act-tag">Disamarkan</span>
        </div>
        {(data?.recent.length ?? 0) > 0 ? (
          <div className="mon-act-list">
            {data?.recent.map((e, i) => (
              <article className="mon-event" key={`${e.ago}-${i}`}>
                <div className="mon-event-top">
                  <span className="mon-event-ago">{e.ago}</span>
                  <span className={`mon-event-result${e.found ? " is-found" : " is-empty"}`}>
                    {e.found ? "Ketemu" : "Kosong"}
                  </span>
                </div>
                <p className="mon-event-title">{e.title}</p>
                <div className="mon-event-cols">
                  <span>
                    Preset: <b>{e.presets.toLocaleString("id-ID")}</b>
                  </span>
                  <span>
                    Lama: <b>{e.ms ? `${e.ms} detik` : "—"}</b>
                  </span>
                </div>
                <p className="mon-event-foot">
                  Perangkat: {e.device} · {e.source}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <div className="mon-empty">Belum ada aktivitas.</div>
        )}
      </section>
    </>
  );
}
