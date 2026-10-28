// Formula 1 screens beyond the home: the season session by session, team and driver
// strength, drivers and teams, circuits, history and the rules.
// Data: public/data/f1-season.json and f1-sessions/<year>/<key>.json (OpenF1, Jolpica).
import { useMemo, useState, type ReactNode } from 'react';
import { BumpChart, MultiLine } from '../components/charts';
import { PercentileGrid, QuadrantScatter, RankStrips, Spaghetti, ordinal, type GridCol, type StripMetric } from '../components/power';
import { Chips, usePick } from '../components/tabs';
import { dayLong, dayShort, fmt, hhmm } from '../core/time';
import { lapTime, raceTime, useF1Session, type F1Driver, type F1Meeting, type F1SeasonFile, type F1SessionFile } from '../sources/f1Season';

export const F1_TABS = [['now', 'Now'], ['season', 'Season'], ['power', 'Power'], ['drivers', 'Drivers & teams'], ['circuits', 'Circuits'], ['history', 'History'], ['how', 'How it works']] as const;
export type F1Tab = typeof F1_TABS[number][0];

const Src = ({ children }: { children: ReactNode }) => <div className="osrc">{children}</div>;
const COMPOUND: Record<string, string> = { SOFT: '#e8002d', MEDIUM: '#ffd12e', HARD: '#d8d8d8', INTERMEDIATE: '#43b02a', WET: '#0067ad' };
const TYPES: [string, string][] = [['street', 'Street'], ['high-speed', 'High-speed'], ['power', 'Power'], ['technical', 'Technical'], ['mixed', 'Mixed']];
const pct = (v: number) => `+${v.toFixed(2)}%`;
const shortName = (m: F1Meeting) => m.location.replace('Marina Bay', 'Singapore');

const useDrivers = (d: F1SeasonFile) => useMemo(() => d.drivers, [d]);
const colourOf = (d: F1SeasonFile, team: string | null | undefined) => (team && d.teams[team]?.colour) || 'var(--o-other)';
/** Final championship order (latest table) */
function standings(d: F1SeasonFile) {
  const lastC = d.champ.at(-1);
  return { drivers: [...(lastC?.drivers ?? [])].sort((a, b) => a[1] - b[1]), teams: [...(lastC?.teams ?? [])].sort((a, b) => a[1] - b[1]) };
}

/* ───────────────────────────── Season ───────────────────────────── */

export function SeasonScreen({ d }: { d: F1SeasonFile }) {
  const rounds = d.meetings.filter(m => !m.cancelled);
  const [pickM, setM] = usePick('round');
  const lastDone = [...rounds].reverse().find(m => m.sessions.some(s => s.done));
  const m = rounds.find(x => String(x.round) === pickM) ?? lastDone ?? rounds[0];
  const [pickS, setS] = useState<number | null>(null);
  const done = m.sessions.filter(s => s.done);
  const sKey = done.some(s => s.key === pickS) ? pickS! : (done.find(s => s.name === 'Race') ?? done.at(-1))?.key ?? null;
  const st = standings(d);
  const D = useDrivers(d);
  // Points after each race or sprint, top eight drivers
  const top = st.drivers.slice(0, 8).map(x => x[0]);
  const steps = d.champ.map(c => { const mm = d.meetings.find(x => x.key === c.meeting); return `${mm ? shortName(mm).slice(0, 3).toUpperCase() : ''}${c.name === 'Sprint' ? '·S' : ''}`; });
  return (
    <>
      <section className="ocard">
        <h2>The {d.year} season, round by round</h2>
        <p className="dek">Pick a Grand Prix, then a session: full classification, and for races and sprints the lap chart, the gaps, the tyre strategies and the pit stops.</p>
        <Chips label="Round" items={rounds.map(x => ({ k: String(x.round), label: `${x.round} ${shortName(x)}${x.sessions.every(s => s.done) ? '' : x.sessions.some(s => s.done) ? ' ●' : ''}` }))} value={String(m.round)} set={k => { setM(k); setS(null); }} />
        <div style={{ fontSize: 13, color: 'var(--o-ink2)', margin: '0 0 8px' }}>{m.country} · {d.circuits[m.circuit]?.name ?? m.circuit} · {dayLong(Date.parse(m.race))}</div>
        {done.length ? <Chips label="Session" items={done.map(s => ({ k: s.key, label: s.name }))} value={sKey ?? 0} set={setS} /> : <p className="dek">No session run yet. First session: {dayLong(Date.parse(m.sessions[0].start))} at {hhmm(Date.parse(m.sessions[0].start))} Rome.</p>}
        {sKey && <SessionView d={d} k={sKey} />}
      </section>

      <ResultsGrid d={d} />

      {d.champ.length > 1 && <section className="s-two">
        <div className="ocard">
          <h2>The drivers' title fight</h2>
          <p className="dek">Points after every race and sprint (·S), top eight.</p>
          <MultiLine steps={steps} unit="points" series={top.map(n => ({ name: D[n]?.code ?? String(n), color: colourOf(d, D[n]?.team), values: d.champ.map(c => c.drivers.find(x => x[0] === n)?.[2] ?? null) }))} />
        </div>
        <div className="ocard">
          <h2>The constructors</h2>
          <p className="dek">Points after every race and sprint.</p>
          <MultiLine steps={steps} unit="points" series={st.teams.slice(0, 8).map(([t]) => ({ name: t.replace(' F1 Team', '').replace(' Racing', ''), color: colourOf(d, t), values: d.champ.map(c => c.teams.find(x => x[0] === t)?.[2] ?? null) }))} />
        </div>
      </section>}
      <Src>Source: OpenF1</Src>
    </>
  );
}

