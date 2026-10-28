// MLB screens beyond the home: the season day by day, team strength, every team, the
// players, the awards race, the off-season moves, history and the rules; plus the Dodgers'
// Season and Power screens. Data: public/data/mlb-season.json (MLB Stats API) and ESPN live.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { DiffBars } from '../components/charts';
import { Score } from '../components/common';
import { PercentileGrid, QuadrantScatter, RankStrips, Spaghetti, WinProb, ordinal, ranks, type GridCol, type StripMetric } from '../components/power';
import { Chips, usePick } from '../components/tabs';
import { getJSON } from '../core/fetcher';
import { DAY, dayLong, dayShort, fmt, hhmm, sportsDay } from '../core/time';
import { memJSON } from '../sources/gamecast';
import { LEAGUES, leagueDay, type LeagueGame } from '../sources/leagueDay';

export const MLB_TABS = [['now', 'Now'], ['season', 'Season'], ['power', 'Power'], ['teams', 'Teams'], ['players', 'Players'], ['awards', 'Awards race'], ['offseason', 'Off-season'], ['history', 'History'], ['how', 'How it works']] as const;
export type MlbTab = typeof MLB_TABS[number][0];

export interface MlbTeam { id: number; abbr: string; name: string; short: string; league: 'AL' | 'NL'; division: string; espn: string | null; color: string | null; alt: string | null }
export interface MlbFile {
  updated: string; season: number; teams: MlbTeam[];
  standings: Record<string, { w: number; l: number; pct: number; rs: number; ra: number; gb: string; divRank: number; wc: number | null; streak: string; splits: Record<string, [number, number]> }>;
  power: Record<string, Record<string, number | null>>;
  games: { id: number; date: string; type: string; h: number; a: number; hs: number; as: number; series: string | null }[];
  batters: { id: number; name: string; team: number; pos: string | null; pa: number; hr: number; sb: number; avg: number; obp: number; slg: number; ops: number; war: number; wrc: number; woba: number; bat: number; fld: number; run: number }[];
  pitchers: { id: number; name: string; team: number; ip: number; gs: number; g: number; era: number; whip: number; so: number; bb: number; w: number; sv: number; k9: number; war: number; fip: number; xfip: number }[];
  transactions: { date: string; type: string; team: number | null; from: number | null; to: number | null; player: string | null; text: string }[];
  markets: Record<string, { label: string; rows: { name: string; p: number }[] }>;
  history: { worldSeries: { year: number; winner: string; loser: string; league: string; games: string | null }[]; seasons: Record<string, Record<string, { w: number; l: number; pct: number; diff: number; div: boolean }>> };
}
export function useMlbSeason(enabled = true) {
  const [d, setD] = useState<MlbFile | null>(null);
  useEffect(() => { if (!enabled) return; let on = true; getJSON<MlbFile>(`${import.meta.env.BASE_URL}data/mlb-season.json`, 15 * 60e3).then(x => on && setD(x)).catch(() => {}); return () => { on = false; }; }, [enabled]);
  return d;
}

