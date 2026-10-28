// World Cup & Euros screens beyond the home (national team strength by World Football
// Elo, Italy, the record of both tournaments) and the Milan Season and Power screens
// (Serie A with expected goals). Data: football.json and football-season.json.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { DiffBars, MultiLine } from '../components/charts';
import { Dumbbells, PercentileGrid, QuadrantScatter, RankStrips, Spaghetti, ordinal, ranks, type GridCol, type StripMetric } from '../components/power';
import { getJSON } from '../core/fetcher';
import { COUNTRY, EURO_WINNERS, WC_WINNERS } from '../sources/football';
import { fmt } from '../core/time';

export const WC_TABS = [['now', 'Now'], ['power', 'Power'], ['italy', 'Italy'], ['history', 'History'], ['how', 'How it works']] as const;
export type WcTab = typeof WC_TABS[number][0];

interface SaGame { date: string; home: boolean; xg: number; xga: number; npxg: number; npxga: number; ppda: number | null; ppdaAllowed: number | null; deep: number; deepAllowed: number; gf: number; ga: number; xpts: number; pts: number; result: string; opp: string | null }
export interface FootballSeason {
  updated: string;
  elo: { table: { rank: number; code: string; name: string; rating: number; peak: number }[]; history: Record<string, { name: string; years: [number, number][] }>; italy: { date: string; home: string; away: string; hs: number; as: number; type: string; venue: string | null; change: number; after: number; opp: string }[] } | null;
  serieA: { season: number; teams: { id: string; name: string; games: SaGame[] }[] } | null;
}
export function useFootballSeason(enabled = true) {
  const [d, setD] = useState<FootballSeason | null>(null);
  useEffect(() => { if (!enabled) return; let on = true; getJSON<FootballSeason>(`${import.meta.env.BASE_URL}data/football-season.json`, 30 * 60e3).then(x => on && setD(x)).catch(() => {}); return () => { on = false; }; }, [enabled]);
  return d;
}

const Src = ({ children }: { children: ReactNode }) => <div className="osrc">{children}</div>;
const AZZURRO = '#0066b3';
const TYPE: Record<string, string> = { F: 'Friendly', WC: 'World Cup', WCQ: 'World Cup qualifier', EC: 'Euro', ECQ: 'Euro qualifier', ENA: 'Nations League', ENB: 'Nations League', ENQ: 'Nations League play-off', CA: 'Copa América' };
const RIVAL_COL: Record<string, string> = { IT: AZZURRO, FR: '#1d3f8c', ES: '#c60b1e', EN: 'var(--o-ink2)', DE: 'var(--o-ink)', PT: '#006600', NL: '#ff6600', AR: '#74acdf', BR: '#e8c200' };

/* ───────────────────────────── National teams: Power ───────────────────────────── */

export function PowerScreen({ s }: { s: FootballSeason }) {
  const e = s.elo;
  if (!e) return <section className="ocard"><p className="dek">Ratings not available.</p></section>;
  const it = e.table.find(t => t.code === 'IT');
  const years = [...new Set(Object.values(e.history).flatMap(h => h.years.map(y => y[0])))].sort((a, b) => a - b).filter(y => y >= 2000);
  const max = e.table[0]?.rating ?? 1, min = e.table[39]?.rating ?? 0;
  return (
    <>
      <section className="ocard">
        <h2>The strongest national teams</h2>
        <p className="dek">World Football Elo: every match moves points from loser to winner, more for a surprise, a big margin or an important game. It weighs results better than the FIFA ranking. Number one: <b>{e.table[0]?.name}</b>. Italy: <b>{it ? `${ordinal(it.rank)}, ${it.rating}` : '–'}</b>. A 100-point gap is about a 64% chance of winning.</p>
        <div style={{ columns: '2 300px', columnGap: 30 }}>
          {e.table.slice(0, 40).map(t => <div key={t.code} style={{ breakInside: 'avoid', display: 'grid', gridTemplateColumns: '22px 120px 1fr 44px', gap: 8, alignItems: 'center', fontSize: 12.5, margin: '3px 0', fontWeight: t.code === 'IT' ? 700 : 400 }}><span style={{ color: 'var(--o-ink3)' }}>{t.rank}</span><span>{t.name}</span><span style={{ height: 10, width: `${((t.rating - min + 50) / (max - min + 50)) * 100}%`, background: t.code === 'IT' ? AZZURRO : 'var(--o-other)', borderRadius: 2 }} /><b>{t.rating}</b></div>)}
        </div>
        <Src>Source: eloratings.net</Src>
      </section>
      <section className="ocard">
        <h2>The big nations since 2000</h2>
        <p className="dek">Elo at the end of every year: the rise and fall of the great football nations. Italy in blue.</p>
        <MultiLine steps={years.map(String)} unit="Elo" series={Object.entries(e.history).map(([code, h]) => ({ name: h.name, color: RIVAL_COL[code] ?? 'var(--o-other)', values: years.map(y => h.years.find(x => x[0] === y)?.[1] ?? null) }))} />
        <Src>Source: eloratings.net</Src>
      </section>
    </>
  );
}

