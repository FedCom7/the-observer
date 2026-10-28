// The NFL screens beyond the home: the whole season, team strength, every team,
// leaders, the playoff race, history and the rules. Data: public/data/nfl.json
// (scripts/collect/nfl.mjs) plus ESPN live for box scores and leaders.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BumpChart, DiffBars } from '../components/charts';
import { NflLogo, Score } from '../components/common';
import { Dumbbells, PercentileGrid, ProbCell, QuadrantScatter, RankStrips, Spaghetti, WinProb, ordinal, ranks, type GridCol, type StripMetric } from '../components/power';
import { Chips, usePick } from '../components/tabs';
import { dayLong, dayShort, fmt, hhmm } from '../core/time';
import { nflBox, standingsByWeek, winPct, type NflBox, type NflSeasonFile, type NflSeasonGame, type NflTeamInfo } from '../sources/nflData';

export const NFL_TABS = [['now', 'Now'], ['season', 'Season'], ['power', 'Power'], ['teams', 'Teams'], ['leaders', 'Leaders'], ['race', 'Playoff race'], ['history', 'History'], ['how', 'How it works']] as const;
export type NflTab = typeof NFL_TABS[number][0];

const ME = 'NE';
const DIVS = ['East', 'North', 'South', 'West'];
const sign = (v: number, d = 2) => `${v > 0 ? '+' : ''}${v.toFixed(d)}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const rec = (r: { w: number; l: number; t: number }) => `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}`;

/** A team colour that reads on both light and dark cards (very dark or very light brand colours fall back). */
export function teamInk(t: NflTeamInfo | undefined): string {
  const lum = (hex: string | null) => { if (!hex) return -1; const n = parseInt(hex.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => v / 255); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  for (const c of [t?.color ?? null, t?.alt ?? null]) { const l = lum(c); if (l > 0.12 && l < 0.75) return c!; }
  return 'var(--o-accent)';
}

const Loading = ({ what }: { what: string }) => <section className="ocard"><p className="dek">Loading {what}…</p></section>;
const Src = ({ children }: { children: ReactNode }) => <div className="osrc">{children}</div>;

function useTeams(d: NflSeasonFile) {
  return useMemo(() => Object.fromEntries(d.teams.map(t => [t.abbr, t])), [d]);
}

/** The latest week with results (or the first one before the season starts). */
const currentWeek = (d: NflSeasonFile) => {
  const reg = d.games.filter(g => g.type === 2);
  const live = reg.find(g => g.st === 'in');
  if (live) return live.wk;
  const next = reg.find(g => g.st === 'pre');
  const lastDone = Math.max(0, ...reg.filter(g => g.st === 'post').map(g => g.wk));
  return next && reg.filter(g => g.wk === next.wk).some(g => g.st === 'post') ? next.wk : Math.max(1, lastDone);
};
const playedWeeks = (d: NflSeasonFile) => Math.max(0, ...d.games.filter(g => g.type === 2 && g.st === 'post').map(g => g.wk));

/* ───────────────────────────── Season ───────────────────────────── */

export function SeasonScreen({ d }: { d: NflSeasonFile }) {
  const T = useTeams(d);
  const [pick, setPick] = usePick('week');
  const wk = pick ?? `r${currentWeek(d)}`;
  const games = d.games.filter(g => `${g.type === 3 ? 'p' : 'r'}${g.wk}` === wk || (wk === 'p' && g.type === 3));
  const weeks = [...Array.from({ length: 18 }, (_, i) => ({ k: `r${i + 1}`, label: String(i + 1) })), { k: 'p', label: 'Playoffs' }];
  const upTo = playedWeeks(d);
  return (
    <>
      <section className="ocard">
        <h2>Every game of {d.season}</h2>
        <p className="dek">Pick a week. Open a game for the box score, the scoring plays and how the chance of winning moved. Kickoffs in Rome time.</p>
        <Chips label="Week" items={weeks} value={wk} set={k => setPick(k)} />
        {groupByDay(games.filter(g => g.h !== 'TBD' || wk === 'p')).map(([day, gs]) => (
          <div key={day} style={{ marginBottom: 14 }}>
            <div className="lab">{day}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10, alignItems: 'start' }}>
              {gs.map(g => <SeasonGame key={g.id} g={g} T={T} />)}
            </div>
          </div>
        ))}
        {!games.length && <p className="dek">No games scheduled yet.</p>}
        <Src>Source: ESPN</Src>
      </section>
      {upTo >= 2 && <ResultsGrid d={d} upTo={upTo} />}
      {upTo >= 2 && <StandingsRace d={d} upTo={upTo} />}
    </>
  );
}

const groupByDay = (games: NflSeasonGame[]) => {
  const m = new Map<string, NflSeasonGame[]>();
  for (const g of games) { const k = fmt(Date.parse(g.start), { weekday: 'long', day: 'numeric', month: 'long' }); m.set(k, [...(m.get(k) ?? []), g]); }
  return [...m.entries()];
};

export function SeasonGame({ g, T, open: start = false }: { g: NflSeasonGame; T: Record<string, NflTeamInfo>; open?: boolean }) {
  const [open, setOpen] = useState(start);
  const t0 = Date.parse(g.start);
  const line = (abbr: string, score: number | null, lines: number[], won: boolean) => (
    <tr style={{ fontWeight: won ? 700 : 400, color: g.st === 'post' && !won ? 'var(--o-ink3)' : 'var(--o-ink)' }}>
      <td><NflLogo abbr={abbr} />{T[abbr]?.short ?? abbr}</td>
      {g.st !== 'pre' && lines.map((v, i) => <td key={i} className="n" style={{ color: 'var(--o-ink3)', fontWeight: 400, width: 18 }}><Score>{v}</Score></td>)}
      <td className="n" style={{ width: 28 }}><Score as="b">{g.st === 'pre' ? '' : score}</Score></td>
    </tr>
  );
  const hw = g.hs != null && g.as != null && g.hs > g.as, aw = g.hs != null && g.as != null && g.as > g.hs;
  return (
    <div style={{ border: `1px solid ${g.st === 'in' ? '#ff453a' : 'var(--o-line)'}`, borderRadius: 10, padding: '8px 10px', gridColumn: open ? '1 / -1' : undefined }}>
      <button onClick={() => setOpen(!open)} disabled={g.st === 'pre'} style={{ all: 'unset', display: 'block', width: '100%', cursor: g.st === 'pre' ? 'default' : 'pointer' }} aria-expanded={open}>
        {g.note && <div className="lab" style={{ marginBottom: 2 }}>{g.note}</div>}
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}><tbody>
          {line(g.a, g.as, g.al, aw)}{line(g.h, g.hs, g.hl, hw)}
        </tbody></table>
        <div style={{ fontSize: 11, color: g.st === 'in' ? '#ff453a' : 'var(--o-ink3)', marginTop: 2 }}>
          {g.st === 'pre' ? `${hhmm(t0)} Rome${g.tv ? ` · ${g.tv}` : ''}${g.venue ? ` · ${g.venue}` : ''}` : g.detail}
          {g.st !== 'pre' && <span style={{ float: 'right' }}>{open ? 'Close ▲' : 'Box score ▼'}</span>}
        </div>
      </button>
      {open && <GameDetail g={g} T={T} />}
    </div>
  );
}

const STAT_ROWS: [string, string][] = [['totalYards', 'Total yards'], ['yardsPerPlay', 'Yards per play'], ['netPassingYards', 'Passing yards'], ['rushingYards', 'Rushing yards'], ['firstDowns', 'First downs'], ['thirdDownEff', 'Third downs'], ['fourthDownEff', 'Fourth downs'], ['redZoneAttempts', 'Red zone (TD-trips)'], ['turnovers', 'Turnovers'], ['sacksYardsLost', 'Sacks–yards'], ['totalPenaltiesYards', 'Penalties–yards'], ['possessionTime', 'Possession']];

function GameDetail({ g, T }: { g: NflSeasonGame; T: Record<string, NflTeamInfo> }) {
  const side = (a: string) => ({ abbr: a, name: T[a]?.short ?? a, color: teamInk(T[a]) });
  return <FootballBox id={g.id} live={g.st === 'in'} league="nfl" away={side(g.a)} home={side(g.h)} Logo={a => <NflLogo abbr={a} />} />;
}

export interface BoxSide { abbr: string; name: string; color: string }

/** Box score of an American football game (NFL or college): chance of winning, team stats, scoring, drives, players. */
export function FootballBox({ id, live, league, away: A, home: H, Logo }: { id: string; live: boolean; league: 'nfl' | 'college-football'; away: BoxSide; home: BoxSide; Logo: (abbr: string) => ReactNode }) {
  const [box, setBox] = useState<NflBox | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let on = true;
    const load = () => nflBox(id, league).then(b => { if (on) setBox(b); }).catch(() => on && setErr(true));
    load();
    const t = live ? setInterval(load, 30e3) : 0;
    return () => { on = false; if (t) clearInterval(t); };
  }, [id, live, league]);
  const g = { a: A.abbr, h: H.abbr };
  if (err) return <p className="dek">The box score is not available.</p>;
  if (!box) return <p className="dek">Loading the box score…</p>;
  const away = box.teams.find(t => !t.home), home = box.teams.find(t => t.home);
  return (
    <div style={{ marginTop: 10, display: 'grid', gap: 14 }}>
      {box.wp.length > 5 && <div>
        <div className="lab">Chance of winning, play by play</div>
        <WinProb points={box.wp} home={H.name} away={A.name} homeColor={H.color} awayColor={A.color} />
      </div>}
      <div className="s-two">
        {away && home && <div>
          <div className="lab">Team stats</div>
          <table className="otable"><thead><tr><th /><th className="n">{Logo(g.a)}{g.a}</th><th className="n">{Logo(g.h)}{g.h}</th></tr></thead>
            <tbody>{STAT_ROWS.filter(([k]) => away.stats[k] != null).map(([k, label]) => <tr key={k}><td>{label}</td><td className="n">{away.stats[k]}</td><td className="n">{home.stats[k]}</td></tr>)}</tbody></table>
        </div>}
        <div>
          <div className="lab">Scoring plays</div>
          <table className="otable"><tbody>{box.scoring.map((s, i) => <tr key={i}><td style={{ whiteSpace: 'nowrap', color: 'var(--o-ink3)' }}>Q{s.q} {s.clock}</td><td>{Logo(s.team)}<b>{s.type}</b> {s.text}</td><td className="n"><Score>{s.away}–{s.home}</Score></td></tr>)}</tbody></table>
        </div>
      </div>
      {box.drives.length > 0 && <DriveStrip box={box} sides={[A, H]} Logo={Logo} />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
        {['passing', 'rushing', 'receiving', 'defensive'].flatMap(cat => [g.a, g.h].map(abbr => {
          const p = box.players.find(x => x.abbr === abbr && x.cat === cat);
          if (!p || !p.rows.length) return null;
          const cols = p.labels.slice(0, 6);
          return (
            <div key={cat + abbr}>
              <div className="lab">{Logo(abbr)}{abbr} · {cat}</div>
              <table className="otable" style={{ fontSize: 11.5 }}><thead><tr><th /> {cols.map(c => <th key={c} className="n">{c}</th>)}</tr></thead>
                <tbody>{p.rows.map(r => <tr key={r.name}><td>{r.name}</td>{r.stats.slice(0, 6).map((s, i) => <td key={i} className="n">{s}</td>)}</tr>)}</tbody></table>
            </div>
          );
        }))}
      </div>
      <Src>Source: ESPN box score</Src>
    </div>
  );
}

/** Every drive as a bar of yards gained, coloured by how it ended (a drive chart). */
function DriveStrip({ box, sides, Logo }: { box: NflBox; sides: BoxSide[]; Logo: (abbr: string) => ReactNode }) {
  const color = (r: string) => (/touchdown/i.test(r) ? 'var(--o-s3)' : /field goal$/i.test(r) && !/missed/i.test(r) ? 'var(--o-s4)' : /interception|fumble|downs|safety/i.test(r) ? 'var(--o-s2)' : 'var(--o-other)');
  const max = Math.max(40, ...box.drives.map(x => Math.abs(x.yards)));
  return (
    <div>
      <div className="lab">Every drive</div>
      <div className="olegend">{[['Touchdown', 'var(--o-s3)'], ['Field goal', 'var(--o-s4)'], ['Turnover or downs', 'var(--o-s2)'], ['Punt, end of half', 'var(--o-other)']].map(([k, c]) => <span key={k}><i style={{ background: c }} />{k}</span>)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {sides.map(({ abbr, name }) => (
          <div key={abbr}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{Logo(abbr)}{name}</div>
            {box.drives.filter(x => x.team === abbr).map((x, i) => (
              <div key={i} title={`Q${x.q} · ${x.plays} plays, ${x.yards} yards, ${x.time} · ${x.result}`} style={{ display: 'grid', gridTemplateColumns: '1fr 74px', gap: 6, alignItems: 'center', fontSize: 10.5, color: 'var(--o-ink3)', marginBottom: 2 }}>
                <div style={{ height: 9, width: `${Math.max(2, (Math.max(0, x.yards) / max) * 100)}%`, background: color(x.result), borderRadius: 2 }} />
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.yards} yd · {x.result}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Teams × weeks: every result as a cell, coloured by the margin. */
function ResultsGrid({ d, upTo }: { d: NflSeasonFile; upTo: number }) {
  const T = useTeams(d);
  const [conf, setConf] = useState<'AFC' | 'NFC'>('AFC');
  const table = standingsByWeek(d.games, d.teams, upTo).at(-1)!.table;
  const teams = d.teams.filter(t => t.conf === conf).sort((a, b) => winPct(table[b.abbr]) - winPct(table[a.abbr]) || (table[b.abbr].pf - table[b.abbr].pa) - (table[a.abbr].pf - table[a.abbr].pa));
  const cell = (abbr: string, wk: number) => {
    const g = d.games.find(x => x.type === 2 && x.wk === wk && (x.h === abbr || x.a === abbr));
    if (!g) return <td key={wk} className="n" style={{ color: 'var(--o-ink3)', fontSize: 10 }}>bye</td>;
    const home = g.h === abbr, opp = home ? g.a : g.h;
    if (g.st !== 'post' || g.hs == null || g.as == null) return <td key={wk} className="n" style={{ color: 'var(--o-ink3)', fontSize: 10 }}>{home ? '' : '@'}{opp}</td>;
    const m = home ? g.hs - g.as : g.as - g.hs;
    const p = 0.5 + Math.max(-0.5, Math.min(0.5, m / 40));
    return <td key={wk} className="n" title={`${home ? 'vs' : 'at'} ${T[opp]?.name ?? opp}: ${home ? g.hs : g.as}–${home ? g.as : g.hs}`} style={{ background: `color-mix(in srgb, ${m > 0 ? 'var(--o-s1)' : m < 0 ? 'var(--o-s2)' : 'var(--o-other)'} ${Math.round(Math.abs(p - 0.5) * 140 + 18)}%, var(--o-card))`, fontSize: 10.5, padding: '5px 2px' }}>{home ? '' : '@'}{opp}<br /><b>{m > 0 ? `W+${m}` : m < 0 ? `L${m}` : 'T'}</b></td>;
  };
  return (
    <section className="ocard">
      <h2>The season, result by result</h2>
      <p className="dek">Every team's games, week by week, in order of record. Blue is a win, orange a loss; the deeper the colour, the wider the margin. “@” means on the road.</p>
      <Chips label="Conference" items={[{ k: 'AFC', label: 'AFC' }, { k: 'NFC', label: 'NFC' }]} value={conf} set={setConf} />
      <div style={{ overflowX: 'auto' }}>
        <table className="otable" style={{ fontSize: 11, minWidth: 760 }}>
          <thead><tr><th>Team</th><th className="n">W-L</th>{Array.from({ length: upTo }, (_, i) => <th key={i} className="n">{i + 1}</th>)}</tr></thead>
          <tbody>{teams.map(t => <tr key={t.abbr} className={t.abbr === ME ? 'me' : ''}><td style={{ whiteSpace: 'nowrap' }}><NflLogo abbr={t.abbr} />{t.short}</td><td className="n">{rec(table[t.abbr])}</td>{Array.from({ length: upTo }, (_, i) => cell(t.abbr, i + 1))}</tr>)}</tbody>
        </table>
      </div>
      <Src>Source: ESPN results</Src>
    </section>
  );
}

/** Conference rank after each week (record, then point differential) as a bump chart. */
function StandingsRace({ d, upTo }: { d: NflSeasonFile; upTo: number }) {
  const [conf, setConf] = useState<'AFC' | 'NFC'>('AFC');
  const T = useTeams(d);
  const hist = standingsByWeek(d.games, d.teams, upTo);
  const teams = d.teams.filter(t => t.conf === conf);
  const rankAt = (h: typeof hist[number]) => {
    const order = [...teams].sort((a, b) => winPct(h.table[b.abbr]) - winPct(h.table[a.abbr]) || (h.table[b.abbr].pf - h.table[b.abbr].pa) - (h.table[a.abbr].pf - h.table[a.abbr].pa));
    return Object.fromEntries(order.map((t, i) => [t.abbr, i + 1]));
  };
  const rk = hist.map(rankAt);
  const now = rk.at(-1)!;
  const lit = new Set([ME, ...Object.entries(now).filter(([, r]) => r <= 3).map(([k]) => k)]);
  return (
    <section className="ocard">
      <h2>The conference table, week by week</h2>
      <p className="dek">Rank in the conference by record (then point differential) after every week. The current top three and the Patriots in colour; the top seven make the playoffs.</p>
      <Chips label="Conference" items={[{ k: 'AFC', label: 'AFC' }, { k: 'NFC', label: 'NFC' }]} value={conf} set={setConf} />
      <BumpChart weeks={hist.map(h => h.wk)} maxRank={16} series={teams.map(t => ({ id: t.abbr, name: t.short, ranks: rk.map(r => r[t.abbr]), color: lit.has(t.abbr) ? teamInk(T[t.abbr]) : undefined }))} />
      <Src>Computed from ESPN results; division tiebreakers not applied</Src>
    </section>
  );
}

/* ───────────────────────────── Power ───────────────────────────── */

const POWER_COLS: GridCol[] = [
  { key: 'fpi', label: 'FPI', group: 'Overall', fmt: v => sign(v, 1), title: 'ESPN Football Power Index: expected margin against an average team on a neutral field' },
  { key: 'net', label: 'Net EPA', group: 'Overall', fmt: v => sign(v), title: 'Offensive EPA per play minus defensive EPA allowed per play' },
  { key: 'offEpa', label: 'EPA/play', group: 'Offence', fmt: v => sign(v), title: 'Expected points added per pass or run' },
  { key: 'offPassEpa', label: 'Pass', group: 'Offence', fmt: v => sign(v) },
  { key: 'offRushEpa', label: 'Run', group: 'Offence', fmt: v => sign(v) },
  { key: 'offSr', label: 'Success', group: 'Offence', fmt: pct, title: 'Share of plays with positive EPA' },
  { key: 'offExp', label: 'Big plays', group: 'Offence', fmt: pct, title: 'Passes of 20+ yards and runs of 10+' },
  { key: 'off3rd', label: '3rd down', group: 'Offence', fmt: pct },
  { key: 'offRz', label: 'Red zone', group: 'Offence', fmt: pct, title: 'Drives inside the 20 that end in a touchdown' },
  { key: 'offPtsDrive', label: 'Pts/drive', group: 'Offence', fmt: v => v.toFixed(2) },
  { key: 'sackRateAllowed', label: 'Sacked', group: 'Offence', fmt: pct, low: true, title: 'Sacks per dropback' },
  { key: 'defEpa', label: 'EPA/play', group: 'Defence', fmt: v => sign(v), low: true },
  { key: 'defPassEpa', label: 'Pass', group: 'Defence', fmt: v => sign(v), low: true },
  { key: 'defRushEpa', label: 'Run', group: 'Defence', fmt: v => sign(v), low: true },
  { key: 'defSr', label: 'Success', group: 'Defence', fmt: pct, low: true },
  { key: 'defExp', label: 'Big plays', group: 'Defence', fmt: pct, low: true },
  { key: 'def3rd', label: '3rd down', group: 'Defence', fmt: pct, low: true },
  { key: 'defRz', label: 'Red zone', group: 'Defence', fmt: pct, low: true },
  { key: 'defPtsDrive', label: 'Pts/drive', group: 'Defence', fmt: v => v.toFixed(2), low: true },
  { key: 'sackRate', label: 'Sacks', group: 'Defence', fmt: pct },
  { key: 'toMargin', label: 'Margin', group: 'Turnovers', fmt: v => (v > 0 ? `+${v}` : String(v)) },
  { key: 'effSt', label: 'Special teams', group: 'Kicking', fmt: v => v.toFixed(0), title: 'ESPN special teams efficiency, 0–100' },
];

/** Every number a team is judged on, flat, for the grids and the strips. */
export function teamValues(d: NflSeasonFile): Record<string, Record<string, number | null>> {
  const out: Record<string, Record<string, number | null>> = {};
  for (const t of d.teams) {
    const p = d.pbp?.teams[t.abbr], f = d.fpi[t.abbr];
    const q = (i: number) => (p?.byQ.off[i] != null && p?.byQ.def[i] != null ? p.byQ.off[i]! - p.byQ.def[i]! : null);
    out[t.abbr] = {
      fpi: f?.fpi ?? null, effSt: f?.effSt ?? null, sos: f?.sosRank ?? null,
      net: p ? p.offEpa - p.defEpa : null,
      ...(p ? Object.fromEntries((['offEpa', 'offPassEpa', 'offRushEpa', 'offSr', 'offExp', 'off3rd', 'offRz', 'offPtsDrive', 'sackRateAllowed', 'defEpa', 'defPassEpa', 'defRushEpa', 'defSr', 'defExp', 'def3rd', 'defRz', 'defPtsDrive', 'sackRate', 'toMargin', 'earlyPass'] as const).map(k => [k, p[k]])) : {}),
      q1: q(0), q2: q(1), q3: q(2), q4: q(3),
      firstHalf: p && p.byQ.off[0] != null && p.byQ.off[1] != null ? (p.byQ.off[0]! + p.byQ.off[1]! - p.byQ.def[0]! - p.byQ.def[1]!) / 2 : null,
      secondHalf: p && p.byQ.off[2] != null && p.byQ.off[3] != null ? (p.byQ.off[2]! + p.byQ.off[3]! - p.byQ.def[2]! - p.byQ.def[3]!) / 2 : null,
      close: p?.close4.off != null && p.close4.def != null ? p.close4.off - p.close4.def : null,
    };
  }
  return out;
}

const PHASE_COLS: GridCol[] = [
  { key: 'q1', label: '1st Q', group: 'Net EPA per play by quarter', fmt: v => sign(v) },
  { key: 'q2', label: '2nd Q', group: 'Net EPA per play by quarter', fmt: v => sign(v) },
  { key: 'q3', label: '3rd Q', group: 'Net EPA per play by quarter', fmt: v => sign(v) },
  { key: 'q4', label: '4th Q', group: 'Net EPA per play by quarter', fmt: v => sign(v) },
  { key: 'firstHalf', label: '1st half', group: 'Halves', fmt: v => sign(v) },
  { key: 'secondHalf', label: '2nd half', group: 'Halves', fmt: v => sign(v) },
  { key: 'close', label: 'Close 4th Q', group: 'Clutch', fmt: v => sign(v), title: 'Fourth quarter with the score within eight points' },
];

export function PowerScreen({ d }: { d: NflSeasonFile }) {
  const T = useTeams(d);
  const V = useMemo(() => teamValues(d), [d]);
  const p = d.pbp;
  if (!p) return <Loading what="team strength" />;
  const best = (k: string, low = false) => Object.entries(ranks(Object.fromEntries(Object.entries(V).map(([a, v]) => [a, v[k]])), low)).find(([, r]) => r === 1)?.[0] ?? '';
  const topFpi = best('fpi'), topOff = best('offEpa'), topDef = best('defEpa', true), topPass = best('offPassEpa'), topRun = best('offRushEpa'), topClose = best('close');
  const byNet = Object.entries(V).filter(([, v]) => v.net != null).sort((a, b) => b[1].net! - a[1].net!).map(([k]) => k);
  const lit = new Set([ME, ...byNet.slice(0, 4)]);
  const name = (a: string) => T[a]?.short ?? a;
  const rows = d.teams.map(t => ({ id: t.abbr, label: <><NflLogo abbr={t.abbr} />{t.short}</>, values: V[t.abbr], me: t.abbr === ME }));
  const weeks = Array.from({ length: p.maxWeek }, (_, i) => i + 1);
  // Net EPA, rolling over the last three games played
  const rolling = (abbr: string) => {
    const ws = p.teams[abbr]?.weeks ?? [];
    return weeks.map(w => { const last = ws.filter(x => x.wk <= w && x.off != null && x.def != null).slice(-3); return last.length && ws.some(x => x.wk === w) ? last.reduce((a, x) => a + x.off! - x.def!, 0) / last.length : null; });
  };
  return (
    <>
      <section className="ocard">
        <h2>Who is strongest, and at what</h2>
        <p className="dek">
          After {p.maxWeek} weeks: the strongest team overall is the <b>{T[topFpi]?.name}</b> (ESPN's power index). The best offence play for play belongs to the <b>{name(topOff)}</b>, the best defence to the <b>{name(topDef)}</b>.
          The best passing game is the <b>{name(topPass)}</b>, the best running game the <b>{name(topRun)}</b>; in tight fourth quarters nobody has been better than the <b>{name(topClose)}</b>.
        </p>
        <p className="dek" style={{ fontSize: 12.5 }}>Most numbers here are <b>EPA per play</b>: the expected points a play adds or takes away, given down, distance and field position. Zero is average; +0.10 is a very good offence; for a defence, lower is better.</p>
      </section>

      <section className="ocard">
        <h2>Offence against defence</h2>
        <p className="dek">Each dot is a team. Further right, the offence gains more per play; higher up, the defence gives up less. The complete teams sit top right.</p>
        <QuadrantScatter invertY xLabel="Offence: EPA per play" yLabel="Defence: EPA allowed per play (less is better)" corners={['Complete teams', 'Win with defence', 'Win with offence', 'Struggling']}
          points={d.teams.filter(t => p.teams[t.abbr]).map(t => ({ id: t.abbr, label: t.abbr, x: p.teams[t.abbr].offEpa, y: p.teams[t.abbr].defEpa, color: lit.has(t.abbr) ? teamInk(t) : undefined, tip: <><div className="k">{t.name}</div><div>Offence {sign(p.teams[t.abbr].offEpa)} · Defence {sign(p.teams[t.abbr].defEpa)}</div><div>Net {sign(V[t.abbr].net!)} · FPI {d.fpi[t.abbr] ? sign(d.fpi[t.abbr].fpi, 1) : '–'}</div></> }))} />
        <Src>Source: nflverse play-by-play (EPA model by nflfastR), ESPN FPI</Src>
      </section>

      <section className="s-two">
        <div className="ocard">
          <h2>How they move the ball</h2>
          <p className="dek">Offence: EPA per pass against EPA per run. Passing is worth more for almost everyone; the teams to the top right can do both.</p>
          <QuadrantScatter height={360} xLabel="Passing EPA per play" yLabel="Running EPA per play" corners={['Do both', 'Run first', 'Pass first', 'Neither']}
            points={d.teams.filter(t => p.teams[t.abbr]).map(t => ({ id: t.abbr, label: t.abbr, x: p.teams[t.abbr].offPassEpa, y: p.teams[t.abbr].offRushEpa, color: lit.has(t.abbr) ? teamInk(t) : undefined, tip: <><div className="k">{t.name}</div>Pass {sign(p.teams[t.abbr].offPassEpa)} · Run {sign(p.teams[t.abbr].offRushEpa)} · passes on {pct(p.teams[t.abbr].earlyPass)} of early downs</> }))} />
        </div>
        <div className="ocard">
          <h2>How they stop it</h2>
          <p className="dek">Defence: EPA allowed per pass and per run, less is better. Top right are the defences with no obvious hole.</p>
          <QuadrantScatter height={360} invertY xLabel="Pass defence (less allowed →)" yLabel="Run defence (less allowed)" fmt={v => v.toFixed(2)} corners={['No weak spot', 'Stops the run', 'Stops the pass', 'Leaky']}
            points={d.teams.filter(t => p.teams[t.abbr]).map(t => ({ id: t.abbr, label: t.abbr, x: -p.teams[t.abbr].defPassEpa, y: p.teams[t.abbr].defRushEpa, color: lit.has(t.abbr) ? teamInk(t) : undefined, tip: <><div className="k">{t.name}</div>Pass allowed {sign(p.teams[t.abbr].defPassEpa)} · Run allowed {sign(p.teams[t.abbr].defRushEpa)}</> }))} />
        </div>
      </section>

      <section className="ocard">
        <h2>Every team, every strength</h2>
        <p className="dek">The colour is the rank among the 32 teams: deep blue among the best, deep orange among the worst. Click a column to sort; hover a cell for the rank.</p>
        <PercentileGrid rows={rows} cols={POWER_COLS} initial="fpi" />
        <Src>Sources: nflverse play-by-play, ESPN FPI and efficiency</Src>
      </section>

      <section className="ocard">
        <h2>When they are strongest</h2>
        <p className="dek">Net EPA per play (offence minus defence) quarter by quarter: who starts fast, who fades, who finishes. The last column is the fourth quarter of close games.</p>
        <PercentileGrid rows={rows} cols={PHASE_COLS} initial="close" />
        <Src>Source: nflverse play-by-play</Src>
      </section>

      <section className="ocard">
        <h2>Who is getting better</h2>
        <p className="dek">Net EPA per play over each team's last three games. Grey lines are the rest of the league; hover one to see it.</p>
        <Spaghetti steps={weeks.map(w => `Wk ${w}`)} series={d.teams.map(t => ({ id: t.abbr, label: t.short, values: rolling(t.abbr), color: lit.has(t.abbr) ? teamInk(t) : undefined }))} />
        <Src>Source: nflverse play-by-play</Src>
      </section>

      <section className="ocard">
        <h2>Strength against schedule</h2>
        <p className="dek">ESPN's power index (FPI, expected margin against an average team) against the difficulty of the opponents faced so far. A strong team with a hard schedule is stronger than its record says.</p>
        <QuadrantScatter height={360} xLabel="FPI" yLabel="Schedule so far (harder ↑)" invertY fmt={v => v.toFixed(0)} corners={['Strong, tested', 'Tested, losing', 'Strong, easy road', 'Weak, easy road']}
          points={d.teams.filter(t => d.fpi[t.abbr]?.sosRank != null).map(t => ({ id: t.abbr, label: t.abbr, x: d.fpi[t.abbr].fpi, y: d.fpi[t.abbr].sosRank!, color: lit.has(t.abbr) ? teamInk(t) : undefined, tip: <><div className="k">{t.name}</div>FPI {sign(d.fpi[t.abbr].fpi, 1)} · schedule so far {ordinal(d.fpi[t.abbr].sosRank!)} hardest · still to play {d.fpi[t.abbr].sosRemRank ? ordinal(d.fpi[t.abbr].sosRemRank!) : '–'} hardest</> }))} />
        <Src>Source: ESPN FPI</Src>
      </section>
    </>
  );
}

/* ───────────────────────────── Teams ───────────────────────────── */

export const STRIPS: StripMetric[] = [
  { key: 'fpi', label: 'Power index (FPI)', fmt: v => sign(v, 1) },
  { key: 'offEpa', label: 'Offence', note: 'EPA per play', fmt: v => sign(v) },
  { key: 'offPassEpa', label: 'Passing game', fmt: v => sign(v) },
  { key: 'offRushEpa', label: 'Running game', fmt: v => sign(v) },
  { key: 'offPtsDrive', label: 'Points per drive', fmt: v => v.toFixed(2) },
  { key: 'off3rd', label: 'Third downs', fmt: pct },
  { key: 'offRz', label: 'Red zone TDs', fmt: pct },
  { key: 'sackRateAllowed', label: 'Protecting the QB', note: 'sacks per dropback', fmt: pct, low: true },
  { key: 'defEpa', label: 'Defence', note: 'EPA allowed per play', fmt: v => sign(v), low: true },
  { key: 'defPassEpa', label: 'Pass defence', fmt: v => sign(v), low: true },
  { key: 'defRushEpa', label: 'Run defence', fmt: v => sign(v), low: true },
  { key: 'sackRate', label: 'Pass rush', note: 'sacks per dropback', fmt: pct },
  { key: 'toMargin', label: 'Turnover margin', fmt: v => (v > 0 ? `+${v}` : String(v)) },
  { key: 'effSt', label: 'Special teams', note: 'ESPN efficiency 0–100', fmt: v => v.toFixed(0) },
  { key: 'close', label: 'Close fourth quarters', note: 'net EPA per play', fmt: v => sign(v) },
];

export function TeamsScreen({ d }: { d: NflSeasonFile }) {
  const [pick, setPick] = usePick('team');
  const abbr = d.teams.some(t => t.abbr === pick) ? pick! : ME;
  return (
    <>
      <section className="ocard">
        <h2>Pick a team</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
          {(['AFC', 'NFC'] as const).flatMap(c => DIVS.map(dv => `${c} ${dv}`)).map(div => (
            <div key={div}>
              <div className="lab">{div}</div>
              {d.teams.filter(t => t.div === div).map(t => <button key={t.abbr} className="btn" aria-pressed={t.abbr === abbr} onClick={() => setPick(t.abbr)} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 3, textTransform: 'none', letterSpacing: 0, fontSize: 12, color: 'var(--o-ink)', background: t.abbr === abbr ? 'var(--o-accent-soft)' : 'transparent', borderColor: t.abbr === abbr ? 'var(--o-accent)' : 'var(--o-line)' }}><NflLogo abbr={t.abbr} />{t.short}</button>)}
            </div>
          ))}
        </div>
      </section>
      <TeamProfile d={d} abbr={abbr} />
      <TeamSeason d={d} abbr={abbr} />
    </>
  );
}

/** One team against the league: its rank in everything, against its division and the best. */
export function TeamProfile({ d, abbr }: { d: NflSeasonFile; abbr: string }) {
  const T = useTeams(d);
  const V = useMemo(() => teamValues(d), [d]);
  const t = T[abbr], f = d.fpi[abbr];
  const upTo = playedWeeks(d);
  const table = upTo ? standingsByWeek(d.games, d.teams, upTo).at(-1)!.table : null;
  const r = table?.[abbr];
  const rivals = d.teams.filter(x => x.div === t?.div && x.abbr !== abbr);
  const topFpi = Object.entries(d.fpi).sort((a, b) => b[1].fpi - a[1].fpi).map(([k]) => k).find(k => k !== abbr);
  const cmp = [...rivals.map((x, i) => ({ id: x.abbr, color: ['var(--o-s4)', 'var(--o-s3)', 'var(--o-s2)'][i] })), ...(topFpi && !rivals.some(x => x.abbr === topFpi) ? [{ id: topFpi, color: 'var(--o-ink)' }] : [])];
  const rk = (k: string, low = false) => ranks(Object.fromEntries(Object.entries(V).map(([a, v]) => [a, v[k]])), low)[abbr];
  const strong = STRIPS.map(m => ({ m, r: rk(m.key, m.low) })).filter(x => x.r).sort((a, b) => a.r - b.r);
  if (!t) return null;
  return (
    <section className="ocard">
      <h2><NflLogo abbr={abbr} />{t.name}</h2>
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', margin: '6px 0 14px' }}>
        {r && <div className="kpi"><Score as="b">{rec(r)}</Score><span>Record</span></div>}
        {r && <div className="kpi"><Score as="b">{r.pf - r.pa > 0 ? '+' : ''}{r.pf - r.pa}</Score><span>Point diff.</span></div>}
        {f && <div className="kpi"><b>{ordinal(f.rank)}</b><span>Power index</span></div>}
        {f && <div className="kpi"><b>{f.projW.toFixed(1)}</b><span>Projected wins</span></div>}
        {f && <div className="kpi"><b>{Math.round(f.playoff)}%</b><span>Playoff chance</span></div>}
        {f && <div className="kpi"><b>{f.title < 1 ? '<1' : Math.round(f.title)}%</b><span>Win Super Bowl</span></div>}
      </div>
      {strong.length > 0 && <p className="dek">
        <b>Best at:</b> {strong.slice(0, 3).map(x => `${x.m.label} (${ordinal(x.r)})`).join(', ')}. <b>Weakest at:</b> {strong.slice(-3).reverse().map(x => `${x.m.label} (${ordinal(x.r)})`).join(', ')}.
      </p>}
      <div className="olegend">
        <span><i style={{ background: teamInk(t) }} />{t.short}</span>
        {cmp.map(c => <span key={c.id}><i style={{ background: c.color }} />{T[c.id]?.short}{c.id === topFpi && !rivals.some(x => x.abbr === c.id) ? ' (top FPI)' : ''}</span>)}
        <span><i style={{ background: 'var(--o-other)' }} />Rest of the league</span>
      </div>
      <RankStrips metrics={STRIPS} values={V} me={abbr} color={teamInk(t)} labelOf={a => T[a]?.abbr ?? a} compare={cmp} />
      <Src>Sources: nflverse play-by-play, ESPN FPI</Src>
    </section>
  );
}

/** A team's games: margins, form per game (EPA) and every box score. */
export function TeamSeason({ d, abbr }: { d: NflSeasonFile; abbr: string }) {
  const T = useTeams(d);
  const games = d.games.filter(g => g.h === abbr || g.a === abbr);
  const done = games.filter(g => g.st === 'post' && g.hs != null && g.as != null);
  const w = d.pbp?.teams[abbr]?.weeks ?? [];
  const color = teamInk(T[abbr]);
  return (
    <>
      {done.length > 0 && <section className="s-two">
        <div className="ocard">
          <h2>Game by game</h2>
          <p className="dek">Winning or losing margin of every game.</p>
          <DiffBars color={color} bars={done.map(g => { const home = g.h === abbr, m = home ? g.hs! - g.as! : g.as! - g.hs!; return { label: `${home ? '' : '@'}${home ? g.a : g.h}`, value: m, tip: `Week ${g.wk}: ${home ? 'vs' : 'at'} ${T[home ? g.a : g.h]?.name}, ${home ? g.hs : g.as}–${home ? g.as : g.hs}` }; })} />
        </div>
        {w.length > 0 && <div className="ocard">
          <h2>Offence and defence, each game</h2>
          <p className="dek">EPA per play gained by the offence and allowed by the defence in each game. Blue right of orange is a game the team controlled.</p>
          <Dumbbells aLabel="Defence allowed" bLabel="Offence gained" aColor="var(--o-s2)" bColor="var(--o-s1)" fmt={v => sign(v)}
            rows={w.filter(x => x.off != null && x.def != null).map(x => ({ id: String(x.wk), label: `Wk ${x.wk} ${x.opp}`, a: x.def!, b: x.off! }))} />
        </div>}
      </section>}
      <section className="ocard">
        <h2>Schedule and results</h2>
        <p className="dek">Open a game for the box score and the chance of winning, play by play.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10, alignItems: 'start' }}>
          {games.map(g => <div key={g.id}><div className="lab">{g.type === 3 ? g.note ?? 'Playoffs' : `Week ${g.wk}`} · {dayShort(Date.parse(g.start))}</div><SeasonGame g={g} T={T} /></div>)}
        </div>
        <Src>Source: ESPN</Src>
      </section>
    </>
  );
}

/* ───────────────────────────── Leaders ───────────────────────────── */

interface Leader { cat: string; label: string; rows: { name: string; team: string; value: string; photo: string | null }[] }

async function nflLeadersAll(): Promise<Leader[]> {
  const res = await fetch('https://site.api.espn.com/apis/site/v3/sports/football/nfl/leaders?limit=10');
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  const j = await res.json();
  return (j.leaders?.categories ?? []).filter((c: { name: string }) => !/kickoff|punt/i.test(c.name)).map((c: { name: string; displayName: string; leaders: { displayValue: string; athlete: { displayName: string; headshot?: { href: string } }; team?: { abbreviation?: string } }[] }) => ({
    cat: c.name, label: c.displayName, rows: c.leaders.slice(0, 10).map(l => ({ name: l.athlete.displayName, team: l.team?.abbreviation ?? '', value: l.displayValue, photo: l.athlete.headshot?.href ?? null })),
  }));
}

export function LeadersScreen({ d }: { d: NflSeasonFile }) {
  const T = useTeams(d);
  const [L, setL] = useState<Leader[] | null>(null);
  useEffect(() => { nflLeadersAll().then(setL).catch(() => setL([])); }, []);
  const qbs = d.pbp?.qbs.filter(q => q.cpoe != null) ?? [];
  return (
    <>
      {qbs.length > 0 && <section className="ocard">
        <h2>The quarterbacks</h2>
        <p className="dek">Value per dropback (EPA, including sacks and scrambles) against accuracy: completion percentage above what the throws' difficulty would predict (CPOE). The best sit top right. Quarterbacks with at least 60 dropbacks.</p>
        <QuadrantScatter xLabel="Completion % over expected" yLabel="EPA per dropback" fmt={v => v.toFixed(1)} corners={['Elite', 'Productive, less accurate', 'Accurate, little value', 'Struggling']}
          points={qbs.map(q => ({ id: q.name + q.team, label: q.name, x: q.cpoe!, y: q.epa, color: q.team === ME ? teamInk(T[ME]) : undefined, tip: <><div className="k">{q.name} · {q.team}</div>EPA/dropback {sign(q.epa)} · CPOE {sign(q.cpoe!, 1)} · success {pct(q.sr)} · {q.dropbacks} dropbacks</> }))} />
        <table className="otable" style={{ marginTop: 10 }}>
          <thead><tr><th>#</th><th>Quarterback</th><th className="n">Dropbacks</th><th className="n">EPA/db</th><th className="n">CPOE</th><th className="n">Success</th></tr></thead>
          <tbody>{qbs.slice(0, 20).map((q, i) => <tr key={q.name + q.team} className={q.team === ME ? 'me' : ''}><td>{i + 1}</td><td><NflLogo abbr={q.team} />{q.name}</td><td className="n">{q.dropbacks}</td><td className="n">{sign(q.epa)}</td><td className="n">{sign(q.cpoe!, 1)}</td><td className="n">{pct(q.sr)}</td></tr>)}</tbody>
        </table>
        <Src>Source: nflverse play-by-play</Src>
      </section>}
      <section className="ocard">
        <h2>Statistical leaders</h2>
        {!L ? <p className="dek">Loading…</p> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 18 }}>
            {L.map(c => (
              <div key={c.cat}>
                <div className="lab">{c.label}</div>
                {c.rows.map((r, i) => (
                  <div key={r.name} style={{ display: 'grid', gridTemplateColumns: i === 0 ? '44px 1fr auto' : '16px 1fr auto', gap: 8, alignItems: 'center', fontSize: i === 0 ? 13.5 : 12.5, padding: '3px 0', borderBottom: '1px solid var(--o-line)', fontWeight: r.team === ME ? 700 : 400 }}>
                    {i === 0 && r.photo ? <img src={r.photo} alt="" style={{ width: 44, height: 32, objectFit: 'cover', objectPosition: 'top' }} loading="lazy" /> : <span style={{ color: 'var(--o-ink3)' }}>{i + 1}</span>}
                    <span>{r.name} <small style={{ color: 'var(--o-ink3)' }}><NflLogo abbr={r.team} />{r.team}</small></span>
                    <Score as="b">{r.value}</Score>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        <Src>Source: ESPN</Src>
      </section>
    </>
  );
}

/* ───────────────────────────── Playoff race ───────────────────────────── */

export function RaceScreen({ d }: { d: NflSeasonFile }) {
  const T = useTeams(d);
  const upTo = playedWeeks(d);
  const table = upTo ? standingsByWeek(d.games, d.teams, upTo).at(-1)!.table : null;
  const hist = d.fpiHistory;
  const top = Object.entries(d.fpi).sort((a, b) => b[1].title - a[1].title).slice(0, 6).map(([k]) => k);
  return (
    <>
      <section className="ocard">
        <h2>The race to the Super Bowl</h2>
        <p className="dek">ESPN simulates the rest of the season thousands of times with its power index. Each column is the share of simulations in which the team gets that far. Seven teams per conference make the playoffs; the top seed skips the first round.</p>
        <div className="s-two" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {(['AFC', 'NFC'] as const).map(conf => (
            <div key={conf} style={{ overflowX: 'auto' }}>
              <div className="lab">{conf}</div>
              <table className="otable" style={{ fontSize: 12 }}>
                <thead><tr><th>Team</th><th className="n">W-L</th><th className="n">Proj.</th><th className="n">Playoffs</th><th className="n">Division</th><th className="n">Conf. title</th><th className="n">Win SB</th></tr></thead>
                <tbody>{d.teams.filter(t => t.conf === conf && d.fpi[t.abbr]).sort((a, b) => d.fpi[b.abbr].playoff - d.fpi[a.abbr].playoff || d.fpi[b.abbr].title - d.fpi[a.abbr].title).map((t, i) => {
                  const f = d.fpi[t.abbr];
                  return (
                    <tr key={t.abbr} className={t.abbr === ME ? 'me' : ''} style={{ borderTop: i === 7 ? '2px solid var(--o-ink3)' : undefined }}>
                      <td style={{ whiteSpace: 'nowrap' }}><NflLogo abbr={t.abbr} />{t.short}</td>
                      <td className="n">{table ? rec(table[t.abbr]) : '–'}</td>
                      <td className="n">{f.projW.toFixed(1)}</td>
                      <ProbCell p={f.playoff} /><ProbCell p={f.div} /><ProbCell p={f.sb} /><ProbCell p={f.title} color="var(--o-s4)" />
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          ))}
        </div>
        <Src>Source: ESPN Football Power Index · “Conf. title” = reaching the Super Bowl</Src>
      </section>
      <section className="ocard">
        <h2>Title chances over the season</h2>
        {hist.length >= 2 ? <>
          <p className="dek">Chance of winning the Super Bowl after each week, for the six current favourites and the Patriots.</p>
          <Spaghetti zero={false} fmt={v => `${Math.round(v)}%`} steps={hist.map(h => `Wk ${h.wk}`)} series={d.teams.map(t => ({ id: t.abbr, label: t.short, values: hist.map(h => h.t[t.abbr]?.[2] ?? null), color: top.includes(t.abbr) || t.abbr === ME ? teamInk(T[t.abbr]) : undefined }))} />
        </> : <p className="dek">The Observer started recording ESPN's odds after week {hist[0]?.wk ?? upTo}; this chart fills in from next week.</p>}
        <Src>Source: ESPN Football Power Index, one reading per week</Src>
      </section>
    </>
  );
}

/* ───────────────────────────── History ───────────────────────────── */

// Wikipedia names → today's franchise
const MOVED: Record<string, string> = { Redskins: 'WSH', 'Football Team': 'WSH', Commanders: 'WSH', Raiders: 'LV', Colts: 'IND', Rams: 'LAR', Chargers: 'LAC', Oilers: 'TEN', Titans: 'TEN' };

export function HistoryScreen({ d }: { d: NflSeasonFile }) {
  const T = useTeams(d);
  const [conf, setConf] = useState<'AFC' | 'NFC'>('AFC');
  const sb = d.history.superBowls;
  const franchise = (name: string) => { const nick = Object.keys(MOVED).find(k => name.endsWith(k)); return nick ? MOVED[nick] : d.teams.find(t => name.endsWith(t.short))?.abbr ?? name; };
  const tally = d.teams.map(t => ({ t, w: sb.filter(s => franchise(s.winner) === t.abbr).length, l: sb.filter(s => franchise(s.loser) === t.abbr).length })).sort((a, b) => b.w - a.w || b.l - a.l);
  const seasons = Object.keys(d.history.seasons).map(Number).sort((a, b) => a - b);
  const champ = Object.fromEntries(sb.map(s => [s.season, franchise(s.winner)]));
  const loser = Object.fromEntries(sb.map(s => [s.season, franchise(s.loser)]));
  const afc = sb.filter(s => s.n > 4 && s.wConf === 'A').length, nfc = sb.filter(s => s.n > 4 && s.wConf === 'N').length;
  const maxW = Math.max(1, ...tally.map(x => x.w + x.l));
  return (
    <>
      <section className="ocard">
        <h2>Super Bowls by franchise</h2>
        <p className="dek">{sb.length} Super Bowls since January 1967. Since the 1970 merger the NFC has won {nfc}, the AFC {afc}. Solid bars are titles, light bars lost Super Bowls. Teams that moved are counted with today's franchise.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', columnGap: 30 }}>
          {tally.map(({ t, w, l }) => (
            <div key={t.abbr} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 48px', gap: 8, alignItems: 'center', fontSize: 12, padding: '2px 0', fontWeight: t.abbr === ME ? 700 : 400 }}>
              <span style={{ whiteSpace: 'nowrap' }}><NflLogo abbr={t.abbr} />{t.short}</span>
              <span style={{ display: 'flex', height: 10 }}>
                <span style={{ width: `${(w / maxW) * 100}%`, background: teamInk(t), borderRadius: '2px 0 0 2px' }} />
                <span style={{ width: `${(l / maxW) * 100}%`, background: teamInk(t), opacity: 0.3 }} />
              </span>
              <span style={{ color: 'var(--o-ink2)', textAlign: 'right' }}>{w}–{l}</span>
            </div>
          ))}
        </div>
        <Src>Source: Wikipedia, List of Super Bowl champions</Src>
      </section>

      {seasons.length > 0 && <section className="ocard">
        <h2>Every team since 2002</h2>
        <p className="dek">Winning percentage of every season since the league went to 32 teams and eight divisions. Deep blue is a great season, deep orange a terrible one; ★ won the Super Bowl, ◆ lost it, a small number is the playoff seed. Dynasties show up as long blue rows.</p>
        <Chips label="Conference" items={[{ k: 'AFC', label: 'AFC' }, { k: 'NFC', label: 'NFC' }]} value={conf} set={setConf} />
        <div style={{ overflowX: 'auto' }}>
          <table className="otable" style={{ fontSize: 10.5, minWidth: 820 }}>
            <thead><tr><th>Team</th>{seasons.map(y => <th key={y} className="n" style={{ padding: '4px 1px' }}>{String(y).slice(2)}</th>)}</tr></thead>
            <tbody>{DIVS.flatMap(dv => d.teams.filter(t => t.div === `${conf} ${dv}`)).map((t, i) => (
              <tr key={t.abbr} className={t.abbr === ME ? 'me' : ''} style={{ borderTop: i % 4 === 0 ? '2px solid var(--o-line)' : undefined }}>
                <td style={{ whiteSpace: 'nowrap' }}><NflLogo abbr={t.abbr} />{t.short}</td>
                {seasons.map(y => {
                  const s = d.history.seasons[y]?.[t.abbr];
                  if (!s) return <td key={y} />;
                  const mark = champ[y] === t.abbr ? '★' : loser[y] === t.abbr ? '◆' : s.seed && s.seed <= 7 ? String(s.seed) : '';
                  return <td key={y} className="n" title={`${y}: ${s.w}-${s.l}${s.t ? `-${s.t}` : ''}${s.seed && s.seed <= 7 ? `, seed ${s.seed}` : ''}${mark === '★' ? ', Super Bowl champions' : mark === '◆' ? ', lost the Super Bowl' : ''}`}
                    style={{ background: `color-mix(in srgb, ${s.pct >= 0.5 ? 'var(--o-s1)' : 'var(--o-s2)'} ${Math.round(Math.abs(s.pct - 0.5) * 170)}%, var(--o-card))`, color: Math.abs(s.pct - 0.5) > 0.3 ? '#fff' : 'var(--o-ink)', padding: '5px 1px', textAlign: 'center', fontWeight: 700 }}>{mark}</td>;
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
        <Src>Source: ESPN standings</Src>
      </section>}

      <section className="ocard">
        <h2>Every Super Bowl</h2>
        <table className="otable" style={{ fontSize: 12 }}>
          <thead><tr><th>Game</th><th>Date</th><th>Champion</th><th className="n">Score</th><th>Runner-up</th><th>Venue</th></tr></thead>
          <tbody>{[...sb].reverse().map(s => {
            const w = franchise(s.winner), l = franchise(s.loser);
            return <tr key={s.n} className={w === ME || l === ME ? 'me' : ''}><td>{s.roman}</td><td style={{ whiteSpace: 'nowrap' }}>{fmt(Date.parse(s.date), { day: 'numeric', month: 'short', year: 'numeric' })}</td><td>{T[w] && <NflLogo abbr={w} />}{s.winner}</td><td className="n">{s.ws}–{s.ls}</td><td>{T[l] && <NflLogo abbr={l} />}{s.loser}</td><td style={{ color: 'var(--o-ink3)' }}>{s.venue}</td></tr>;
          })}</tbody>
        </table>
        <Src>Source: Wikipedia, List of Super Bowl champions</Src>
      </section>
    </>
  );
}

/* ───────────────────────────── How it works ───────────────────────────── */

export function HowScreen({ d }: { d: NflSeasonFile }) {
  const reg = d.games.filter(g => g.type === 2), post = d.games.filter(g => g.type === 3);
  const first = reg[0] ? Date.parse(reg[0].start) : null, last = reg.length ? Date.parse(reg[reg.length - 1].start) : null;
  const round = (name: RegExp) => post.find(g => name.test(g.note ?? ''));
  const wc = post.find(g => g.wk === 1), dv = post.find(g => g.wk === 2), cc = round(/Championship/), sbg = post.find(g => g.wk === 5);
  const steps: [string, number | null, string][] = [
    ['Regular season', first, `18 weeks, 17 games each${last ? `, to ${dayLong(last)}` : ''}`],
    ['Wild Card round', wc ? Date.parse(wc.start) : null, 'Seeds 2–7 play; the top seed rests'],
    ['Divisional round', dv ? Date.parse(dv.start) : null, 'Eight teams left'],
    ['Conference championships', cc ? Date.parse(cc.start) : null, 'AFC and NFC titles'],
    ['Super Bowl', sbg ? Date.parse(sbg.start) : null, 'One game, neutral site'],
  ];
  const P = ({ children }: { children: ReactNode }) => <p style={{ margin: '0 0 10px', lineHeight: 1.55, fontSize: 14 }}>{children}</p>;
  return (
    <>
      <section className="ocard">
        <h2>The {d.season} season at a glance</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          {steps.map(([name, t, what], i) => (
            <div key={name} style={{ borderTop: `3px solid ${i === 0 ? 'var(--o-s1)' : i === 4 ? 'var(--o-s4)' : 'var(--o-ink3)'}`, paddingTop: 8 }}>
              <div style={{ fontWeight: 700 }}>{name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--o-ink2)' }}>{t ? dayLong(t) : 'Date to come'}</div>
              <div style={{ fontSize: 12, color: 'var(--o-ink3)', marginTop: 4 }}>{what}</div>
            </div>
          ))}
        </div>
        <Src>Dates: ESPN schedule</Src>
      </section>
      <section className="s-two">
        <div className="ocard">
          <h2>The league</h2>
          <P><b>32 teams, two conferences</b> (AFC and NFC), each split into four divisions of four: East, North, South and West.</P>
          <P><b>The schedule is a formula.</b> Each team plays its three division rivals twice (6 games), all four teams of one division in its own conference (4) and of one in the other conference (4), the two teams that finished in the same place in the remaining divisions of its conference (2), and one more team from the other conference (1): 17 games, plus one week off, the bye.</P>
          <P><b>Standings</b> go by winning percentage; a tie counts as half a win. When teams are level, tiebreakers decide, in this order: head-to-head, record within the division (for division rivals) or the conference, record against common opponents, strength of victory, strength of schedule, then points.</P>
        </div>
        <div className="ocard">
          <h2>The playoffs</h2>
          <P><b>Seven teams per conference.</b> The four division winners are seeded 1 to 4 by record, whatever it is; the three best other teams are the wild cards, seeds 5 to 7.</P>
          <P><b>Only the top seed rests</b> in the first round, so finishing first matters: the bye and home field until the Super Bowl. In each round the higher seed hosts. After every round the top seed left plays the lowest one left.</P>
          <P><b>Single elimination.</b> One game per round, no series; the Super Bowl is played at a site chosen years ahead.</P>
        </div>
      </section>
      <section className="s-two">
        <div className="ocard">
          <h2>Rules worth knowing</h2>
          <P><b>Overtime:</b> 10 minutes in the regular season, 15 in the playoffs. Since 2025 both teams get the ball at least once, even if the first scores a touchdown; after that, next score wins. Regular-season games can still end tied; playoff games cannot.</P>
          <P><b>Kickoffs:</b> since 2024 the “dynamic kickoff” lines both teams up close together, so more kicks are returned. A touchback brings the ball to the 35.</P>
          <P><b>Two-point conversion:</b> after a touchdown, a kick from the 15 is worth one point, a play from the 2 is worth two.</P>
        </div>
        <div className="ocard">
          <h2>Reading the numbers in this section</h2>
          <P><b>EPA (expected points added):</b> every down-distance-field position has an expected value in points. A play's EPA is how much it moved that value. Summed or averaged, it is the best single measure of how good an offence or a defence is, because it accounts for situation, not just yards.</P>
          <P><b>Success rate:</b> share of plays with positive EPA. It rewards consistency; EPA also rewards big plays.</P>
          <P><b>CPOE:</b> a quarterback's completion percentage minus what an average passer would complete on the same throws.</P>
          <P><b>FPI:</b> ESPN's Football Power Index, the margin a team would be expected to win by against an average team on a neutral field. It drives ESPN's playoff and title odds.</P>
        </div>
      </section>
    </>
  );
}
