import { useEffect, useMemo, useState } from 'react';
import { useWidth } from '../components/charts';
import { Score } from '../components/common';
import { Hero } from '../components/sheet';
import { useData } from '../core/store';
import { DAY, countdown, dayLong, dayShort, hhmm } from '../core/time';
import { ROUNDS, liveDraw, type DrawMatch, type DrawPlayer, type Slam, type TennisData } from '../sources/tennis';

const SLAM_ORDER = ['Australian Open', 'French Open', 'Wimbledon', 'US Open'];
const SLAM_COLOR: Record<string, string> = { 'Australian Open': '#0091d2', 'French Open': '#d35220', 'Roland Garros': '#d35220', Wimbledon: '#3c7d3e', 'US Open': '#2a5ab8' };
const ROUND_SHORT: Record<string, string> = { 'Round 1': 'R128', 'Round 2': 'R64', 'Round 3': 'R32', 'Round 4': 'R16', Quarterfinal: 'QF', Semifinal: 'SF', Final: 'F' };

/** Men's tennis: the Grand Slams (dates, draw, live scores), the ATP ranking, the all-time champions. */
export function TennisPage() {
  const { tennis: d, news, now } = useData();
  const live = useLiveDraw(d, now);
  if (!d) return <Hero id="tennis" dek="Loading the Slams…" />;
  const slams = d.slams;
  const current = slams.find(s => Date.parse(s.start) <= now && now <= Date.parse(s.end) + DAY);
  const next = slams.find(s => Date.parse(s.start) > now);
  const matches = live?.length ? mergeDraw(d.draw?.matches ?? [], live) : d.draw?.matches ?? [];
  const final = matches.find(m => m.round === 'Final');
  const champ = final?.players.find(p => p.winner);
  const one = d.rankings?.ranks[0];
  const myNews = news.filter(n => n.passion === 'tennis').slice(0, 8);
  return (
    <>
      <Hero id="tennis" dek={<>
        {current ? `The ${current.name} is under way. ` : next ? `Next Slam: the ${next.name}, from ${dayLong(Date.parse(next.start))}. ` : ''}
        {champ && d.draw?.slam ? `${champ.name} won the last one, the ${d.draw.slam.name} ${d.draw.slam.year}. ` : ''}
        {one ? `${one.name} is world No. 1 with ${one.points.toLocaleString('en-US')} points.` : ''}
      </>} />

      <section className="s-top">
        <div className="ocard s-next">
          <div className="lab">{current ? 'Under way' : 'Next Grand Slam'}</div>
          {(current ?? next) && <SlamCard s={(current ?? next)!} now={now} />}
        </div>
        <div className="ocard">
          <div className="lab">Last Slam final{d.draw?.slam ? ` · ${d.draw.slam.name} ${d.draw.slam.year}` : ''}</div>
          {final ? <MatchBox m={final} big /> : <div>No final yet.</div>}
        </div>
        <div className="ocard">
          <div className="lab">ATP top 5</div>
          {(d.rankings?.ranks ?? []).slice(0, 5).map(r => (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '18px 1fr 70px', gap: 6, fontSize: 13, padding: '3px 0' }}>
              <span style={{ color: 'var(--o-ink3)' }}>{r.rank}</span><b>{r.name} <small style={{ color: 'var(--o-ink3)', fontWeight: 400 }}>{r.country}</small></b><Score><span style={{ display: 'block', textAlign: 'right' }}>{r.points.toLocaleString('en-US')}</span></Score>
            </div>
          ))}
        </div>
      </section>

      <section className="ocard">
        <h2>The four Slams</h2>
        <p className="dek">This year's and next year's Grand Slams, with their dates and surfaces. Matches start around 11:00 local time.</p>
        <SlamStrip slams={slams} now={now} />
      </section>

      {matches.length > 0 && <DrawSection d={d} matches={matches} live={Boolean(current && live?.length)} />}

      <section className="s-two">
        <div className="ocard">
          <h2>ATP ranking</h2>
          <p className="dek">Points of the top 20{d.rankings?.updated ? `, ranking of ${dayLong(Date.parse(d.rankings.updated))}` : ''}. Arrows show the change from the previous week; Italians in green.</p>
          <RankingBars d={d} />
          <div className="osrc">Source: ESPN</div>
        </div>
        <div className="ocard">
          <h2>Most Grand Slam titles</h2>
          <p className="dek">Men's singles champions since 1877, coloured by tournament. The French titles before 1925 (club members only) are not counted.</p>
          <TitlesChart d={d} />
          <div className="osrc">Source: Wikipedia</div>
        </div>
      </section>

      <section className="s-two">
        <div className="ocard">
          <h2>The last ten years</h2>
          <RecentChampions d={d} />
        </div>
        <div className="ocard">
          <div className="lab">From the wire</div>
          <div className="onews">{myNews.map(n => <a key={n.id} className="r" href={n.url} target="_blank" rel="noreferrer"><time>{dayShort(n.time)} · {n.source}</time><p>{n.title}</p></a>)}</div>
        </div>
      </section>
    </>
  );
}