/* ───────────────────────────── Italy ───────────────────────────── */

export function ItalyScreen({ s }: { s: FootballSeason }) {
  const e = s.elo;
  if (!e) return null;
  const ms = e.italy;
  const w = ms.filter(m => (m.home === 'IT' ? m.hs > m.as : m.as > m.hs)).length, d = ms.filter(m => m.hs === m.as).length;
  const it = e.history.IT;
  const peak = it ? it.years.reduce((a, y) => (y[1] > a[1] ? y : a), it.years[0]) : null;
  return (
    <>
      <section className="ocard">
        <h2>Italy, match by match</h2>
        <p className="dek">The last {ms.length} matches: {w} wins, {d} draws, {ms.length - w - d} defeats. The bars show how many Elo points each result won or lost.{peak ? ` Italy's best year-end rating since 1990: ${peak[1]} in ${peak[0]}.` : ''}</p>
        <DiffBars color={AZZURRO} bars={[...ms].reverse().map(m => ({ label: '', value: m.change, tip: `${fmt(Date.parse(m.date), { day: 'numeric', month: 'short', year: 'numeric' })} · ${m.home === 'IT' ? 'Italy' : m.opp} ${m.hs}–${m.as} ${m.home === 'IT' ? m.opp : 'Italy'} · ${TYPE[m.type] ?? m.type} · Elo ${m.change > 0 ? '+' : ''}${m.change} → ${m.after}` }))} />
      </section>
      <section className="ocard">
        <h2>Every recent match</h2>
        <table className="otable" style={{ fontSize: 12.5 }}><tbody>{ms.map(m => { const home = m.home === 'IT', gf = home ? m.hs : m.as, ga = home ? m.as : m.hs; return <tr key={m.date + m.opp}><td style={{ whiteSpace: 'nowrap' }}>{fmt(Date.parse(m.date), { day: 'numeric', month: 'short', year: 'numeric' })}</td><td>{home ? '' : 'at '}{m.opp}</td><td className="n" style={{ fontWeight: 700, color: gf > ga ? 'var(--o-s3)' : gf < ga ? 'var(--o-s2)' : 'var(--o-ink2)' }}>{gf}–{ga}</td><td style={{ color: 'var(--o-ink3)' }}>{TYPE[m.type] ?? m.type}</td><td className="n">{m.change > 0 ? '+' : ''}{m.change}</td><td className="n">{m.after}</td></tr>; })}</tbody></table>
        <Src>Source: eloratings.net</Src>
      </section>
    </>
  );
}

/* ───────────────────────────── History ───────────────────────────── */