/** Drivers × rounds: finishing position of every Grand Prix. */
function ResultsGrid({ d }: { d: F1SeasonFile }) {
  const D = useDrivers(d);
  const st = standings(d);
  const rounds = d.meetings.filter(m => !m.cancelled && m.sessions.some(s => s.name === 'Race' && s.done));
  if (!rounds.length) return null;
  const res = (m: F1Meeting, name: string) => d.results.find(r => r.meeting === m.key && r.name === name)?.results ?? [];
  const cell = (pos: number | null, out: boolean) => {
    if (out) return { bg: 'var(--o-grid)', ink: 'var(--o-ink3)', t: 'R' };
    if (!pos) return { bg: 'transparent', ink: 'var(--o-ink3)', t: '' };
    if (pos <= 3) return { bg: ['#d4af37', '#a8a9ad', '#b0764a'][pos - 1], ink: '#fff', t: String(pos) };
    if (pos <= 10) return { bg: `color-mix(in srgb, var(--o-s1) ${Math.round((11 - pos) * 7 + 10)}%, var(--o-card))`, ink: 'var(--o-ink)', t: String(pos) };
    return { bg: 'transparent', ink: 'var(--o-ink3)', t: String(pos) };
  };
  return (
    <section className="ocard">
      <h2>Every result</h2>
      <p className="dek">Finishing position in every Grand Prix, drivers in championship order. Gold, silver and bronze for the podium, blue for the points, R for a retirement; the small number is the sprint.</p>
      <div style={{ overflowX: 'auto' }}>
        <table className="otable" style={{ fontSize: 11 }}>
          <thead><tr><th>Driver</th><th className="n">Pts</th>{rounds.map(m => <th key={m.key} className="n" title={m.country}>{shortName(m).slice(0, 3).toUpperCase()}</th>)}</tr></thead>
          <tbody>{st.drivers.map(([n, , pts]) => (
            <tr key={n}><td style={{ whiteSpace: 'nowrap' }}><span style={{ display: 'inline-block', width: 4, height: 12, background: colourOf(d, D[n]?.team), marginRight: 6, verticalAlign: -1 }} />{D[n]?.code ?? n}</td><td className="n"><b>{pts}</b></td>
              {rounds.map(m => { const r = res(m, 'Race').find(x => x.n === n), sp = m.sprint ? res(m, 'Sprint').find(x => x.n === n) : null; const c = cell(r?.pos ?? null, !!r && (r.dnf || r.dns || r.dsq)); return <td key={m.key} className="n" style={{ background: c.bg, color: c.ink, fontWeight: 700, padding: '4px 2px', textAlign: 'center' }}>{c.t}{sp?.pos ? <sup style={{ fontWeight: 400, opacity: 0.8 }}> {sp.pos}</sup> : null}</td>; })}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}

function SessionView({ d, k }: { d: F1SeasonFile; k: number }) {
  const s = useF1Session(d.year, k);
  if (!s) return <p className="dek">Loading the session…</p>;
  const race = s.type === 'Race';
  return race ? <RaceView s={s} /> : <TimedView s={s} />;
}

const Bar = ({ c }: { c: string | null }) => <span style={{ display: 'inline-block', width: 4, height: 12, background: c ?? 'var(--o-other)', marginRight: 6, verticalAlign: -1 }} />;

/** Practice and qualifying: best laps, sectors (fastest in purple), speed trap. */
function TimedView({ s }: { s: F1SessionFile }) {
  const D = Object.fromEntries(s.drivers.map(x => [x.n, x]));
  const best = (n: number, i: number) => Math.min(...(s.laps[n] ?? []).map(l => l[i] as number).filter(v => v > 0));
  const rows = s.results.filter(r => r.pos).sort((a, b) => a.pos! - b.pos!);
  const top = [3, 4, 5].map(i => Math.min(...rows.map(r => best(r.n, i))));
  const speedTop = Math.max(...rows.map(r => Math.max(...(s.laps[r.n] ?? []).map(l => l[6] ?? 0))));
  const quali = /Qualifying|Shootout/.test(s.name);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="otable" style={{ fontSize: 12 }}>
        <thead><tr><th className="n">Pos</th><th>Driver</th><th>Team</th>{quali ? <><th className="n">Q1</th><th className="n">Q2</th><th className="n">Q3</th></> : <><th className="n">Best</th><th className="n">Gap</th></>}<th className="n">S1</th><th className="n">S2</th><th className="n">S3</th><th className="n">Top speed</th><th className="n">Laps</th></tr></thead>
        <tbody>{rows.map(r => {
          const x = D[r.n]; const times = Array.isArray(r.time) ? r.time : [r.time];
          const sp = Math.max(...(s.laps[r.n] ?? []).map(l => l[6] ?? 0));
          return <tr key={r.n}><td className="n">{r.pos}</td><td style={{ whiteSpace: 'nowrap' }}><Bar c={x?.colour ?? null} /><b>{x?.code}</b> <span style={{ color: 'var(--o-ink3)' }}>{x?.last}</span></td><td>{x?.team}</td>
            {quali ? [0, 1, 2].map(i => <td key={i} className="n">{lapTime(times[i] as number | null)}</td>) : <><td className="n">{lapTime(times[0] as number | null)}</td><td className="n">{r.gap && typeof r.gap === 'number' ? `+${r.gap.toFixed(3)}` : ''}</td></>}
            {[3, 4, 5].map((i, j) => { const v = best(r.n, i); return <td key={i} className="n" style={{ color: v === top[j] ? '#a020f0' : undefined, fontWeight: v === top[j] ? 700 : 400 }}>{Number.isFinite(v) ? v.toFixed(3) : '–'}</td>; })}
            <td className="n" style={{ color: sp === speedTop ? '#a020f0' : undefined }}>{sp || '–'}</td><td className="n">{r.laps}</td></tr>;
        })}</tbody>
      </table>
      <Src>Source: OpenF1 · purple: fastest of the session</Src>
    </div>
  );
}

/** Race or sprint: classification, lap chart, gaps, strategies, pit stops. */
function RaceView({ s }: { s: F1SessionFile }) {
  const D: Record<number, F1Driver> = Object.fromEntries(s.drivers.map(x => [x.n, x]));
  const rows = [...s.results].sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99));
  const laps = Math.max(0, ...rows.map(r => r.laps ?? 0));
  // Crossing time of the line at the end of every lap, per driver
  const cross: Record<number, number[]> = {};
  for (const [n, ls] of Object.entries(s.laps)) for (const l of ls) if (l[1] != null && l[2]) (cross[+n] ??= [])[l[0]] = l[1] + l[2] * 1000;
  const posAt: Record<number, (number | null)[]> = {}, gapAt: Record<number, (number | null)[]> = {};
  for (let L = 1; L <= laps; L++) {
    const order = Object.entries(cross).filter(([, c]) => c[L] != null).sort((a, b) => a[1][L] - b[1][L]);
    const lead = order[0]?.[1][L];
    order.forEach(([n, c], i) => { (posAt[+n] ??= Array(laps).fill(null))[L - 1] = i + 1; (gapAt[+n] ??= Array(laps).fill(null))[L - 1] = (c[L] - lead) / 1000; });
  }
  const best = (n: number) => Math.min(...(s.laps[n] ?? []).map(l => l[2] ?? Infinity));
  const fastest = Math.min(...rows.map(r => best(r.n)));
  const pitsOf = (n: number) => s.pits.filter(p => p[0] === n);
  const stintsOf = (n: number) => s.stints.filter(x => x[0] === n).sort((a, b) => a[1] - b[1]);
  const top = rows.filter(r => r.pos && r.pos <= 6).map(r => r.n);
  const steps = Array.from({ length: laps }, (_, i) => String(i + 1));
  const stops = s.pits.filter(p => p[3] && p[3] > 1.5 && p[3] < 15).sort((a, b) => a[3]! - b[3]!);
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ overflowX: 'auto' }}>
        <table className="otable" style={{ fontSize: 12 }}>
          <thead><tr><th className="n">Pos</th><th>Driver</th><th>Team</th><th className="n">Laps</th><th className="n">Time / gap</th><th className="n">Best lap</th><th className="n">Stops</th><th>Tyres</th><th className="n">Pts</th></tr></thead>
          <tbody>{rows.map(r => {
            const x = D[r.n], b = best(r.n);
            return <tr key={r.n}><td className="n">{r.pos ?? (r.dsq ? 'DSQ' : r.dns ? 'DNS' : 'R')}</td><td style={{ whiteSpace: 'nowrap' }}><Bar c={x?.colour ?? null} /><b>{x?.code}</b> <span style={{ color: 'var(--o-ink3)' }}>{x?.last}</span></td><td>{x?.team}</td><td className="n">{r.laps}</td>
              <td className="n">{r.pos === 1 && typeof r.time === 'number' ? raceTime(r.time) : typeof r.gap === 'number' ? `+${r.gap.toFixed(3)}` : r.gap ?? (r.dnf ? 'Retired' : '')}</td>
              <td className="n" style={{ color: b === fastest ? '#a020f0' : undefined, fontWeight: b === fastest ? 700 : 400 }}>{Number.isFinite(b) ? lapTime(b) : '–'}</td><td className="n">{pitsOf(r.n).length}</td>
              <td>{stintsOf(r.n).map(x => <span key={x[1]} title={`${x[2]}, laps ${x[3]}–${x[4]}`} style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: COMPOUND[x[2]] ?? 'var(--o-other)', border: '1px solid var(--o-ink3)', marginRight: 2 }} />)}</td>
              <td className="n">{r.points || ''}</td></tr>;
          })}</tbody>
        </table>
      </div>
      {laps > 3 && <div>
        <div className="lab">Lap chart</div>
        <p className="dek">Position at the end of every lap. The top six finishers in their team colours.{s.neutral.length ? ` Safety car or virtual safety car on laps ${s.neutral.join(', ')}.` : ''}</p>
        <BumpChart weeks={Array.from({ length: laps }, (_, i) => i + 1)} maxRank={Math.max(10, s.drivers.length)} series={s.drivers.map(x => ({ id: String(x.n), name: x.code, ranks: posAt[x.n] ?? [], color: top.includes(x.n) ? x.colour ?? undefined : undefined }))} />
      </div>}
      {laps > 3 && <div>
        <div className="lab">Gap to the leader</div>
        <p className="dek">Seconds behind the car in front of the field at the end of each lap, the top ten finishers. A drop is a pit stop or a safety car closing the field.</p>
        <Spaghetti zero={false} fmt={v => `${v.toFixed(0)}s`} steps={steps} series={rows.filter(r => r.pos && r.pos <= 10).map(r => ({ id: String(r.n), label: D[r.n]?.code ?? '', values: (gapAt[r.n] ?? []).map(v => (v != null && v < 120 ? v : null)), color: r.pos! <= 6 ? D[r.n]?.colour ?? undefined : undefined }))} />
      </div>}
      {s.stints.length > 0 && <div>
        <div className="lab">Tyre strategies</div>
        <div className="olegend">{Object.entries(COMPOUND).map(([k, c]) => <span key={k}><i style={{ background: c, border: '1px solid var(--o-ink3)' }} />{k[0] + k.slice(1).toLowerCase()}</span>)}</div>
        {rows.map(r => (
          <div key={r.n} style={{ display: 'grid', gridTemplateColumns: '50px 1fr', gap: 8, alignItems: 'center', fontSize: 11.5, margin: '2px 0' }}>
            <b>{D[r.n]?.code}</b>
            <div style={{ position: 'relative', height: 14, background: 'var(--o-grid)', borderRadius: 3 }}>
              {stintsOf(r.n).map(x => <div key={x[1]} title={`${x[2]} · laps ${x[3]}–${x[4]}${x[5] ? ` · ${x[5]} laps old at the start` : ''}`} style={{ position: 'absolute', left: `${((x[3] - 1) / laps) * 100}%`, width: `${((x[4] - x[3] + 1) / laps) * 100}%`, top: 0, bottom: 0, background: COMPOUND[x[2]] ?? 'var(--o-other)', borderRight: '2px solid var(--o-card)', color: x[2] === 'SOFT' || x[2] === 'WET' || x[2] === 'INTERMEDIATE' ? '#fff' : '#222', fontSize: 9.5, textAlign: 'center', lineHeight: '14px', overflow: 'hidden' }}>{x[4] - x[3] + 1}</div>)}
            </div>
          </div>
        ))}
      </div>}
      {stops.length > 0 && <div>
        <div className="lab">The fastest pit stops</div>
        <table className="otable" style={{ fontSize: 12, maxWidth: 520 }}>
          <thead><tr><th>Driver</th><th>Team</th><th className="n">Lap</th><th className="n">Stationary</th><th className="n">Pit lane</th></tr></thead>
          <tbody>{stops.slice(0, 10).map((p, i) => <tr key={i}><td><Bar c={D[p[0]]?.colour ?? null} />{D[p[0]]?.code}</td><td>{D[p[0]]?.team}</td><td className="n">{p[1]}</td><td className="n"><b>{p[3]!.toFixed(2)}s</b></td><td className="n">{p[2]?.toFixed(1)}s</td></tr>)}</tbody>
        </table>
      </div>}
      <Src>Source: OpenF1</Src>
    </div>
  );
}

