// FIA WEC screens beyond the home: every session of the season, the manufacturers'
// pace, the cars and crews, Le Mans history and the rules.
// Data: wec.json (calendar, standings), wec-season.json and wec-sessions/<year>/<id>.json.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PercentileGrid, QuadrantScatter, type GridCol } from '../components/power';
import { Chips, usePick } from '../components/tabs';
import { getJSON } from '../core/fetcher';
import { dayLong } from '../core/time';

export const WEC_TABS = [['now', 'Now'], ['season', 'Season'], ['power', 'Power'], ['cars', 'Cars & crews'], ['lemans', 'Le Mans'], ['how', 'How it works']] as const;
export type WecTab = typeof WEC_TABS[number][0];

export interface WecRow { pos: number | null; number: string; brand: string | null; team: string; laps: number | null; time: string | null; gap: string | null; avg: number | null; best: string | null; bestOn: number | null }
export interface WecSessionFile { id: string; round: number; race: string; name: string; cls: string | null; state: string | null; rows: WecRow[] }
export interface WecSeasonFile {
  updated: string; year: number;
  rounds: { round: number; slug: string; name: string; start: string; end: string; raceId: string; sessions: { id: string; name: string; cls: string | null; state: string | null }[] }[];
  cars: Record<string, { vehicle: string | null; cls: string | null; drivers: string[] } | null>;
  pace: Record<string, Record<string, number>>;
  leMans: { manufacturers: { name: string; nation: string | null; wins: number; years: number[] }[]; drivers: { name: string; nation: string | null; wins: number; years: number[] }[] } | null;
}
export function useWecSeason(enabled = true) {
  const [d, setD] = useState<WecSeasonFile | null>(null);
  useEffect(() => { if (!enabled) return; let on = true; getJSON<WecSeasonFile>(`${import.meta.env.BASE_URL}data/wec-season.json`, 15 * 60e3).then(x => on && setD(x)).catch(() => {}); return () => { on = false; }; }, [enabled]);
  return d;
}
function useSession(year: number, id: string | null) {
  const [s, setS] = useState<WecSessionFile | null>(null);
  useEffect(() => { if (!id) return; let on = true; setS(null); fetch(`${import.meta.env.BASE_URL}data/wec-sessions/${year}/${id}.json`).then(r => r.json()).then(x => on && setS(x)).catch(() => {}); return () => { on = false; }; }, [year, id]);
  return s;
}

const Src = ({ children }: { children: ReactNode }) => <div className="osrc">{children}</div>;
// Manufacturer colours (the cars' liveries, roughly)
const BRAND: Record<string, string> = { Toyota: '#eb0a1e', Ferrari: '#d40000', Porsche: '#8a8d8f', Cadillac: '#2b2b6b', Bmw: '#1c69d4', Alpine: '#0090ff', Peugeot: '#4a4a4a', 'Aston Martin': '#00665e', Lamborghini: '#c9a227', Genesis: '#a36b2c', Mclaren: '#ff8000', Corvette: '#f2c200', Ford: '#003478', Lexus: '#1a1a1a', Mercedes: '#00a19c', 'Mercedes-Amg': '#00a19c' };
export const brandInk = (b: string | null | undefined) => (b && BRAND[b]) || 'var(--o-other)';
const short = (n: string) => n.replace(/^(TotalEnergies|ROLEX|Bapco Energies)\s+/i, '').replace('6 Hours of ', '').replace('24 Hours of ', '');

/* ───────────────────────────── Season ───────────────────────────── */