export function HistoryScreen({ wcLatest }: { wcLatest?: { year: number; abbr: string } | null }) {
  const wc: [number, string][] = [...WC_WINNERS, ...(wcLatest && !WC_WINNERS.some(([y]) => y === wcLatest.year) ? [[wcLatest.year, wcLatest.abbr] as [number, string]] : [])];
  const lists: [string, [number, string][]][] = [['World Cup', wc], ['European Championship', EURO_WINNERS]];
  const name = (c: string) => COUNTRY[c] ?? c;
  return (
    <>
      {lists.map(([title, ws]) => {
        const decades = [...new Set(ws.map(([y]) => Math.floor(y / 10) * 10))];
        return (
          <section key={title} className="ocard">
            <h2>{title}: every winner</h2>
            <p className="dek">One tile per edition; Italy in blue. {title === 'World Cup' ? 'No tournament in 1942 and 1946 (war).' : 'Held every four years since 1960; 2020 was played in 2021.'}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {ws.map(([y, c]) => <div key={y} title={`${y}: ${name(c)}`} style={{ width: 62, padding: '5px 0', textAlign: 'center', borderRadius: 4, background: c === 'ITA' ? AZZURRO : 'var(--o-grid)', color: c === 'ITA' ? '#fff' : 'var(--o-ink)', fontSize: 11 }}><b>{y}</b><br />{c}</div>)}
            </div>
            <table className="otable" style={{ fontSize: 12, marginTop: 12 }}><thead><tr><th>Decade</th><th>Champions</th></tr></thead>
              <tbody>{decades.map(dc => <tr key={dc}><td>{dc}s</td><td>{ws.filter(([y]) => Math.floor(y / 10) * 10 === dc).map(([y, c]) => <span key={y} style={{ marginRight: 12, fontWeight: c === 'ITA' ? 700 : 400, color: c === 'ITA' ? AZZURRO : undefined }}>{name(c)} {y}</span>)}</td></tr>)}</tbody></table>
          </section>
        );
      })}
    </>
  );
}

export function HowScreen() {
  const P = ({ children }: { children: ReactNode }) => <p style={{ margin: '0 0 10px', lineHeight: 1.55, fontSize: 14 }}>{children}</p>;
  return (
    <section className="s-two">
      <div className="ocard">
        <h2>The World Cup</h2>
        <P><b>48 teams</b> since 2026 (it was 32): twelve groups of four, the top two and the eight best third-placed teams go to a round of 32, then knock-out to the final. Every four years; the 2030 edition is shared by Spain, Portugal and Morocco, with three opening games in South America for the centenary.</P>
        <P><b>Qualifying</b> is by confederation: Europe (UEFA) has 16 places, decided by groups and play-offs.</P>
      </div>
      <div className="ocard">
        <h2>The European Championship</h2>
        <P><b>24 teams</b>, six groups of four; the top two and the four best third-placed teams go to the round of 16. Euro 2028 is in the United Kingdom and Ireland.</P>
        <P>The <b>Nations League</b> fills the autumn: its final standings decide the pots of the qualifying draw and give a second route, through play-offs, to teams that miss out in their group.</P>
      </div>
    </section>
  );
}

/* ───────────────────────────── Milan: Season and Power ───────────────────────────── */

const MILAN = 'AC Milan';
const ROSSO = '#fb090b';

function teamTotals(t: { games: SaGame[] }) {
  const g = t.games, n = g.length || 1, sum = (k: keyof SaGame) => g.reduce((a, x) => a + (Number(x[k]) || 0), 0);
  const ppd = g.map(x => x.ppda).filter((x): x is number => x != null);
  return { games: g.length, pts: sum('pts'), xpts: sum('xpts'), gf: sum('gf'), ga: sum('ga'), xg: sum('xg') / n, xga: sum('xga') / n, npxg: sum('npxg') / n, npxga: sum('npxga') / n, ppda: ppd.reduce((a, x) => a + x, 0) / (ppd.length || 1), deep: sum('deep') / n, deepAllowed: sum('deepAllowed') / n, finishing: (sum('gf') - sum('xg')) / n, keeping: (sum('xga') - sum('ga')) / n, luck: sum('pts') - sum('xpts') };
}