/* ───────────────────────────── Power ───────────────────────────── */

const TEAM_COLS: GridCol[] = [
  { key: 'quali', label: 'Quali', group: 'Pace (gap to the best, %)', fmt: pct, low: true, title: 'Team best lap against pole, average of every qualifying and sprint qualifying' },
  { key: 'race', label: 'Race', group: 'Pace (gap to the best, %)', fmt: pct, low: true, title: 'Median clean lap of the team’s best car against the fastest team, every race and sprint' },
  { key: 's1', label: 'S1', group: 'Sectors in qualifying', fmt: pct, low: true },
  { key: 's2', label: 'S2', group: 'Sectors in qualifying', fmt: pct, low: true },
  { key: 's3', label: 'S3', group: 'Sectors in qualifying', fmt: pct, low: true },
  { key: 'speed', label: 'Top speed', group: 'Car', fmt: v => `${v.toFixed(1)} km/h`, title: 'Speed trap against the fastest car, average' },
  { key: 'degSoft', label: 'Soft', group: 'Tyre wear (s per lap)', fmt: v => v.toFixed(3), low: true },
  { key: 'degMedium', label: 'Medium', group: 'Tyre wear (s per lap)', fmt: v => v.toFixed(3), low: true },
  { key: 'degHard', label: 'Hard', group: 'Tyre wear (s per lap)', fmt: v => v.toFixed(3), low: true },
  { key: 'pit', label: 'Pit stop', group: 'Operations', fmt: v => `${v.toFixed(2)}s`, low: true, title: 'Median stationary time' },
  { key: 'start', label: 'Starts', group: 'Operations', fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(1)}`, title: 'Average places gained on the first lap' },
  { key: 'gained', label: 'Race craft', group: 'Operations', fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(1)}`, title: 'Average places gained from the grid to the flag' },
  { key: 'dnfRate', label: 'Retirements', group: 'Operations', fmt: v => `${Math.round(v * 100)}%`, low: true, title: 'Share of starts not finished' },
];