export const LAD = 119;
const Src = ({ children }: { children: ReactNode }) => <div className="osrc">{children}</div>;
const f3 = (v: number | null | undefined) => (v == null ? '–' : v.toFixed(3).replace(/^0/, ''));
const f2 = (v: number | null | undefined) => (v == null ? '–' : v.toFixed(2));
const pc = (v: number) => `${(v * 100).toFixed(1)}%`;
export const MlbLogo = ({ t }: { t?: MlbTeam }) => t?.espn ? <><img className="lg-light" src={`https://a.espncdn.com/i/teamlogos/mlb/500/${t.espn}.png`} alt="" loading="lazy" style={{ height: '1.15em', width: '1.15em', objectFit: 'contain', verticalAlign: '-0.2em', marginRight: '0.4em' }} /><img className="lg-dark" src={`https://a.espncdn.com/i/teamlogos/mlb/500-dark/${t.espn}.png`} alt="" loading="lazy" style={{ height: '1.15em', width: '1.15em', objectFit: 'contain', verticalAlign: '-0.2em', marginRight: '0.4em' }} /></> : null;
export const mlbInk = (t?: MlbTeam) => {
  const lum = (h: string | null) => { if (!h) return -1; const n = parseInt(h.replace('#', ''), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
  for (const c of [t?.color ?? null, t?.alt ?? null]) { const l = lum(c); if (l > 0.12 && l < 0.75) return c!; }
  return 'var(--o-accent)';
};
const useT = (d: MlbFile) => useMemo(() => Object.fromEntries(d.teams.map(t => [t.id, t])), [d]);
const DIVS = ['East', 'Central', 'West'];

/* ───────────────────────────── Season ───────────────────────────── */

const ymd = (t: number) => fmt(t, { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-');

export function SeasonScreen({ d, now }: { d: MlbFile; now: number }) {
  const T = useT(d);
  const [pick, setPick] = usePick('day');
  const today = sportsDay(now);
  const lastGame = d.games.at(-1)?.date;
  const def = lastGame && Date.parse(`${lastGame}T12:00:00Z`) < today - DAY ? sportsDay(Date.parse(`${lastGame}T18:00:00Z`)) : today;
  const day = pick ? sportsDay(Date.parse(`${pick}T18:00:00Z`)) : def;
  const [games, setGames] = useState<LeagueGame[] | null>(null);
  useEffect(() => {
    let on = true; setGames(null);
    const l = LEAGUES.find(x => x.key === 'mlb')!;
    const load = () => leagueDay(l, day, day + DAY, true).then(g => on && setGames(g)).catch(() => on && setGames([]));
    load();
    const t = day === today ? setInterval(load, 30e3) : 0;
    return () => { on = false; if (t) clearInterval(t); };
  }, [day, today]);
  const go = (t: number) => setPick(ymd(t + 12 * 3600e3));
  return (
    <>
      <section className="ocard">
        <h2>Day by day</h2>
        <p className="dek">Every game of {d.season}. A day runs from 07:00 to 07:00 Rome time. Open a finished game for the box score and the chance of winning through it.</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0 12px', flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => go(day - DAY)}>‹ Previous</button>
          <b style={{ minWidth: 200, textAlign: 'center' }}>{dayLong(day + 12 * 3600e3)}</b>
          <button className="btn" onClick={() => go(day + DAY)}>Next ›</button>
        </div>
        {!games ? <p className="dek">Loading…</p> : !games.length ? <p className="dek">No games on this day.</p> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10, alignItems: 'start' }}>{games.map(g => <DayGame key={g.id} g={g} />)}</div>
        )}
        <Src>Source: ESPN</Src>
      </section>
      <AboveFive d={d} T={T} />
    </>
  );
}

function DayGame({ g }: { g: LeagueGame }) {
  const [open, setOpen] = useState(false);
  const live = g.state === 'in';
  return (
    <div style={{ border: `1px solid ${live ? '#ff453a' : 'var(--o-line)'}`, borderRadius: 10, padding: '8px 10px', gridColumn: open ? '1 / -1' : undefined }}>
      <button onClick={() => setOpen(!open)} disabled={g.state === 'pre'} aria-expanded={open} style={{ all: 'unset', display: 'block', width: '100%', cursor: g.state === 'pre' ? 'default' : 'pointer' }}>
        {g.away && g.home && [g.away, g.home].map(s => <div key={s.abbr} style={{ display: 'flex', fontSize: 13, fontWeight: s.winner ? 700 : 400, color: g.state === 'post' && s.winner === false ? 'var(--o-ink3)' : 'var(--o-ink)' }}><span style={{ flex: 1 }}>{s.name}</span>{g.state !== 'pre' && <Score as="b">{s.score}</Score>}</div>)}
        <div style={{ fontSize: 11, color: live ? '#ff453a' : 'var(--o-ink3)', marginTop: 2 }}>{g.state === 'pre' ? `${hhmm(g.start)} Rome` : g.clock ?? (live ? 'Live' : 'Final')}{g.line.series ? ` · ${g.line.series}` : ''}{g.state !== 'pre' && <span style={{ float: 'right' }}>{open ? 'Close ▲' : 'Box score ▼'}</span>}</div>
      </button>
      {open && g.espn && <BaseballBox id={g.espn.id} live={live} />}
    </div>
  );
}

interface BBox { lines: { abbr: string; runs: string[]; r: number; h: number; e: number }[]; wp: { t: number; p: number }[]; home: string; away: string; tables: { abbr: string; kind: string; labels: string[]; rows: { name: string; pos: string; stats: string[] }[] }[]; innings: number }

async function loadBaseball(id: string, live: boolean): Promise<BBox> {
  const j = await memJSON<any>(`https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${id}`, live ? 15e3 : 30 * 60e3); // eslint-disable-line @typescript-eslint/no-explicit-any
  const comp = j.header.competitions[0];
  const H = comp.competitors.find((c: { homeAway: string }) => c.homeAway === 'home'), A = comp.competitors.find((c: { homeAway: string }) => c.homeAway === 'away');
  const innings = Math.max(9, ...[H, A].map((c: { linescores?: unknown[] }) => c.linescores?.length ?? 0));
  const idx = new Map<string, number>((j.plays ?? []).map((p: { id: string }, i: number) => [p.id, i]));
  const total = (j.plays ?? []).length || 1;
  return {
    home: H.team.abbreviation, away: A.team.abbreviation, innings,
    lines: [A, H].map((c: { team: { abbreviation: string }; linescores?: { displayValue: string }[]; score: string; hits?: number; errors?: number }) => ({ abbr: c.team.abbreviation, runs: (c.linescores ?? []).map(l => l.displayValue), r: +c.score, h: c.hits ?? 0, e: c.errors ?? 0 })),
    wp: (j.winprobability ?? []).map((w: { playId: string; homeWinPercentage: number }) => idx.has(w.playId) ? { t: idx.get(w.playId)! / total, p: w.homeWinPercentage } : null).filter(Boolean),
    tables: (j.boxscore?.players ?? []).flatMap((t: { team: { abbreviation: string }; statistics: { type: string; labels: string[]; athletes: { athlete: { shortName: string }; position?: { abbreviation: string }; stats: string[] }[] }[] }) => t.statistics.map(s => ({ abbr: t.team.abbreviation, kind: s.type, labels: s.labels, rows: s.athletes.filter(a => a.stats?.length).map(a => ({ name: a.athlete.shortName, pos: a.position?.abbreviation ?? '', stats: a.stats })) }))),
  };
}

function BaseballBox({ id, live }: { id: string; live: boolean }) {
  const [b, setB] = useState<BBox | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { let on = true; const load = () => loadBaseball(id, live).then(x => on && setB(x)).catch(() => on && setErr(true)); load(); const t = live ? setInterval(load, 20e3) : 0; return () => { on = false; if (t) clearInterval(t); }; }, [id, live]);
  if (err) return <p className="dek">The box score is not available.</p>;
  if (!b) return <p className="dek">Loading the box score…</p>;
  return (
    <div style={{ marginTop: 10, display: 'grid', gap: 14 }}>
      <div style={{ overflowX: 'auto' }}><table className="otable" style={{ fontSize: 12, maxWidth: 560 }}>
        <thead><tr><th />{Array.from({ length: b.innings }, (_, i) => <th key={i} className="n">{i + 1}</th>)}<th className="n">R</th><th className="n">H</th><th className="n">E</th></tr></thead>
        <tbody>{b.lines.map(l => <tr key={l.abbr}><td><b>{l.abbr}</b></td>{Array.from({ length: b.innings }, (_, i) => <td key={i} className="n">{l.runs[i] ?? ''}</td>)}<td className="n"><b>{l.r}</b></td><td className="n">{l.h}</td><td className="n">{l.e}</td></tr>)}</tbody>
      </table></div>
      {b.wp.length > 10 && <div><div className="lab">Chance of winning through the game</div><WinProb points={b.wp} home={b.home} away={b.away} homeColor="var(--o-s1)" awayColor="var(--o-s2)" periods={b.innings} prefix="" /></div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14 }}>
        {b.tables.map(t => (
          <div key={t.abbr + t.kind} style={{ overflowX: 'auto' }}>
            <div className="lab">{t.abbr} · {t.kind}</div>
            <table className="otable" style={{ fontSize: 11.5 }}><thead><tr><th />{t.labels.map(l => <th key={l} className="n">{l}</th>)}</tr></thead>
              <tbody>{t.rows.map((r, i) => <tr key={r.name + i}><td style={{ whiteSpace: 'nowrap' }}>{r.name} <small style={{ color: 'var(--o-ink3)' }}>{r.pos}</small></td>{r.stats.map((s, k) => <td key={k} className="n">{s}</td>)}</tr>)}</tbody></table>
          </div>
        ))}
      </div>
      <Src>Source: ESPN box score</Src>
    </div>
  );
}