export function MilanSeason({ s }: { s: FootballSeason }) {
  const sa = s.serieA;
  const m = sa?.teams.find(t => t.name === MILAN);
  if (!sa || !m) return <section className="ocard"><p className="dek">Serie A data not available.</p></section>;
  // Points after each matchday, every team
  const n = Math.max(...sa.teams.map(t => t.games.length));
  const cum = (t: { games: SaGame[] }) => { let a = 0; return Array.from({ length: n }, (_, i) => (t.games[i] ? (a += t.games[i].pts) : null)); };
  const tops = [...sa.teams].sort((a, b) => teamTotals(b).pts - teamTotals(a).pts).slice(0, 4).map(t => t.name);
  return (
    <>
      <section className="s-two">
        <div className="ocard">
          <h2>Match by match</h2>
          <p className="dek">Expected goals for (blue) and against (orange) in every Serie A match: the quality of the chances, whatever the score.</p>
          <Dumbbells aLabel="xG against" bLabel="xG for" aColor="var(--o-s2)" bColor="var(--o-s1)" better="high" fmt={v => v.toFixed(2)} rows={m.games.map((g, i) => ({ id: String(i), label: `${g.home ? '' : '@'}${(g.opp ?? '').slice(0, 10)} ${g.gf}–${g.ga}`, a: g.xga, b: g.xg }))} />
        </div>
        <div className="ocard">
          <h2>Results against chances</h2>
          <p className="dek">Points won in each match against the expected points of the chances created and conceded (xPTS).</p>
          <DiffBars color={ROSSO} bars={m.games.map(g => ({ label: (g.opp ?? '').slice(0, 3).toUpperCase(), value: Math.round((g.pts - g.xpts) * 10) / 10, tip: `${g.home ? 'vs' : 'at'} ${g.opp}: ${g.gf}–${g.ga} · xG ${g.xg}–${g.xga} · ${g.pts} pts from ${g.xpts} expected` }))} />
        </div>
      </section>
      <section className="ocard">
        <h2>The title race</h2>
        <p className="dek">Points after every matchday; Milan in red, the current top four in colour.</p>
        <Spaghetti zero={false} fmt={v => String(Math.round(v))} steps={Array.from({ length: n }, (_, i) => `MD${i + 1}`)} series={sa.teams.map(t => ({ id: t.id, label: t.name, values: cum(t), color: t.name === MILAN ? ROSSO : tops.includes(t.name) ? ['var(--o-s1)', 'var(--o-s3)', 'var(--o-s4)', 'var(--o-ink2)'][tops.indexOf(t.name)] : undefined }))} />
        <Src>Source: Understat</Src>
      </section>
    </>
  );
}

const STRIPS: StripMetric[] = [
  { key: 'xg', label: 'Chances created', note: 'xG per match', fmt: v => v.toFixed(2) },
  { key: 'xga', label: 'Chances conceded', note: 'xG against per match', fmt: v => v.toFixed(2), low: true },
  { key: 'finishing', label: 'Finishing', note: 'goals minus xG per match', fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(2)}` },
  { key: 'keeping', label: 'Goalkeeping and defending', note: 'xG against minus goals against', fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(2)}` },
  { key: 'ppda', label: 'Pressing', note: 'opponent passes per defensive action (lower = higher press)', fmt: v => v.toFixed(1), low: true },
  { key: 'deep', label: 'Getting into the box', note: 'passes into the area per match', fmt: v => v.toFixed(1) },
  { key: 'deepAllowed', label: 'Keeping them out', note: 'opponent passes into the area', fmt: v => v.toFixed(1), low: true },
  { key: 'xpts', label: 'Expected points', fmt: v => v.toFixed(1) },
  { key: 'luck', label: 'Points above expected', fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
];