function teamValues(d: F1SeasonFile) {
  return Object.fromEntries(Object.entries(d.power.teams).map(([t, p]) => [t, {
    quali: p.quali, race: p.race, s1: p.s1, s2: p.s2, s3: p.s3, speed: p.speed, pit: p.pit, start: p.start, gained: p.gained, dnfRate: p.starts ? p.dnf / p.starts : null,
    degSoft: p.deg.SOFT?.slope ?? null, degMedium: p.deg.MEDIUM?.slope ?? null, degHard: p.deg.HARD?.slope ?? null,
    ...Object.fromEntries(TYPES.map(([k]) => [`t_${k}`, p.byType[k] ?? null])),
    ...Object.fromEntries(Object.entries(p.rounds).flatMap(([r, x]) => [[`q${r}`, x.quali ?? null], [`r${r}`, x.race ?? null]])),
  }])) as Record<string, Record<string, number | null>>;
}

export function PowerScreen({ d }: { d: F1SeasonFile }) {
  const V = useMemo(() => teamValues(d), [d]);
  const teams = Object.keys(d.power.teams).filter(t => d.teams[t]);
  const by = (k: string) => [...teams].filter(t => V[t][k] != null).sort((a, b) => V[a][k]! - V[b][k]!);
  const rows = teams.map(t => ({ id: t, label: <><Bar c={d.teams[t].colour} />{t}</>, values: V[t] }));
  const rounds = d.meetings.filter(m => m.round && teams.some(t => d.power.teams[t].rounds[m.round!]));
  const fastQ = by('quali')[0], fastR = by('race')[0], fastS = [...teams].sort((a, b) => (V[b].speed ?? -99) - (V[a].speed ?? -99))[0];
  const sectorBest = (['s1', 's2', 's3'] as const).map(k => by(k)[0]);
  const lowDeg = by('degMedium')[0];
  const pitBest = by('pit')[0];
  const typeBest = TYPES.map(([k, l]) => [l, by(`t_${k}`)[0]] as const).filter(([, t]) => t);
  const roundCols = (kind: 'q' | 'r'): GridCol[] => rounds.map(m => ({ key: `${kind}${m.round}`, label: shortName(m).slice(0, 3).toUpperCase(), fmt: v => v.toFixed(2), low: true, title: `${m.country}: gap to the best team, %` }));
  const drivers = Object.entries(d.power.drivers).filter(([n, x]) => d.drivers[n] && x.quali != null && x.race != null);
  return (
    <>
      <section className="ocard">
        <h2>Who has the fastest car, and where</h2>
        <p className="dek">Over one lap the quickest car has been the <b>{fastQ}</b>; on race pace the <b>{fastR}</b>. The best in the first, second and third sectors: {sectorBest.map((t, i) => <b key={i}>{t}{i < 2 ? ', ' : ''}</b>)}. Fastest on the straights: <b>{fastS}</b>. Gentlest on the tyres (medium): <b>{lowDeg}</b>. Quickest pit crew: <b>{pitBest}</b>.</p>
        <p className="dek">By type of circuit: {typeBest.map(([l, t], i) => <span key={l}>{i ? '; ' : ''}{l.toLowerCase()} tracks <b>{t}</b></span>)}.</p>
        <p className="dek" style={{ fontSize: 12.5 }}>Pace is measured as the gap to the best, in percent of a lap time: 0.5% on a 90-second lap is about 0.45 seconds.</p>
      </section>

      <section className="ocard">
        <h2>One lap against a race distance</h2>
        <p className="dek">Average gap to pole in qualifying against the gap to the fastest team in races (clean laps only: no pit laps, no safety car). Top right are fast in both; a team above the diagonal is better on Sunday than Saturday.</p>
        <QuadrantScatter xLabel="Qualifying pace (closer to pole →)" yLabel="Race pace (closer to the best ↑)" invertY fmt={v => `${Math.abs(v).toFixed(1)}%`}
          corners={['Complete car', 'Race car', 'Qualifying car', 'Off the pace']}
          points={teams.filter(t => V[t].quali != null && V[t].race != null).map(t => ({ id: t, label: t.replace(' F1 Team', '').replace(' Racing', ''), x: -V[t].quali!, y: V[t].race!, color: d.teams[t].colour ?? undefined, tip: <><div className="k">{t}</div>Qualifying +{V[t].quali!.toFixed(2)}% · Race +{V[t].race!.toFixed(2)}%</> }))} />
        <Src>Computed from OpenF1 lap times</Src>
      </section>

      <section className="ocard">
        <h2>Every team, every strength</h2>
        <p className="dek">Deep blue among the best, deep orange among the worst. Click a column to sort.</p>
        <PercentileGrid rows={rows} cols={TEAM_COLS} initial="quali" />
        <Src>Computed from OpenF1 laps, stints and pit stops</Src>
      </section>

      <section className="ocard">
        <h2>By type of circuit</h2>
        <p className="dek">Average gap to pole in qualifying on each kind of track: street circuits, high-speed (fast corners, aerodynamic efficiency), power (long straights, low drag), technical (slow corners, traction) and mixed.</p>
        <PercentileGrid rows={rows} cols={TYPES.map(([k, l]) => ({ key: `t_${k}`, label: l, fmt: pct, low: true }))} initial="t_street" />
      </section>

      <section className="s-two">
        <div className="ocard">
          <h2>Straight-line speed against lap time</h2>
          <p className="dek">Speed trap against qualifying pace. Fast on the straights but slow over the lap means a low-drag car that lacks downforce in the corners; the reverse, a car that carries speed through the corners.</p>
          <QuadrantScatter height={360} xLabel="Top speed vs the fastest (km/h)" yLabel="Qualifying gap (closer ↑)" invertY fmt={v => v.toFixed(1)} corners={['Fast everywhere', 'Corner car', 'Straight-line car', 'Slow']}
            points={teams.filter(t => V[t].speed != null && V[t].quali != null).map(t => ({ id: t, label: t.split(' ')[0], x: V[t].speed!, y: V[t].quali!, color: d.teams[t].colour ?? undefined, tip: <><div className="k">{t}</div>{V[t].speed!.toFixed(1)} km/h vs fastest · +{V[t].quali!.toFixed(2)}% in qualifying</> }))} />
        </div>
        <div className="ocard">
          <h2>The drivers</h2>
          <p className="dek">Each driver's own qualifying gap to pole against his race pace. Team-mates in the same colour: the gap between them is the driver, not the car.</p>
          <QuadrantScatter height={360} xLabel="Qualifying (closer to pole →)" yLabel="Race pace (closer ↑)" invertY fmt={v => `${Math.abs(v).toFixed(1)}%`} corners={['Fast both days', 'Sunday driver', 'Saturday driver', 'Off the pace']}
            points={drivers.map(([n, x]) => ({ id: n, label: d.drivers[n].code, x: -x.quali!, y: x.race!, color: d.drivers[n].colour ?? undefined, tip: <><div className="k">{d.drivers[n].name}</div>Qualifying +{x.quali!.toFixed(2)}% · race +{x.race!.toFixed(2)}%</> }))} />
        </div>
      </section>

      {rounds.length > 1 && <section className="ocard">
        <h2>Race by race</h2>
        <p className="dek">Qualifying gap to pole at every Grand Prix (lower is better): the development race, and the tracks that suit each car.</p>
        <PercentileGrid rows={rows} cols={roundCols('q')} initial={`q${rounds.at(-1)!.round}`} />
        <h3 style={{ marginTop: 18 }}>Race pace</h3>
        <PercentileGrid rows={rows} cols={roundCols('r')} initial={`r${rounds.at(-1)!.round}`} />
        <h3 style={{ marginTop: 18 }}>The development race</h3>
        <p className="dek">Qualifying gap to pole across the season, every team. Lower is better.</p>
        <Spaghetti zero={false} fmt={v => `${v.toFixed(1)}%`} steps={rounds.map(m => shortName(m).slice(0, 3).toUpperCase())} series={teams.map(t => ({ id: t, label: t.split(' ')[0], values: rounds.map(m => d.power.teams[t].rounds[m.round!]?.quali ?? null), color: d.teams[t].colour ?? undefined }))} />
        <Src>Computed from OpenF1 lap times</Src>
      </section>}
    </>
  );
}