/** Games above or below .500 through the season, every team (division leaders in colour). */
function AboveFive({ d, T, only }: { d: MlbFile; T: Record<string, MlbTeam>; only?: number }) {
  const [lg, setLg] = useState<'AL' | 'NL'>(only ? T[only]?.league ?? 'NL' : 'NL');
  const reg = d.games.filter(g => g.type === 'R');
  const teams = d.teams.filter(t => t.league === lg);
  const series = teams.map(t => { let v = 0; const vals: number[] = []; for (const g of reg) { if (g.h !== t.id && g.a !== t.id) continue; const won = g.h === t.id ? g.hs > g.as : g.as > g.hs; v += won ? 1 : -1; vals.push(v); } return { t, vals }; });
  const n = Math.max(...series.map(s => s.vals.length));
  const lit = new Set(teams.filter(t => d.standings[t.id]?.divRank === 1).map(t => t.id));
  if (only) lit.add(only);
  return (
    <section className="ocard">
      <h2>The race, game by game</h2>
      <p className="dek">Wins minus losses after every game of the regular season. Division winners in colour.</p>
      {!only && <Chips label="League" items={[{ k: 'NL', label: 'National League' }, { k: 'AL', label: 'American League' }]} value={lg} set={setLg} />}
      <Spaghetti fmt={v => (v > 0 ? `+${v}` : String(v))} steps={Array.from({ length: n }, (_, i) => String(i + 1))} series={series.map(s => ({ id: String(s.t.id), label: s.t.short, values: Array.from({ length: n }, (_, i) => s.vals[i] ?? null), color: lit.has(s.t.id) ? mlbInk(s.t) : undefined }))} />
      <Src>Computed from MLB results</Src>
    </section>
  );
}

/* ───────────────────────────── Power ───────────────────────────── */

