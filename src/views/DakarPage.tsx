import { useState } from 'react';
import { useWidth } from '../components/charts';
import { Score } from '../components/common';
import { Hero } from '../components/sheet';
import { useData } from '../core/store';
import { countdown, dayLong, dayShort } from '../core/time';
import type { DakarRow, DakarStage } from '../sources/dakar';

/** Dakar Rally: the route stage by stage and the official rankings by category. */
export function DakarPage() {
  const { dakar, news, now } = useData();
  const [cat, setCat] = useState('Bikes');
  if (!dakar) return <Hero id="dakar" dek="Loading the Dakar…" />;
  const stages = dakar.stages;
  const start = stages[0] ? Date.parse(stages[0].date) : null;
  const end = stages.length ? Date.parse(stages[stages.length - 1].date) : null;
  const running = start !== null && end !== null && now >= start && now <= end + 12 * 3600e3;
  const nextStage = stages.find(s => !s.rest && Date.parse(s.date) > now - 8 * 3600e3);
  const r = dakar.rankings;
  const live = r && r.edition === dakar.edition;
  const cats = r ? Object.keys(r.general) : [];
  const total = stages.reduce((a, s) => a + (s.totalKm ?? 0), 0), special = stages.reduce((a, s) => a + (s.specialKm ?? 0), 0);
  const myNews = news.filter(n => n.passion === 'dakar').slice(0, 8);

  return (
    <>
      <Hero id="dakar" dek={`Dakar ${dakar.edition}: ${stages.filter(s => !s.rest).length} days of racing in Saudi Arabia, ${total.toLocaleString('en-US')} km in all, ${special.toLocaleString('en-US')} km against the clock.${!running && start && start > now ? ` The prologue starts in ${Math.ceil((start - now) / 86400e3)} days.` : ''}`} />

      <section className="s-top">
        <div className="ocard s-next">
          <div className="lab">{running ? 'Rally under way · next stage' : 'Start'}</div>
          {nextStage ? (
            <>
              <h3>{nextStage.label}</h3>
              <div className="when">{dayLong(Date.parse(nextStage.date))} · {nextStage.from}{nextStage.to !== nextStage.from ? ` → ${nextStage.to}` : ''}</div>
              <div className="s-cd">{countdown(Date.parse(nextStage.date) - now)}<small>approximate start of the day · {nextStage.specialKm} km special</small></div>
            </>
          ) : <div>The {dakar.edition} rally is over.</div>}
        </div>
        <div className="ocard">
          <div className="lab">{live ? `General classification after stage ${r!.stage}` : `${r?.edition ?? ''} winners`}</div>
          {r && ['Bikes', 'Cars'].map(c => r.general[c]?.[0] && (
            <div key={c} style={{ marginBottom: 8 }}><small style={{ color: 'var(--o-ink3)' }}>{c}</small><br /><Score><b>#{r.general[c][0].bib} {r.general[c][0].crew.join(' / ')}</b> <small>({r.general[c][0].nation})</small></Score></div>
          ))}
        </div>
        <div className="ocard">
          <div className="lab">The route</div>
          <div className="kpis">
            <div className="kpi"><b>{stages.filter(s => !s.rest).length}</b><span>Racing days</span></div>
            <div className="kpi"><b>{special.toLocaleString('en-US')}</b><span>km special</span></div>
            <div className="kpi"><b>{Math.max(...stages.map(s => s.totalKm ?? 0))}</b><span>km longest day</span></div>
          </div>
        </div>
      </section>

      <section className="ocard">
        <h2>The {dakar.edition} route, stage by stage</h2>
        <p className="dek">Total distance of each day, with the timed special in color. The rest day is in {stages.find(s => s.rest)?.from ?? 'the middle'}.</p>
        <StageBars stages={stages} now={now} />
        <div className="osrc">Source: dakar.com</div>
      </section>

      {r && (
        <section className="ocard">
          <h2>{live ? `Rankings after stage ${r.stage}` : `Final rankings, Dakar ${r.edition}`}</h2>
          <p className="dek">{live ? 'Official times, refreshed with every update from the organiser.' : `The ${dakar.edition} rankings replace these once the rally starts.`}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {cats.map(c => <button key={c} className="btn" aria-pressed={cat === c} onClick={() => setCat(c)} style={{ color: 'var(--o-ink)', background: cat === c ? 'var(--o-accent-soft)' : 'transparent', borderColor: 'var(--o-line)' }}>{c}</button>)}
          </div>
          <div className="s-two" style={{ gap: 24 }}>
            <RankTable title="General" rows={r.general[cat] ?? []} />
            <RankTable title={`Stage ${r.stage}`} rows={r.stageRanking[cat] ?? []} />
          </div>
        </section>
      )}

      <section className="ocard">
        <div className="lab">From the wire</div>
        <div className="onews">{myNews.map(n => <a key={n.id} className="r" href={n.url} target="_blank" rel="noreferrer"><time>{dayShort(n.time)} · {n.source}</time><p>{n.title}</p></a>)}</div>
      </section>
    </>
  );
}