/** While a Slam is on, the draw refreshes every minute straight from ESPN. */
function useLiveDraw(d: TennisData | undefined, now: number) {
  const [live, setLive] = useState<DrawMatch[] | null>(null);
  const current = d?.slams.find(s => Date.parse(s.start) <= now && now <= Date.parse(s.end) + DAY);
  const key = current ? `${current.key}${current.year}` : null;
  useEffect(() => {
    if (!key) return;
    let on = true;
    const tick = () => liveDraw(new Date().toISOString().slice(0, 10)).then(m => on && m.length && setLive(m)).catch(() => {});
    tick();
    const t = setInterval(tick, 60e3);
    return () => { on = false; clearInterval(t); };
  }, [key]);
  return key ? live : null;
}

const mergeDraw = (base: DrawMatch[], live: DrawMatch[]) => {
  const by = new Map(base.map(m => [m.id, m]));
  for (const m of live) by.set(m.id, m);
  return [...by.values()].sort((a, b) => a.r - b.r);
};

function SlamCard({ s, now }: { s: Slam; now: number }) {
  const t = Date.parse(s.start);
  return (
    <>
      <h3 style={{ margin: 0 }}><i className="cy-dot" style={{ background: SLAM_COLOR[s.name] ?? s.color }} />{s.name} {s.year}</h3>
      <div className="when">{dayShort(t)} – {dayShort(Date.parse(s.end))} · {s.place} · {s.surface}</div>
      <div className="s-cd">{t > now ? countdown(t - now) : 'Under way'}<small>{t > now ? 'until day one' : `final ${dayLong(Date.parse(s.end))}`}</small></div>
    </>
  );
}

