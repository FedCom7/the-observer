// College football screens beyond the home: every game week by week, team strength,
// the polls, the conferences, the Heisman race, history and the rules; and the Texas
// Season and Power screens. Data: public/data/cfb-season.json (CollegeFootballData, ESPN).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BumpChart, DiffBars } from '../components/charts';
import { PercentileGrid, ProbCell, QuadrantScatter, RankStrips, ordinal, ranks, type GridCol, type StripMetric } from '../components/power';
import { Chips, usePick } from '../components/tabs';
import { getJSON } from '../core/fetcher';
import { dayShort, fmt, hhmm } from '../core/time';
import { FootballBox } from './NflScreens';

export const CFB_TABS = [['now', 'Now'], ['season', 'Season'], ['power', 'Power'], ['rankings', 'Rankings'], ['conferences', 'Conferences'], ['heisman', 'Heisman'], ['history', 'History'], ['how', 'How it works']] as const;
export type CfbTab = typeof CFB_TABS[number][0];

export interface CfbTeam { id: string; school: string; mascot: string; abbr: string; conference: string; color: string | null; alt: string | null; logo: string | null }
export interface CfbGame { id: string; week: number; type: string; start: string; done: boolean; h: string; a: string; hc: string | null; ac: string | null; hs: number | null; as: number | null; conf: boolean; neutral: boolean; venue: string | null; notes: string | null; hwp: number | null }
export type CfbPower = Record<string, number | null>;
export interface CfbFile {
  updated: string; season: number; cfbdRemaining: number | null; teams: CfbTeam[]; games: CfbGame[]; power: Record<string, CfbPower>;
  polls: { week: number; type: string; poll: 'AP' | 'Coaches' | 'CFP'; ranks: [number, string, number, number][] }[];
  qbs: { name: string; team: string; conf: string; avg: number; pass: number; rush: number; total: number }[];
  fpi: Record<string, { fpi: number; rank: number; projW: number; projL: number; conf: number; playoff: number; title: number; sos: number | null }>;
  markets: { heisman: { title: string; rows: { name: string; p: number }[] } | null; title: { title: string; rows: { name: string; p: number }[] } | null };
  history: { champions: { year: number; champion: string; conference: string | null; second: string | null; third: string | null }[] };
}
export function useCfbSeason(enabled = true) {
  const [d, setD] = useState<CfbFile | null>(null);
  useEffect(() => { if (!enabled) return; let on = true; getJSON<CfbFile>(`${import.meta.env.BASE_URL}data/cfb-season.json`, 15 * 60e3).then(x => on && setD(x)).catch(() => {}); return () => { on = false; }; }, [enabled]);
  return d;
}

const ME = 'Texas';
const BURNT = '#bf5700';
const P4 = ['SEC', 'Big Ten', 'Big 12', 'ACC'];
const Src = ({ children }: { children: ReactNode }) => <div className="osrc">{children}</div>;
const sg = (v: number, d = 2) => `${v > 0 ? '+' : ''}${v.toFixed(d)}`;
const pc = (v: number) => `${Math.round(v * 100)}%`;