export function SeasonScreen({ d }: { d: WecSeasonFile }) {
  const [pickR, setR] = usePick('round');
  const r = d.rounds.find(x => String(x.round) === pickR) ?? d.rounds.at(-1);
  const [pickS, setS] = useState<string | null>(null);
  const sid = r?.sessions.some(s => s.id === pickS) ? pickS : r?.sessions.find(s => /^race$/i.test(s.name))?.id ?? r?.sessions[0]?.id ?? null;
  const s = useSession(d.year, sid);
  if (!r) return <section className="ocard"><p className="dek">No round run yet.</p></section>;
  const race = /^race$/i.test(s?.name ?? '');
  const lead = s?.rows[0];
  return (
    <section className="ocard">
      <h2>The {d.year} season, session by session</h2>
      <p className="dek">Pick a round and a session. Hypercar classification from the official results; best lap and the lap it was set on.</p>
      <Chips label="Round" items={d.rounds.map(x => ({ k: String(x.round), label: `${x.round} ${short(x.name)}` }))} value={String(r.round)} set={k => { setR(k); setS(null); }} />
      <Chips label="Session" items={r.sessions.map(x => ({ k: x.id, label: x.name }))} value={sid ?? ''} set={setS} />
      {!s ? <p className="dek">Loading…</p> : <>
        <p className="dek">{r.name} · {dayLong(Date.parse(r.start))} · {s.cls ?? ''} {s.state ?? ''}</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="otable" style={{ fontSize: 12.5 }}>
            <thead><tr><th className="n">Pos</th><th className="n">#</th><th>Car</th><th>Team</th><th>Crew</th><th className="n">Laps</th>{race && <th className="n">Time</th>}<th className="n">Gap</th>{race && <th className="n">Avg km/h</th>}<th className="n">Best lap</th><th className="n">On lap</th></tr></thead>
            <tbody>{s.rows.map(x => { const c = d.cars[x.number]; return (
              <tr key={x.number}><td className="n">{x.pos ?? '–'}</td><td className="n"><span style={{ display: 'inline-block', width: 4, height: 12, background: brandInk(x.brand), marginRight: 5, verticalAlign: -1 }} />{x.number}</td><td style={{ whiteSpace: 'nowrap' }}>{c?.vehicle ?? x.brand}</td><td>{x.team}</td><td style={{ fontSize: 11.5, color: 'var(--o-ink2)' }}>{c?.drivers.join(', ')}</td><td className="n">{x.laps}</td>{race && <td className="n">{x === lead ? x.time : ''}</td>}<td className="n">{x === lead ? '' : x.gap}</td>{race && <td className="n">{x.avg}</td>}<td className="n">{x.best}</td><td className="n">{x.bestOn}</td></tr>
            ); })}</tbody>
          </table>
        </div>
      </>}
      <Src>Source: fiawec.com official results</Src>
    </section>
  );
}

/* ───────────────────────────── Power ───────────────────────────── */

