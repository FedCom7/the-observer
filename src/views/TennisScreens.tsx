// Tennis screens beyond the home: every Slam of the season round by round, strength by
// surface (Elo), the players, the four Slams and their history, the rules.
// Data: tennis.json (calendar, rankings, champions) and tennis-season.json (draws, Elo).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PercentileGrid, QuadrantScatter, RankStrips, ordinal, type GridCol, type StripMetric } from '../components/power';
import { Chips, usePick } from '../components/tabs';
import { getJSON } from '../core/fetcher';
import { fmt } from '../core/time';
import type { DrawMatch, DrawPlayer, TennisData } from '../sources/tennis';

export const TENNIS_TABS = [['now', 'Now'], ['season', 'Season'], ['power', 'Power'], ['players', 'Players'], ['slams', 'The Slams'], ['how', 'How it works']] as const;
export type TennisTab = typeof TENNIS_TABS[number][0];

interface EloRow { rank: number; name: string; age: number | null; elo: number; hardRank: number; hard: number; clayRank: number; clay: number; grassRank: number; grass: number; peak: number; peakMonth: string | null; atp: number | null }
export interface TennisSeason { updated: string; draws: Record<string, { slam: string; short: string; year: number; surface: string; color: string; name: string; start: string; matches: DrawMatch[] }>; elo: { updated: string | null; rows: EloRow[] } | null }
export function useTennisSeason(enabled = true) {
  const [d, setD] = useState<TennisSeason | null>(null);
  useEffect(() => { if (!enabled) return; let on = true; getJSON<TennisSeason>(`${import.meta.env.BASE_URL}data/tennis-season.json`, 30 * 60e3).then(x => on && setD(x)).catch(() => {}); return () => { on = false; }; }, [enabled]);
  return d;
}

const Src = ({ children }: { children: ReactNode }) => <div className="osrc">{children}</div>;
const ROUNDS = ['Round 1', 'Round 2', 'Round 3', 'Round 4', 'Quarterfinal', 'Semifinal', 'Final'];
const SURF: Record<string, string> = { Hard: 'var(--o-s1)', Clay: '#c8562b', Grass: '#3a8f3a' };
const sets = (p: DrawPlayer) => p.sets.map(s => `${s.g}${s.tb != null ? `⁽${s.tb}⁾` : ''}`).join(' ');
const reached = (matches: DrawMatch[], name: string) => {
  let best = -1, won = false;
  for (const m of matches) if (m.players.some(p => p.name === name)) { best = Math.max(best, m.r); if (m.r === 6 && m.players.find(p => p.name === name)?.winner) won = true; }
  return best < 0 ? null : won ? 'W' : ['R1', 'R2', 'R3', 'R4', 'QF', 'SF', 'F'][best];
};

/* ───────────────────────────── Season ───────────────────────────── */