const useT = (d: CfbFile) => useMemo(() => Object.fromEntries(d.teams.map(t => [t.school, t])), [d]);
export const CfbLogo = ({ t }: { t?: CfbTeam }) => t?.logo ? <img src={t.logo} alt="" loading="lazy" style={{ height: '1.15em', width: '1.15em', objectFit: 'contain', verticalAlign: '-0.2em', marginRight: '0.4em' }} /> : null;
const ink = (t?: CfbTeam) => {
  const lum = (h: string | null) => { if (!h) return -1; const n = parseInt(h.replace('#', ''), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
  for (const c of [t?.color ?? null, t?.alt ?? null]) { const l = lum(c); if (l > 0.12 && l < 0.75) return c!; }
  return 'var(--o-accent)';
};
/** AP rank of every team in a given week (latest poll up to that week). */
function apAt(d: CfbFile, week?: number) {
  const ap = d.polls.filter(p => p.poll === 'AP' && p.type === 'regular' && (week == null || p.week <= week)).sort((a, b) => a.week - b.week).at(-1);
  return Object.fromEntries((ap?.ranks ?? []).map(r => [r[1], r[0]]));
}
const record = (d: CfbFile, school: string, confOnly = false) => {
  let w = 0, l = 0, pf = 0, pa = 0;
  for (const g of d.games) { if (!g.done || g.hs == null || g.as == null) continue; if (confOnly && !g.conf) continue; const home = g.h === school; if (!home && g.a !== school) continue; const s = home ? g.hs : g.as, o = home ? g.as : g.hs; pf += s; pa += o; if (s > o) w++; else l++; }
  return { w, l, pf, pa };
};

/* ───────────────────────────── Season ───────────────────────────── */

export function SeasonScreen({ d }: { d: CfbFile }) {
  const T = useT(d);
  const weeks = [...new Set(d.games.filter(g => g.type === 'regular').map(g => g.week))].sort((a, b) => a - b);
  const current = d.games.find(g => !g.done && g.type === 'regular')?.week ?? weeks.at(-1) ?? 1;
  const [pick, setPick] = usePick('week');
  const wk = pick === 'post' ? 'post' : Number(pick ?? current);
  const [filter, setFilter] = useState<'top' | 'p4' | 'all'>('top');
  const rk = apAt(d, wk === 'post' ? undefined : (wk as number));
  const games = d.games.filter(g => (wk === 'post' ? g.type === 'postseason' : g.type === 'regular' && g.week === wk))
    .filter(g => filter === 'all' || (filter === 'top' ? rk[g.h] || rk[g.a] || g.h === ME || g.a === ME : P4.includes(g.hc ?? '') || P4.includes(g.ac ?? '')))
    .sort((a, b) => a.start.localeCompare(b.start));
  const days = new Map<string, CfbGame[]>();
  for (const g of games) { const k = fmt(Date.parse(g.start), { weekday: 'long', day: 'numeric', month: 'long' }); days.set(k, [...(days.get(k) ?? []), g]); }
  return (
    <>
      <section className="ocard">
        <h2>Every game of {d.season}</h2>
        <p className="dek">Pick a week. Open a finished game for the box score, the drives and how the chance of winning moved. Kickoffs in Rome time; AP rank before the game.</p>
        <Chips label="Week" items={[...weeks.map(w => ({ k: String(w), label: String(w) })), ...(d.games.some(g => g.type === 'postseason') ? [{ k: 'post', label: 'Bowls & playoff' }] : [])]} value={String(wk)} set={setPick} />
        <Chips label="Filter" items={[{ k: 'top', label: 'Top 25 and Texas' }, { k: 'p4', label: 'Power four' }, { k: 'all', label: 'All FBS' }]} value={filter} set={setFilter} />
        {[...days.entries()].map(([day, gs]) => (
          <div key={day} style={{ marginBottom: 12 }}>
            <div className="lab">{day}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8, alignItems: 'start' }}>{gs.map(g => <CfbGameCard key={g.id} g={g} T={T} rk={rk} />)}</div>
          </div>
        ))}
        {!games.length && <p className="dek">No games for this filter.</p>}
        <Src>Sources: CollegeFootballData, ESPN (box scores)</Src>
      </section>
    </>
  );
}

