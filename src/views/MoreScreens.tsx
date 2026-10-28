// More Sports screens beyond the home: MotoGP in depth (every classification, riders and
// manufacturers), Formula 2 and 3, the WRC by surface, Indianapolis and Daytona, the
// Vendée Globe. Data: more.json (the more collector) and more-season.json + motogp-events/.
import { useEffect, useState, type ReactNode } from 'react';
import { PercentileGrid, QuadrantScatter, type GridCol } from '../components/power';
import { Chips, usePick } from '../components/tabs';
import { getJSON } from '../core/fetcher';
import { dayLong, dayShort, fmt } from '../core/time';
import type { MoreData } from '../sources/more';

export const MORE_TABS = [['now', 'Now'], ['motogp', 'MotoGP'], ['feeder', 'F2 & F3'], ['wrc', 'WRC'], ['classics', 'Indy & Daytona'], ['vendee', 'Vendée Globe']] as const;
export type MoreTab = typeof MORE_TABS[number][0];

interface MgpRow { pos: number | null; rider: string; number: number | null; nation: string; team: string; make: string; laps: number | null; time: string | null; gap: string | null; speed: number | null; points: number; status: string | null; grid?: number }
interface MgpEvent { id: string; round: number; name: string; circuit: string; country: string; date: string; grid: MgpRow[]; sprint: MgpRow[]; race: MgpRow[] }
export interface MoreSeason {
  updated: string; year: number; rounds: { id: string; round: number; name: string; circuit: string; country: string; date: string }[];
  riders: { rider: string; number: number | null; nation: string; team: string; make: string; grid: number | null; race: number | null; sprint: number | null; gained: number | null; racePts: number; sprintPts: number; dnf: number; starts: number; wins: number; podiums: number }[];
  makes: { make: string; pts: Record<string, number>; best: Record<string, number>; bestSprint: Record<string, number>; total: number; wins: number; avgBest: number | null }[];
}
export function useMoreSeason(enabled = true) {
  const [d, setD] = useState<MoreSeason | null>(null);
  useEffect(() => { if (!enabled) return; let on = true; getJSON<MoreSeason>(`${import.meta.env.BASE_URL}data/more-season.json`, 15 * 60e3).then(x => on && setD(x)).catch(() => {}); return () => { on = false; }; }, [enabled]);
  return d;
}

const Src = ({ children }: { children: ReactNode }) => <div className="osrc">{children}</div>;
const MAKE: Record<string, string> = { Ducati: '#cc0000', Aprilia: '#41bfaa', KTM: '#ff6600', Honda: '#1c3f94', Yamaha: '#0a2d8c' };
const makeInk = (m: string) => MAKE[m] ?? 'var(--o-other)';
const shortCountry = (c: string) => ({ 'United Kingdom of Great Britain and Northern Ireland': 'UK', 'United States of America': 'USA' } as Record<string, string>)[c] ?? c;
const title = (s: string) => s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).replace(/\bOf\b/g, 'of');

/* ───────────────────────────── MotoGP ───────────────────────────── */

