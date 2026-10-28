// The NBA screens beyond the home: the season day by day, team strength per 100
// possessions, every team, the players, the awards race, history and the rules.
// Data: public/data/nba-season.json (scripts/collect/nbaSeason.mjs) and ESPN live.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BumpChart, DiffBars } from '../components/charts';
import { Score } from '../components/common';
import { ShotCourt, ZONES } from '../components/court';
import { PercentileGrid, ProbCell, QuadrantScatter, RankStrips, Spaghetti, WinProb, ordinal, ranks, type GridCol, type StripMetric } from '../components/power';
import { Chips, usePick } from '../components/tabs';
import { DAY, dayLong, fmt, hhmm, sportsDay } from '../core/time';
import { memJSON } from '../sources/gamecast';
import { LEAGUES, leagueDay, type LeagueGame } from '../sources/leagueDay';
import { seasonLabel, type NbaPower, type NbaSeasonFile, type NbaTeamInfo } from '../sources/nbaSeason';

export const NBA_TABS = [['now', 'Now'], ['season', 'Season'], ['power', 'Power'], ['teams', 'Teams'], ['players', 'Players'], ['awards', 'Awards race'], ['history', 'History'], ['how', 'How it works']] as const;
export type NbaTab = typeof NBA_TABS[number][0];

const sg = (v: number, d = 1) => `${v > 0 ? '+' : ''}${v.toFixed(d)}`;
const pc = (v: number) => `${Math.round(v * 100)}%`;
const pc1 = (v: number) => `${(v * 100).toFixed(1)}%`;
const Src = ({ children }: { children: ReactNode }) => <div className="osrc">{children}</div>;

export function NbaLogo({ abbr }: { abbr: string }) {
  const a = abbr.toLowerCase(), box = { height: '1.15em', width: '1.15em', objectFit: 'contain', verticalAlign: '-0.2em', margin: '-0.2em 0.4em -0.2em 0', flex: 'none' } as const;
  return <><img className="lg-light" src={`https://a.espncdn.com/i/teamlogos/nba/500/${a}.png`} alt="" style={box} loading="lazy" /><img className="lg-dark" src={`https://a.espncdn.com/i/teamlogos/nba/500-dark/${a}.png`} alt="" style={box} loading="lazy" /></>;
}

/** A team colour that reads on both light and dark cards. */
export function nbaInk(t: NbaTeamInfo | undefined): string {
  const lum = (hex: string | null) => { if (!hex) return -1; const n = parseInt(hex.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => v / 255); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  for (const c of [t?.color ?? null, t?.alt ?? null]) { const l = lum(c); if (l > 0.12 && l < 0.75) return c!; }
  return 'var(--o-accent)';
}

const useT = (d: NbaSeasonFile) => useMemo(() => Object.fromEntries(d.teams.map(t => [t.abbr, t])), [d]);
const early = (d: NbaSeasonFile) => Math.min(...Object.values(d.power).map(p => p.g)) < 10;
const Early = ({ d }: { d: NbaSeasonFile }) => early(d) ? <p className="dek" style={{ fontSize: 12, color: 'var(--o-s2)' }}>Early season: teams have played {Math.min(...Object.values(d.power).map(p => p.g))}–{Math.max(...Object.values(d.power).map(p => p.g))} games, so a single blowout moves these numbers a lot. ESPN's BPI, which starts from preseason expectations, is steadier.</p> : null;

/* ───────────────────────────── Season ───────────────────────────── */

const ymd = (t: number) => fmt(t, { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-');

export function SeasonScreen({ d, now }: { d: NbaSeasonFile; now: number }) {
  const [pick, setPick] = usePick('day');
  const today = sportsDay(now);
  const first = d.schedule.start ? sportsDay(Date.parse(d.schedule.start) + 6 * 3600e3) : today;
  const day = pick ? sportsDay(Date.parse(`${pick}T12:00:00Z`)) : today;
  const [games, setGames] = useState<LeagueGame[] | null>(null);
  useEffect(() => {
    let on = true;
    setGames(null);
    const l = LEAGUES.find(x => x.key === 'nba')!;
    const load = () => leagueDay(l, day, day + DAY, true).then(g => { if (on) setGames(g); }).catch(() => on && setGames([]));
    load();
    const t = day === today ? setInterval(load, 30e3) : 0;
    return () => { on = false; if (t) clearInterval(t); };
  }, [day, today]);
  const go = (t: number) => setPick(t === today ? null : ymd(t + 12 * 3600e3));
  return (
    <>
      <section className="ocard">
        <h2>Day by day</h2>
        <p className="dek">Every game of the {seasonLabel(d.season)} season. A day runs from 07:00 to 07:00 Rome time, so the night games count with the evening before. Open a finished game for the box score and the chance of winning through it.</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0 12px', flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => go(day - DAY)} disabled={day <= first}>‹ Previous</button>
          <b style={{ minWidth: 200, textAlign: 'center' }}>{dayLong(day + 12 * 3600e3)}</b>
          <button className="btn" onClick={() => go(day + DAY)}>Next ›</button>
          {day !== today && <button className="btn" onClick={() => go(today)}>Today</button>}
        </div>
        {!games ? <p className="dek">Loading…</p> : !games.length ? <p className="dek">No games on this day.</p> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10, alignItems: 'start' }}>
            {games.map(g => <DayGame key={g.id} g={g} />)}
          </div>
        )}
        <Src>Source: ESPN</Src>
      </section>
      {d.results.length > 10 && <ResultsGrid d={d} />}
      {d.results.length > 30 && <StandingsRace d={d} />}
    </>
  );
}

function DayGame({ g }: { g: LeagueGame }) {
  const [open, setOpen] = useState(false);
  const sides = g.away && g.home ? [g.away, g.home] : [];
  const live = g.state === 'in';
  return (
    <div style={{ border: `1px solid ${live ? '#ff453a' : 'var(--o-line)'}`, borderRadius: 10, padding: '8px 10px', gridColumn: open ? '1 / -1' : undefined }}>
      <button onClick={() => setOpen(!open)} disabled={g.state === 'pre'} aria-expanded={open} style={{ all: 'unset', display: 'block', width: '100%', cursor: g.state === 'pre' ? 'default' : 'pointer' }}>
        {sides.map(s => (
          <div key={s.abbr} style={{ display: 'flex', gap: 8, fontSize: 13, fontWeight: s.winner ? 700 : 400, color: g.state === 'post' && s.winner === false ? 'var(--o-ink3)' : 'var(--o-ink)' }}>
            <span style={{ flex: 1 }}><NbaLogo abbr={s.abbr} />{s.name}</span>{g.state !== 'pre' && <Score as="b">{s.score}</Score>}
          </div>
        ))}
        <div style={{ fontSize: 11, color: live ? '#ff453a' : 'var(--o-ink3)', marginTop: 2 }}>
          {g.state === 'pre' ? `${hhmm(g.start)} Rome${g.tv ? ` · ${g.tv}` : ''}` : g.clock ?? (live ? 'Live' : 'Final')}
          {g.state !== 'pre' && <span style={{ float: 'right' }}>{open ? 'Close ▲' : 'Box score ▼'}</span>}
        </div>
      </button>
      {open && g.espn && <NbaBox id={g.espn.id} live={live} />}
    </div>
  );
}

interface Box { home: string; away: string; teams: { abbr: string; home: boolean; s: Record<string, string> }[]; players: { abbr: string; labels: string[]; rows: { name: string; starter: boolean; stats: string[] }[] }[]; lines: { abbr: string; q: string[] }[]; wp: { t: number; p: number }[]; periods: number }