const COLS: GridCol[] = [
  { key: 'diffG', label: 'Run diff/G', group: 'Overall', fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(2)}` },
  { key: 'war', label: 'WAR', group: 'Overall', fmt: v => v.toFixed(1), title: 'Wins above replacement of all the team’s players' },
  { key: 'wrc', label: 'wRC+', group: 'Hitting', fmt: v => v.toFixed(0), title: 'Runs created, 100 = league average, park-adjusted' },
  { key: 'ops', label: 'OPS', group: 'Hitting', fmt: f3 },
  { key: 'iso', label: 'Power (ISO)', group: 'Hitting', fmt: f3 },
  { key: 'bbPct', label: 'BB%', group: 'Hitting', fmt: pc },
  { key: 'kPct', label: 'K%', group: 'Hitting', fmt: pc, low: true },
  { key: 'opsRisp', label: 'RISP', group: 'Hitting', fmt: f3, title: 'OPS with runners in scoring position' },
  { key: 'fip', label: 'FIP', group: 'Pitching', fmt: f2, low: true, title: 'Fielding-independent pitching: what the ERA would be from strikeouts, walks and home runs alone' },
  { key: 'spEra', label: 'SP ERA', group: 'Pitching', fmt: f2, low: true },
  { key: 'rpEra', label: 'Bullpen ERA', group: 'Pitching', fmt: f2, low: true },
  { key: 'k9', label: 'K/9', group: 'Pitching', fmt: v => v.toFixed(1) },
  { key: 'bb9', label: 'BB/9', group: 'Pitching', fmt: v => v.toFixed(1), low: true },
  { key: 'hr9', label: 'HR/9', group: 'Pitching', fmt: v => v.toFixed(2), low: true },
  { key: 'defRuns', label: 'Defence', group: 'Field', fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(0)}`, title: 'Fielding runs above average (players summed)' },
  { key: 'runRuns', label: 'Base running', group: 'Field', fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(0)}` },
];
const SIT_COLS: GridCol[] = [
  { key: 'oneRun', label: 'One-run', group: 'Win % in', fmt: v => f3(v) }, { key: 'extraInning', label: 'Extras', group: 'Win % in', fmt: v => f3(v) },
  { key: 'winners', label: 'vs winning teams', group: 'Win % in', fmt: v => f3(v) }, { key: 'home', label: 'Home', group: 'Win % in', fmt: v => f3(v) }, { key: 'away', label: 'Road', group: 'Win % in', fmt: v => f3(v) },
  { key: 'lastTen', label: 'Last 10', group: 'Win % in', fmt: v => f3(v) }, { key: 'opsVL', label: 'vs LHP', group: 'OPS against', fmt: f3 }, { key: 'opsVR', label: 'vs RHP', group: 'OPS against', fmt: f3 },
  { key: 'luck', label: 'Luck', group: 'Record vs runs', fmt: v => `${v > 0 ? '+' : ''}${(v * 162).toFixed(1)} W`, title: 'Wins above what the run differential predicts (Pythagorean)' },
];

export function mlbValues(d: MlbFile) {
  const out: Record<string, Record<string, number | null>> = {};
  for (const t of d.teams) {
    const p = d.power[t.id] ?? {}, s = d.standings[t.id];
    const sp = (k: string) => { const x = s?.splits?.[k]; return x && x[0] + x[1] ? x[0] / (x[0] + x[1]) : null; };
    out[t.id] = { ...p, diffG: p.rsg != null && p.rag != null ? p.rsg - p.rag : null, war: (p.warBat ?? 0) + (p.warPit ?? 0), oneRun: sp('oneRun'), extraInning: sp('extraInning'), winners: sp('winners'), home: sp('home'), away: sp('away'), lastTen: sp('lastTen') };
  }
  return out;
}

export function PowerScreen({ d }: { d: MlbFile }) {
  const T = useT(d);
  const V = useMemo(() => mlbValues(d), [d]);
  const best = (k: string, low = false) => Object.entries(ranks(Object.fromEntries(Object.entries(V).map(([a, v]) => [a, v[k]])), low)).find(([, r]) => r === 1)?.[0];
  const name = (id?: string) => (id ? T[id]?.short : '');
  const lit = new Set([String(LAD), ...Object.entries(V).sort((a, b) => (b[1].diffG ?? 0) - (a[1].diffG ?? 0)).slice(0, 5).map(([k]) => k)]);
  const rows = d.teams.map(t => ({ id: String(t.id), label: <><MlbLogo t={t} />{t.short}</>, values: V[t.id], me: t.id === LAD }));
  const pts = (fx: (v: Record<string, number | null>) => number | null, fy: (v: Record<string, number | null>) => number | null, tip: (t: MlbTeam) => ReactNode) => d.teams.filter(t => fx(V[t.id]) != null && fy(V[t.id]) != null).map(t => ({ id: String(t.id), label: t.abbr, x: fx(V[t.id])!, y: fy(V[t.id])!, color: lit.has(String(t.id)) ? mlbInk(t) : undefined, tip: <><div className="k">{t.name}</div>{tip(t)}</> }));
  const luck = [...d.teams].filter(t => V[t.id].luck != null).sort((a, b) => V[b.id].luck! - V[a.id].luck!);
  return (
    <>
      <section className="ocard">
        <h2>Who was strongest, and at what</h2>
        <p className="dek">Best run differential: <b>{name(best('diffG'))}</b>. Best lineup (wRC+): <b>{name(best('wrc'))}</b>; most power: <b>{name(best('iso'))}</b>. Best pitching (FIP): <b>{name(best('fip', true))}</b>; best rotation: <b>{name(best('spEra', true))}</b>; best bullpen: <b>{name(best('rpEra', true))}</b>. Best defence: <b>{name(best('defRuns'))}</b>. Luckiest: <b>{name(luck[0]?.id ? String(luck[0].id) : undefined)}</b>, unluckiest: <b>{name(luck.at(-1)?.id ? String(luck.at(-1)!.id) : undefined)}</b>.</p>
      </section>
      <section className="ocard">
        <h2>Runs scored against runs allowed</h2>
        <p className="dek">Per game. Right scores more, up allows fewer. Over a season, run differential predicts the record better than the record itself.</p>
        <QuadrantScatter invertY xLabel="Runs scored per game" yLabel="Runs allowed per game (fewer ↑)" corners={['Complete teams', 'Pitching first', 'Slugging first', 'Struggling']}
          points={pts(v => v.rsg, v => v.rag, t => <>{d.standings[t.id]?.w}-{d.standings[t.id]?.l} · {V[t.id].rsg} scored, {V[t.id].rag} allowed per game</>)} />
        <Src>Source: MLB Stats API</Src>
      </section>
      <section className="s-two">
        <div className="ocard">
          <h2>Lineup against staff</h2>
          <p className="dek">Hitting (wRC+, 100 = average) against pitching (FIP, lower is better).</p>
          <QuadrantScatter height={360} invertY xLabel="Team wRC+" yLabel="Team FIP (lower ↑)" fmt={v => v.toFixed(1)} fmtX={v => v.toFixed(0)} corners={['Both', 'Arms', 'Bats', 'Neither']}
            points={pts(v => v.wrc, v => v.fip, t => <>wRC+ {V[t.id].wrc} · FIP {f2(V[t.id].fip)} · ERA {f2(V[t.id].era)}</>)} />
        </div>
        <div className="ocard">
          <h2>Rotation against bullpen</h2>
          <p className="dek">Starters' ERA against relievers' ERA: top right is deep everywhere.</p>
          <QuadrantScatter height={360} invertY xLabel="Starters' ERA (lower →)" yLabel="Bullpen ERA (lower ↑)" fmt={v => Math.abs(v).toFixed(2)} corners={['Deep staff', 'Bullpen saves it', 'Rotation carries it', 'Thin']}
            points={pts(v => (v.spEra != null ? -v.spEra : null), v => v.rpEra, t => <>Starters {f2(V[t.id].spEra)} ERA ({V[t.id].spIp} IP) · bullpen {f2(V[t.id].rpEra)}</>)} />
        </div>
      </section>
      <section className="ocard">
        <h2>Every team, every strength</h2>
        <p className="dek">Colour = rank among the 30 teams (blue among the best). Click a column to sort.</p>
        <PercentileGrid rows={rows} cols={COLS} initial="diffG" />
        <Src>Source: MLB Stats API; team wRC+, defence and base running summed from the players</Src>
      </section>
      <section className="ocard">
        <h2>When they win</h2>
        <p className="dek">Winning percentage in close games, extra innings, against winning teams, at home and away and in the last ten; hitting against left- and right-handed pitching; and “luck”, the wins above what the runs scored and allowed predict.</p>
        <PercentileGrid rows={rows} cols={SIT_COLS} initial="oneRun" />
      </section>
      <section className="ocard">
        <h2>Lucky and unlucky</h2>
        <p className="dek">Actual wins minus the wins the run differential predicts (Pythagorean expectation). Teams far right won more close games than their play deserved.</p>
        <DiffBars color="var(--o-s1)" bars={luck.map(t => ({ label: t.abbr, value: Math.round((V[t.id].luck ?? 0) * 162), tip: `${t.name}: ${d.standings[t.id]?.w} wins, ${Math.round((V[t.id].pyth ?? 0) * 162)} expected` }))} />
      </section>
    </>
  );
}

/* ───────────────────────────── Teams ───────────────────────────── */

const STRIPS: StripMetric[] = [
  { key: 'diffG', label: 'Run differential', note: 'per game', fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(2)}` },
  { key: 'wrc', label: 'Lineup (wRC+)', fmt: v => v.toFixed(0) },
  { key: 'iso', label: 'Power (ISO)', fmt: f3 },
  { key: 'bbPct', label: 'Plate discipline (BB%)', fmt: pc },
  { key: 'kPct', label: 'Strikeouts (K%)', fmt: pc, low: true },
  { key: 'opsRisp', label: 'With runners in scoring position', note: 'OPS', fmt: f3 },
  { key: 'fip', label: 'Pitching (FIP)', fmt: f2, low: true },
  { key: 'spEra', label: 'Rotation (ERA)', fmt: f2, low: true },
  { key: 'rpEra', label: 'Bullpen (ERA)', fmt: f2, low: true },
  { key: 'k9', label: 'Strikeouts per 9', fmt: v => v.toFixed(1) },
  { key: 'defRuns', label: 'Defence', note: 'runs above average', fmt: v => v.toFixed(0) },
  { key: 'runRuns', label: 'Base running', note: 'runs above average', fmt: v => v.toFixed(0) },
  { key: 'oneRun', label: 'One-run games', note: 'win %', fmt: f3 },
];