export function PowerScreen({ d }: { d: WecSeasonFile }) {
  const brands = Object.keys(d.pace);
  const rounds = d.rounds;
  const avg = (b: string, k: string) => { const xs = rounds.map(r => d.pace[b]?.[`${k}${r.round}`]).filter((x): x is number => x != null); return xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : null; };
  const V = Object.fromEntries(brands.map(b => [b, { quali: avg(b, 'hyperpole') ?? avg(b, 'quali'), race: avg(b, 'race'), avgGap: avg(b, 'avg'), pos: avg(b, 'pos'), ...Object.fromEntries(rounds.flatMap(r => [[`q${r.round}`, d.pace[b]?.[`hyperpole${r.round}`] ?? d.pace[b]?.[`quali${r.round}`] ?? null], [`r${r.round}`, d.pace[b]?.[`race${r.round}`] ?? null], [`p${r.round}`, d.pace[b]?.[`pos${r.round}`] ?? null]])) }])) as Record<string, Record<string, number | null>>;
  const rows = brands.map(b => ({ id: b, label: <><span style={{ display: 'inline-block', width: 4, height: 12, background: brandInk(b), marginRight: 6, verticalAlign: -1 }} />{b}</>, values: V[b] }));
  const by = (k: string) => [...brands].filter(b => V[b][k] != null).sort((a, b) => (V[a][k] as number) - (V[b][k] as number));
  const roundCols = (p: string, label: string, fmt: (v: number) => string): GridCol[] => rounds.map(r => ({ key: `${p}${r.round}`, label: short(r.name).slice(0, 8), group: label, fmt, low: true }));
  return (
    <>
      <section className="ocard">
        <h2>Who has the fastest Hypercar</h2>
        <p className="dek">Over one lap (hyperpole) the quickest manufacturer on average has been <b>{by('quali')[0] ?? '–'}</b>; on the best race lap <b>{by('race')[0] ?? '–'}</b>; the best finisher on average <b>{by('pos')[0] ?? '–'}</b>. Gaps are in percent of a lap; the Balance of Performance (weight and power set by the organisers before each race) keeps them small on purpose.</p>
      </section>
      {brands.length > 1 && <section className="ocard">
        <h2>One lap against the race</h2>
        <p className="dek">Average gap to the fastest car in hyperpole against the gap of the manufacturer's best race lap. Top right are fast in both.</p>
        <QuadrantScatter height={380} invertY xLabel="Hyperpole gap (closer →)" yLabel="Race best-lap gap (closer ↑)" fmt={v => `${Math.abs(v).toFixed(1)}%`} corners={['Fast everywhere', 'Race pace', 'One-lap pace', 'Off the pace']}
          points={brands.filter(b => V[b].quali != null && V[b].race != null).map(b => ({ id: b, label: b, x: -(V[b].quali as number), y: V[b].race as number, color: brandInk(b), tip: <><div className="k">{b}</div>Hyperpole +{(V[b].quali as number).toFixed(2)}% · race best lap +{(V[b].race as number).toFixed(2)}% · average best finish {(V[b].pos as number)?.toFixed(1)}</> }))} />
      </section>}
      <section className="ocard">
        <h2>Round by round</h2>
        <p className="dek">Gap of each manufacturer's best car to the fastest, in percent: hyperpole, best race lap, and the best finishing position.</p>
        <PercentileGrid rows={rows} cols={roundCols('q', 'Hyperpole gap %', v => v.toFixed(2))} />
        <div style={{ height: 14 }} />
        <PercentileGrid rows={rows} cols={roundCols('r', 'Best race lap gap %', v => v.toFixed(2))} />
        <div style={{ height: 14 }} />
        <PercentileGrid rows={rows} cols={roundCols('p', 'Best finish', v => `P${v}`)} />
        <Src>Computed from fiawec.com results</Src>
      </section>
    </>
  );
}

/* ───────────────────────────── Cars ───────────────────────────── */