/* ───────────────────────────── Drivers & teams ───────────────────────────── */

const D_STRIPS: StripMetric[] = [
  { key: 'quali', label: 'Qualifying pace', note: 'gap to pole, %', fmt: v => `+${v.toFixed(2)}%`, low: true },
  { key: 'race', label: 'Race pace', note: 'gap to the fastest, %', fmt: v => `+${v.toFixed(2)}%`, low: true },
  { key: 'avgQuali', label: 'Average grid position', fmt: v => v.toFixed(1), low: true },
  { key: 'avgFinish', label: 'Average finish', fmt: v => v.toFixed(1), low: true },
  { key: 'start', label: 'Starts', note: 'places gained on lap 1', fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
  { key: 'gained', label: 'Race craft', note: 'places gained grid to flag', fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
  { key: 'dnf', label: 'Retirements', fmt: v => String(v), low: true },
];

export function DriversScreen({ d }: { d: F1SeasonFile }) {
  const st = standings(d);
  const [pick, setPick] = usePick('driver');
  const n = d.drivers[pick ?? ''] ? Number(pick) : st.drivers[0]?.[0] ?? Number(Object.keys(d.drivers)[0]);
  const x = d.drivers[n], p = d.power.drivers[n];
  const mate = d.teams[x?.team]?.drivers.find(m => m !== n);
  const races = d.results.filter(r => r.name === 'Race');
  const mine = races.map(r => ({ m: d.meetings.find(mm => mm.key === r.meeting)!, r: r.results.find(y => y.n === n) })).filter(y => y.m && y.r);
  const quals = d.results.filter(r => r.name === 'Qualifying');
  const wins = mine.filter(y => y.r!.pos === 1).length, podiums = mine.filter(y => y.r!.pos && y.r!.pos <= 3).length, poles = quals.filter(q => q.results.find(y => y.n === n)?.pos === 1).length;
  const pts = st.drivers.find(y => y[0] === n);
  const V = Object.fromEntries(Object.entries(d.power.drivers).filter(([k]) => d.drivers[k]).map(([k, v]) => [k, { quali: v.quali, race: v.race, avgQuali: v.avgQuali, avgFinish: v.avgFinish, start: v.start, gained: v.gained, dnf: v.dnf }]));
  const tst = standings(d).teams;
  return (
    <>
      <section className="ocard">
        <h2>Pick a driver</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
          {tst.map(([t]) => (
            <div key={t} style={{ borderLeft: `4px solid ${colourOf(d, t)}`, paddingLeft: 8 }}>
              <div className="lab" style={{ marginBottom: 2 }}>{t}</div>
              {(d.teams[t]?.drivers ?? []).map(k => <button key={k} className="btn" aria-pressed={k === n} onClick={() => setPick(String(k))} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 3, textTransform: 'none', letterSpacing: 0, fontSize: 12, color: 'var(--o-ink)', background: k === n ? 'var(--o-accent-soft)' : 'transparent', borderColor: k === n ? 'var(--o-accent)' : 'var(--o-line)' }}>{d.drivers[k]?.name}</button>)}
            </div>
          ))}
        </div>
      </section>
      {x && <section className="ocard">
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          {x.photo && <img src={x.photo} alt="" style={{ width: 90, height: 90, objectFit: 'cover', objectPosition: 'top', borderRadius: 8, background: 'var(--o-grid)' }} />}
          <div><h2 style={{ margin: 0 }}>{x.name} <span style={{ color: 'var(--o-ink3)', fontWeight: 400 }}>#{x.n}</span></h2><div style={{ color: 'var(--o-ink2)' }}><Bar c={x.colour} />{x.team}</div></div>
        </div>
        <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', margin: '12px 0' }}>
          <div className="kpi"><b>{pts ? ordinal(pts[1]) : '–'}</b><span>Championship</span></div>
          <div className="kpi"><b>{pts?.[2] ?? 0}</b><span>Points</span></div>
          <div className="kpi"><b>{wins}</b><span>Wins</span></div>
          <div className="kpi"><b>{podiums}</b><span>Podiums</span></div>
          <div className="kpi"><b>{poles}</b><span>Poles</span></div>
          {p && mate && <div className="kpi"><b>{p.h2hQ[0]}–{p.h2hQ[1]}</b><span>Quali vs {d.drivers[mate]?.code}</span></div>}
          {p && mate && <div className="kpi"><b>{p.h2hR[0]}–{p.h2hR[1]}</b><span>Races vs {d.drivers[mate]?.code}</span></div>}
        </div>
        <div className="olegend"><span><i style={{ background: x.colour ?? 'var(--o-accent)' }} />{x.code}</span>{mate && <span><i style={{ background: 'var(--o-ink)' }} />{d.drivers[mate]?.code} (team-mate)</span>}<span><i style={{ background: 'var(--o-other)' }} />Other drivers</span></div>
        <RankStrips metrics={D_STRIPS} values={V} me={String(n)} color={x.colour ?? 'var(--o-accent)'} labelOf={k => d.drivers[k]?.code ?? k} compare={mate ? [{ id: String(mate), color: 'var(--o-ink)' }] : []} />
        <Src>Computed from OpenF1</Src>
      </section>}
      {mine.length > 0 && <section className="ocard">
        <h2>Race by race</h2>
        <table className="otable" style={{ fontSize: 12 }}>
          <thead><tr><th>Round</th><th>Grand Prix</th><th className="n">Grid</th><th className="n">Finish</th>{mate && <th className="n">{d.drivers[mate]?.code}</th>}<th className="n">Points</th></tr></thead>
          <tbody>{mine.map(({ m, r }) => {
            const q = quals.find(qq => qq.meeting === m.key)?.results.find(y => y.n === n)?.pos;
            const mr = races.find(rr => rr.meeting === m.key)?.results.find(y => y.n === mate);
            const c = r!.pos && r!.pos <= 3 ? ['#d4af37', '#a8a9ad', '#b0764a'][r!.pos - 1] : undefined;
            return <tr key={m.key}><td>{m.round}</td><td>{m.country}</td><td className="n">{q ?? '–'}</td><td className="n" style={{ background: c, color: c ? '#fff' : undefined, fontWeight: 700 }}>{r!.pos ?? (r!.dnf ? 'R' : r!.dsq ? 'DSQ' : 'DNS')}</td>{mate && <td className="n" style={{ color: 'var(--o-ink3)' }}>{mr?.pos ?? (mr ? 'R' : '–')}</td>}<td className="n">{r!.points || ''}</td></tr>;
          })}</tbody>
        </table>
      </section>}
    </>
  );
}