export function TeamProfile({ d, id }: { d: MlbFile; id: number }) {
  const T = useT(d);
  const V = useMemo(() => mlbValues(d), [d]);
  const t = T[id], s = d.standings[id], p = d.power[id];
  const rivals = d.teams.filter(x => x.league === t?.league && x.division === t?.division && x.id !== id);
  const rk = (k: string, low = false) => ranks(Object.fromEntries(Object.entries(V).map(([a, v]) => [a, v[k]])), low)[id];
  const strong = STRIPS.map(m => ({ m, r: rk(m.key, m.low) })).filter(x => x.r).sort((a, b) => a.r - b.r);
  const bats = d.batters.filter(b => b.team === id).slice(0, 10), arms = d.pitchers.filter(b => b.team === id).slice(0, 10);
  if (!t || !s) return null;
  return (
    <>
      <section className="ocard">
        <h2><MlbLogo t={t} />{t.name}</h2>
        <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', margin: '6px 0 12px' }}>
          <div className="kpi"><b>{s.w}-{s.l}</b><span>Record</span></div>
          <div className="kpi"><b>{s.rs - s.ra > 0 ? '+' : ''}{s.rs - s.ra}</b><span>Run differential</span></div>
          <div className="kpi"><b>{ordinal(s.divRank)}</b><span>{t.league} {t.division}</span></div>
          <div className="kpi"><b>{((p?.warBat ?? 0) + (p?.warPit ?? 0)).toFixed(1)}</b><span>Team WAR</span></div>
          <div className="kpi"><b>{Math.round((p?.pyth ?? 0) * 162)}</b><span>Expected wins</span></div>
        </div>
        {strong.length > 3 && <p className="dek"><b>Best at:</b> {strong.slice(0, 3).map(x => `${x.m.label} (${ordinal(x.r)})`).join(', ')}. <b>Weakest at:</b> {strong.slice(-3).reverse().map(x => `${x.m.label} (${ordinal(x.r)})`).join(', ')}.</p>}
        <div className="olegend"><span><i style={{ background: mlbInk(t) }} />{t.short}</span>{rivals.map((r, i) => <span key={r.id}><i style={{ background: ['var(--o-s4)', 'var(--o-s3)', 'var(--o-s2)', 'var(--o-ink2)'][i] }} />{r.short}</span>)}<span><i style={{ background: 'var(--o-other)' }} />Rest of MLB</span></div>
        <RankStrips metrics={STRIPS} values={V} me={String(id)} color={mlbInk(t)} labelOf={a => T[a]?.abbr ?? a} compare={rivals.map((r, i) => ({ id: String(r.id), color: ['var(--o-s4)', 'var(--o-s3)', 'var(--o-s2)', 'var(--o-ink2)'][i] }))} />
        <Src>Source: MLB Stats API</Src>
      </section>
      <section className="s-two">
        <div className="ocard">
          <h2>Best hitters by WAR</h2>
          <table className="otable" style={{ fontSize: 12 }}><thead><tr><th>Player</th><th className="n">PA</th><th className="n">OPS</th><th className="n">HR</th><th className="n">wRC+</th><th className="n">WAR</th></tr></thead>
            <tbody>{bats.map(b => <tr key={b.id}><td>{b.name} <small style={{ color: 'var(--o-ink3)' }}>{b.pos}</small></td><td className="n">{b.pa}</td><td className="n">{f3(b.ops)}</td><td className="n">{b.hr}</td><td className="n">{b.wrc}</td><td className="n"><b>{b.war}</b></td></tr>)}</tbody></table>
        </div>
        <div className="ocard">
          <h2>Best pitchers by WAR</h2>
          <table className="otable" style={{ fontSize: 12 }}><thead><tr><th>Pitcher</th><th className="n">IP</th><th className="n">ERA</th><th className="n">FIP</th><th className="n">K</th><th className="n">WAR</th></tr></thead>
            <tbody>{arms.map(b => <tr key={b.id}><td>{b.name} <small style={{ color: 'var(--o-ink3)' }}>{b.gs >= 10 ? 'SP' : 'RP'}</small></td><td className="n">{b.ip}</td><td className="n">{f2(b.era)}</td><td className="n">{f2(b.fip)}</td><td className="n">{b.so}</td><td className="n"><b>{b.war}</b></td></tr>)}</tbody></table>
        </div>
      </section>
    </>
  );
}

export function TeamsScreen({ d }: { d: MlbFile }) {
  const [pick, setPick] = usePick('team');
  const id = d.teams.some(t => String(t.id) === pick) ? Number(pick) : LAD;
  return (
    <>
      <section className="ocard">
        <h2>Pick a team</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
          {(['AL', 'NL'] as const).flatMap(lg => DIVS.map(dv => [lg, dv] as const)).map(([lg, dv]) => (
            <div key={lg + dv}><div className="lab">{lg} {dv}</div>
              {d.teams.filter(t => t.league === lg && t.division === dv).map(t => <button key={t.id} className="btn" aria-pressed={t.id === id} onClick={() => setPick(String(t.id))} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 3, textTransform: 'none', letterSpacing: 0, fontSize: 12, color: 'var(--o-ink)', background: t.id === id ? 'var(--o-accent-soft)' : 'transparent', borderColor: t.id === id ? 'var(--o-accent)' : 'var(--o-line)' }}><MlbLogo t={t} />{t.short}</button>)}
            </div>
          ))}
        </div>
      </section>
      <TeamProfile d={d} id={id} />
    </>
  );
}

/* ───────────────────────────── Players ───────────────────────────── */