export function MotoGPScreen({ s, more }: { s: MoreSeason; more: MoreData }) {
  const [pick, setPick] = usePick('round');
  const r = s.rounds.find(x => String(x.round) === pick) ?? s.rounds.at(-1);
  const [ev, setEv] = useState<MgpEvent | null>(null);
  const [kind, setKind] = useState<'race' | 'sprint' | 'grid'>('race');
  useEffect(() => { if (!r) return; let on = true; setEv(null); fetch(`${import.meta.env.BASE_URL}data/motogp-events/${s.year}/${r.id}.json`).then(x => x.json()).then(x => on && setEv(x)).catch(() => {}); return () => { on = false; }; }, [s.year, r]);
  const rounds = s.rounds.map(x => String(x.round));
  const makeRows = s.makes.map(m => ({ id: m.make, label: <><span style={{ display: 'inline-block', width: 4, height: 12, background: makeInk(m.make), marginRight: 6, verticalAlign: -1 }} />{m.make}</>, values: { ...Object.fromEntries(rounds.map(k => [`b${k}`, m.best[k] ?? null])), total: m.total, wins: m.wins, avgBest: m.avgBest } }));
  const cols: GridCol[] = [{ key: 'total', label: 'Points', group: 'Season', fmt: v => String(v) }, { key: 'wins', label: 'Wins', group: 'Season', fmt: v => String(v) }, { key: 'avgBest', label: 'Avg best', group: 'Season', fmt: v => v.toFixed(1), low: true }, ...rounds.map(k => ({ key: `b${k}`, label: k, group: 'Best finish, round by round', fmt: (v: number) => String(v), low: true }))];
  const list = ev ? (kind === 'race' ? ev.race : kind === 'sprint' ? ev.sprint : ev.grid.map(g => ({ ...g, pos: g.grid ?? g.pos }))) : [];
  const riders = s.riders.filter(x => x.starts >= 5);
  return (
    <>
      <section className="ocard">
        <h2>The {s.year} MotoGP season, round by round</h2>
        <Chips label="Round" items={s.rounds.map(x => ({ k: String(x.round), label: `${x.round} ${shortCountry(x.country)}` }))} value={String(r?.round ?? '')} set={setPick} />
        <Chips label="Session" items={[{ k: 'race', label: 'Grand Prix' }, { k: 'sprint', label: 'Sprint' }, { k: 'grid', label: 'Grid (qualifying)' }]} value={kind} set={setKind} />
        {!ev ? <p className="dek">{r ? 'Loading…' : 'No round yet.'}</p> : <>
          <p className="dek">{title(ev.name)} · {ev.circuit} · {dayLong(Date.parse(`${ev.date}T12:00:00Z`))}</p>
          <table className="otable" style={{ fontSize: 12.5 }}>
            <thead><tr><th className="n">Pos</th><th>Rider</th><th>Team</th><th>Bike</th>{kind !== 'grid' && <th className="n">Laps</th>}<th className="n">{kind === 'grid' ? 'Best lap' : 'Time / gap'}</th>{kind !== 'grid' && <th className="n">Avg km/h</th>}{kind !== 'grid' && <th className="n">Pts</th>}</tr></thead>
            <tbody>{list.map((x, i) => <tr key={x.rider + i}><td className="n">{x.pos ?? (x.status === 'OUTSTND' ? '–' : 'R')}</td><td><b>{x.number}</b> {x.rider} <small style={{ color: 'var(--o-ink3)' }}>{x.nation}</small></td><td>{x.team}</td><td><span style={{ display: 'inline-block', width: 4, height: 12, background: makeInk(x.make), marginRight: 5, verticalAlign: -1 }} />{x.make}</td>{kind !== 'grid' && <td className="n">{x.laps}</td>}<td className="n">{kind === 'grid' ? x.time : x.pos === 1 ? x.time : x.gap && x.gap !== '0.000' ? `+${x.gap}` : ''}</td>{kind !== 'grid' && <td className="n">{x.speed}</td>}{kind !== 'grid' && <td className="n">{x.points || ''}</td>}</tr>)}</tbody>
          </table>
        </>}
        <Src>Source: MotoGP results API</Src>
      </section>
      <section className="ocard">
        <h2>The manufacturers</h2>
        <p className="dek">Points of all of each make's riders (sprints included), wins, and the best finish of its bikes in every Grand Prix. Blue among the best.</p>
        <PercentileGrid rows={makeRows} cols={cols} initial="total" />
      </section>
      <section className="s-two">
        <div className="ocard">
          <h2>Saturday against Sunday</h2>
          <p className="dek">Average finish in sprints against average finish in Grands Prix (riders with five starts or more). Top right are fast in both.</p>
          <QuadrantScatter height={380} invertY xLabel="Sprint (better →)" yLabel="Grand Prix (better ↑)" fmt={v => Math.abs(v).toFixed(0)} corners={['Strong in both', 'Grand Prix rider', 'Sprint rider', 'Back of the field']}
            points={riders.filter(x => x.sprint && x.race).map(x => ({ id: x.rider, label: x.rider.split(' ').slice(-1)[0], x: -x.sprint!, y: x.race!, color: makeInk(x.make), tip: <><div className="k">{x.rider} · {x.make}</div>Sprint avg {x.sprint} · GP avg {x.race} · grid avg {x.grid} · {x.racePts + x.sprintPts} pts</> }))} />
        </div>
        <div className="ocard">
          <h2>Qualifying against race craft</h2>
          <p className="dek">Average grid position against places gained from the grid to the flag in Grands Prix. Right qualifies well, up gains places on Sunday.</p>
          <QuadrantScatter height={380} xLabel="Grid (better →)" yLabel="Places gained" fmt={v => v.toFixed(1)} fmtX={v => Math.abs(v).toFixed(0)} corners={['Fast and racy', 'Comes through the field', 'Fades', 'Struggling']}
            points={riders.filter(x => x.grid && x.gained != null).map(x => ({ id: x.rider, label: x.rider.split(' ').slice(-1)[0], x: -x.grid!, y: x.gained!, color: makeInk(x.make), tip: <><div className="k">{x.rider}</div>Grid avg {x.grid} · gained {x.gained} · {x.dnf} retirements</> }))} />
        </div>
      </section>
      <section className="ocard">
        <h2>The riders</h2>
        <table className="otable" style={{ fontSize: 12.5 }}>
          <thead><tr><th>#</th><th>Rider</th><th>Bike</th><th className="n">Points</th><th className="n">GP</th><th className="n">Sprint</th><th className="n">Wins</th><th className="n">Podiums</th><th className="n">Avg grid</th><th className="n">Avg finish</th><th className="n">Retired</th></tr></thead>
          <tbody>{s.riders.slice(0, 25).map((x, i) => <tr key={x.rider}><td>{i + 1}</td><td>{x.rider} <small style={{ color: 'var(--o-ink3)' }}>{x.nation}</small></td><td><span style={{ display: 'inline-block', width: 4, height: 12, background: makeInk(x.make), marginRight: 5, verticalAlign: -1 }} />{x.make}</td><td className="n"><b>{x.racePts + x.sprintPts}</b></td><td className="n">{x.racePts}</td><td className="n">{x.sprintPts}</td><td className="n">{x.wins}</td><td className="n">{x.podiums}</td><td className="n">{x.grid}</td><td className="n">{x.race}</td><td className="n">{x.dnf}</td></tr>)}</tbody>
        </table>
        <p className="dek" style={{ fontSize: 11.5 }}>Computed from the classifications; the official standings (with any penalty) are on the home screen.{more.motogp?.moto2?.[0] ? ` Moto2 leader: ${more.motogp.moto2[0].name}; Moto3: ${more.motogp.moto3[0]?.name}.` : ''}</p>
      </section>
    </>
  );
}