async function loadBox(id: string, live: boolean): Promise<Box> {
  const j = await memJSON<any>(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${id}`, live ? 15e3 : 30 * 60e3); // eslint-disable-line @typescript-eslint/no-explicit-any
  const comp = j.header.competitions[0];
  const H = comp.competitors.find((c: { homeAway: string }) => c.homeAway === 'home'), A = comp.competitors.find((c: { homeAway: string }) => c.homeAway === 'away');
  const periods = Math.max(4, ...comp.competitors.map((c: { linescores?: unknown[] }) => c.linescores?.length ?? 0));
  const clock = (p: { period?: { number: number }; clock?: { displayValue: string } }) => {
    const q = p.period?.number ?? 1, [m, s] = (p.clock?.displayValue ?? '0').split(':').map(Number), left = s == null ? m : m * 60 + s;
    const len = q > 4 ? 300 : 720, before = q > 4 ? 2880 + (q - 5) * 300 : (q - 1) * 720;
    return (before + len - left) / (2880 + Math.max(0, periods - 4) * 300);
  };
  const plays = new Map<string, { period?: { number: number }; clock?: { displayValue: string } }>((j.plays ?? []).map((p: { id: string }) => [p.id, p]));
  return {
    home: H.team.abbreviation, away: A.team.abbreviation, periods,
    lines: [A, H].map((c: { team: { abbreviation: string }; linescores?: { displayValue: string }[] }) => ({ abbr: c.team.abbreviation, q: (c.linescores ?? []).map(l => l.displayValue) })),
    teams: (j.boxscore?.teams ?? []).map((t: { team: { abbreviation: string; id: string }; statistics: { name: string; displayValue: string }[] }) => ({ abbr: t.team.abbreviation, home: t.team.id === H.team.id, s: Object.fromEntries(t.statistics.map(x => [x.name, x.displayValue])) })),
    players: (j.boxscore?.players ?? []).map((t: { team: { abbreviation: string }; statistics: { names: string[]; athletes: { athlete: { shortName: string }; starter: boolean; stats: string[]; didNotPlay?: boolean }[] }[] }) => ({ abbr: t.team.abbreviation, labels: t.statistics[0]?.names ?? [], rows: (t.statistics[0]?.athletes ?? []).filter(a => !a.didNotPlay && a.stats?.length).map(a => ({ name: a.athlete.shortName, starter: a.starter, stats: a.stats })) })),
    wp: (j.winprobability ?? []).map((w: { playId: string; homeWinPercentage: number }) => { const p = plays.get(w.playId); return p ? { t: clock(p), p: w.homeWinPercentage } : null; }).filter(Boolean).sort((a: { t: number }, b: { t: number }) => a.t - b.t),
  };
}

const BOX_ROWS: [string, string][] = [['fieldGoalsMade-fieldGoalsAttempted', 'Field goals'], ['fieldGoalPct', 'FG %'], ['threePointFieldGoalsMade-threePointFieldGoalsAttempted', 'Threes'], ['freeThrowsMade-freeThrowsAttempted', 'Free throws'], ['totalRebounds', 'Rebounds'], ['offensiveRebounds', 'Offensive rebounds'], ['assists', 'Assists'], ['totalTurnovers', 'Turnovers'], ['steals', 'Steals'], ['blocks', 'Blocks'], ['pointsInPaint', 'Points in the paint'], ['fastBreakPoints', 'Fast-break points'], ['turnoverPoints', 'Points off turnovers'], ['largestLead', 'Largest lead']];

function NbaBox({ id, live }: { id: string; live: boolean }) {
  const [b, setB] = useState<Box | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let on = true;
    const load = () => loadBox(id, live).then(x => on && setB(x)).catch(() => on && setErr(true));
    load();
    const t = live ? setInterval(load, 20e3) : 0;
    return () => { on = false; if (t) clearInterval(t); };
  }, [id, live]);
  if (err) return <p className="dek">The box score is not available.</p>;
  if (!b) return <p className="dek">Loading the box score…</p>;
  const away = b.teams.find(t => !t.home), home = b.teams.find(t => t.home);
  return (
    <div style={{ marginTop: 10, display: 'grid', gap: 14 }}>
      <table className="otable" style={{ maxWidth: 420 }}>
        <thead><tr><th />{b.lines[0].q.map((_, i) => <th key={i} className="n">{i < 4 ? `Q${i + 1}` : `OT${i > 4 ? i - 3 : ''}`}</th>)}</tr></thead>
        <tbody>{b.lines.map(l => <tr key={l.abbr}><td><NbaLogo abbr={l.abbr} />{l.abbr}</td>{l.q.map((v, i) => <td key={i} className="n"><Score>{v}</Score></td>)}</tr>)}</tbody>
      </table>
      {b.wp.length > 10 && <div><div className="lab">Chance of winning through the game</div><WinProb points={b.wp} home={b.home} away={b.away} homeColor="var(--o-s1)" awayColor="var(--o-s2)" periods={b.periods} /></div>}
      {away && home && <div className="s-two">
        <table className="otable"><thead><tr><th /><th className="n"><NbaLogo abbr={away.abbr} />{away.abbr}</th><th className="n"><NbaLogo abbr={home.abbr} />{home.abbr}</th></tr></thead>
          <tbody>{BOX_ROWS.filter(([k]) => away.s[k] != null).map(([k, l]) => <tr key={k}><td>{l}</td><td className="n">{away.s[k]}</td><td className="n">{home.s[k]}</td></tr>)}</tbody></table>
        <div />
      </div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14 }}>
        {b.players.map(p => (
          <div key={p.abbr} style={{ overflowX: 'auto' }}>
            <div className="lab"><NbaLogo abbr={p.abbr} />{p.abbr}</div>
            <table className="otable" style={{ fontSize: 11.5 }}>
              <thead><tr><th />{p.labels.map(l => <th key={l} className="n">{l}</th>)}</tr></thead>
              <tbody>{p.rows.map(r => <tr key={r.name}><td style={{ whiteSpace: 'nowrap', fontWeight: r.starter ? 600 : 400 }}>{r.name}</td>{r.stats.map((s, i) => <td key={i} className="n">{s}</td>)}</tr>)}</tbody>
            </table>
          </div>
        ))}
      </div>
      <Src>Source: ESPN box score</Src>
    </div>
  );
}

/** Teams × games: every result as a cell, coloured by the margin. */
function ResultsGrid({ d }: { d: NbaSeasonFile }) {
  const [conf, setConf] = useState<'East' | 'West'>('East');
  const reg = d.results.filter(r => r.type === 2);
  const byTeam = (a: string) => reg.filter(r => r.h === a || r.a === a);
  const teams = d.teams.filter(t => t.conf === conf).sort((x, y) => (d.power[y.abbr]?.w ?? 0) / Math.max(1, d.power[y.abbr]?.g ?? 1) - (d.power[x.abbr]?.w ?? 0) / Math.max(1, d.power[x.abbr]?.g ?? 1) || (d.power[y.abbr]?.net ?? 0) - (d.power[x.abbr]?.net ?? 0));
  const n = Math.max(...d.teams.map(t => byTeam(t.abbr).length));
  return (
    <section className="ocard">
      <h2>The season, result by result</h2>
      <p className="dek">Each team's games in order, by record. Blue a win, orange a loss; the deeper the colour, the wider the margin. “@” is on the road.</p>
      <Chips label="Conference" items={[{ k: 'East', label: 'East' }, { k: 'West', label: 'West' }]} value={conf} set={setConf} />
      <div style={{ overflowX: 'auto' }}>
        <table className="otable" style={{ fontSize: 10.5 }}>
          <thead><tr><th>Team</th><th className="n">W-L</th>{Array.from({ length: n }, (_, i) => <th key={i} className="n">{i + 1}</th>)}</tr></thead>
          <tbody>{teams.map(t => (
            <tr key={t.abbr}><td style={{ whiteSpace: 'nowrap' }}><NbaLogo abbr={t.abbr} />{t.short}</td><td className="n">{d.power[t.abbr]?.w ?? 0}-{d.power[t.abbr]?.l ?? 0}</td>
              {byTeam(t.abbr).map(r => { const home = r.h === t.abbr, m = home ? r.hs - r.as : r.as - r.hs, opp = home ? r.a : r.h; return <td key={r.id} className="n" title={`${fmt(Date.parse(r.date), { day: 'numeric', month: 'short' })} ${home ? 'vs' : 'at'} ${opp}: ${home ? r.hs : r.as}–${home ? r.as : r.hs}`} style={{ background: `color-mix(in srgb, ${m > 0 ? 'var(--o-s1)' : 'var(--o-s2)'} ${Math.round(Math.min(1, Math.abs(m) / 25) * 70 + 15)}%, var(--o-card))`, padding: '4px 2px' }}>{home ? '' : '@'}{opp}<br /><b>{m > 0 ? '+' : ''}{m}</b></td>; })}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <Src>Source: ESPN results</Src>
    </section>
  );
}

function StandingsRace({ d }: { d: NbaSeasonFile }) {
  const [conf, setConf] = useState<'East' | 'West'>('East');
  const T = useT(d);
  const reg = d.results.filter(r => r.type === 2);
  const t0 = Date.parse(d.schedule.start ?? reg[0].date);
  const weeks = Math.ceil((Date.parse(reg.at(-1)!.date) - t0) / (7 * DAY));
  const teams = d.teams.filter(t => t.conf === conf);
  const rankAt = (end: number) => {
    const rec = Object.fromEntries(teams.map(t => [t.abbr, { w: 0, l: 0, diff: 0 }]));
    for (const r of reg) { if (Date.parse(r.date) >= end) break; for (const [me, s, o] of [[r.h, r.hs, r.as], [r.a, r.as, r.hs]] as const) { if (!rec[me]) continue; if (s > o) rec[me].w++; else rec[me].l++; rec[me].diff += s - o; } }
    const pct = (x: { w: number; l: number }) => (x.w + x.l ? x.w / (x.w + x.l) : 0.5);
    return Object.fromEntries([...teams].sort((a, b) => pct(rec[b.abbr]) - pct(rec[a.abbr]) || rec[b.abbr].diff - rec[a.abbr].diff).map((t, i) => [t.abbr, i + 1]));
  };
  const rk = Array.from({ length: weeks }, (_, i) => rankAt(t0 + (i + 1) * 7 * DAY));
  const lit = new Set(Object.entries(rk.at(-1) ?? {}).filter(([, r]) => r <= 3).map(([k]) => k));
  return (
    <section className="ocard">
      <h2>The conference table, week by week</h2>
      <p className="dek">Rank by winning percentage at the end of each week. 1–6 go to the playoffs, 7–10 to the play-in.</p>
      <Chips label="Conference" items={[{ k: 'East', label: 'East' }, { k: 'West', label: 'West' }]} value={conf} set={setConf} />
      <BumpChart weeks={rk.map((_, i) => i + 1)} maxRank={15} series={teams.map(t => ({ id: t.abbr, name: t.short, ranks: rk.map(r => r[t.abbr]), color: lit.has(t.abbr) ? nbaInk(T[t.abbr]) : undefined }))} />
    </section>
  );
}

/* ───────────────────────────── Power ───────────────────────────── */

export function nbaValues(d: NbaSeasonFile): Record<string, Record<string, number | null>> {
  const out: Record<string, Record<string, number | null>> = {};
  for (const t of d.teams) {
    const p = d.power[t.abbr], b = d.bpi[t.abbr];
    if (!p) { out[t.abbr] = { bpi: b?.bpi ?? null }; continue; }
    out[t.abbr] = {
      bpi: b?.bpi ?? null, bpiOff: b?.off ?? null, bpiDef: b?.def ?? null, sos: b?.sos ?? null,
      net: p.net, ortg: p.ortg, drtg: p.drtg, pace: p.pace,
      efg: p.off.efg, tov: p.off.tov, orb: p.off.orb, ftr: p.off.ftr, ts: p.off.ts, tpRate: p.off.tpRate, tpPct: p.off.tpPct, astRate: p.off.astRate, paint: p.off.paint, fb: p.off.fb,
      dEfg: p.def.efg, dTov: p.def.tov, dOrb: p.def.orb, dFtr: p.def.ftr, dTpPct: p.def.tpPct, dTpRate: p.def.tpRate, stl: p.def.stl, blk: p.def.blk, dPaint: p.def.paint, dFb: p.def.fb, reb: p.reb,
      q1: p.quarters[0], q2: p.quarters[1], q3: p.quarters[2], q4: p.quarters[3], clutch: p.clutch.net, closeW: p.close.w + p.close.l ? p.close.w / (p.close.w + p.close.l) : null,
      home: p.home.net, away: p.away.net, b2b: p.b2b.net, rested: p.rested.net,
      ...Object.fromEntries(ZONES.flatMap(([k]) => [[`f_${k}`, p.shots[k]?.freq ?? null], [`p_${k}`, p.shots[k]?.pct ?? null], [`dp_${k}`, p.oppShots[k]?.pct ?? null]])),
    };
  }
  return out;
}

const POWER_COLS: GridCol[] = [
  { key: 'bpi', label: 'BPI', group: 'Overall', fmt: v => sg(v), title: 'ESPN Basketball Power Index: points better than an average team' },
  { key: 'net', label: 'Net rtg', group: 'Overall', fmt: v => sg(v), title: 'Points scored minus allowed per 100 possessions' },
  { key: 'ortg', label: 'Off rtg', group: 'Offence', fmt: v => v.toFixed(1), title: 'Points per 100 possessions' },
  { key: 'efg', label: 'eFG%', group: 'Offence', fmt: pc1, title: 'Effective field goal %: threes count 1.5' },
  { key: 'tov', label: 'TOV%', group: 'Offence', fmt: pc1, low: true, title: 'Turnovers per possession' },
  { key: 'orb', label: 'OREB%', group: 'Offence', fmt: pc1, title: 'Share of own misses rebounded' },
  { key: 'ftr', label: 'FT rate', group: 'Offence', fmt: v => v.toFixed(3), title: 'Free throws made per field goal attempt' },
  { key: 'tpPct', label: '3P%', group: 'Offence', fmt: pc1 },
  { key: 'astRate', label: 'AST%', group: 'Offence', fmt: pc, title: 'Share of baskets assisted' },
  { key: 'drtg', label: 'Def rtg', group: 'Defence', fmt: v => v.toFixed(1), low: true, title: 'Points allowed per 100 possessions' },
  { key: 'dEfg', label: 'eFG%', group: 'Defence', fmt: pc1, low: true },
  { key: 'dTov', label: 'TOV%', group: 'Defence', fmt: pc1, title: 'Turnovers forced per possession' },
  { key: 'dOrb', label: 'OREB%', group: 'Defence', fmt: pc1, low: true, title: 'Share of misses the opponent rebounds' },
  { key: 'dFtr', label: 'FT rate', group: 'Defence', fmt: v => v.toFixed(3), low: true },
  { key: 'dTpPct', label: '3P%', group: 'Defence', fmt: pc1, low: true },
  { key: 'stl', label: 'Steals', group: 'Defence', fmt: v => v.toFixed(1), title: 'Per 100 possessions' },
  { key: 'blk', label: 'Blocks', group: 'Defence', fmt: v => v.toFixed(1), title: 'Per 100 possessions' },
  { key: 'pace', label: 'Pace', group: 'Style', fmt: v => v.toFixed(1), neutral: true, title: 'Possessions per 48 minutes' },
  { key: 'tpRate', label: '3PA rate', group: 'Style', fmt: pc, neutral: true, title: 'Share of shots from three' },
];
const PHASE_COLS: GridCol[] = [
  { key: 'q1', label: '1st Q', group: 'Average margin per quarter', fmt: v => sg(v) },
  { key: 'q2', label: '2nd Q', group: 'Average margin per quarter', fmt: v => sg(v) },
  { key: 'q3', label: '3rd Q', group: 'Average margin per quarter', fmt: v => sg(v) },
  { key: 'q4', label: '4th Q', group: 'Average margin per quarter', fmt: v => sg(v) },
  { key: 'clutch', label: 'Clutch', group: 'Close games', fmt: v => sg(v), title: 'Points margin per game in the last five minutes with the score within five' },
  { key: 'closeW', label: 'Won', group: 'Close games', fmt: pc, title: 'Share of games decided by five points or fewer that they won' },
  { key: 'home', label: 'Home', group: 'Net rating', fmt: v => sg(v) },
  { key: 'away', label: 'Road', group: 'Net rating', fmt: v => sg(v) },
  { key: 'rested', label: 'Rested', group: 'Net rating', fmt: v => sg(v) },
  { key: 'b2b', label: 'Back-to-back', group: 'Net rating', fmt: v => sg(v), title: 'Second night of back-to-back games' },
];
const SHOT_COLS: GridCol[] = [
  ...ZONES.map(([k, l]) => ({ key: `f_${k}`, label: l.replace('Above-the-break three', 'Above break 3').replace('Corner three', 'Corner 3'), group: 'Share of shots (style)', fmt: pc, neutral: true })),
  ...ZONES.map(([k, l]) => ({ key: `p_${k}`, label: l.replace('Above-the-break three', 'Above break 3').replace('Corner three', 'Corner 3'), group: 'Made (offence)', fmt: pc })),
  ...ZONES.map(([k, l]) => ({ key: `dp_${k}`, label: l.replace('Above-the-break three', 'Above break 3').replace('Corner three', 'Corner 3'), group: 'Allowed (defence)', fmt: pc, low: true })),
];

export function PowerScreen({ d }: { d: NbaSeasonFile }) {
  const T = useT(d);
  const V = useMemo(() => nbaValues(d), [d]);
  const best = (k: string, low = false) => Object.entries(ranks(Object.fromEntries(Object.entries(V).map(([a, v]) => [a, v[k]])), low)).find(([, r]) => r === 1)?.[0] ?? '';
  const byNet = Object.entries(d.power).sort((a, b) => b[1].net - a[1].net).map(([k]) => k);
  const byBpi = Object.entries(d.bpi).sort((a, b) => b[1].bpi - a[1].bpi).map(([k]) => k);
  const lit = new Set([...byNet.slice(0, 3), ...byBpi.slice(0, 3)]);
  const rows = d.teams.map(t => ({ id: t.abbr, label: <><NbaLogo abbr={t.abbr} />{t.short}</>, values: V[t.abbr] }));
  const pts = (fx: (p: NbaPower) => number, fy: (p: NbaPower) => number, tip: (t: NbaTeamInfo, p: NbaPower) => ReactNode) => d.teams.filter(t => d.power[t.abbr]).map(t => ({ id: t.abbr, label: t.abbr, x: fx(d.power[t.abbr]), y: fy(d.power[t.abbr]), color: lit.has(t.abbr) ? nbaInk(t) : undefined, tip: <><div className="k">{t.name}</div>{tip(t, d.power[t.abbr])}</> }));
  // Rolling net rating over the last five games, by game number
  const maxG = Math.max(...Object.values(d.power).map(p => p.g));
  const rolling = (a: string) => { const log = d.power[a]?.log ?? []; return Array.from({ length: maxG }, (_, i) => { const w = log.slice(Math.max(0, i - 4), i + 1); return i < log.length ? w.reduce((s, x) => s + x.ortg - x.drtg, 0) / w.length : null; }); };
  const n = (a: string) => T[a]?.short ?? a;
  return (
    <>
      <section className="ocard">
        <h2>Who is strongest, and at what</h2>
        <p className="dek">ESPN's power index has the <b>{T[byBpi[0]]?.name}</b> on top. On the court so far the best net rating belongs to the <b>{n(byNet[0])}</b>; the best offence to the <b>{n(best('ortg'))}</b>, the best defence to the <b>{n(best('drtg', true))}</b>. The best shooters (eFG%) are the <b>{n(best('efg'))}</b>, the best on the offensive glass the <b>{n(best('orb'))}</b>, and in clutch time nobody has beaten the <b>{n(best('clutch'))}</b>.</p>
        <p className="dek" style={{ fontSize: 12.5 }}>Everything is <b>per 100 possessions</b>, so fast and slow teams compare fairly. A net rating of +10 is a title contender; +5 a good playoff team; 0 average.</p>
        <Early d={d} />
      </section>

      <section className="ocard">
        <h2>Offence against defence</h2>
        <p className="dek">Points scored and allowed per 100 possessions. Right scores more, up allows less: the complete teams sit top right. In colour: the top three by net rating and by ESPN's index.</p>
        <QuadrantScatter invertY xLabel="Offensive rating" yLabel="Defensive rating (less allowed ↑)" fmt={v => v.toFixed(0)} corners={['Contenders', 'Defence first', 'Offence first', 'Rebuilding']}
          points={pts(p => p.ortg, p => p.drtg, (t, p) => <>Off {p.ortg.toFixed(1)} · Def {p.drtg.toFixed(1)} · Net {sg(p.net)} · {p.w}-{p.l}{d.bpi[t.abbr] ? ` · BPI ${sg(d.bpi[t.abbr].bpi)}` : ''}</>)} />
        <Src>Computed from ESPN box scores; BPI from ESPN</Src>
      </section>

      <section className="s-two">
        <div className="ocard">
          <h2>How they score</h2>
          <p className="dek">Two of the four factors: shooting (eFG%) against ball security (turnovers per possession). Top right shoot well and rarely give it away.</p>
          <QuadrantScatter height={360} invertY xLabel="Effective FG%" yLabel="Turnover rate (fewer ↑)" fmt={v => pc(v)} corners={['Efficient', 'Careful', 'Shoot well, sloppy', 'Struggling']}
            points={pts(p => p.off.efg, p => p.off.tov, (_, p) => <>eFG {pc1(p.off.efg)} · TOV {pc1(p.off.tov)} · OREB {pc1(p.off.orb)} · FT rate {p.off.ftr.toFixed(3)}</>)} />
        </div>
        <div className="ocard">
          <h2>How they play</h2>
          <p className="dek">Style, not quality: pace (possessions per 48 minutes) against the share of shots taken from three.</p>
          <QuadrantScatter height={360} xLabel="Pace" yLabel="Share of shots from three" fmt={v => (v > 1 ? v.toFixed(0) : pc(v))} corners={['Fast, from deep', 'Slow, from deep', 'Fast, inside', 'Slow, inside']}
            points={pts(p => p.pace, p => p.off.tpRate, (_, p) => <>Pace {p.pace.toFixed(1)} · {pc(p.off.tpRate)} of shots from three, {pc1(p.off.tpPct)} made</>)} />
        </div>
      </section>

      <section className="ocard">
        <h2>Every team, every strength</h2>
        <p className="dek">Colour = rank among the 30 teams: deep blue among the best, deep orange among the worst; grey columns are style. Click a column to sort.</p>
        <PercentileGrid rows={rows} cols={POWER_COLS} initial="bpi" />
        <Src>Computed from ESPN box scores; BPI from ESPN</Src>
      </section>

      <section className="ocard">
        <h2>Where they shoot, and how well</h2>
        <p className="dek">Shot zones from the play-by-play coordinates: at the rim, the rest of the paint, mid-range, corner threes and above-the-break threes. The first block is where a team's shots come from; the second how often they go in; the third what the defence allows.</p>
        <PercentileGrid rows={rows} cols={SHOT_COLS} initial="p_rim" />
        <Src>Computed from ESPN play-by-play</Src>
      </section>

      <section className="ocard">
        <h2>When they are strongest</h2>
        <p className="dek">Average margin quarter by quarter, the last five minutes of close games (clutch), and net rating at home, on the road, rested and on the second night of a back-to-back.</p>
        <PercentileGrid rows={rows} cols={PHASE_COLS} initial="clutch" />
      </section>

      {maxG >= 3 && <section className="ocard">
        <h2>Who is getting better</h2>
        <p className="dek">Net rating over each team's last five games, game by game. Grey lines are the rest of the league.</p>
        <Spaghetti fmt={v => sg(v, 0)} steps={Array.from({ length: maxG }, (_, i) => `G${i + 1}`)} series={d.teams.map(t => ({ id: t.abbr, label: t.short, values: rolling(t.abbr), color: lit.has(t.abbr) ? nbaInk(t) : undefined }))} />
      </section>}

      {Object.keys(d.bpi).length > 0 && <section className="ocard">
        <h2>Expected against actual</h2>
        <p className="dek">ESPN's index (which blends results with preseason expectations) against the net rating so far. Above the trend a team is playing better than expected.</p>
        <QuadrantScatter height={360} xLabel="BPI" yLabel="Net rating so far" fmt={v => sg(v, 0)} corners={['Strong and winning', 'Overachieving', 'Underachieving', 'Weak']}
          points={d.teams.filter(t => d.bpi[t.abbr] && d.power[t.abbr]).map(t => ({ id: t.abbr, label: t.abbr, x: d.bpi[t.abbr].bpi, y: d.power[t.abbr].net, color: lit.has(t.abbr) ? nbaInk(t) : undefined, tip: <><div className="k">{t.name}</div>BPI {sg(d.bpi[t.abbr].bpi)} (off {sg(d.bpi[t.abbr].off)}, def {sg(d.bpi[t.abbr].def)}) · net rating {sg(d.power[t.abbr].net)}</> }))} />
        <Src>Source: ESPN BPI, box scores</Src>
      </section>}
    </>
  );
}

/* ───────────────────────────── Teams ───────────────────────────── */

const STRIPS: StripMetric[] = [
  { key: 'bpi', label: 'Power index (BPI)', fmt: v => sg(v) },
  { key: 'net', label: 'Net rating', fmt: v => sg(v) },
  { key: 'ortg', label: 'Offence', note: 'points per 100 possessions', fmt: v => v.toFixed(1) },
  { key: 'efg', label: 'Shooting (eFG%)', fmt: pc1 },
  { key: 'tov', label: 'Ball security', note: 'turnovers per possession', fmt: pc1, low: true },
  { key: 'orb', label: 'Offensive rebounding', fmt: pc1 },
  { key: 'ftr', label: 'Getting to the line', fmt: v => v.toFixed(3) },
  { key: 'drtg', label: 'Defence', note: 'points allowed per 100', fmt: v => v.toFixed(1), low: true },
  { key: 'dEfg', label: 'Shooting allowed', fmt: pc1, low: true },
  { key: 'dTov', label: 'Turnovers forced', fmt: pc1 },
  { key: 'dOrb', label: 'Defensive rebounding', note: 'opponent OREB%', fmt: pc1, low: true },
  { key: 'clutch', label: 'Clutch', note: 'margin per game', fmt: v => sg(v) },
  { key: 'pace', label: 'Pace', fmt: v => v.toFixed(1), neutral: true },
  { key: 'tpRate', label: 'Three-point rate', fmt: pc, neutral: true },
];

export function TeamsScreen({ d }: { d: NbaSeasonFile }) {
  const [pick, setPick] = usePick('team');
  const T = useT(d);
  const abbr = T[pick ?? ''] ? pick! : byBest(d);
  const t = T[abbr], p = d.power[abbr], b = d.bpi[abbr];
  const V = useMemo(() => nbaValues(d), [d]);
  const [mode, setMode] = useState<'pct' | 'freq'>('pct');
  const rivals = d.teams.filter(x => x.div === t?.div && x.abbr !== abbr);
  const rk = (k: string, low = false) => ranks(Object.fromEntries(Object.entries(V).map(([a, v]) => [a, v[k]])), low)[abbr];
  const strong = STRIPS.filter(m => !m.neutral).map(m => ({ m, r: rk(m.key, m.low) })).filter(x => x.r).sort((a, c) => a.r - c.r);
  const roster = d.players.filter(x => x.team === abbr).sort((a, c) => c.min - a.min);
  const allShots = Object.fromEntries(Object.entries(d.power).map(([k, v]) => [k, v.shots]));
  const allOpp = Object.fromEntries(Object.entries(d.power).map(([k, v]) => [k, v.oppShots]));
  return (
    <>
      <section className="ocard">
        <h2>Pick a team</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
          {[...new Set(d.teams.map(x => x.div))].sort((a, c) => (d.teams.find(x => x.div === a)!.conf === 'East' ? 0 : 1) - (d.teams.find(x => x.div === c)!.conf === 'East' ? 0 : 1)).map(div => (
            <div key={div}><div className="lab">{div}</div>
              {d.teams.filter(x => x.div === div).map(x => <button key={x.abbr} className="btn" aria-pressed={x.abbr === abbr} onClick={() => setPick(x.abbr)} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 3, textTransform: 'none', letterSpacing: 0, fontSize: 12, color: 'var(--o-ink)', background: x.abbr === abbr ? 'var(--o-accent-soft)' : 'transparent', borderColor: x.abbr === abbr ? 'var(--o-accent)' : 'var(--o-line)' }}><NbaLogo abbr={x.abbr} />{x.short}</button>)}
            </div>
          ))}
        </div>
      </section>
      {t && <section className="ocard">
        <h2><NbaLogo abbr={abbr} />{t.name}</h2>
        <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', margin: '6px 0 14px' }}>
          {p && <div className="kpi"><Score as="b">{p.w}-{p.l}</Score><span>Record</span></div>}
          {p && <div className="kpi"><b>{sg(p.net)}</b><span>Net rating</span></div>}
          {b && <div className="kpi"><b>{ordinal(b.rank)}</b><span>Power index</span></div>}
          {b && <div className="kpi"><b>{b.projW.toFixed(0)}</b><span>Projected wins</span></div>}
          {b && <div className="kpi"><b>{Math.round(b.playoffs)}%</b><span>Playoffs</span></div>}
          {b && <div className="kpi"><b>{b.title < 1 ? '<1' : Math.round(b.title)}%</b><span>Title</span></div>}
        </div>
        {strong.length > 2 && <p className="dek"><b>Best at:</b> {strong.slice(0, 3).map(x => `${x.m.label} (${ordinal(x.r)})`).join(', ')}. <b>Weakest at:</b> {strong.slice(-3).reverse().map(x => `${x.m.label} (${ordinal(x.r)})`).join(', ')}.</p>}
        <Early d={d} />
        <div className="olegend"><span><i style={{ background: nbaInk(t) }} />{t.short}</span>{rivals.map((r, i) => <span key={r.abbr}><i style={{ background: ['var(--o-s4)', 'var(--o-s3)', 'var(--o-s2)', 'var(--o-ink2)'][i] }} />{r.short}</span>)}<span><i style={{ background: 'var(--o-other)' }} />Rest of the league</span></div>
        <RankStrips metrics={STRIPS} values={V} me={abbr} color={nbaInk(t)} labelOf={a => a} compare={rivals.map((r, i) => ({ id: r.abbr, color: ['var(--o-s4)', 'var(--o-s3)', 'var(--o-s2)', 'var(--o-ink2)'][i] }))} />
      </section>}
      {p && <section className="ocard">
        <h2>Shot chart</h2>
        <p className="dek">{mode === 'pct' ? 'How often shots go in, zone by zone, coloured by rank in the league (blue among the best).' : 'Where the shots come from: the darker the zone, the more the team uses it compared with the league.'} Hover a zone for the detail.</p>
        <Chips label="Mode" items={[{ k: 'pct', label: 'Accuracy' }, { k: 'freq', label: 'Frequency' }]} value={mode} set={setMode} />
        <div className="s-two" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div><div className="lab">{t?.short} shooting</div><ShotCourt all={allShots} me={abbr} side="off" mode={mode} /></div>
          <div><div className="lab">Opponents against the {t?.short}</div><ShotCourt all={allOpp} me={abbr} side="def" mode={mode} /></div>
        </div>
        <Src>Computed from ESPN play-by-play coordinates</Src>
      </section>}
      {p && p.log.length > 0 && <section className="s-two">
        <div className="ocard">
          <h2>Game by game</h2>
          <DiffBars color={nbaInk(t)} bars={p.log.map(g => ({ label: `${g.home ? '' : '@'}${g.opp}`, value: g.pts - g.opp_pts, tip: `${fmt(Date.parse(g.date), { day: 'numeric', month: 'short' })} ${g.home ? 'vs' : 'at'} ${T[g.opp]?.name}: ${g.pts}–${g.opp_pts} · off ${g.ortg} def ${g.drtg}` }))} />
        </div>
        <div className="ocard">
          <h2>The rotation</h2>
          <table className="otable" style={{ fontSize: 12 }}>
            <thead><tr><th>Player</th><th className="n">G</th><th className="n">MIN</th><th className="n">PTS</th><th className="n">REB</th><th className="n">AST</th><th className="n">TS%</th><th className="n">USG%</th><th className="n">+/-</th></tr></thead>
            <tbody>{roster.slice(0, 12).map(x => <tr key={x.id}><td style={{ whiteSpace: 'nowrap' }}><span style={{ color: 'var(--o-ink3)' }}>{x.pos}</span> {x.name}</td><td className="n">{x.g}</td><td className="n">{(x.min / x.g).toFixed(1)}</td><td className="n">{(x.pts / x.g).toFixed(1)}</td><td className="n">{(x.reb / x.g).toFixed(1)}</td><td className="n">{(x.ast / x.g).toFixed(1)}</td><td className="n">{x.ts != null ? pc1(x.ts) : '–'}</td><td className="n">{x.usg?.toFixed(1) ?? '–'}</td><td className="n">{x.pm > 0 ? '+' : ''}{x.pm}</td></tr>)}</tbody>
          </table>
          <Src>Per game; computed from ESPN box scores</Src>
        </div>
      </section>}
    </>
  );
}
const byBest = (d: NbaSeasonFile) => Object.entries(d.bpi).sort((a, b) => b[1].bpi - a[1].bpi)[0]?.[0] ?? d.teams[0].abbr;

/* ───────────────────────────── Players ───────────────────────────── */

const PER: [string, string][] = [['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists'], ['stl', 'Steals'], ['blk', 'Blocks'], ['tpm', 'Threes made']];

export function PlayersScreen({ d }: { d: NbaSeasonFile }) {
  const T = useT(d);
  const maxG = Math.max(1, ...d.players.map(p => p.g));
  const minG = Math.max(2, Math.round(maxG * 0.6));
  // Regulars only: enough games, minutes and shots for the rates to mean something
  const qual = d.players.filter(p => p.g >= Math.min(minG, maxG) && p.min / p.g >= 20 && p.fga / p.g >= 5);
  const [sortKey, setSort] = useState<string>('pts');
  const per = (p: typeof qual[number], k: string) => (p as unknown as Record<string, number>)[k] / p.g;
  return (
    <>
      <section className="ocard">
        <h2>Volume against efficiency</h2>
        <p className="dek">Points per game against true shooting (points per shot, free throws included). The stars who score a lot without wasting shots sit top right. Players with at least {minG} games and 20 minutes a night; bubble labels are the top scorers.</p>
        <QuadrantScatter xLabel="Points per game" yLabel="True shooting %" fmtX={v => v.toFixed(0)} fmt={v => pc(v)} corners={['Efficient stars', 'Efficient role players', 'Volume, inefficient', 'Struggling']}
          points={qual.filter(p => p.ts != null && p.ts <= 1).map(p => ({ id: p.id, label: p.pts / p.g >= 22 ? p.name.split(' ').slice(-1)[0] : '', x: p.pts / p.g, y: p.ts!, color: p.pts / p.g >= 25 ? nbaInk(T[p.team]) : undefined, tip: <><div className="k">{p.name} · {p.team}</div>{(p.pts / p.g).toFixed(1)} pts, {(p.reb / p.g).toFixed(1)} reb, {(p.ast / p.g).toFixed(1)} ast · TS {pc1(p.ts!)} · usage {p.usg?.toFixed(1)}%</> }))} />
        <Src>Computed from ESPN box scores</Src>
      </section>
      <section className="ocard">
        <h2>Leaders per game</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 18 }}>
          {PER.map(([k, label]) => (
            <div key={k}><div className="lab">{label}</div>
              {[...qual].sort((a, b) => per(b, k) - per(a, k)).slice(0, 8).map((p, i) => <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '16px 1fr auto', gap: 6, fontSize: 12.5, padding: '3px 0', borderBottom: '1px solid var(--o-line)' }}><span style={{ color: 'var(--o-ink3)' }}>{i + 1}</span><span>{p.name} <small style={{ color: 'var(--o-ink3)' }}><NbaLogo abbr={p.team} />{p.team}</small></span><b>{per(p, k).toFixed(1)}</b></div>)}
            </div>
          ))}
        </div>
      </section>
      <section className="ocard">
        <h2>All qualified players</h2>
        <Chips label="Sort" items={[['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists'], ['ts', 'True shooting'], ['usg', 'Usage'], ['pm', 'Plus-minus']].map(([k, l]) => ({ k, label: l }))} value={sortKey} set={setSort} />
        <div style={{ overflowX: 'auto' }}>
          <table className="otable" style={{ fontSize: 12 }}>
            <thead><tr><th>#</th><th>Player</th><th className="n">G</th><th className="n">MIN</th><th className="n">PTS</th><th className="n">REB</th><th className="n">AST</th><th className="n">STL</th><th className="n">BLK</th><th className="n">TOV</th><th className="n">3PM</th><th className="n">TS%</th><th className="n">USG%</th><th className="n">+/-</th></tr></thead>
            <tbody>{[...qual].sort((a, b) => (sortKey === 'ts' ? (b.ts ?? 0) - (a.ts ?? 0) : sortKey === 'usg' ? (b.usg ?? 0) - (a.usg ?? 0) : sortKey === 'pm' ? b.pm - a.pm : per(b, sortKey) - per(a, sortKey))).slice(0, 60).map((p, i) => (
              <tr key={p.id}><td>{i + 1}</td><td style={{ whiteSpace: 'nowrap' }}>{p.name} <small style={{ color: 'var(--o-ink3)' }}><NbaLogo abbr={p.team} />{p.team}</small></td><td className="n">{p.g}</td><td className="n">{(p.min / p.g).toFixed(1)}</td><td className="n">{(p.pts / p.g).toFixed(1)}</td><td className="n">{(p.reb / p.g).toFixed(1)}</td><td className="n">{(p.ast / p.g).toFixed(1)}</td><td className="n">{(p.stl / p.g).toFixed(1)}</td><td className="n">{(p.blk / p.g).toFixed(1)}</td><td className="n">{(p.tov / p.g).toFixed(1)}</td><td className="n">{(p.tpm / p.g).toFixed(1)}</td><td className="n">{p.ts != null ? pc1(p.ts) : '–'}</td><td className="n">{p.usg?.toFixed(1)}</td><td className="n">{p.pm > 0 ? '+' : ''}{p.pm}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <Src>Computed from ESPN box scores · usage is an estimate from team totals</Src>
      </section>
    </>
  );
}

/* ───────────────────────────── Awards race ───────────────────────────── */

export function AwardsScreen({ d }: { d: NbaSeasonFile }) {
  const champ = d.markets.KXNBA;
  const teamOf = (name: string) => d.teams.find(t => t.name.startsWith(name) || t.name === name || name.startsWith(t.short));
  const order = ['KXNBAMVP', 'KXNBAROY', 'KXNBADPOY', 'KXNBASIXTH', 'KXNBAMIMP', 'KXNBACLUTCH', 'KXNBACOY'];
  const hist = d.marketHistory;
  return (
    <>
      {champ && <section className="ocard">
        <h2>Who wins the title</h2>
        <p className="dek">Two forecasts side by side: the price traders pay on Kalshi (a prediction market) and ESPN's BPI simulations. Where they disagree, one of them is wrong.</p>
        <table className="otable" style={{ fontSize: 12.5 }}>
          <thead><tr><th>Team</th><th className="n">Market</th><th className="n">ESPN BPI</th><th className="n">Record</th></tr></thead>
          <tbody>{champ.rows.slice(0, 12).map(r => { const t = teamOf(r.name); return <tr key={r.name}><td>{t ? <><NbaLogo abbr={t.abbr} />{t.name}</> : r.name}</td><ProbCell p={r.p} color="var(--o-s4)" /><ProbCell p={t ? d.bpi[t.abbr]?.title : null} /><td className="n">{t && d.power[t.abbr] ? `${d.power[t.abbr].w}-${d.power[t.abbr].l}` : '–'}</td></tr>; })}</tbody>
        </table>
        <Src>Sources: Kalshi (midpoint of bid and ask), ESPN BPI</Src>
      </section>}
      <section className="ocard">
        <h2>The awards race</h2>
        <p className="dek">The market's chance for each candidate. Awards need 65 games played, so injuries can end a race in March.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 22 }}>
          {order.filter(k => d.markets[k]).map(k => {
            const m = d.markets[k], max = Math.max(...m.rows.map(r => r.p));
            const stats = (name: string) => d.players.find(p => p.name === name);
            return (
              <div key={k}>
                <div className="lab">{m.label}</div>
                {m.rows.slice(0, 8).map(r => { const s = stats(r.name); return (
                  <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 40px', gap: 8, alignItems: 'center', fontSize: 12.5, margin: '4px 0' }}>
                    <span>{r.name}{s && <small style={{ color: 'var(--o-ink3)' }}> <NbaLogo abbr={s.team} />{(s.pts / s.g).toFixed(1)}/{(s.reb / s.g).toFixed(1)}/{(s.ast / s.g).toFixed(1)}</small>}</span>
                    <span style={{ height: 10, background: 'var(--o-grid)', borderRadius: 2 }}><span style={{ display: 'block', height: '100%', width: `${(r.p / max) * 100}%`, background: 'var(--o-s1)', borderRadius: 2 }} /></span>
                    <b style={{ textAlign: 'right' }}>{r.p < 1 ? '<1' : Math.round(r.p)}%</b>
                  </div>
                ); })}
              </div>
            );
          })}
        </div>
        <Src>Source: Kalshi prediction markets · player line: points/rebounds/assists per game</Src>
      </section>
      <section className="ocard">
        <h2>How the MVP race moves</h2>
        {hist.length >= 2 ? <Spaghetti zero={false} fmt={v => `${Math.round(v)}%`} steps={hist.map(h => `Wk ${h.wk}`)} series={(d.markets.KXNBAMVP?.rows ?? []).slice(0, 8).map((r, i) => ({ id: r.name, label: r.name.split(' ').slice(-1)[0], values: hist.map(h => h.t.KXNBAMVP?.[r.name] ?? null), color: i < 5 ? ['var(--o-s1)', 'var(--o-s2)', 'var(--o-s3)', 'var(--o-s4)', 'var(--o-ink2)'][i] : undefined }))} />
          : <p className="dek">The Observer records the market once a week; the chart fills in from next week.</p>}
      </section>
    </>
  );
}

/* ───────────────────────────── History ───────────────────────────── */

// Old names → today's franchise
const MOVED: [RegExp, string][] = [[/Minneapolis Lakers/, 'LAL'], [/(Philadelphia|San Francisco) Warriors/, 'GS'], [/Syracuse Nationals/, 'PHI'], [/St\. Louis Hawks/, 'ATL'], [/Rochester Royals/, 'SAC'], [/Washington Bullets/, 'WSH'], [/Seattle SuperSonics/, 'OKC'], [/Fort Wayne Pistons/, 'DET'], [/New Jersey Nets/, 'BKN'], [/Kansas City Kings/, 'SAC'], [/Baltimore Bullets|Chicago Stags|Washington Capitols/, '—']];

export function HistoryScreen({ d }: { d: NbaSeasonFile }) {
  const T = useT(d);
  const [conf, setConf] = useState<'East' | 'West'>('West');
  const fin = d.history.finals;
  const fr = (name: string) => MOVED.find(([re]) => re.test(name))?.[1] ?? d.teams.find(t => name === t.name || name.endsWith(t.name.split(' ').slice(-1)[0]))?.abbr ?? '—';
  const tally = d.teams.map(t => ({ t, w: fin.filter(f => fr(f.winner) === t.abbr).length, l: fin.filter(f => fr(f.loser) === t.abbr).length })).sort((a, b) => b.w - a.w || b.l - a.l);
  const maxW = Math.max(1, ...tally.map(x => x.w + x.l));
  const seasons = Object.keys(d.history.seasons).map(Number).sort((a, b) => a - b);
  const champ = Object.fromEntries(fin.map(f => [f.year, fr(f.winner)])), lost = Object.fromEntries(fin.map(f => [f.year, fr(f.loser)]));
  const east = fin.filter(f => f.year >= 1971 && f.conf === 'East').length, west = fin.filter(f => f.year >= 1971 && f.conf === 'West').length;
  return (
    <>
      <section className="ocard">
        <h2>Titles by franchise</h2>
        <p className="dek">{fin.length} Finals since 1947. Since the conferences began (1971) the East has won {east}, the West {west}. Solid bars are titles, light bars lost Finals; teams that moved count with today's franchise.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', columnGap: 30 }}>
          {tally.map(({ t, w, l }) => (
            <div key={t.abbr} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 48px', gap: 8, alignItems: 'center', fontSize: 12, padding: '2px 0' }}>
              <span style={{ whiteSpace: 'nowrap' }}><NbaLogo abbr={t.abbr} />{t.short}</span>
              <span style={{ display: 'flex', height: 10 }}><span style={{ width: `${(w / maxW) * 100}%`, background: nbaInk(t) }} /><span style={{ width: `${(l / maxW) * 100}%`, background: nbaInk(t), opacity: 0.3 }} /></span>
              <span style={{ color: 'var(--o-ink2)', textAlign: 'right' }}>{w}–{l}</span>
            </div>
          ))}
        </div>
        <Src>Source: Wikipedia, List of NBA champions</Src>
      </section>
      {seasons.length > 0 && <section className="ocard">
        <h2>Every team since 2004–05</h2>
        <p className="dek">Winning percentage of every season since the league reached 30 teams. ★ champions, ◆ lost the Finals, a small number is the playoff seed.</p>
        <Chips label="Conference" items={[{ k: 'West', label: 'West' }, { k: 'East', label: 'East' }]} value={conf} set={setConf} />
        <div style={{ overflowX: 'auto' }}>
          <table className="otable" style={{ fontSize: 10.5, minWidth: 760 }}>
            <thead><tr><th>Team</th>{seasons.map(y => <th key={y} className="n" style={{ padding: '4px 1px' }}>{String(y).slice(2)}</th>)}</tr></thead>
            <tbody>{d.teams.filter(t => t.conf === conf).sort((a, b) => a.div.localeCompare(b.div)).map(t => (
              <tr key={t.abbr}><td style={{ whiteSpace: 'nowrap' }}><NbaLogo abbr={t.abbr} />{t.short}</td>
                {seasons.map(y => { const s = d.history.seasons[y]?.[t.abbr]; if (!s) return <td key={y} />; const mark = champ[y] === t.abbr ? '★' : lost[y] === t.abbr ? '◆' : s.seed && s.seed <= 8 ? String(s.seed) : ''; return <td key={y} className="n" title={`${seasonLabel(y)}: ${s.w}-${s.l}${s.seed ? `, seed ${s.seed}` : ''}`} style={{ background: `color-mix(in srgb, ${s.pct >= 0.5 ? 'var(--o-s1)' : 'var(--o-s2)'} ${Math.round(Math.abs(s.pct - 0.5) * 170)}%, var(--o-card))`, color: Math.abs(s.pct - 0.5) > 0.3 ? '#fff' : 'var(--o-ink)', padding: '5px 1px', textAlign: 'center', fontWeight: 700 }}>{mark}</td>; })}
              </tr>
            ))}</tbody>
          </table>
        </div>
        <Src>Source: ESPN standings</Src>
      </section>}
      <section className="ocard">
        <h2>Every Finals</h2>
        <table className="otable" style={{ fontSize: 12 }}>
          <thead><tr><th>Year</th><th>Champion</th><th className="n">Series</th><th>Runner-up</th></tr></thead>
          <tbody>{[...fin].reverse().map(f => { const w = fr(f.winner), l = fr(f.loser); return <tr key={f.year}><td>{f.year}</td><td>{T[w] && <NbaLogo abbr={w} />}{f.winner}</td><td className="n">{f.games}</td><td>{T[l] && <NbaLogo abbr={l} />}{f.loser}</td></tr>; })}</tbody>
        </table>
        <Src>Source: Wikipedia, List of NBA champions</Src>
      </section>
    </>
  );
}

/* ───────────────────────────── How it works ───────────────────────────── */

export function HowScreen({ d }: { d: NbaSeasonFile }) {
  const P = ({ children }: { children: ReactNode }) => <p style={{ margin: '0 0 10px', lineHeight: 1.55, fontSize: 14 }}>{children}</p>;
  return (
    <>
      <section className="ocard">
        <h2>The {seasonLabel(d.season)} season at a glance</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          {([
            ['Regular season', d.schedule.start ? dayLong(Date.parse(d.schedule.start)) : '–', `82 games each${d.schedule.end ? `, to ${dayLong(Date.parse(`${d.schedule.end}T12:00:00Z`))}` : ''}`],
            ['NBA Cup', 'November–December', 'Group games inside the regular season; knockout rounds, final in Las Vegas'],
            ['Trade deadline', 'February', 'Last day to trade players'],
            ['Play-in', 'Mid-April', 'Seeds 7–10 play for the last two places'],
            ['Playoffs', 'April–May', 'Four best-of-seven rounds, 16 teams'],
            ['Finals', 'June', 'East champion against West champion'],
          ] as const).map(([name, when, what], i) => (
            <div key={name} style={{ borderTop: `3px solid ${i === 0 ? 'var(--o-s1)' : i === 5 ? 'var(--o-s4)' : 'var(--o-ink3)'}`, paddingTop: 8 }}>
              <div style={{ fontWeight: 700 }}>{name}</div><div style={{ fontSize: 12.5, color: 'var(--o-ink2)' }}>{when}</div><div style={{ fontSize: 12, color: 'var(--o-ink3)', marginTop: 4 }}>{what}</div>
            </div>
          ))}
        </div>
      </section>
      <section className="s-two">
        <div className="ocard">
          <h2>The league</h2>
          <P><b>30 teams, two conferences</b> of 15 (East and West), each split into three divisions of five. Every team plays 82 games: four against each division rival, three or four against the other conference teams, two against every team in the other conference.</P>
          <P><b>Standings</b> go by winning percentage. Ties are broken by head-to-head, then division winner, division record, conference record and record against playoff teams.</P>
          <P><b>The NBA Cup</b> (the in-season tournament) uses some November and December games: groups of five, eight teams to the knockout rounds. Its games count in the standings, except the final.</P>
        </div>
        <div className="ocard">
          <h2>Play-in and playoffs</h2>
          <P><b>Seeds 1–6</b> in each conference go straight to the playoffs. <b>Seeds 7–10</b> play the play-in: 7 against 8 (the winner is the 7th seed), 9 against 10 (the loser is out), then the loser of 7–8 against the winner of 9–10 for the 8th seed.</P>
          <P><b>Four rounds, all best of seven:</b> first round (1 v 8, 2 v 7, 3 v 6, 4 v 5), conference semifinals, conference finals, NBA Finals. The better record has home court: games 1, 2, 5 and 7.</P>
          <P><b>Awards</b> (MVP and the others) need at least 65 games played. The <b>draft lottery</b> draws the top four picks among the 14 teams that missed the playoffs; the three worst records each have a 14% chance at the first pick.</P>
        </div>
      </section>
      <section className="ocard">
        <h2>Reading the numbers in this section</h2>
        <div className="s-two" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <P><b>Possessions</b> are estimated from the box score: field-goal attempts − offensive rebounds + turnovers + 0.44 × free-throw attempts. <b>Pace</b> is possessions per 48 minutes.</P>
            <P><b>Offensive and defensive rating:</b> points scored and allowed per 100 possessions. <b>Net rating</b> is the difference: the best single measure of how good a team has been.</P>
            <P><b>The four factors</b> (Dean Oliver) explain most of that: shooting (eFG%, where a three is worth 1.5 makes), turnovers per possession, offensive rebounding (share of own misses grabbed) and free-throw rate (free throws made per field-goal attempt). Each has a defensive mirror.</P>
          </div>
          <div>
            <P><b>True shooting %</b> is points per shot, counting threes and free throws. <b>Usage</b> estimates the share of team possessions a player ends with a shot, free throws or a turnover while on the floor.</P>
            <P><b>Clutch time</b> is the last five minutes of the fourth quarter or overtime with the score within five points.</P>
            <P><b>BPI</b> is ESPN's Basketball Power Index: how many points a team is better than average, offence and defence, blending results with preseason expectations. It drives ESPN's playoff and title odds.</P>
          </div>
        </div>
      </section>
    </>
  );
}