export function PlayersScreen({ d }: { d: MlbFile }) {
  const T = useT(d);
  const [lg, setLg] = useState<'all' | 'AL' | 'NL'>('all');
  const inLg = (team: number) => lg === 'all' || T[team]?.league === lg;
  const bats = d.batters.filter(b => b.pa >= 400 && inLg(b.team)), arms = d.pitchers.filter(p => inLg(p.team));
  const sp = arms.filter(p => p.gs >= 15 && p.ip >= 100), rp = arms.filter(p => p.gs < 5 && p.ip >= 40);
  return (
    <>
      <section className="ocard">
        <h2>The best hitters</h2>
        <Chips label="League" items={[{ k: 'all', label: 'MLB' }, { k: 'AL', label: 'American League' }, { k: 'NL', label: 'National League' }]} value={lg} set={setLg} />
        <p className="dek">Runs created (wRC+, 100 = average) against wins above replacement: WAR adds defence and base running to the bat. Regulars with 400+ plate appearances; Dodgers in colour.</p>
        <QuadrantScatter xLabel="wRC+" yLabel="WAR" fmt={v => v.toFixed(1)} fmtX={v => v.toFixed(0)} corners={['MVP class', 'Glove and legs', 'Bat only', 'Below par']}
          points={bats.map(b => ({ id: String(b.id), label: b.war >= 5 ? b.name.split(' ').slice(-1)[0] : '', x: b.wrc, y: b.war, color: b.team === LAD ? mlbInk(T[LAD]) : b.war >= 6 ? 'var(--o-s1)' : undefined, tip: <><div className="k">{b.name} · {T[b.team]?.abbr} · {b.pos}</div>{f3(b.avg)}/{f3(b.obp)}/{f3(b.slg)}, {b.hr} HR, {b.sb} SB · wRC+ {b.wrc} · WAR {b.war}</> }))} />
        <table className="otable" style={{ fontSize: 12, marginTop: 10 }}><thead><tr><th>#</th><th>Player</th><th>Team</th><th className="n">PA</th><th className="n">AVG/OBP/SLG</th><th className="n">HR</th><th className="n">SB</th><th className="n">wRC+</th><th className="n">Bat</th><th className="n">Field</th><th className="n">Run</th><th className="n">WAR</th></tr></thead>
          <tbody>{bats.slice(0, 25).map((b, i) => <tr key={b.id} className={b.team === LAD ? 'me' : ''}><td>{i + 1}</td><td>{b.name} <small style={{ color: 'var(--o-ink3)' }}>{b.pos}</small></td><td><MlbLogo t={T[b.team]} />{T[b.team]?.abbr}</td><td className="n">{b.pa}</td><td className="n">{f3(b.avg)}/{f3(b.obp)}/{f3(b.slg)}</td><td className="n">{b.hr}</td><td className="n">{b.sb}</td><td className="n">{b.wrc}</td><td className="n">{b.bat}</td><td className="n">{b.fld}</td><td className="n">{b.run}</td><td className="n"><b>{b.war}</b></td></tr>)}</tbody></table>
        <Src>Source: MLB Stats API (sabermetrics)</Src>
      </section>
      <section className="s-two">
        <div className="ocard">
          <h2>Starters</h2>
          <p className="dek">ERA against FIP: below the diagonal a pitcher was helped by his defence or luck.</p>
          <QuadrantScatter height={360} invertY xLabel="WAR" yLabel="FIP (lower ↑)" fmt={v => v.toFixed(2)} fmtX={v => v.toFixed(1)} corners={['Aces', 'Good, few innings', 'Workhorses', '']}
            points={sp.map(p => ({ id: String(p.id), label: p.war >= 4 ? p.name.split(' ').slice(-1)[0] : '', x: p.war, y: p.fip, color: p.team === LAD ? mlbInk(T[LAD]) : undefined, tip: <><div className="k">{p.name} · {T[p.team]?.abbr}</div>{p.ip} IP, {p.w} W, ERA {f2(p.era)}, FIP {f2(p.fip)}, {p.so} K · WAR {p.war}</> }))} />
        </div>
        <div className="ocard">
          <h2>Relievers</h2>
          <table className="otable" style={{ fontSize: 12 }}><thead><tr><th>Pitcher</th><th>Team</th><th className="n">IP</th><th className="n">SV</th><th className="n">ERA</th><th className="n">FIP</th><th className="n">K/9</th><th className="n">WAR</th></tr></thead>
            <tbody>{rp.slice(0, 15).map(p => <tr key={p.id} className={p.team === LAD ? 'me' : ''}><td>{p.name}</td><td>{T[p.team]?.abbr}</td><td className="n">{p.ip}</td><td className="n">{p.sv || ''}</td><td className="n">{f2(p.era)}</td><td className="n">{f2(p.fip)}</td><td className="n">{p.k9?.toFixed(1)}</td><td className="n"><b>{p.war}</b></td></tr>)}</tbody></table>
        </div>
      </section>
    </>
  );
}

/* ───────────────────────────── Awards race ───────────────────────────── */