export function CarsScreen({ d }: { d: WecSeasonFile }) {
  const [cls, setCls] = useState('Hypercar');
  const list = Object.entries(d.cars).filter(([, c]) => c && (c.cls ?? '').toLowerCase() === cls.toLowerCase()).sort((a, b) => Number(a[0]) - Number(b[0]));
  const byModel = useMemo(() => { const m = new Map<string, [string, NonNullable<WecSeasonFile['cars'][string]>][]>(); for (const [n, c] of list) { const k = c!.vehicle ?? '–'; m.set(k, [...(m.get(k) ?? []), [n, c!]]); } return [...m.entries()]; }, [list]);
  return (
    <section className="ocard">
      <h2>The cars and their crews</h2>
      <Chips label="Class" items={['Hypercar', 'LMGT3'].map(k => ({ k, label: k }))} value={cls} set={setCls} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {byModel.map(([model, cars]) => (
          <div key={model} style={{ borderTop: `3px solid ${brandInk(model.split(' ')[0])}`, paddingTop: 6 }}>
            <b>{model}</b>
            {cars.map(([n, c]) => <div key={n} style={{ fontSize: 12.5, margin: '4px 0' }}><b>#{n}</b> <span style={{ color: 'var(--o-ink2)' }}>{c.drivers.join(' · ')}</span></div>)}
          </div>
        ))}
      </div>
      {!list.length && <p className="dek">No cars of this class on record yet.</p>}
      <Src>Source: fiawec.com car pages</Src>
    </section>
  );
}

/* ───────────────────────────── Le Mans ───────────────────────────── */

export function LeMansScreen({ d }: { d: WecSeasonFile }) {
  const lm = d.leMans;
  if (!lm) return <section className="ocard"><p className="dek">Le Mans history not available.</p></section>;
  const byYear = new Map<number, string>();
  for (const m of lm.manufacturers) for (const y of m.years) byYear.set(y, m.name);
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const top = lm.manufacturers.slice(0, 8).map(m => m.name);
  const colour = (n: string) => BRAND[n] ?? ['var(--o-s1)', 'var(--o-s2)', 'var(--o-s3)', 'var(--o-s4)', 'var(--oc-tech)', 'var(--oc-cul)', 'var(--o-ink2)', 'var(--o-rep)'][top.indexOf(n)] ?? 'var(--o-other)';
  const max = lm.manufacturers[0]?.wins ?? 1;
  return (
    <>
      <section className="ocard">
        <h2>A century of the 24 Hours</h2>
        <p className="dek">The winning manufacturer of every edition since 1923: the eras of Bentley, Ferrari, Ford, Porsche, Audi and Toyota at a glance.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {years.map(y => <div key={y} title={`${y}: ${byYear.get(y)}`} style={{ width: 22, height: 22, background: colour(byYear.get(y)!), color: '#fff', fontSize: 8, display: 'grid', placeItems: 'center', borderRadius: 2 }}>{String(y).slice(2)}</div>)}
        </div>
        <div className="olegend" style={{ marginTop: 8 }}>{top.map(n => <span key={n}><i style={{ background: colour(n) }} />{n}</span>)}<span><i style={{ background: 'var(--o-other)' }} />Others</span></div>
        <Src>Source: Wikipedia, List of 24 Hours of Le Mans winners</Src>
      </section>
      <section className="s-two">
        <div className="ocard">
          <h2>Wins by manufacturer</h2>
          {lm.manufacturers.slice(0, 16).map(m => <div key={m.name} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 28px', gap: 8, alignItems: 'center', fontSize: 12.5, margin: '3px 0' }}><span>{m.name}</span><span style={{ height: 10, width: `${(m.wins / max) * 100}%`, background: colour(m.name), borderRadius: 2 }} /><b>{m.wins}</b></div>)}
        </div>
        <div className="ocard">
          <h2>The most successful drivers</h2>
          <table className="otable" style={{ fontSize: 12.5 }}><tbody>{lm.drivers.slice(0, 15).map(x => <tr key={x.name}><td>{x.name} <small style={{ color: 'var(--o-ink3)' }}>{x.nation}</small></td><td className="n"><b>{x.wins}</b></td><td style={{ color: 'var(--o-ink3)', fontSize: 11 }}>{x.years.join(', ')}</td></tr>)}</tbody></table>
        </div>
      </section>
    </>
  );
}

/* ───────────────────────────── How it works ───────────────────────────── */

export function HowScreen() {
  const P = ({ children }: { children: ReactNode }) => <p style={{ margin: '0 0 10px', lineHeight: 1.55, fontSize: 14 }}>{children}</p>;
  return (
    <section className="s-two">
      <div className="ocard">
        <h2>The championship</h2>
        <P><b>Two classes</b> race together: <b>Hypercar</b>, the prototypes of the manufacturers (Toyota, Ferrari, Porsche, Cadillac, BMW, Alpine, Peugeot, Aston Martin…), and <b>LMGT3</b>, cars based on road GTs with professional and amateur drivers. Each car has a crew of two or three drivers who take turns.</P>
        <P><b>Races</b> last six hours or more (1,812 km in Qatar, eight hours in Bahrain); the 24 Hours of Le Mans is worth double points. The winner is the car that covers the most distance.</P>
        <P><b>Qualifying</b> is in two steps: a first session, then the ten fastest of each class go to the <b>Hyperpole</b> for the front of the grid.</P>
      </div>
      <div className="ocard">
        <h2>Balance of Performance</h2>
        <P>The Hypercars are built to different concepts (hybrid or not, different engines), so before each race the organisers set each model's weight and power, the <b>BoP</b>, to keep them within a few tenths of each other. A car that wins a lot can be slowed down at the next race.</P>
        <P>That is why the gaps in the Power screen are small and change from race to race: they measure the cars as balanced, plus the teams and drivers.</P>
      </div>
    </section>
  );
}