function RankTable({ title, rows }: { title: string; rows: DakarRow[] }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="lab">{title}</div>
      <table className="otable">
        <tbody>{rows.map(x => (
          <tr key={x.bib}><td>{x.pos}</td><td><Score><b>#{x.bib}</b> {x.crew.join(' / ')}</Score><br /><small style={{ color: 'var(--o-ink3)' }}>{x.nation} · {x.team}</small></td><td className="n"><Score>{x.pos === 1 ? x.time : x.gap}</Score></td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function StageBars({ stages, now }: { stages: DakarStage[]; now: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const H = 240, l = 40, b = 46, t = 16;
  const max = Math.max(...stages.map(s => s.totalKm ?? 0), 100);
  const hi = Math.ceil(max / 200) * 200;
  const band = (W - l) / stages.length, bw = Math.min(26, band * 0.6);
  const y = (v: number) => t + ((hi - v) / hi) * (H - t - b);
  return (
    <div ref={ref} className="ochart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Stage distances">
        {[0, hi / 2, hi].map(v => <g key={v}><line x1={l} x2={W} y1={y(v)} y2={y(v)} stroke="var(--o-grid)" /><text x={l - 6} y={y(v) + 4} textAnchor="end">{v}</text></g>)}
        {stages.map((s, i) => {
          const cx = l + band * i + band / 2, done = Date.parse(s.date) < now - 12 * 3600e3;
          return (
            <g key={i} opacity={done ? 0.45 : 1}>
              {s.totalKm != null && <rect x={cx - bw / 2} y={y(s.totalKm)} width={bw} height={y(0) - y(s.totalKm)} rx={3} fill="var(--o-grid)" />}
              {s.specialKm != null && <rect x={cx - bw / 2} y={y(s.specialKm)} width={bw} height={y(0) - y(s.specialKm)} rx={3} fill="var(--oc-mot)"><title>{`${s.label} · ${s.from} → ${s.to} · ${s.specialKm} km special / ${s.totalKm} km`}</title></rect>}
              {s.rest && <text x={cx} y={y(0) - 6} textAnchor="middle" style={{ fill: 'var(--o-ink3)', fontSize: 10 }}>Rest</text>}
              <text x={cx} y={H - 28} textAnchor="middle" style={{ fontSize: 10.5, fill: 'var(--o-ink2)' }}>{s.rest ? '–' : s.num === 0 ? 'P' : s.num}</text>
              <text x={cx} y={H - 14} textAnchor="middle" style={{ fontSize: 9.5 }}>{dayShort(Date.parse(s.date)).split(' ')[1]}</text>
            </g>
          );
        })}
      </svg>
      <div className="olegend"><span><i style={{ background: 'var(--oc-mot)', height: 10 }} />Special (timed)</span><span><i style={{ background: 'var(--o-grid)', height: 10 }} />Total distance</span></div>
    </div>
  );
}