export function MilanPower({ s }: { s: FootballSeason }) {
  const sa = s.serieA;
  const V = useMemo(() => Object.fromEntries((sa?.teams ?? []).map(t => [t.name, teamTotals(t)])) as Record<string, Record<string, number>>, [sa]);
  if (!sa || !V[MILAN]) return <section className="ocard"><p className="dek">Serie A data not available.</p></section>;
  const rivals = ['Inter', 'Juventus', 'Napoli', 'Roma'].filter(r => V[r]);
  const rk = (k: string, low = false) => ranks(Object.fromEntries(Object.entries(V).map(([a, v]) => [a, v[k]])), low)[MILAN];
  const strong = STRIPS.map(m => ({ m, r: rk(m.key, m.low) })).sort((a, b) => a.r - b.r);
  const cols: GridCol[] = [{ key: 'pts', label: 'Points', fmt: v => String(v) }, { key: 'xpts', label: 'xPTS', fmt: v => v.toFixed(1) }, { key: 'xg', label: 'xG/90', fmt: v => v.toFixed(2) }, { key: 'xga', label: 'xGA/90', fmt: v => v.toFixed(2), low: true }, { key: 'finishing', label: 'Finishing', fmt: v => v.toFixed(2) }, { key: 'ppda', label: 'PPDA', fmt: v => v.toFixed(1), low: true }, { key: 'deep', label: 'Deep', fmt: v => v.toFixed(1) }, { key: 'deepAllowed', label: 'Deep allowed', fmt: v => v.toFixed(1), low: true }];
  return (
    <>
      <section className="ocard">
        <h2>Milan against Serie A</h2>
        <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', margin: '6px 0 12px' }}>
          <div className="kpi"><b>{V[MILAN].pts}</b><span>Points</span></div>
          <div className="kpi"><b>{V[MILAN].xpts.toFixed(1)}</b><span>Expected points</span></div>
          <div className="kpi"><b>{ordinal(rk('pts'))}</b><span>On points</span></div>
          <div className="kpi"><b>{ordinal(rk('xpts'))}</b><span>On chances</span></div>
          <div className="kpi"><b>{V[MILAN].gf}–{V[MILAN].ga}</b><span>Goals</span></div>
        </div>
        <p className="dek"><b>Best at:</b> {strong.slice(0, 3).map(x => `${x.m.label} (${ordinal(x.r)})`).join(', ')}. <b>Weakest at:</b> {strong.slice(-3).reverse().map(x => `${x.m.label} (${ordinal(x.r)})`).join(', ')}.</p>
        <div className="olegend"><span><i style={{ background: ROSSO }} />Milan</span>{rivals.map((r, i) => <span key={r}><i style={{ background: ['var(--o-s1)', 'var(--o-ink)', 'var(--o-s4)', 'var(--o-s2)'][i] }} />{r}</span>)}<span><i style={{ background: 'var(--o-other)' }} />Rest of Serie A</span></div>
        <RankStrips metrics={STRIPS} values={V} me={MILAN} color={ROSSO} labelOf={n => n} compare={rivals.map((r, i) => ({ id: r, color: ['var(--o-s1)', 'var(--o-ink)', 'var(--o-s4)', 'var(--o-s2)'][i] }))} />
        <Src>Source: Understat (Serie A only)</Src>
      </section>
      <section className="s-two">
        <div className="ocard">
          <h2>Attack against defence</h2>
          <p className="dek">Expected goals created and conceded per match, every Serie A team.</p>
          <QuadrantScatter height={360} invertY xLabel="xG for per match" yLabel="xG against (less ↑)" corners={['Dominant', 'Solid', 'Open', 'Struggling']}
            points={Object.entries(V).map(([n, v]) => ({ id: n, label: n.replace('AC ', ''), x: v.xg, y: v.xga, color: n === MILAN ? ROSSO : rivals.includes(n) ? 'var(--o-ink2)' : undefined, tip: <><div className="k">{n}</div>xG {v.xg.toFixed(2)} for, {v.xga.toFixed(2)} against per match · {v.pts} pts ({v.xpts.toFixed(1)} expected)</> }))} />
        </div>
        <div className="ocard">
          <h2>Every team</h2>
          <PercentileGrid rows={Object.keys(V).map(n => ({ id: n, label: n, values: V[n], me: n === MILAN }))} cols={cols} initial="pts" />
        </div>
      </section>
    </>
  );
}