export function SeasonScreen({ s }: { s: TennisSeason }) {
  const keys = Object.keys(s.draws).sort((a, b) => (s.draws[a].start ?? '').localeCompare(s.draws[b].start ?? ''));
  const [pick, setPick] = usePick('slam');
  const key = keys.includes(pick ?? '') ? pick! : keys.at(-1);
  const d = key ? s.draws[key] : null;
  const [round, setRound] = useState(4);
  if (!d) return <section className="ocard"><p className="dek">No Slam played yet this season.</p></section>;
  const final = d.matches.find(m => m.r === 6);
  const champ = final?.players.find(p => p.winner);
  // The champion's path
  const path = champ ? d.matches.filter(m => m.players.some(p => p.name === champ.name)).sort((a, b) => a.r - b.r) : [];
  const cols = [3, 4, 5, 6];
  return (
    <>
      <section className="ocard">
        <h2>The Slams of {d.year}</h2>
        <Chips label="Slam" items={keys.map(k => ({ k, label: `${s.draws[k].slam} ${s.draws[k].year}` }))} value={key!} set={setPick} />
        <p className="dek">{d.surface} courts.{champ ? <> Champion: <b>{champ.name}</b>{final ? `, ${sets(champ)} in the final against ${final.players.find(p => !p.winner)?.name}` : ''}.</> : ''}</p>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols.length}, minmax(170px, 1fr))`, gap: 10, minWidth: 720 }}>
            {cols.map(r => (
              <div key={r} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', gap: 6 }}>
                <div className="lab">{ROUNDS[r]}</div>
                {d.matches.filter(m => m.r === r).map(m => <MatchBox key={m.id} m={m} color={d.color} />)}
              </div>
            ))}
          </div>
        </div>
        <Src>Source: ESPN</Src>
      </section>
      {path.length > 0 && <section className="ocard">
        <h2>How {champ!.name} won it</h2>
        <table className="otable" style={{ fontSize: 12.5, maxWidth: 620 }}><tbody>{path.map(m => { const opp = m.players.find(p => p.name !== champ!.name)!; const me = m.players.find(p => p.name === champ!.name)!; return <tr key={m.id}><td>{ROUNDS[m.r]}</td><td>{opp.name} {opp.seed ? <small style={{ color: 'var(--o-ink3)' }}>[{opp.seed}]</small> : null} <small style={{ color: 'var(--o-ink3)' }}>{opp.country}</small></td><td className="n">{sets(me)}</td></tr>; })}</tbody></table>
      </section>}
      <section className="ocard">
        <h2>Every match</h2>
        <Chips label="Round" items={ROUNDS.map((r, i) => ({ k: i, label: r }))} value={round} set={setRound} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>{d.matches.filter(m => m.r === round).map(m => <MatchBox key={m.id} m={m} color={d.color} />)}</div>
      </section>
    </>
  );
}

function MatchBox({ m, color }: { m: DrawMatch; color: string }) {
  return (
    <div style={{ border: '1px solid var(--o-line)', borderLeft: `3px solid ${color}`, borderRadius: 6, padding: '4px 8px', fontSize: 12 }}>
      {m.players.map(p => <div key={p.id + p.name} style={{ display: 'flex', gap: 6, fontWeight: p.winner ? 700 : 400, color: p.winner ? 'var(--o-ink)' : 'var(--o-ink3)' }}><span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.seed ? <small>[{p.seed}] </small> : null}{p.short ?? p.name}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{sets(p)}</span></div>)}
    </div>
  );
}

/* ───────────────────────────── Power ───────────────────────────── */

const COLS: GridCol[] = [
  { key: 'elo', label: 'Elo', group: 'Overall', fmt: v => v.toFixed(0) },
  { key: 'hard', label: 'Hard', group: 'By surface', fmt: v => v.toFixed(0) },
  { key: 'clay', label: 'Clay', group: 'By surface', fmt: v => v.toFixed(0) },
  { key: 'grass', label: 'Grass', group: 'By surface', fmt: v => v.toFixed(0) },
  { key: 'peak', label: 'Peak', group: 'Career', fmt: v => v.toFixed(0) },
  { key: 'atp', label: 'ATP rank', group: 'Official', fmt: v => String(v), low: true },
  { key: 'age', label: 'Age', group: 'Official', fmt: v => v.toFixed(1), neutral: true },
];

export function PowerScreen({ s }: { s: TennisSeason }) {
  const rows = s.elo?.rows ?? [];
  const top = rows.slice(0, 40);
  if (!rows.length) return <section className="ocard"><p className="dek">Elo ratings not available.</p></section>;
  const best = (k: 'hard' | 'clay' | 'grass') => [...top].sort((a, b) => b[k] - a[k])[0];
  // Specialists: surface Elo far above the player's own average
  const spec = top.map(r => { const avg = (r.hard + r.clay + r.grass) / 3; return { r, d: { hard: r.hard - avg, clay: r.clay - avg, grass: r.grass - avg } }; });
  const most = (k: 'hard' | 'clay' | 'grass') => [...spec].sort((a, b) => b.d[k] - a.d[k]).slice(0, 4).map(x => x.r.name);
  return (
    <>
      <section className="ocard">
        <h2>Who is strongest, and where</h2>
        <p className="dek">Elo ratings weigh every win by the strength of the opponent, unlike the ATP ranking, which adds up points from tournaments. The best on hard courts: <b>{best('hard').name}</b>; on clay: <b>{best('clay').name}</b>; on grass: <b>{best('grass').name}</b>. Most specialised on clay: {most('clay').join(', ')}; on grass: {most('grass').join(', ')}.</p>
        <p className="dek" style={{ fontSize: 12.5 }}>A 100-point Elo gap means about a 64% chance of winning a match; 200 points, about 76%.</p>
      </section>
      <section className="s-two">
        <div className="ocard">
          <h2>Clay against grass</h2>
          <p className="dek">Elo on clay against Elo on grass, the top 40. Dots far from the diagonal are specialists; the colour is the best surface.</p>
          <QuadrantScatter height={380} xLabel="Clay Elo" yLabel="Grass Elo" fmt={v => v.toFixed(0)} corners={['Everywhere', 'Grass', 'Clay', '']}
            points={top.map(r => { const bestS = r.hard >= r.clay && r.hard >= r.grass ? 'Hard' : r.clay >= r.grass ? 'Clay' : 'Grass'; return { id: r.name, label: r.rank <= 12 ? r.name.split(' ').slice(-1)[0] : '', x: r.clay, y: r.grass, color: SURF[bestS], tip: <><div className="k">{r.name} · Elo #{r.rank}</div>Hard {r.hard.toFixed(0)} · Clay {r.clay.toFixed(0)} · Grass {r.grass.toFixed(0)} · ATP {r.atp ?? '–'}</> }; })} />
        </div>
        <div className="ocard">
          <h2>Ranking against strength</h2>
          <p className="dek">ATP ranking against Elo rank. Below the line a player is ranked higher than his results deserve (often after a run of easy draws or points to defend); above, the opposite.</p>
          <QuadrantScatter height={380} invertY xLabel="Elo rank (better →)" yLabel="ATP rank (better ↑)" fmt={v => String(Math.round(Math.abs(v)))} corners={['', 'Ranked too high', 'Ranked too low', '']}
            points={top.filter(r => r.atp && r.atp <= 60).map(r => ({ id: r.name, label: Math.abs((r.atp ?? 0) - r.rank) >= 8 || r.rank <= 6 ? r.name.split(' ').slice(-1)[0] : '', x: -r.rank, y: r.atp!, tip: <><div className="k">{r.name}</div>Elo #{r.rank} · ATP #{r.atp}</> }))} />
        </div>
      </section>
      <section className="ocard">
        <h2>The top 40 on every surface</h2>
        <PercentileGrid rows={top.map(r => ({ id: r.name, label: <>{r.rank}. {r.name}</>, values: { elo: r.elo, hard: r.hard, clay: r.clay, grass: r.grass, peak: r.peak, atp: r.atp, age: r.age } }))} cols={COLS} initial="elo" />
        <Src>Source: Tennis Abstract Elo ratings, updated {s.elo?.updated}</Src>
      </section>
    </>
  );
}

/* ───────────────────────────── Players ───────────────────────────── */

const STRIPS: StripMetric[] = [{ key: 'elo', label: 'Overall Elo', fmt: v => v.toFixed(0) }, { key: 'hard', label: 'Hard courts', fmt: v => v.toFixed(0) }, { key: 'clay', label: 'Clay', fmt: v => v.toFixed(0) }, { key: 'grass', label: 'Grass', fmt: v => v.toFixed(0) }];

export function PlayersScreen({ s, t }: { s: TennisSeason; t: TennisData }) {
  const rows = s.elo?.rows.slice(0, 50) ?? [];
  const [pick, setPick] = usePick('player');
  const p = rows.find(r => r.name === pick) ?? rows[0];
  const V = useMemo(() => Object.fromEntries(rows.map(r => [r.name, { elo: r.elo, hard: r.hard, clay: r.clay, grass: r.grass }])), [rows]);
  if (!p) return null;
  const titles = t.champions.filter(c => c.name === p.name);
  const draws = Object.values(s.draws).sort((a, b) => a.year - b.year || a.slam.localeCompare(b.slam));
  const best = Math.max(p.hard, p.clay, p.grass);
  const atp = t.rankings?.ranks.find(r => r.name === p.name);
  return (
    <>
      <section className="ocard">
        <h2>Pick a player</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{rows.map(r => <button key={r.name} className="btn" aria-pressed={r.name === p.name} onClick={() => setPick(r.name)} style={{ textTransform: 'none', letterSpacing: 0, fontSize: 11.5, padding: '3px 7px', color: 'var(--o-ink)', background: r.name === p.name ? 'var(--o-accent-soft)' : 'transparent', borderColor: r.name === p.name ? 'var(--o-accent)' : 'var(--o-line)' }}>{r.rank}. {r.name}</button>)}</div>
      </section>
      <section className="ocard">
        <h2>{p.name}</h2>
        <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', margin: '6px 0 12px' }}>
          <div className="kpi"><b>{atp ? ordinal(atp.rank) : p.atp ?? '–'}</b><span>ATP ranking</span></div>
          <div className="kpi"><b>{ordinal(p.rank)}</b><span>Elo</span></div>
          <div className="kpi"><b>{p.age?.toFixed(0)}</b><span>Age</span></div>
          <div className="kpi"><b>{best === p.clay ? 'Clay' : best === p.grass ? 'Grass' : 'Hard'}</b><span>Best surface</span></div>
          <div className="kpi"><b>{titles.length}</b><span>Slam titles</span></div>
          <div className="kpi"><b>{p.peak.toFixed(0)}</b><span>Peak Elo{p.peakMonth ? `, ${p.peakMonth}` : ''}</span></div>
        </div>
        <RankStrips metrics={STRIPS} values={V} me={p.name} color="var(--o-s1)" labelOf={n => n.split(' ').slice(-1)[0]} />
        {draws.length > 0 && <><div className="lab" style={{ marginTop: 10 }}>Slams this season</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{draws.map(d => <div key={d.slam + d.year} style={{ border: '1px solid var(--o-line)', borderTop: `3px solid ${d.color}`, borderRadius: 6, padding: '6px 10px', textAlign: 'center', minWidth: 90 }}><div style={{ fontSize: 11, color: 'var(--o-ink3)' }}>{d.slam}</div><b style={{ fontSize: 16 }}>{reached(d.matches, p.name) ?? '–'}</b></div>)}</div></>}
        {titles.length > 0 && <p className="dek" style={{ marginTop: 10 }}>Slam titles: {titles.map(c => `${c.slam} ${c.year}`).join(', ')}.</p>}
        <Src>Sources: Tennis Abstract, ESPN, Wikipedia</Src>
      </section>
    </>
  );
}

/* ───────────────────────────── The Slams ───────────────────────────── */

export function SlamsScreen({ t }: { t: TennisData }) {
  const slams = [...new Map(t.slams.map(x => [x.name, x])).values()];
  const [pick, setPick] = useState(slams[0]?.name ?? 'Australian Open');
  const sl = slams.find(x => x.name === pick);
  const ch = t.champions.filter(c => c.slam === pick);
  const most = Object.entries(ch.reduce<Record<string, number>>((a, c) => { a[c.name] = (a[c.name] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const nations = Object.entries(ch.filter(c => c.year >= 1968).reduce<Record<string, number>>((a, c) => { const k = c.country ?? '–'; a[k] = (a[k] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const FACTS: Record<string, string> = {
    'Australian Open': 'Melbourne Park, January. Hard courts (GreenSet since 2020), three courts with a roof; the heat policy can stop play.',
    'Roland Garros': 'Paris, late May to early June. Red clay: the slowest surface, long rallies, high bounces; the only Slam on clay.',
    Wimbledon: 'London, late June to July. Grass: the fastest surface, low bounces, short points; the oldest tournament (1877), all-white dress code.',
    'US Open': 'New York, late August to September. Hard courts (Laykold), night sessions, a final-set tie-break at 6–6 like every Slam since 2022.',
  };
  return (
    <section className="ocard">
      <h2>The four Slams</h2>
      <Chips label="Slam" items={slams.map(x => ({ k: x.name, label: x.name }))} value={pick} set={setPick} />
      <p className="dek">{FACTS[pick] ?? ''}{sl ? ` Next: ${fmt(Date.parse(sl.start), { day: 'numeric', month: 'long', year: 'numeric' })}.` : ''}</p>
      <div className="s-two" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div>
          <div className="lab">Most titles</div>
          {most.map(([n, k]) => <div key={n} style={{ display: 'grid', gridTemplateColumns: '170px 1fr 24px', gap: 8, alignItems: 'center', fontSize: 12.5, margin: '3px 0' }}><span>{n}</span><span style={{ height: 10, width: `${(k / most[0][1]) * 100}%`, background: sl?.color ?? 'var(--o-s1)', borderRadius: 2 }} /><b>{k}</b></div>)}
          <div className="lab" style={{ marginTop: 12 }}>Champions' nations since 1968 (the Open era)</div>
          <div style={{ fontSize: 12.5 }}>{nations.map(([n, k]) => `${n} ${k}`).join(' · ')}</div>
        </div>
        <div>
          <div className="lab">The last 25 champions</div>
          <table className="otable" style={{ fontSize: 12.5 }}><tbody>{[...ch].reverse().slice(0, 25).map(c => <tr key={c.year}><td>{c.year}</td><td>{c.name}</td><td style={{ color: 'var(--o-ink3)' }}>{c.country}</td></tr>)}</tbody></table>
        </div>
      </div>
      <Src>Source: Wikipedia</Src>
    </section>
  );
}

/* ───────────────────────────── How it works ───────────────────────────── */

export function HowScreen() {
  const P = ({ children }: { children: ReactNode }) => <p style={{ margin: '0 0 10px', lineHeight: 1.55, fontSize: 14 }}>{children}</p>;
  return (
    <section className="s-two">
      <div className="ocard">
        <h2>A Grand Slam</h2>
        <P><b>128 players</b> in the men's draw (104 or so by ranking, 16 from qualifying, 8 wild cards), <b>seven rounds</b> over two weeks. The 32 best-ranked are seeded so they cannot meet early: the top two only in the final.</P>
        <P><b>Best of five sets</b> for men. At 6–6 in the deciding set a tie-break to 10 points decides the match (the same rule at all four Slams since 2022).</P>
        <P>Ranking points: 2,000 to the champion, 1,300 to the finalist, 800 to a semi-finalist, down to 10 for a first-round loss.</P>
      </div>
      <div className="ocard">
        <h2>Rankings and ratings</h2>
        <P><b>ATP ranking:</b> the points of a player's best 19 tournaments over the last 52 weeks (the four Slams and the Masters count automatically). Points from a year ago drop off, so the ranking also reflects what a player has to defend.</P>
        <P><b>Elo rating</b> (Tennis Abstract): every match moves points from the loser to the winner, more when the winner was the underdog. It measures strength right now, and can be split by surface. A 100-point gap is about a 64% chance of winning.</P>
      </div>
    </section>
  );
}