/* ───────────────────────────── F2 & F3 ───────────────────────────── */

export function FeederScreen({ more }: { more: MoreData }) {
  const [series, setSeries] = useState<'f2' | 'f3'>('f2');
  const f = more[series];
  if (!f) return <section className="ocard"><p className="dek">No data.</p></section>;
  const split = f.drivers.map(d => { let sr = 0, fr = 0; d.perRace.forEach((p, i) => { if (p == null) return; if (f.races[i] === 'SR') sr += p; else fr += p; }); return { ...d, sr, fr }; });
  return (
    <>
      <section className="ocard">
        <h2>{series === 'f2' ? 'Formula 2' : 'Formula 3'}, {f.season}</h2>
        <Chips label="Series" items={[{ k: 'f2', label: 'Formula 2' }, { k: 'f3', label: 'Formula 3' }]} value={series} set={setSeries} />
        <p className="dek">Each weekend has a short sprint race (SR, with the top of the qualifying order reversed: ten in F2, twelve in F3) and a longer feature race (FR, from pole, with a pit stop). Who scores where: sprint points against feature points.</p>
        <QuadrantScatter height={380} xLabel="Feature race points" yLabel="Sprint race points" fmt={v => v.toFixed(0)} corners={['Strong in both', 'Sprint specialist', 'Feature specialist', '']}
          points={split.filter(d => d.points > 0).map(d => ({ id: d.name, label: d.pos <= 10 ? d.name : '', x: d.fr, y: d.sr, color: d.pos <= 3 ? 'var(--o-s1)' : undefined, tip: <><div className="k">{d.name}</div>{d.points} pts: {d.fr} in features, {d.sr} in sprints</> }))} />
      </section>
      <section className="ocard">
        <h2>Race by race</h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="otable" style={{ fontSize: 11 }}>
            <thead><tr><th>Driver</th><th className="n">Pts</th>{f.races.map((k, i) => <th key={i} className="n" style={{ color: k === 'FR' ? 'var(--o-ink)' : 'var(--o-ink3)' }}>{k}</th>)}</tr></thead>
            <tbody>{f.drivers.slice(0, 22).map(d => <tr key={d.name}><td style={{ whiteSpace: 'nowrap' }}>{d.pos}. {d.name}</td><td className="n"><b>{d.points}</b></td>{d.perRace.map((p, i) => <td key={i} className="n" style={{ background: p ? `color-mix(in srgb, var(--o-s1) ${Math.round(Math.min(1, p / 25) * 70 + 8)}%, var(--o-card))` : undefined, color: p && p >= 18 ? '#fff' : 'var(--o-ink2)', padding: '4px 2px' }}>{p ?? ''}</td>)}</tr>)}</tbody>
          </table>
        </div>
        <Src>Source: official F2/F3 sites</Src>
      </section>
    </>
  );
}