/* ───────────────────────────── Circuits ───────────────────────────── */

export function CircuitsScreen({ d }: { d: F1SeasonFile }) {
  const rounds = d.meetings.filter(m => !m.cancelled);
  const [pick, setPick] = usePick('circuit');
  const m = rounds.find(x => x.circuit === pick) ?? rounds.find(x => !x.sessions.every(s => s.done)) ?? rounds[0];
  const c = d.circuits[m.circuit];
  const past = d.history.winners.filter(w => w.circuit === c?.id).reverse();
  const race = d.results.find(r => r.meeting === m.key && r.name === 'Race');
  const quali = d.results.find(r => r.meeting === m.key && r.name === 'Qualifying');
  const win = race?.results.find(r => r.pos === 1), pole = quali?.results.find(r => r.pos === 1);
  const most = Object.entries(past.reduce<Record<string, number>>((a, w) => { a[w.driver] = (a[w.driver] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const teamsHere = Object.entries(d.power.teams).map(([t, p]) => [t, p.rounds[m.round!]?.quali] as const).filter(([, v]) => v != null).sort((a, b) => a[1]! - b[1]!);
  const fromPole = past.filter(w => w.grid === 1).length;
  return (
    <>
      <section className="ocard">
        <h2>The calendar</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {rounds.map(x => { const cc = d.circuits[x.circuit]; const w = d.results.find(r => r.meeting === x.key && r.name === 'Race')?.results.find(r => r.pos === 1); return (
            <button key={x.key} onClick={() => setPick(x.circuit)} className="btn" aria-pressed={x.key === m.key} style={{ textAlign: 'left', textTransform: 'none', letterSpacing: 0, color: 'var(--o-ink)', background: x.key === m.key ? 'var(--o-accent-soft)' : 'transparent', borderColor: x.key === m.key ? 'var(--o-accent)' : 'var(--o-line)', padding: '6px 8px' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>{x.round}. {x.country}</div>
              <div style={{ fontSize: 11, color: 'var(--o-ink3)' }}>{dayShort(Date.parse(x.race))} · {cc?.type ?? ''}{w ? ` · ${d.drivers[w.n]?.code}` : ''}</div>
            </button>
          ); })}
        </div>
      </section>
      <section className="ocard">
        <h2>{c?.name ?? m.circuit}</h2>
        <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', margin: '6px 0 12px' }}>
          <div className="kpi"><b style={{ textTransform: 'capitalize' }}>{c?.type ?? '–'}</b><span>Type</span></div>
          <div className="kpi"><b>{c?.km ?? '–'} km</b><span>Lap</span></div>
          <div className="kpi"><b>{c?.corners ?? '–'}</b><span>Corners</span></div>
          <div className="kpi"><b>{past.length}</b><span>Grands Prix here</span></div>
          <div className="kpi"><b>{past.length ? Math.round((fromPole / past.length) * 100) : 0}%</b><span>Won from pole</span></div>
        </div>
        <p className="dek">{m.country}, {dayLong(Date.parse(m.race))} at {hhmm(Date.parse(m.race))} Rome.{win ? ` Won this year by ${d.drivers[win.n]?.name}` : ''}{pole ? `${win ? ', pole' : ' Pole'} ${d.drivers[pole.n]?.name}` : ''}{win || pole ? '.' : ''}</p>
        <div className="s-two" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div>
            {teamsHere.length > 0 && <><div className="lab">Qualifying gap to pole here, {d.year}</div>
              {teamsHere.map(([t, v]) => <div key={t} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 54px', gap: 8, alignItems: 'center', fontSize: 12, margin: '3px 0' }}><span><Bar c={d.teams[t]?.colour ?? null} />{t}</span><span style={{ height: 10, width: `${Math.max(2, 100 - (v! / (teamsHere.at(-1)![1]! || 1)) * 90)}%`, background: d.teams[t]?.colour ?? 'var(--o-other)', borderRadius: 2 }} /><b>+{v!.toFixed(2)}%</b></div>)}</>}
            {most.length > 0 && <><div className="lab" style={{ marginTop: 14 }}>Most wins here</div>{most.map(([n, k]) => <div key={n} style={{ fontSize: 12.5 }}>{n} <b>{k}</b></div>)}</>}
          </div>
          <div>
            <div className="lab">Past winners</div>
            <table className="otable" style={{ fontSize: 12 }}><tbody>{past.slice(0, 15).map(w => <tr key={`${w.year}${w.round}`}><td>{w.year}</td><td>{w.driver}</td><td style={{ color: 'var(--o-ink3)' }}>{w.team}</td><td className="n" title="Grid position">P{w.grid}</td></tr>)}</tbody></table>
          </div>
        </div>
        <Src>Sources: OpenF1, Jolpica (Ergast archive)</Src>
      </section>
    </>
  );
}

/* ───────────────────────────── History ───────────────────────────── */

export function HistoryScreen({ d }: { d: F1SeasonFile }) {
  const H = d.history;
  const count = (xs: string[]) => Object.entries(xs.reduce<Record<string, number>>((a, k) => { a[k] = (a[k] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const titles = count(H.champions.map(c => c.driver)).slice(0, 15), cTitles = count(H.champions.filter(c => c.constructor).map(c => c.constructor!)).slice(0, 12);
  const wins = count(H.winners.map(w => w.driver)).slice(0, 20), tWins = count(H.winners.map(w => w.team)).slice(0, 15);
  const bars = (rows: [string, number][], colour: string) => { const max = rows[0]?.[1] ?? 1; return rows.map(([k, v]) => <div key={k} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 34px', gap: 8, alignItems: 'center', fontSize: 12, margin: '3px 0' }}><span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k}</span><span style={{ height: 10, width: `${(v / max) * 100}%`, background: colour, borderRadius: 2 }} /><b>{v}</b></div>); };
  // Share of races won from pole, by decade
  const decades = [...new Set(H.winners.map(w => Math.floor(w.year / 10) * 10))];
  return (
    <>
      <section className="s-two" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="ocard"><h2>Drivers' titles</h2>{bars(titles, 'var(--o-s1)')}</div>
        <div className="ocard"><h2>Constructors' titles</h2><p className="dek">The constructors' championship began in 1958.</p>{bars(cTitles, 'var(--o-s2)')}</div>
      </section>
      <section className="s-two" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="ocard"><h2>Most Grand Prix wins</h2>{bars(wins, 'var(--o-s3)')}</div>
        <div className="ocard"><h2>Wins by team</h2>{bars(tWins, 'var(--o-s4)')}</div>
      </section>
      {decades.length > 1 && <section className="ocard">
        <h2>Does pole still matter?</h2>
        <p className="dek">Share of Grands Prix won from pole position, decade by decade.</p>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${decades.length}, 1fr)`, gap: 6, alignItems: 'end', height: 140 }}>
          {decades.map(dc => { const ws = H.winners.filter(w => Math.floor(w.year / 10) * 10 === dc), p = ws.filter(w => w.grid === 1).length / (ws.length || 1); return <div key={dc} style={{ textAlign: 'center', fontSize: 11 }}><div style={{ height: p * 110, background: 'var(--o-s1)', borderRadius: '3px 3px 0 0' }} title={`${ws.length} races`} /><b>{Math.round(p * 100)}%</b><div style={{ color: 'var(--o-ink3)' }}>{dc}s</div></div>; })}
        </div>
      </section>}
      <section className="ocard">
        <h2>Every champion</h2>
        <table className="otable" style={{ fontSize: 12 }}>
          <thead><tr><th>Year</th><th>Driver</th><th>Team</th><th className="n">Points</th><th className="n">Wins</th><th>Constructors' champion</th></tr></thead>
          <tbody>{[...H.champions].reverse().map(c => <tr key={c.year}><td>{c.year}</td><td>{c.driver} <small style={{ color: 'var(--o-ink3)' }}>{c.nation}</small></td><td>{c.team}</td><td className="n">{c.points}</td><td className="n">{c.wins}</td><td>{c.constructor ?? '–'}</td></tr>)}</tbody>
        </table>
        <Src>Source: Jolpica (the Ergast archive)</Src>
      </section>
    </>
  );
}

/* ───────────────────────────── How it works ───────────────────────────── */

export function HowScreen({ d }: { d: F1SeasonFile }) {
  const P = ({ children }: { children: ReactNode }) => <p style={{ margin: '0 0 10px', lineHeight: 1.55, fontSize: 14 }}>{children}</p>;
  const rounds = d.meetings.filter(m => !m.cancelled);
  const sprints = rounds.filter(m => m.sprint).length;
  const pts = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  return (
    <>
      <section className="ocard">
        <h2>The {d.year} season</h2>
        <P><b>{rounds.length} Grands Prix</b>{d.meetings.length > rounds.length ? ` (${d.meetings.length - rounds.length} cancelled)` : ''}, {sprints} of them with a sprint, from {fmt(Date.parse(rounds[0].race), { day: 'numeric', month: 'long' })} to {fmt(Date.parse(rounds.at(-1)!.race), { day: 'numeric', month: 'long' })}. Eleven teams, 22 drivers.</P>
        <div className="lab">Points, Grand Prix</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 4, maxWidth: 560, marginBottom: 10 }}>{pts.map((p, i) => <div key={i} style={{ textAlign: 'center', fontSize: 11 }}><div style={{ height: p * 3, background: i < 3 ? ['#d4af37', '#a8a9ad', '#b0764a'][i] : 'var(--o-s1)', borderRadius: '3px 3px 0 0' }} /><b>{p}</b><div style={{ color: 'var(--o-ink3)' }}>P{i + 1}</div></div>)}</div>
        <P>Sprints pay 8, 7, 6, 5, 4, 3, 2, 1 to the top eight. There is no point for the fastest lap any more (dropped in 2025).</P>
      </section>
      <section className="s-two">
        <div className="ocard">
          <h2>A race weekend</h2>
          <P><b>Normal weekend:</b> three practice sessions, qualifying on Saturday, the Grand Prix on Sunday.</P>
          <P><b>Qualifying</b> is a knockout in three parts: Q1 (all cars, the slowest six are out), Q2 (the slowest six of the rest are out), Q3 (the top ten fight for pole). The order sets the grid.</P>
          <P><b>Sprint weekend:</b> one practice, sprint qualifying on Friday, the sprint (about 100 km, no mandatory stop) and Grand Prix qualifying on Saturday, the race on Sunday.</P>
          <P><b>Tyres:</b> Pirelli brings three dry compounds per race, labelled soft (red), medium (yellow) and hard (white). In a dry race each driver must use at least two of them, so everyone stops at least once.</P>
        </div>
        <div className="ocard">
          <h2>The 2026 rules</h2>
          <P><b>New engines:</b> roughly half the power now comes from the electric motor (350 kW), the MGU-H is gone and the fuel is fully sustainable. Audi joined as a works team, Ford with Red Bull, Honda with Aston Martin; Cadillac is the eleventh team.</P>
          <P><b>Active aerodynamics:</b> front and rear wings move. A low-drag setting on the straights and a high-downforce one in the corners replace DRS.</P>
          <P><b>Overtaking aid:</b> a driver within a second of the car ahead can use extra electrical energy (the manual override).</P>
          <P><b>Smaller, lighter cars:</b> 20 cm shorter in wheelbase, 10 cm narrower and about 30 kg lighter than in 2025.</P>
        </div>
      </section>
      <section className="ocard">
        <h2>Reading the numbers in this section</h2>
        <div className="s-two" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <P><b>Qualifying pace:</b> each team's best lap against pole, in percent. It is the purest measure of a car: low fuel, new tyres, maximum attack.</P>
            <P><b>Race pace:</b> the median lap of a team's faster car, using only clean laps (no first lap, pit laps, safety-car laps or laps 7% off the fastest), against the fastest team.</P>
            <P><b>Sectors:</b> the lap is split in three timed parts; the best sector times per team show where a car gains, corner type by corner type.</P>
          </div>
          <div>
            <P><b>Tyre wear:</b> how many seconds a lap a team loses as its tyres age within a stint, after correcting for the car getting lighter as fuel burns (about 0.055 s a lap).</P>
            <P><b>Pit stop:</b> the median time the car stands still; the whole pit lane costs about 20–25 seconds more.</P>
            <P><b>Starts and race craft:</b> places gained on the first lap and from the grid (qualifying position) to the flag.</P>
          </div>
        </div>
      </section>
    </>
  );
}