export function AwardsScreen({ d }: { d: MlbFile }) {
  const T = useT(d);
  const m = Object.values(d.markets);
  const top = (lg: 'AL' | 'NL', arms: boolean) => (arms ? d.pitchers.filter(p => T[p.team]?.league === lg && p.gs >= 15) : d.batters.filter(b => T[b.team]?.league === lg)).slice(0, 6);
  return (
    <>
      <section className="ocard">
        <h2>The awards</h2>
        <p className="dek">MVP, Cy Young and Rookie of the Year are voted by the Baseball Writers before the postseason ends and announced in November. Postseason games do not count.{m.length ? '' : ' No betting market is open right now: below, the WAR leaders that usually decide the vote.'}</p>
        {m.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>
          {m.map(x => <div key={x.label}><div className="lab">{x.label}</div>{x.rows.slice(0, 6).map(r => <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 40px', gap: 8, alignItems: 'center', fontSize: 12.5, margin: '3px 0' }}><span>{r.name}</span><span style={{ height: 9, width: `${r.p}%`, background: 'var(--o-s1)', borderRadius: 2 }} /><b>{Math.round(r.p)}%</b></div>)}</div>)}
        </div>}
        {m.length > 0 && <Src>Source: Kalshi</Src>}
      </section>
      <section className="ocard">
        <h2>The WAR leaders</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 18 }}>
          {([['AL', false, 'AL MVP'], ['NL', false, 'NL MVP'], ['AL', true, 'AL Cy Young'], ['NL', true, 'NL Cy Young']] as const).map(([lg, arms, label]) => (
            <div key={label}><div className="lab">{label}</div>
              {top(lg, arms).map((x, i) => <div key={x.id} style={{ display: 'grid', gridTemplateColumns: '16px 1fr auto', gap: 6, fontSize: 12.5, padding: '3px 0', borderBottom: '1px solid var(--o-line)', fontWeight: x.team === LAD ? 700 : 400 }}><span style={{ color: 'var(--o-ink3)' }}>{i + 1}</span><span>{x.name} <small style={{ color: 'var(--o-ink3)' }}><MlbLogo t={T[x.team]} />{T[x.team]?.abbr}</small></span><b>{x.war}</b></div>)}
            </div>
          ))}
        </div>
        <Src>Source: MLB Stats API</Src>
      </section>
    </>
  );
}

/* ───────────────────────────── Off-season ───────────────────────────── */

export function OffseasonScreen({ d }: { d: MlbFile }) {
  const T = useT(d);
  const [kind, setKind] = useState('all');
  const kinds = [...new Set(d.transactions.map(x => x.type))];
  const list = d.transactions.filter(x => kind === 'all' || x.type === kind);
  const lad = d.transactions.filter(x => x.team === LAD || x.from === LAD || x.to === LAD);
  return (
    <section className="ocard">
      <h2>The moves of the last 30 days</h2>
      <p className="dek">Trades, free-agent signings, releases and waiver claims of the 30 major league clubs, latest first. From November free agency opens: this is where the market shows up.{lad.length ? ` The Dodgers: ${lad.length} moves.` : ''}</p>
      <Chips label="Type" items={[{ k: 'all', label: 'All' }, ...kinds.map(k => ({ k, label: k }))]} value={kind} set={setKind} />
      <table className="otable" style={{ fontSize: 12.5 }}><tbody>{list.slice(0, 80).map((x, i) => <tr key={i} className={x.team === LAD || x.to === LAD || x.from === LAD ? 'me' : ''}><td style={{ whiteSpace: 'nowrap' }}>{dayShort(Date.parse(`${x.date}T12:00:00Z`))}</td><td><MlbLogo t={x.team ? T[x.team] : undefined} /></td><td>{x.text}</td></tr>)}</tbody></table>
      <Src>Source: MLB Stats API transactions</Src>
    </section>
  );
}

/* ───────────────────────────── History ───────────────────────────── */

// Old names → today's franchise
const MOVED: [RegExp, string][] = [[/Brooklyn/, 'Dodgers'], [/New York Giants/, 'Giants'], [/Philadelphia Athletics|Oakland Athletics|Kansas City Athletics/, 'Athletics'], [/Boston Braves|Milwaukee Braves/, 'Braves'], [/Washington Senators/, 'Twins'], [/St. Louis Browns/, 'Orioles'], [/Florida Marlins/, 'Marlins'], [/Anaheim Angels/, 'Angels'], [/Boston Americans/, 'Red Sox'], [/Cleveland Indians/, 'Guardians']];

export function HistoryScreen({ d }: { d: MlbFile }) {
  const ws = d.history.worldSeries;
  const fr = (name: string) => { const m = MOVED.find(([re]) => re.test(name))?.[1]; const key = m ?? name; return d.teams.find(t => key === t.name || key.endsWith(t.short) || t.short === key); };
  const tally = d.teams.map(t => ({ t, w: ws.filter(x => fr(x.winner)?.id === t.id).length, l: ws.filter(x => fr(x.loser)?.id === t.id).length })).sort((a, b) => b.w - a.w || b.l - a.l);
  const max = Math.max(1, ...tally.map(x => x.w + x.l));
  const [lg, setLg] = useState<'NL' | 'AL'>('NL');
  const seasons = Object.keys(d.history.seasons).map(Number).sort((a, b) => a - b);
  const champ = Object.fromEntries(ws.map(x => [x.year, fr(x.winner)?.id])), lost = Object.fromEntries(ws.map(x => [x.year, fr(x.loser)?.id]));
  return (
    <>
      <section className="ocard">
        <h2>World Series by franchise</h2>
        <p className="dek">{ws.length} World Series since 1903 (none in 1904 and 1994). The American League has won {ws.filter(x => x.league === 'AL').length}, the National League {ws.filter(x => x.league === 'NL').length}. Solid bars are titles, light bars lost Series.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', columnGap: 30 }}>
          {tally.map(({ t, w, l }) => <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 48px', gap: 8, alignItems: 'center', fontSize: 12, padding: '2px 0', fontWeight: t.id === LAD ? 700 : 400 }}><span><MlbLogo t={t} />{t.short}</span><span style={{ display: 'flex', height: 10 }}><span style={{ width: `${(w / max) * 100}%`, background: mlbInk(t) }} /><span style={{ width: `${(l / max) * 100}%`, background: mlbInk(t), opacity: 0.3 }} /></span><span style={{ textAlign: 'right', color: 'var(--o-ink2)' }}>{w}–{l}</span></div>)}
        </div>
        <Src>Source: Wikipedia, List of World Series champions</Src>
      </section>
      {seasons.length > 0 && <section className="ocard">
        <h2>Every team since 2000</h2>
        <p className="dek">Winning percentage of every season; ★ won the World Series, ◆ lost it, • won the division.</p>
        <Chips label="League" items={[{ k: 'NL', label: 'National League' }, { k: 'AL', label: 'American League' }]} value={lg} set={setLg} />
        <div style={{ overflowX: 'auto' }}>
          <table className="otable" style={{ fontSize: 10.5, minWidth: 760 }}>
            <thead><tr><th>Team</th>{seasons.map(y => <th key={y} className="n" style={{ padding: '4px 1px' }}>{String(y).slice(2)}</th>)}</tr></thead>
            <tbody>{DIVS.flatMap(dv => d.teams.filter(t => t.league === lg && t.division === dv)).map(t => (
              <tr key={t.id} className={t.id === LAD ? 'me' : ''}><td style={{ whiteSpace: 'nowrap' }}><MlbLogo t={t} />{t.short}</td>
                {seasons.map(y => { const s = d.history.seasons[y]?.[t.id]; if (!s) return <td key={y} />; const mark = champ[y] === t.id ? '★' : lost[y] === t.id ? '◆' : s.div ? '•' : ''; return <td key={y} className="n" title={`${y}: ${s.w}-${s.l}`} style={{ background: `color-mix(in srgb, ${s.pct >= 0.5 ? 'var(--o-s1)' : 'var(--o-s2)'} ${Math.round(Math.min(1, Math.abs(s.pct - 0.5) * 6) * 85)}%, var(--o-card))`, color: Math.abs(s.pct - 0.5) > 0.09 ? '#fff' : 'var(--o-ink)', padding: '5px 1px', textAlign: 'center', fontWeight: 700 }}>{mark}</td>; })}
              </tr>
            ))}</tbody>
          </table>
        </div>
        <Src>Source: MLB Stats API standings</Src>
      </section>}
      <section className="ocard">
        <h2>Every World Series</h2>
        <table className="otable" style={{ fontSize: 12 }}><thead><tr><th>Year</th><th>Champion</th><th className="n">Games</th><th>Runner-up</th></tr></thead>
          <tbody>{[...ws].reverse().map(x => <tr key={x.year} className={fr(x.winner)?.id === LAD || fr(x.loser)?.id === LAD ? 'me' : ''}><td>{x.year}</td><td><MlbLogo t={fr(x.winner)} />{x.winner} <small style={{ color: 'var(--o-ink3)' }}>{x.league}</small></td><td className="n">{x.games}</td><td>{x.loser}</td></tr>)}</tbody></table>
      </section>
    </>
  );
}

/* ───────────────────────────── How it works ───────────────────────────── */

export function HowScreen() {
  const P = ({ children }: { children: ReactNode }) => <p style={{ margin: '0 0 10px', lineHeight: 1.55, fontSize: 14 }}>{children}</p>;
  return (
    <>
      <section className="s-two">
        <div className="ocard">
          <h2>The season</h2>
          <P><b>30 teams</b> in two leagues (American and National), each with three divisions of five. <b>162 games</b> from late March to late September, mostly in three- or four-game series; every team now plays every other team at least once.</P>
          <P><b>The playoffs:</b> six teams per league, the three division winners and three wild cards. The two best division winners skip the Wild Card Series (best of three); then the Division Series (best of five), the League Championship Series and the World Series (best of seven).</P>
          <P><b>Rules since 2023:</b> a pitch clock (15 seconds with the bases empty, 18 with runners), bigger bases, limits on defensive shifts and pick-off throws. In extra innings each half starts with a runner on second.</P>
        </div>
        <div className="ocard">
          <h2>Reading the numbers</h2>
          <P><b>OPS</b> = on-base percentage + slugging. <b>wRC+</b> measures a hitter's runs created against the league, adjusted for ballpark: 100 is average, 150 is star level.</P>
          <P><b>WAR</b> (wins above replacement) sums batting, base running, defence and position into the wins a player adds over a freely available replacement. 2 is a regular, 5 an All-Star, 8 an MVP season.</P>
          <P><b>FIP</b> rebuilds a pitcher's ERA from what he controls alone: strikeouts, walks, hit batters and home runs. A pitcher with an ERA well below his FIP has been lucky or well defended.</P>
          <P><b>Pythagorean record:</b> the wins a team “should” have from its runs scored and allowed. The gap to the real record is mostly luck in close games.</P>
        </div>
      </section>
    </>
  );
}

/* ───────────────────────────── Dodgers: Season and Power ───────────────────────────── */

export function DodgersSeason({ d }: { d: MlbFile }) {
  const T = useT(d);
  const games = d.games.filter(g => g.h === LAD || g.a === LAD);
  const reg = games.filter(g => g.type === 'R'), post = games.filter(g => g.type !== 'R');
  const byMonth = new Map<string, typeof reg>();
  for (const g of reg) { const k = fmt(Date.parse(`${g.date}T18:00:00Z`), { month: 'long' }); byMonth.set(k, [...(byMonth.get(k) ?? []), g]); }
  const res = (g: typeof reg[number]) => { const home = g.h === LAD, m = home ? g.hs - g.as : g.as - g.hs; return { home, m, opp: home ? g.a : g.h }; };
  return (
    <>
      <AboveFive d={d} T={T} only={LAD} />
      <section className="ocard">
        <h2>Month by month</h2>
        <table className="otable" style={{ fontSize: 12.5, maxWidth: 560 }}><thead><tr><th>Month</th><th className="n">W-L</th><th className="n">Runs</th><th className="n">Allowed</th><th className="n">Diff</th></tr></thead>
          <tbody>{[...byMonth.entries()].map(([m, gs]) => { const w = gs.filter(g => res(g).m > 0).length, rs = gs.reduce((a, g) => a + (g.h === LAD ? g.hs : g.as), 0), ra = gs.reduce((a, g) => a + (g.h === LAD ? g.as : g.hs), 0); return <tr key={m}><td>{m}</td><td className="n">{w}-{gs.length - w}</td><td className="n">{rs}</td><td className="n">{ra}</td><td className="n">{rs - ra > 0 ? '+' : ''}{rs - ra}</td></tr>; })}</tbody></table>
      </section>
      {post.length > 0 && <section className="ocard">
        <h2>October</h2>
        <DiffBars color={mlbInk(T[LAD])} bars={post.map(g => { const r = res(g); return { label: `${r.home ? '' : '@'}${T[r.opp]?.abbr}`, value: r.m, tip: `${g.series}: ${r.home ? 'vs' : 'at'} ${T[r.opp]?.name}, ${r.home ? g.hs : g.as}–${r.home ? g.as : g.hs}` }; })} />
      </section>}
      <section className="ocard">
        <h2>Every game</h2>
        <p className="dek">Margin of every regular-season game, in order.</p>
        <DiffBars color={mlbInk(T[LAD])} bars={reg.map(g => { const r = res(g); return { label: '', value: r.m, tip: `${dayShort(Date.parse(`${g.date}T18:00:00Z`))} ${r.home ? 'vs' : 'at'} ${T[r.opp]?.name}: ${r.home ? g.hs : g.as}–${r.home ? g.as : g.hs}` }; })} />
        <Src>Source: MLB Stats API</Src>
      </section>
    </>
  );
}

export const DodgersPower = ({ d }: { d: MlbFile }) => <TeamProfile d={d} id={LAD} />;