/* ───────────────────────────── WRC ───────────────────────────── */

export function WrcScreen({ more }: { more: MoreData }) {
  const w = more.wrc;
  if (!w) return <section className="ocard"><p className="dek">No data.</p></section>;
  const surfaces = [...new Set(w.rounds.map(r => r.surface))];
  const winners = [...new Set(w.rounds.filter(r => r.winner).map(r => r.winner!.driver))];
  const count = (d: string, s: string) => w.rounds.filter(r => r.surface === s && r.winner?.driver === d).length;
  const teams = Object.entries(w.rounds.filter(r => r.winner).reduce<Record<string, number>>((a, r) => { a[r.winner!.team] = (a[r.winner!.team] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <section className="ocard">
        <h2>Who wins where</h2>
        <p className="dek">Rally wins this season by surface: asphalt, gravel, snow and ice, mixed. Each surface rewards a different car set-up and a different kind of driver.</p>
        <table className="otable" style={{ fontSize: 12.5, maxWidth: 640 }}>
          <thead><tr><th>Driver</th>{surfaces.map(s => <th key={s} className="n">{s}</th>)}<th className="n">Total</th></tr></thead>
          <tbody>{winners.map(d => <tr key={d}><td>{d}</td>{surfaces.map(s => { const n = count(d, s); return <td key={s} className="n" style={{ background: n ? `color-mix(in srgb, var(--o-s1) ${n * 25 + 15}%, var(--o-card))` : undefined }}>{n || ''}</td>; })}<td className="n"><b>{w.rounds.filter(r => r.winner?.driver === d).length}</b></td></tr>)}</tbody>
        </table>
        <div className="lab" style={{ marginTop: 12 }}>Wins by team</div>
        {teams.map(([t, n]) => <div key={t} style={{ fontSize: 12.5 }}>{t} <b>{n}</b></div>)}
      </section>
      <section className="s-two">
        <div className="ocard">
          <h2>The calendar</h2>
          <table className="otable" style={{ fontSize: 12.5 }}><tbody>{w.rounds.map(r => <tr key={r.round}><td>{r.round}</td><td>{dayShort(Date.parse(r.start))}</td><td>{r.name}</td><td style={{ color: 'var(--o-ink3)' }}>{r.surface}</td><td>{r.winner ? <b>{r.winner.driver}</b> : ''}</td></tr>)}</tbody></table>
        </div>
        <div className="ocard">
          <h2>Drivers' championship</h2>
          {w.drivers.map(d => <div key={d.name} style={{ display: 'grid', gridTemplateColumns: '18px 1fr 1fr 40px', gap: 8, alignItems: 'center', fontSize: 12.5, margin: '3px 0' }}><span style={{ color: 'var(--o-ink3)' }}>{d.pos}</span><span>{d.name} <small style={{ color: 'var(--o-ink3)' }}>{d.nation}</small></span><span style={{ height: 9, width: `${(d.points / (w.drivers[0]?.points || 1)) * 100}%`, background: 'var(--o-s1)', borderRadius: 2 }} /><b>{d.points}</b></div>)}
          <Src>Source: Wikipedia</Src>
        </div>
      </section>
    </>
  );
}

/* ───────────────────────────── Indy & Daytona ───────────────────────────── */

export function ClassicsScreen({ more }: { more: MoreData }) {
  return (
    <div className="s-two" style={{ gridTemplateColumns: '1fr 1fr' }}>
      {more.classics.map(c => {
        const nations = Object.entries(c.past.reduce<Record<string, number>>((a, p) => { const n = p.podium[0]?.nation || '–'; a[n] = (a[n] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
        return (
          <section key={c.id} className="ocard">
            <h2>{c.name}</h2>
            <p className="dek">{c.place}. Next: {dayLong(Date.parse(c.next.start))}{c.next.tbc ? ' (TBC)' : ''}. {c.id === 'indy500' ? '200 laps of the 2.5-mile oval, 33 cars in rows of three: the biggest single-day sporting event in the world.' : '200 laps of the 2.5-mile superspeedway: NASCAR\'s season opener and its most prestigious race.'}</p>
            <table className="otable" style={{ fontSize: 12.5 }}><thead><tr><th>Year</th><th>Winner</th><th>Second</th><th>Third</th></tr></thead>
              <tbody>{c.past.map(p => <tr key={p.year}><td>{p.year}</td><td><b>{p.podium[0]?.name}</b> <small style={{ color: 'var(--o-ink3)' }}>{p.podium[0]?.nation}</small></td><td>{p.podium[1]?.name}</td><td>{p.podium[2]?.name}</td></tr>)}</tbody></table>
            {nations.length > 1 && <p className="dek" style={{ fontSize: 11.5, marginTop: 8 }}>Winners' nations in these years: {nations.map(([n, k]) => `${n} ${k}`).join(', ')}.</p>}
            <Src>Source: ESPN, Wikipedia</Src>
          </section>
        );
      })}
    </div>
  );
}

/* ───────────────────────────── Vendée Globe ───────────────────────────── */

export function VendeeScreen({ more }: { more: MoreData }) {
  const v = more.vendee;
  if (!v) return null;
  const ws = [...v.winners].filter(w => w.days).sort((a, b) => a.year - b.year);
  const max = Math.max(...ws.map(w => w.days!));
  const fmtDays = (d: number) => `${Math.floor(d)} d ${Math.round((d % 1) * 24)} h`;
  return (
    <>
      <section className="ocard">
        <h2>The Vendée Globe</h2>
        <p className="dek">Solo, non-stop and without assistance around the world: from Les Sables-d'Olonne down the Atlantic, round the three great capes (Good Hope, Leeuwin, Horn) and back, about 45,000 km. Every four years; next start {fmt(Date.parse(v.next.start), { day: 'numeric', month: 'long', year: 'numeric' })}{v.next.tbc ? ' (expected)' : ''}.</p>
        <div className="lab">Winning time, edition by edition</div>
        {ws.map(w => <div key={w.year} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 90px', gap: 8, alignItems: 'center', fontSize: 12.5, margin: '4px 0' }}><span>{w.edition}</span><span style={{ height: 12, width: `${(w.days! / max) * 100}%`, background: 'var(--o-s1)', borderRadius: 2 }} title={`${w.winner}, ${w.boat}`} /><b>{fmtDays(w.days!)}</b></div>)}
        <p className="dek" style={{ fontSize: 12 }}>From more than 109 days in 1989–90 to under 65 in 2024–25: foiling boats changed the race.</p>
      </section>
      <section className="ocard">
        <h2>Every winner</h2>
        <table className="otable" style={{ fontSize: 12.5 }}><tbody>{[...v.winners].map(w => <tr key={w.year}><td>{w.edition}</td><td><b>{w.winner}</b> <small style={{ color: 'var(--o-ink3)' }}>{w.nation}</small></td><td style={{ color: 'var(--o-ink2)' }}>{w.boat}</td><td className="n">{w.days ? fmtDays(w.days) : '–'}</td></tr>)}</tbody></table>
        <Src>Source: Wikipedia</Src>
      </section>
    </>
  );
}