export function CfbGameCard({ g, T, rk }: { g: CfbGame; T: Record<string, CfbTeam>; rk: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  const row = (school: string, score: number | null, won: boolean) => (
    <div style={{ display: 'flex', gap: 6, fontSize: 13, fontWeight: won ? 700 : 400, color: g.done && !won ? 'var(--o-ink3)' : 'var(--o-ink)' }}>
      <span style={{ flex: 1 }}>{rk[school] ? <small style={{ color: 'var(--o-ink3)', marginRight: 3 }}>{rk[school]}</small> : null}<CfbLogo t={T[school]} />{school}</span><b style={{ fontVariantNumeric: 'tabular-nums' }}>{g.done ? score : ''}</b>
    </div>
  );
  const hw = g.done && (g.hs ?? 0) > (g.as ?? 0);
  const me = g.h === ME || g.a === ME;
  return (
    <div style={{ border: `1px solid ${me ? BURNT : 'var(--o-line)'}`, borderRadius: 10, padding: '8px 10px', gridColumn: open ? '1 / -1' : undefined }}>
      <button onClick={() => setOpen(!open)} disabled={!g.done} style={{ all: 'unset', display: 'block', width: '100%', cursor: g.done ? 'pointer' : 'default' }} aria-expanded={open}>
        {g.notes && <div className="lab" style={{ marginBottom: 2 }}>{g.notes}</div>}
        {row(g.a, g.as, g.done && !hw)}{row(g.h, g.hs, hw)}
        <div style={{ fontSize: 11, color: 'var(--o-ink3)', marginTop: 2 }}>{g.done ? `Final${g.hwp != null ? ` · post-game win expectancy ${pc(hw ? g.hwp : 1 - g.hwp)}` : ''}` : `${hhmm(Date.parse(g.start))} Rome`}{g.neutral ? ' · neutral site' : ''}{g.done && <span style={{ float: 'right' }}>{open ? 'Close ▲' : 'Box score ▼'}</span>}</div>
      </button>
      {open && <FootballBox id={g.id} live={false} league="college-football" away={{ abbr: T[g.a]?.abbr ?? g.a, name: g.a, color: ink(T[g.a]) }} home={{ abbr: T[g.h]?.abbr ?? g.h, name: g.h, color: ink(T[g.h]) }} Logo={ab => <CfbLogo t={Object.values(T).find(t => t.abbr === ab)} />} />}
    </div>
  );
}

/* ───────────────────────────── Power ───────────────────────────── */

const COLS: GridCol[] = [
  { key: 'sp', label: 'SP+', group: 'Overall', fmt: v => sg(v, 1), title: 'Bill Connelly’s SP+: points better than an average team, adjusted for opponents' },
  { key: 'fpi', label: 'FPI', group: 'Overall', fmt: v => sg(v, 1), title: 'ESPN Football Power Index' },
  { key: 'spOff', label: 'SP+ off', group: 'Offence', fmt: v => v.toFixed(1) },
  { key: 'epaOff', label: 'EPA/play', group: 'Offence', fmt: v => sg(v) },
  { key: 'passOff', label: 'Pass', group: 'Offence', fmt: v => sg(v) },
  { key: 'rushOff', label: 'Run', group: 'Offence', fmt: v => sg(v) },
  { key: 'srOff', label: 'Success', group: 'Offence', fmt: pc },
  { key: 'expOff', label: 'Explosive', group: 'Offence', fmt: v => v.toFixed(2), title: 'EPA per successful play' },
  { key: 'ppoOff', label: 'Finishing', group: 'Offence', fmt: v => v.toFixed(2), title: 'Points per trip inside the opponent’s 40' },
  { key: 'lineOff', label: 'Line yds', group: 'Offence', fmt: v => v.toFixed(2), title: 'Run yards credited to the offensive line' },
  { key: 'spDef', label: 'SP+ def', group: 'Defence', fmt: v => v.toFixed(1), low: true },
  { key: 'epaDef', label: 'EPA/play', group: 'Defence', fmt: v => sg(v), low: true },
  { key: 'passDef', label: 'Pass', group: 'Defence', fmt: v => sg(v), low: true },
  { key: 'rushDef', label: 'Run', group: 'Defence', fmt: v => sg(v), low: true },
  { key: 'srDef', label: 'Success', group: 'Defence', fmt: pc, low: true },
  { key: 'ppoDef', label: 'Finishing', group: 'Defence', fmt: v => v.toFixed(2), low: true },
  { key: 'havocDef', label: 'Havoc', group: 'Defence', fmt: pc, title: 'Tackles for loss, picks, forced fumbles and pass break-ups per play' },
  { key: 'stuffDef', label: 'Stuffs', group: 'Defence', fmt: pc, title: 'Runs stopped at or behind the line' },
  { key: 'spSt', label: 'SP+ ST', group: 'Special teams', fmt: v => v.toFixed(1) },
];

function values(d: CfbFile) {
  const T = Object.fromEntries(d.teams.map(t => [t.school, t]));
  return Object.fromEntries(Object.entries(d.power).filter(([s]) => T[s]).map(([s, p]) => [s, { ...p, fpi: d.fpi[T[s].id]?.fpi ?? null }])) as Record<string, Record<string, number | null>>;
}

export function PowerScreen({ d }: { d: CfbFile }) {
  const T = useT(d);
  const V = useMemo(() => values(d), [d]);
  const [conf, setConf] = useState('Top 40');
  const rk = apAt(d);
  const bySp = Object.entries(V).filter(([, v]) => v.sp != null).sort((a, b) => b[1].sp! - a[1].sp!).map(([k]) => k);
  const best = (k: string, low = false) => Object.entries(ranks(Object.fromEntries(Object.entries(V).map(([s, v]) => [s, v[k]])), low)).find(([, r]) => r === 1)?.[0];
  const confs = [...new Set(d.teams.map(t => t.conference))].sort();
  const rowsOf = (list: string[]) => list.map(s => ({ id: s, label: <><CfbLogo t={T[s]} />{rk[s] ? <small style={{ color: 'var(--o-ink3)' }}>{rk[s]} </small> : null}{s}</>, values: V[s], me: s === ME }));
  const list = conf === 'Top 40' ? bySp.slice(0, 40) : d.teams.filter(t => t.conference === conf).map(t => t.school).filter(s => V[s]);
  const confAvg = confs.map(c => { const xs = d.teams.filter(t => t.conference === c).map(t => V[t.school]?.sp).filter((x): x is number => x != null); return { c, avg: xs.reduce((a, b) => a + b, 0) / (xs.length || 1), n: xs.length, xs }; }).filter(x => x.n).sort((a, b) => b.avg - a.avg);
  const lo = Math.min(...confAvg.flatMap(c => c.xs)), hi = Math.max(...confAvg.flatMap(c => c.xs));
  const lit = new Set([ME, ...bySp.slice(0, 6)]);
  return (
    <>
      <section className="ocard">
        <h2>Who is strongest, and at what</h2>
        <p className="dek">SP+ (opponent-adjusted efficiency) has <b>{bySp[0]}</b> on top, then {bySp.slice(1, 4).join(', ')}. Best offence: <b>{best('spOff')}</b>; best defence: <b>{best('spDef', true)}</b>; best at finishing drives: <b>{best('ppoOff')}</b>; most disruptive defence (havoc): <b>{best('havocDef')}</b>. Texas is {V[ME]?.sp != null ? <b>{ordinal(bySp.indexOf(ME) + 1)}</b> : '–'} of {bySp.length}.</p>
        <p className="dek" style={{ fontSize: 12.5 }}>EPA per play here is CollegeFootballData's predicted points added, garbage time excluded. SP+ is the standard power rating of the sport, adjusted for the opponents faced.</p>
      </section>
      <section className="ocard">
        <h2>Offence against defence</h2>
        <p className="dek">Every FBS team. Right gains more per play, up allows less. Labels on the AP Top 25 and Texas; in colour the top six by SP+ and Texas.</p>
        <QuadrantScatter height={480} invertY xLabel="Offence: EPA per play" yLabel="Defence: EPA allowed (less ↑)" corners={['Contenders', 'Defence first', 'Offence first', 'Rebuilding']}
          points={Object.entries(V).filter(([, v]) => v.epaOff != null && v.epaDef != null).map(([s, v]) => ({ id: s, label: rk[s] || s === ME ? (T[s]?.abbr ?? s) : '', x: v.epaOff!, y: v.epaDef!, color: lit.has(s) ? (s === ME ? BURNT : ink(T[s])) : undefined, tip: <><div className="k">{s} · {T[s]?.conference}</div>EPA off {sg(v.epaOff!)} · def {sg(v.epaDef!)} · SP+ {v.sp != null ? sg(v.sp, 1) : '–'}</> }))} />
        <Src>Source: CollegeFootballData</Src>
      </section>
      <section className="ocard">
        <h2>Every strength</h2>
        <p className="dek">Colour = rank among all FBS teams (blue among the best). Pick the top 40 by SP+ or a conference.</p>
        <Chips label="Group" items={['Top 40', ...P4, ...confs.filter(c => !P4.includes(c))].map(c => ({ k: c, label: c }))} value={conf} set={setConf} />
        <PercentileGrid rows={rowsOf(list)} cols={COLS} initial="sp" />
        <Src>Sources: CollegeFootballData (SP+, PPA, advanced stats), ESPN FPI</Src>
      </section>
      <section className="s-two">
        <div className="ocard">
          <h2>The strongest conferences</h2>
          <p className="dek">Every team's SP+ (dots) and the conference average (line).</p>
          {confAvg.map(c => (
            <div key={c.c} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 46px', gap: 8, alignItems: 'center', fontSize: 12, margin: '6px 0' }}>
              <span style={{ fontWeight: P4.includes(c.c) ? 700 : 400 }}>{c.c}</span>
              <span style={{ position: 'relative', height: 14, borderTop: '1px solid var(--o-grid)', marginTop: 7 }}>
                {c.xs.map((x, i) => <span key={i} style={{ position: 'absolute', left: `${((x - lo) / (hi - lo || 1)) * 100}%`, top: -5, width: 7, height: 7, borderRadius: '50%', background: 'var(--o-other)', opacity: 0.7 }} />)}
                <span style={{ position: 'absolute', left: `${((c.avg - lo) / (hi - lo || 1)) * 100}%`, top: -9, width: 2, height: 16, background: 'var(--o-ink)' }} />
              </span>
              <b>{sg(c.avg, 1)}</b>
            </div>
          ))}
        </div>
        <div className="ocard">
          <h2>Résumé against strength</h2>
          <p className="dek">AP rank against SP+ rank for the ranked teams. Above the diagonal: ranked higher than their play says.</p>
          <QuadrantScatter height={360} invertY xLabel="SP+ rank (better →)" yLabel="AP rank (better ↑)" fmt={v => String(Math.round(Math.abs(v)))} corners={['Earned it', 'Overrated by voters', 'Underrated', '']}
            points={Object.entries(rk).filter(([s]) => bySp.includes(s)).map(([s, r]) => ({ id: s, label: T[s]?.abbr ?? s, x: -(bySp.indexOf(s) + 1), y: r, color: s === ME ? BURNT : undefined, tip: <><div className="k">{s}</div>AP {r} · SP+ {bySp.indexOf(s) + 1}</> }))} />
        </div>
      </section>
      {Object.keys(d.fpi).length > 0 && <section className="ocard">
        <h2>Playoff chances</h2>
        <p className="dek">ESPN's Football Power Index simulates the rest of the season: the teams most likely to make the 12-team playoff.</p>
        <table className="otable" style={{ fontSize: 12.5 }}>
          <thead><tr><th>Team</th><th className="n">Record</th><th className="n">FPI</th><th className="n">Proj. W-L</th><th className="n">Win conference</th><th className="n">Make playoff</th><th className="n">Win title</th></tr></thead>
          <tbody>{d.teams.filter(t => d.fpi[t.id]).sort((a, b) => (d.fpi[b.id].playoff ?? 0) - (d.fpi[a.id].playoff ?? 0)).slice(0, 20).map(t => { const f = d.fpi[t.id], r = record(d, t.school); return <tr key={t.id} className={t.school === ME ? 'me' : ''}><td><CfbLogo t={t} />{t.school}</td><td className="n">{r.w}-{r.l}</td><td className="n">{sg(f.fpi, 1)}</td><td className="n">{f.projW}-{f.projL}</td><ProbCell p={f.conf} /><ProbCell p={f.playoff} /><ProbCell p={f.title} color="var(--o-s4)" /></tr>; })}</tbody>
        </table>
        <Src>Source: ESPN FPI</Src>
      </section>}
    </>
  );
}

/* ───────────────────────────── Rankings ───────────────────────────── */

export function RankingsScreen({ d }: { d: CfbFile }) {
  const T = useT(d);
  const [poll, setPoll] = useState<'AP' | 'Coaches' | 'CFP'>('AP');
  const ps = d.polls.filter(p => p.poll === poll).sort((a, b) => (a.type === b.type ? a.week - b.week : a.type === 'regular' ? -1 : 1));
  const last = ps.at(-1);
  const teams = [...new Set(ps.flatMap(p => p.ranks.map(r => r[1])))];
  const top = new Set([ME, ...(last?.ranks.slice(0, 6).map(r => r[1]) ?? [])]);
  const prev = ps.at(-2);
  const prevRank = Object.fromEntries((prev?.ranks ?? []).map(r => [r[1], r[0]]));
  const all = ['AP', 'Coaches', 'CFP'].map(k => d.polls.filter(p => p.poll === k).sort((a, b) => a.week - b.week).at(-1));
  return (
    <>
      <section className="ocard">
        <h2>The polls, week by week</h2>
        <Chips label="Poll" items={(['AP', 'Coaches', 'CFP'] as const).filter(k => d.polls.some(p => p.poll === k)).map(k => ({ k, label: k === 'CFP' ? 'Playoff committee' : `${k} poll` }))} value={poll} set={setPoll} />
        <p className="dek">Rank in every {poll === 'CFP' ? 'committee ranking' : 'poll'} of the season; the current top six and Texas in colour.</p>
        {ps.length > 1 && <BumpChart weeks={ps.map(p => p.week)} maxRank={25} series={teams.map(s => ({ id: s, name: s, ranks: ps.map(p => p.ranks.find(r => r[1] === s)?.[0] ?? null), color: top.has(s) ? (s === ME ? BURNT : ink(T[s])) : undefined }))} />}
        <Src>Source: CollegeFootballData</Src>
      </section>
      <section className="s-two">
        <div className="ocard">
          <h2>{poll === 'CFP' ? 'Committee ranking' : `${poll} Top 25`}, week {last?.week}</h2>
          <table className="otable" style={{ fontSize: 12.5 }}>
            <thead><tr><th className="n">#</th><th>Team</th><th className="n">Record</th><th className="n">Move</th><th className="n">1st</th><th className="n">Points</th></tr></thead>
            <tbody>{last?.ranks.map(([r, s, fp, pts]) => { const was = prevRank[s], rec = record(d, s); return <tr key={s} className={s === ME ? 'me' : ''}><td className="n">{r}</td><td><CfbLogo t={T[s]} />{s}</td><td className="n">{rec.w}-{rec.l}</td><td className="n" style={{ color: !was ? 'var(--o-s1)' : was > r ? 'var(--o-s3)' : was < r ? 'var(--o-s2)' : 'var(--o-ink3)' }}>{!was ? 'new' : was > r ? `▲${was - r}` : was < r ? `▼${r - was}` : '–'}</td><td className="n">{fp || ''}</td><td className="n">{pts || ''}</td></tr>; })}</tbody>
          </table>
        </div>
        <div className="ocard">
          <h2>The polls side by side</h2>
          <p className="dek">Where the AP poll (journalists), the Coaches poll and the playoff committee disagree.</p>
          <table className="otable" style={{ fontSize: 12.5 }}>
            <thead><tr><th>Team</th>{all.map((p, i) => p && <th key={i} className="n">{['AP', 'Coaches', 'CFP'][i]}</th>)}</tr></thead>
            <tbody>{(all[0]?.ranks ?? []).map(([, s]) => <tr key={s} className={s === ME ? 'me' : ''}><td><CfbLogo t={T[s]} />{s}</td>{all.map((p, i) => p && <td key={i} className="n">{p.ranks.find(r => r[1] === s)?.[0] ?? '–'}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/* ───────────────────────────── Conferences ───────────────────────────── */

export function ConferencesScreen({ d }: { d: CfbFile }) {
  const confs = [...new Set(d.teams.map(t => t.conference))].sort((a, b) => (P4.indexOf(a) + 1 || 99) - (P4.indexOf(b) + 1 || 99) || a.localeCompare(b));
  const [conf, setConf] = useState('SEC');
  const rk = apAt(d);
  const rows = d.teams.filter(t => t.conference === conf).map(t => ({ t, c: record(d, t.school, true), o: record(d, t.school) }))
    .sort((a, b) => (b.c.w - b.c.l) - (a.c.w - a.c.l) || b.c.w - a.c.w || (b.o.w - b.o.l) - (a.o.w - a.o.l));
  const titleGame = d.games.find(g => g.notes && new RegExp(`${conf.replace('+', '\\+')}.*Championship`, 'i').test(g.notes));
  return (
    <section className="ocard">
      <h2>Conference standings</h2>
      <Chips label="Conference" items={confs.map(c => ({ k: c, label: c }))} value={conf} set={setConf} />
      <p className="dek">Conference record first (it decides who plays the championship game), then overall.{titleGame ? ` Championship game: ${dayShort(Date.parse(titleGame.start))}${titleGame.venue ? `, ${titleGame.venue}` : ''}.` : ''}</p>
      <table className="otable" style={{ fontSize: 12.5 }}>
        <thead><tr><th>Team</th><th className="n">Conf.</th><th className="n">Overall</th><th className="n">Pts for</th><th className="n">Pts against</th><th className="n">SP+</th><th className="n">AP</th></tr></thead>
        <tbody>{rows.map(({ t, c, o }) => <tr key={t.id} className={t.school === ME ? 'me' : ''}><td><CfbLogo t={t} />{t.school}</td><td className="n"><b>{c.w}-{c.l}</b></td><td className="n">{o.w}-{o.l}</td><td className="n">{o.pf}</td><td className="n">{o.pa}</td><td className="n">{d.power[t.school]?.sp != null ? sg(d.power[t.school].sp!, 1) : '–'}</td><td className="n">{rk[t.school] ?? ''}</td></tr>)}</tbody>
      </table>
      <Src>Computed from CollegeFootballData results; tiebreakers not applied</Src>
    </section>
  );
}

/* ───────────────────────────── Heisman ───────────────────────────── */

export function HeismanScreen({ d }: { d: CfbFile }) {
  const T = useT(d);
  const m = d.markets.heisman;
  return (
    <>
      <section className="ocard">
        <h2>The Heisman race</h2>
        <p className="dek">The Heisman Trophy goes to the season's best player, voted by journalists and former winners; the ceremony is in New York in December. It is almost always a quarterback (or a running back) from a top team.</p>
        {m ? m.rows.slice(0, 10).map(r => <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '200px 1fr 44px', gap: 8, alignItems: 'center', fontSize: 13, margin: '4px 0' }}><span>{r.name}</span><span style={{ height: 10, width: `${(r.p / m.rows[0].p) * 100}%`, background: 'var(--o-s1)', borderRadius: 2 }} /><b>{Math.round(r.p)}%</b></div>)
          : <p className="dek" style={{ fontSize: 12.5 }}>No betting market is open on Kalshi right now: below, the numbers that usually decide the vote.</p>}
        {m && <Src>Source: Kalshi</Src>}
      </section>
      {d.qbs.length > 0 && <section className="ocard">
        <h2>The quarterbacks</h2>
        <p className="dek">Value per play (predicted points added) against total value this season. The Heisman favourites are usually top right: efficient and on the field a lot. Quarterbacks with at least 80 plays.</p>
        <QuadrantScatter xLabel="EPA per play" yLabel="Total EPA" fmt={v => v.toFixed(1)} fmtX={v => v.toFixed(2)} corners={['Heisman territory', 'Volume', 'Efficient, fewer plays', 'Struggling']}
          points={d.qbs.map(q => ({ id: q.name + q.team, label: q.total >= (d.qbs[8]?.total ?? 0) || q.team === ME ? q.name.split(' ').slice(-1)[0] : '', x: q.avg, y: q.total, color: q.team === ME ? BURNT : undefined, tip: <><div className="k">{q.name} · {q.team}</div>{sg(q.avg)} per play · total {q.total.toFixed(1)} · passing {sg(q.pass)} · rushing {sg(q.rush)}</> }))} />
        <table className="otable" style={{ fontSize: 12.5, marginTop: 10 }}>
          <thead><tr><th>#</th><th>Quarterback</th><th>Team</th><th className="n">EPA/play</th><th className="n">Passing</th><th className="n">Rushing</th><th className="n">Total</th></tr></thead>
          <tbody>{d.qbs.slice(0, 20).map((q, i) => <tr key={q.name + q.team} className={q.team === ME ? 'me' : ''}><td>{i + 1}</td><td>{q.name}</td><td><CfbLogo t={T[q.team]} />{q.team}</td><td className="n">{sg(q.avg)}</td><td className="n">{sg(q.pass)}</td><td className="n">{sg(q.rush)}</td><td className="n"><b>{q.total.toFixed(1)}</b></td></tr>)}</tbody>
        </table>
        <Src>Source: CollegeFootballData (PPA, garbage time excluded)</Src>
      </section>}
    </>
  );
}

/* ───────────────────────────── History ───────────────────────────── */

export function HistoryScreen({ d }: { d: CfbFile }) {
  const T = useT(d);
  const ch = d.history.champions;
  const count = Object.entries(ch.reduce<Record<string, number>>((a, c) => { a[c.champion] = (a[c.champion] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const confs = Object.entries(ch.reduce<Record<string, number>>((a, c) => { const k = c.conference ?? '–'; a[k] = (a[k] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <section className="s-two">
        <div className="ocard">
          <h2>Champions since 1998</h2>
          <p className="dek">The final AP number one of every season of the BCS (1998–2013) and Playoff (since 2014) eras.</p>
          {count.map(([s, n]) => <div key={s} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 24px', gap: 8, alignItems: 'center', fontSize: 12.5, margin: '3px 0', fontWeight: s === ME ? 700 : 400 }}><span><CfbLogo t={T[s]} />{s}</span><span style={{ height: 10, width: `${(n / count[0][1]) * 100}%`, background: s === ME ? BURNT : ink(T[s]), borderRadius: 2 }} /><b>{n}</b></div>)}
        </div>
        <div className="ocard">
          <h2>By conference</h2>
          {confs.map(([c, n]) => <div key={c} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 24px', gap: 8, alignItems: 'center', fontSize: 12.5, margin: '3px 0' }}><span>{c}</span><span style={{ height: 10, width: `${(n / confs[0][1]) * 100}%`, background: 'var(--o-s1)', borderRadius: 2 }} /><b>{n}</b></div>)}
        </div>
      </section>
      <section className="ocard">
        <h2>Every season</h2>
        <table className="otable" style={{ fontSize: 12.5 }}>
          <thead><tr><th>Season</th><th>Champion</th><th>Second</th><th>Third</th></tr></thead>
          <tbody>{[...ch].reverse().map(c => <tr key={c.year} className={c.champion === ME ? 'me' : ''}><td>{c.year}</td><td><CfbLogo t={T[c.champion]} /><b>{c.champion}</b> <small style={{ color: 'var(--o-ink3)' }}>{c.conference}</small></td><td>{c.second}</td><td>{c.third}</td></tr>)}</tbody>
        </table>
        <Src>Source: CollegeFootballData (final AP poll)</Src>
      </section>
    </>
  );
}

/* ───────────────────────────── How it works ───────────────────────────── */

export function HowScreen({ d }: { d: CfbFile }) {
  const P = ({ children }: { children: ReactNode }) => <p style={{ margin: '0 0 10px', lineHeight: 1.55, fontSize: 14 }}>{children}</p>;
  return (
    <>
      <section className="s-two">
        <div className="ocard">
          <h2>The sport</h2>
          <P><b>{d.teams.length} teams</b> in the top division (FBS), grouped in conferences. The four biggest, the “power four”, are the SEC, the Big Ten, the Big 12 and the ACC.</P>
          <P><b>Twelve games</b> from late August to late November, most against conference rivals; the conference champions are decided by a championship game in early December.</P>
          <P><b>Rosters</b> change fast: players stay three to five years, can transfer through the portal and are paid for their name, image and likeness (NIL).</P>
        </div>
        <div className="ocard">
          <h2>The College Football Playoff</h2>
          <P><b>Twelve teams</b>, chosen and seeded by a 13-member selection committee: the five best-ranked conference champions are guaranteed a place, the other seven are at-large picks.</P>
          <P><b>First round</b> on campus, at the better seed's stadium, in December; the four best-seeded teams skip it. <b>Quarterfinals and semifinals</b> rotate among the six New Year's Six bowls (Rose, Sugar, Orange, Cotton, Peach, Fiesta); the <b>final</b> is in January.</P>
          <P>The other <b>bowls</b>, about 40, are one-off games for teams with at least six wins.</P>
        </div>
      </section>
      <section className="ocard">
        <h2>The rankings and the numbers</h2>
        <div className="s-two" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <P><b>AP poll:</b> 60-odd journalists vote a Top 25 every week; <b>Coaches poll:</b> the same, by head coaches. Neither picks the playoff.</P>
            <P><b>Committee ranking:</b> from November, the playoff committee publishes its own Top 25 every Tuesday; the last one, after the conference championships, sets the bracket.</P>
          </div>
          <div>
            <P><b>SP+</b> (by Bill Connelly) rates teams by efficiency and explosiveness, adjusted for opponents: the number is points better than an average team. <b>FPI</b> is ESPN's equivalent, and drives its playoff odds.</P>
            <P><b>EPA (PPA)</b> is the expected points a play adds; <b>success rate</b> the share of plays that keep the offence on schedule; <b>havoc</b> the share of plays where the defence makes a tackle for loss, an interception, a forced fumble or a break-up.</P>
          </div>
        </div>
      </section>
    </>
  );
}

/* ───────────────────────────── Texas: Season and Power ───────────────────────────── */

export function TexasSeason({ d }: { d: CfbFile }) {
  const T = useT(d);
  const games = d.games.filter(g => g.h === ME || g.a === ME).sort((a, b) => a.start.localeCompare(b.start));
  const done = games.filter(g => g.done && g.hs != null);
  const apWeeks = d.polls.filter(p => p.poll === 'AP' && p.type === 'regular').sort((a, b) => a.week - b.week);
  return (
    <>
      {done.length > 0 && <section className="s-two">
        <div className="ocard">
          <h2>Game by game</h2>
          <DiffBars color={BURNT} bars={done.map(g => { const home = g.h === ME, m = home ? g.hs! - g.as! : g.as! - g.hs!, opp = home ? g.a : g.h; return { label: `${home ? '' : '@'}${T[opp]?.abbr ?? opp}`, value: m, tip: `Week ${g.week}: ${home ? 'vs' : 'at'} ${opp}, ${home ? g.hs : g.as}–${home ? g.as : g.hs}` }; })} />
        </div>
        <div className="ocard">
          <h2>In the AP poll</h2>
          {apWeeks.length > 1 && <BumpChart weeks={apWeeks.map(p => p.week)} maxRank={25} series={[...new Set(['Texas', ...['Texas A&M', 'Oklahoma', 'Georgia', 'Alabama', 'LSU'].filter(s => apWeeks.some(p => p.ranks.some(r => r[1] === s)))])].map((s, i) => ({ id: s, name: s, ranks: apWeeks.map(p => p.ranks.find(r => r[1] === s)?.[0] ?? null), color: i === 0 ? BURNT : undefined }))} />}
          <p className="dek" style={{ fontSize: 11.5 }}>Texas against its SEC and old Big 12 rivals; gaps are weeks outside the Top 25.</p>
        </div>
      </section>}
      <section className="ocard">
        <h2>Schedule and results</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8, alignItems: 'start' }}>
          {games.map(g => <div key={g.id}><div className="lab">Week {g.week} · {dayShort(Date.parse(g.start))}</div><CfbGameCard g={g} T={T} rk={apAt(d, g.week)} /></div>)}
        </div>
        <Src>Sources: CollegeFootballData, ESPN</Src>
      </section>
    </>
  );
}

const STRIPS: StripMetric[] = [
  { key: 'sp', label: 'SP+', fmt: v => sg(v, 1) },
  { key: 'spOff', label: 'Offence (SP+)', fmt: v => v.toFixed(1) },
  { key: 'epaOff', label: 'EPA per play', fmt: v => sg(v) },
  { key: 'passOff', label: 'Passing game', fmt: v => sg(v) },
  { key: 'rushOff', label: 'Running game', fmt: v => sg(v) },
  { key: 'srOff', label: 'Success rate', fmt: pc },
  { key: 'off3', label: 'Third downs', note: 'EPA per play', fmt: v => sg(v) },
  { key: 'ppoOff', label: 'Finishing drives', note: 'points per trip inside the 40', fmt: v => v.toFixed(2) },
  { key: 'lineOff', label: 'Offensive line', note: 'line yards per run', fmt: v => v.toFixed(2) },
  { key: 'havocOff', label: 'Havoc allowed', fmt: pc, low: true },
  { key: 'spDef', label: 'Defence (SP+)', fmt: v => v.toFixed(1), low: true },
  { key: 'epaDef', label: 'EPA allowed', fmt: v => sg(v), low: true },
  { key: 'passDef', label: 'Pass defence', fmt: v => sg(v), low: true },
  { key: 'rushDef', label: 'Run defence', fmt: v => sg(v), low: true },
  { key: 'havocDef', label: 'Havoc', fmt: pc },
  { key: 'stuffDef', label: 'Stuffing the run', fmt: pc },
  { key: 'spSt', label: 'Special teams (SP+)', fmt: v => v.toFixed(1) },
];

export function TexasPower({ d }: { d: CfbFile }) {
  const T = useT(d);
  const V = useMemo(() => values(d), [d]);
  const sec = d.teams.filter(t => t.conference === 'SEC').map(t => t.school);
  const top = Object.entries(V).filter(([, v]) => v.sp != null).sort((a, b) => b[1].sp! - a[1].sp!).slice(0, 3).map(([k]) => k).filter(k => k !== ME);
  const cmp = [...top.map((k, i) => ({ id: k, color: ['var(--o-s1)', 'var(--o-s3)', 'var(--o-s4)'][i] }))];
  const rk = (k: string, low = false) => ranks(Object.fromEntries(Object.entries(V).map(([s, v]) => [s, v[k]])), low)[ME];
  const strong = STRIPS.map(m => ({ m, r: rk(m.key, m.low) })).filter(x => x.r).sort((a, b) => a.r - b.r);
  const secV = Object.fromEntries(sec.filter(s => V[s]).map(s => [s, V[s]]));
  const f = d.fpi[T[ME]?.id ?? ''];
  const r = record(d, ME);
  return (
    <>
      <section className="ocard">
        <h2><CfbLogo t={T[ME]} />Texas against the country</h2>
        <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', margin: '6px 0 12px' }}>
          <div className="kpi"><b>{r.w}-{r.l}</b><span>Record</span></div>
          <div className="kpi"><b>{apAt(d)[ME] ?? '–'}</b><span>AP rank</span></div>
          <div className="kpi"><b>{rk('sp') ? ordinal(rk('sp')) : '–'}</b><span>SP+</span></div>
          {f && <div className="kpi"><b>{Math.round(f.playoff ?? 0)}%</b><span>Make playoff (FPI)</span></div>}
          {f && <div className="kpi"><b>{Math.round(f.conf ?? 0)}%</b><span>Win the SEC</span></div>}
        </div>
        {strong.length > 3 && <p className="dek"><b>Best at:</b> {strong.slice(0, 3).map(x => `${x.m.label} (${ordinal(x.r)})`).join(', ')}. <b>Weakest at:</b> {strong.slice(-3).reverse().map(x => `${x.m.label} (${ordinal(x.r)})`).join(', ')}.</p>}
        <div className="olegend"><span><i style={{ background: BURNT }} />Texas</span>{cmp.map(c => <span key={c.id}><i style={{ background: c.color }} />{c.id}</span>)}<span><i style={{ background: 'var(--o-other)' }} />Rest of FBS</span></div>
        <RankStrips metrics={STRIPS} values={V} me={ME} color={BURNT} labelOf={s => T[s]?.abbr ?? s} compare={cmp} />
        <Src>Sources: CollegeFootballData, ESPN FPI · ranks among all FBS teams</Src>
      </section>
      <section className="ocard">
        <h2>Texas in the SEC</h2>
        <p className="dek">Every SEC team; colour = rank inside the conference.</p>
        <PercentileGrid rows={Object.keys(secV).map(s => ({ id: s, label: <><CfbLogo t={T[s]} />{s}</>, values: secV[s], me: s === ME }))} cols={COLS} initial="sp" />
      </section>
    </>
  );
}