function SlamStrip({ slams, now }: { slams: Slam[]; now: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const list = slams.filter(s => Date.parse(s.end) > now - 300 * DAY);
  if (!list.length) return null;
  const t0 = Date.UTC(new Date(list[0].start).getUTCFullYear(), 0, 1), t1 = Date.parse(list[list.length - 1].end) + 30 * DAY;
  const x = (t: number) => 8 + ((t - t0) / (t1 - t0)) * (W - 16);
  const H = 70;
  return (
    <div ref={ref} className="ochart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Grand Slam calendar">
        <line x1={8} x2={W - 8} y1={34} y2={34} stroke="var(--o-grid)" strokeWidth={2} />
        {now > t0 && now < t1 && <line x1={x(now)} x2={x(now)} y1={14} y2={54} stroke="var(--o-ink)" strokeDasharray="2 3" />}
        {list.map(s => {
          const a = x(Date.parse(s.start)), b = x(Date.parse(s.end));
          return (
            <g key={s.key + s.year} opacity={Date.parse(s.end) < now ? 0.45 : 1}>
              <rect x={a} y={28} width={Math.max(6, b - a)} height={12} rx={4} fill={SLAM_COLOR[s.name] ?? s.color}><title>{`${s.name} ${s.year} · ${dayShort(Date.parse(s.start))} – ${dayShort(Date.parse(s.end))}`}</title></rect>
              <text x={a} y={20} style={{ fontSize: 11, fill: 'var(--o-ink)', fontWeight: 600 }}>{s.short} {String(s.year).slice(2)}</text>
              <text x={a} y={56} style={{ fontSize: 10.5 }}>{dayShort(Date.parse(s.start)).split(' ').slice(1).join(' ')}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Games per set, with the tie-break points of the set's loser as a superscript (7–6⁵). */
function SetsText({ p }: { p: DrawPlayer }) {
  return <>{p.sets.map((s, i) => <span key={i} style={{ marginLeft: 5 }}>{s.g}{s.tb != null && !s.won ? <sup style={{ fontSize: '0.7em' }}>{s.tb}</sup> : null}</span>)}</>;
}

function MatchBox({ m, big }: { m: DrawMatch; big?: boolean }) {
  return (
    <div style={{ border: '1px solid var(--o-line)', borderRadius: 8, padding: big ? '8px 10px' : '4px 7px', fontSize: big ? 14 : 12, background: m.state === 'in' ? 'color-mix(in srgb, #ff453a 8%, var(--o-card))' : 'var(--o-card)' }}>
      {m.players.map(p => (
        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontWeight: p.winner ? 700 : 400, color: p.winner || m.state !== 'post' ? 'var(--o-ink)' : 'var(--o-ink3)' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.seed ? <small style={{ color: 'var(--o-ink3)' }}>[{p.seed}] </small> : null}{big ? p.name : p.short ?? p.name}{p.country ? <small style={{ color: 'var(--o-ink3)' }}> {p.country}</small> : null}</span>
          <Score><span style={{ fontVariantNumeric: 'tabular-nums' }}><SetsText p={p} /></span></Score>
        </div>
      ))}
      {m.state === 'in' && <div style={{ color: '#ff453a', fontSize: 10.5 }}>● {m.detail}</div>}
      {m.state === 'pre' && m.date && <div style={{ color: 'var(--o-ink3)', fontSize: 10.5 }}>{dayShort(Date.parse(m.date))} {hhmm(Date.parse(m.date))}{m.court ? ` · ${m.court}` : ''}</div>}
    </div>
  );
}

function DrawSection({ d, matches, live }: { d: TennisData; matches: DrawMatch[]; live: boolean }) {
  const rounds = ROUNDS.filter(r => matches.some(m => m.round === r));
  const [round, setRound] = useState<string>(rounds[Math.max(0, rounds.length - 4)] ?? 'Round 4');
  // The bracket from the round of 16 on, ordered so that each pair feeds the next match
  const bracket = useMemo(() => {
    const cols = ['Round 4', 'Quarterfinal', 'Semifinal', 'Final'].map(r => matches.filter(m => m.round === r));
    for (let k = cols.length - 2; k >= 0; k--) {
      const nextCol = cols[k + 1];
      const order = nextCol.flatMap(m => m.players.map(p => cols[k].find(x => x.players.some(q => q.id === p.id && q.winner)))).filter(Boolean) as DrawMatch[];
      if (order.length === cols[k].length) cols[k] = order;
    }
    return cols;
  }, [matches]);
  const slam = d.draw?.slam;
  return (
    <section className="ocard">
      <h2>{slam ? `${slam.name} ${slam.year}` : 'The draw'}: men's singles{live ? ' · live' : ''}</h2>
      <p className="dek">From the last sixteen to the final{live ? ', refreshed every minute while the tournament is on' : ''}. Seeds in brackets; the winner of each match in bold.</p>
      {bracket[0].length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(170px, 1fr))', gap: 12, minWidth: 720 }}>
            {bracket.map((col, k) => (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', gap: 6 }}>
                <div className="lab" style={{ marginBottom: 2 }}>{['Last 16', 'Quarterfinals', 'Semifinals', 'Final'][k]}</div>
                {col.map(m => <MatchBox key={m.id} m={m} big={k === 3} />)}
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '16px 0 10px' }}>
        {rounds.map(r => <button key={r} className="btn" aria-pressed={round === r} onClick={() => setRound(r)} style={{ color: 'var(--o-ink)', background: round === r ? 'var(--o-accent-soft)' : 'transparent', borderColor: 'var(--o-line)' }}>{ROUND_SHORT[r]}</button>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
        {matches.filter(m => m.round === round).map(m => <MatchBox key={m.id} m={m} />)}
      </div>
      <div className="osrc">Source: ESPN</div>
    </section>
  );
}

function RankingBars({ d }: { d: TennisData }) {
  const rows = (d.rankings?.ranks ?? []).slice(0, 20);
  if (!rows.length) return null;
  const max = rows[0].points;
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      {rows.map(r => {
        const mv = r.prev - r.rank;
        return (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '22px minmax(0, 150px) 1fr 58px 28px', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
            <span style={{ color: 'var(--o-ink3)', textAlign: 'right' }}>{r.rank}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><b>{r.short ?? r.name}</b> <small style={{ color: 'var(--o-ink3)' }}>{r.country}</small></span>
            <div style={{ height: 8, borderRadius: 3, width: `${(r.points / max) * 100}%`, background: r.country === 'ITA' ? 'var(--oc-out)' : 'var(--o-s1)' }} />
            <Score><span style={{ display: 'block', textAlign: 'right' }}>{r.points.toLocaleString('en-US')}</span></Score>
            <small style={{ color: mv > 0 ? 'var(--o-s3)' : mv < 0 ? 'var(--o-s2)' : 'var(--o-ink3)' }}>{mv > 0 ? `▲${mv}` : mv < 0 ? `▼${-mv}` : '–'}</small>
          </div>
        );
      })}
    </div>
  );
}

function TitlesChart({ d }: { d: TennisData }) {
  const counted = d.champions.filter(c => !(c.slam === 'French Open' && c.year < 1925));
  const by = new Map<string, Record<string, number>>();
  for (const c of counted) { const r = by.get(c.name) ?? {}; r[c.slam] = (r[c.slam] ?? 0) + 1; by.set(c.name, r); }
  const rows = [...by.entries()].map(([name, r]) => ({ name, r, total: Object.values(r).reduce((a, b) => a + b, 0) })).sort((a, b) => b.total - a.total).slice(0, 15);
  const max = rows[0]?.total ?? 1;
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      <div className="olegend">{SLAM_ORDER.map(s => <span key={s}><i style={{ background: SLAM_COLOR[s], height: 8 }} />{s}</span>)}</div>
      {rows.map(x => (
        <div key={x.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 140px) 1fr 28px', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</span>
          <div style={{ display: 'flex', gap: 1, height: 10, width: `${(x.total / max) * 100}%` }} title={SLAM_ORDER.map(s => `${s} ${x.r[s] ?? 0}`).join(' · ')}>
            {SLAM_ORDER.map(s => x.r[s] ? <div key={s} style={{ flex: x.r[s], background: SLAM_COLOR[s], borderRadius: 2 }} /> : null)}
          </div>
          <b style={{ textAlign: 'right' }}>{x.total}</b>
        </div>
      ))}
    </div>
  );
}

function RecentChampions({ d }: { d: TennisData }) {
  const years = [...new Set(d.champions.map(c => c.year))].sort((a, b) => b - a).slice(0, 10);
  return (
    <table className="otable">
      <thead><tr><th>Year</th>{SLAM_ORDER.map(s => <th key={s}><i className="cy-dot" style={{ background: SLAM_COLOR[s] }} />{s.replace(' Open', '').replace('French', 'RG')}</th>)}</tr></thead>
      <tbody>{years.map(y => (
        <tr key={y}><td>{y}</td>{SLAM_ORDER.map(s => { const c = d.champions.find(x => x.year === y && x.slam === s); return <td key={s}><Score>{c ? c.name.split(' ').slice(-1)[0] : '–'}</Score></td>; })}</tr>
      ))}</tbody>
    </table>
  );
}
