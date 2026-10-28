// Dakar screens beyond the home: the last edition's final classification, the
// manufacturers, the 2027 route stage by stage, the history and the rules.
// Data: dakar.json (route, rankings) and dakar-season.json (winners since 1979).
import { useEffect, useState, type ReactNode } from 'react';
import { Chips } from '../components/tabs';
import { getJSON } from '../core/fetcher';
import { dayShort } from '../core/time';
import type { DakarData } from '../sources/dakar';

export const DAKAR_TABS = [['now', 'Now'], ['results', 'Last edition'], ['power', 'Manufacturers'], ['route', 'Route 2027'], ['history', 'History'], ['how', 'How it works']] as const;
export type DakarTab = typeof DAKAR_TABS[number][0];

interface Winner { name: string | null; nation: string | null; make: string | null }
export interface DakarSeason { updated: string; winners: { year: number; cancelled?: boolean; route?: string; car?: Winner; bike?: Winner; truck?: Winner | null }[] }
export function useDakarSeason(enabled = true) {
  const [d, setD] = useState<DakarSeason | null>(null);
  useEffect(() => { if (!enabled) return; let on = true; getJSON<DakarSeason>(`${import.meta.env.BASE_URL}data/dakar-season.json`, 60 * 60e3).then(x => on && setD(x)).catch(() => {}); return () => { on = false; }; }, [enabled]);
  return d;
}

const Src = ({ children }: { children: ReactNode }) => <div className="osrc">{children}</div>;
const MAKES: Record<string, string> = { Toyota: '#eb0a1e', Dacia: '#646b52', Ford: '#003478', Mini: '#111', Peugeot: '#1c3f94', Mitsubishi: '#d0021b', Volkswagen: '#00b0f0', Audi: '#bb0a30', Citroën: '#a50034', KTM: '#ff6600', Honda: '#cc0000', Yamaha: '#0a2d8c', BMW: '#1c69d4', Hero: '#e2231a', Husqvarna: '#002550', 'Gas Gas': '#c8102e', Kamaz: '#1e5aa8', Iveco: '#0b3b8c', Tatra: '#b8860b' };
const ink = (m: string | null | undefined) => (m && MAKES[m]) || 'var(--o-other)';
/** The make from the team name in the official classification ("RED BULL KTM FACTORY RACING" → KTM). */
const makeOfTeam = (t: string) => Object.keys(MAKES).find(m => t.toUpperCase().includes(m.toUpperCase())) ?? (/\bX-RAID\b/i.test(t) ? 'Mini' : /SANDRIDER/i.test(t) ? 'Dacia' : /HILUX|GAZOO/i.test(t) ? 'Toyota' : /RAPTOR/i.test(t) ? 'Ford' : t.split(' ')[0]);

export function ResultsScreen({ dk }: { dk: DakarData }) {
  const r = dk.rankings;
  const cats = r ? Object.keys(r.general) : [];
  const [cat, setCat] = useState(cats.includes('Cars') ? 'Cars' : cats[0] ?? '');
  if (!r) return <section className="ocard"><p className="dek">No classification available.</p></section>;
  const g = r.general[cat] ?? [], st = r.stageRanking[cat] ?? [];
  return (
    <>
      <section className="ocard">
        <h2>Dakar {r.edition}: the final classification</h2>
        <Chips label="Category" items={cats.map(c => ({ k: c, label: c }))} value={cat} set={setCat} />
        <p className="dek">After {r.stage} stages. Time is the total of every special stage plus penalties; the gap is to the winner.</p>
        <table className="otable" style={{ fontSize: 12.5 }}>
          <thead><tr><th className="n">Pos</th><th className="n">Bib</th><th>Crew</th><th>Team</th><th className="n">Time</th><th className="n">Gap</th><th className="n">Penalty</th></tr></thead>
          <tbody>{g.map(x => <tr key={x.bib}><td className="n">{x.pos}</td><td className="n">{x.bib}</td><td>{x.crew.join(' / ')} <small style={{ color: 'var(--o-ink3)' }}>{x.nation}</small></td><td><span style={{ display: 'inline-block', width: 4, height: 12, background: ink(makeOfTeam(x.team)), marginRight: 5, verticalAlign: -1 }} />{x.team}</td><td className="n">{x.time}</td><td className="n">{x.gap}</td><td className="n">{x.penalty}</td></tr>)}</tbody>
        </table>
        {st.length > 0 && <><div className="lab" style={{ marginTop: 14 }}>Last stage ({r.stage})</div>
          <table className="otable" style={{ fontSize: 12.5 }}><tbody>{st.slice(0, 5).map(x => <tr key={x.bib}><td className="n">{x.pos}</td><td>{x.crew.join(' / ')}</td><td>{x.team}</td><td className="n">{x.time}</td><td className="n">{x.gap}</td></tr>)}</tbody></table></>}
        <Src>Source: dakar.com official rankings</Src>
      </section>
    </>
  );
}

export function PowerScreen({ dk, s }: { dk: DakarData; s: DakarSeason }) {
  const r = dk.rankings;
  const [cat, setCat] = useState<'car' | 'bike' | 'truck'>('car');
  const label = { car: 'Cars', bike: 'Bikes', truck: 'Trucks' } as const;
  const top = r?.general[label[cat]] ?? [];
  const byMake = Object.entries(top.reduce<Record<string, number[]>>((a, x) => { const m = makeOfTeam(x.team); (a[m] ??= []).push(x.pos); return a; }, {})).sort((a, b) => Math.min(...a[1]) - Math.min(...b[1]));
  const w = s.winners.filter(x => !x.cancelled && x[cat]?.make);
  const wins = Object.entries(w.reduce<Record<string, number>>((a, x) => { const m = x[cat]!.make!; a[m] = (a[m] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const recent = w.filter(x => x.year >= 2016);
  const recentWins = Object.entries(recent.reduce<Record<string, number>>((a, x) => { const m = x[cat]!.make!; a[m] = (a[m] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <section className="ocard">
        <h2>The manufacturers</h2>
        <Chips label="Category" items={(['car', 'bike', 'truck'] as const).map(k => ({ k, label: label[k] }))} value={cat} set={setCat} />
        {top.length > 0 && <><p className="dek">Who placed where in the top ten of the last edition ({r?.edition}).</p>
          {byMake.map(([m, ps]) => <div key={m} style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8, alignItems: 'center', fontSize: 12.5, margin: '4px 0' }}><span>{m}</span><span style={{ display: 'flex', gap: 3 }}>{Array.from({ length: 10 }, (_, i) => <span key={i} style={{ width: 22, height: 18, borderRadius: 3, background: ps.includes(i + 1) ? ink(m) : 'var(--o-grid)', color: '#fff', fontSize: 10, display: 'grid', placeItems: 'center' }}>{ps.includes(i + 1) ? i + 1 : ''}</span>)}</span></div>)}</>}
        <div className="s-two" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 12 }}>
          <div><div className="lab">Wins since 1979</div>{wins.map(([m, n]) => <div key={m} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 24px', gap: 8, alignItems: 'center', fontSize: 12.5, margin: '3px 0' }}><span>{m}</span><span style={{ height: 10, width: `${(n / wins[0][1]) * 100}%`, background: ink(m), borderRadius: 2 }} /><b>{n}</b></div>)}</div>
          <div><div className="lab">Wins in the last ten editions</div>{recentWins.map(([m, n]) => <div key={m} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 24px', gap: 8, alignItems: 'center', fontSize: 12.5, margin: '3px 0' }}><span>{m}</span><span style={{ height: 10, width: `${(n / recentWins[0][1]) * 100}%`, background: ink(m), borderRadius: 2 }} /><b>{n}</b></div>)}</div>
        </div>
        <div className="lab" style={{ marginTop: 12 }}>The winning make, every edition</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>{s.winners.map(x => <div key={x.year} title={`${x.year}: ${x.cancelled ? 'cancelled' : x[cat]?.make ?? '–'}`} style={{ width: 26, height: 22, borderRadius: 2, background: x.cancelled ? 'transparent' : ink(x[cat]?.make), border: x.cancelled ? '1px dashed var(--o-line)' : 'none', color: '#fff', fontSize: 8.5, display: 'grid', placeItems: 'center' }}>{String(x.year).slice(2)}</div>)}</div>
        <Src>Sources: dakar.com, Wikipedia</Src>
      </section>
    </>
  );
}

export function RouteScreen({ dk }: { dk: DakarData }) {
  const st = dk.stages;
  const max = Math.max(1, ...st.map(x => x.totalKm ?? 0));
  const total = st.reduce((a, x) => a + (x.totalKm ?? 0), 0), special = st.reduce((a, x) => a + (x.specialKm ?? 0), 0);
  return (
    <section className="ocard">
      <h2>Dakar {dk.edition}, day by day</h2>
      <p className="dek">{total.toLocaleString('en-GB')} km in all, of which {special.toLocaleString('en-GB')} against the clock ({Math.round((special / (total || 1)) * 100)}%). The rest are liaisons on open roads between bivouacs. Dark: the special stage; light: the liaison.</p>
      {st.map(x => (
        <div key={x.label} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 120px', gap: 8, alignItems: 'center', fontSize: 12, margin: '4px 0' }}>
          <span><b>{x.label}</b><br /><small style={{ color: 'var(--o-ink3)' }}>{dayShort(Date.parse(x.date))}</small></span>
          {x.rest ? <span style={{ color: 'var(--o-ink3)' }}>Rest day{x.from ? ` · ${x.from}` : ''}</span> : <span style={{ display: 'flex', height: 14, width: `${((x.totalKm ?? 0) / max) * 100}%` }}><span style={{ flex: x.specialKm ?? 0, background: 'var(--o-s4)', borderRadius: '2px 0 0 2px' }} /><span style={{ flex: (x.totalKm ?? 0) - (x.specialKm ?? 0), background: 'color-mix(in srgb, var(--o-s4) 30%, var(--o-card))' }} /></span>}
          <span style={{ color: 'var(--o-ink2)' }}>{x.rest ? '' : `${x.specialKm ?? '–'} / ${x.totalKm ?? '–'} km`}<br /><small style={{ color: 'var(--o-ink3)' }}>{x.from === x.to ? x.from : `${x.from} → ${x.to}`}</small></span>
        </div>
      ))}
      <Src>Source: dakar.com</Src>
    </section>
  );
}

export function HistoryScreen({ s }: { s: DakarSeason }) {
  const [cat, setCat] = useState<'car' | 'bike' | 'truck'>('car');
  const label = { car: 'Cars', bike: 'Bikes', truck: 'Trucks' } as const;
  const w = s.winners.filter(x => !x.cancelled && x[cat]?.name);
  const drivers = Object.entries(w.reduce<Record<string, number>>((a, x) => { const n = x[cat]!.name!; a[n] = (a[n] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const eras = [['Africa', 1979, 2007], ['South America', 2009, 2019], ['Saudi Arabia', 2020, 2100]] as const;
  return (
    <>
      <section className="ocard">
        <h2>The Dakar since 1979</h2>
        <Chips label="Category" items={(['car', 'bike', 'truck'] as const).map(k => ({ k, label: label[k] }))} value={cat} set={setCat} />
        <p className="dek">Three continents: Paris–Dakar and Africa until 2007 (the 2008 edition was cancelled over security threats in Mauritania), South America 2009–2019, Saudi Arabia since 2020.</p>
        <div className="lab">Most wins</div>
        {drivers.map(([n, k]) => <div key={n} style={{ display: 'grid', gridTemplateColumns: '190px 1fr 24px', gap: 8, alignItems: 'center', fontSize: 12.5, margin: '3px 0' }}><span>{n}</span><span style={{ height: 10, width: `${(k / drivers[0][1]) * 100}%`, background: 'var(--o-s4)', borderRadius: 2 }} /><b>{k}</b></div>)}
      </section>
      <section className="ocard">
        <h2>Every winner</h2>
        {eras.map(([era, a, b]) => (
          <div key={era} style={{ marginBottom: 12 }}>
            <div className="lab">{era}</div>
            <table className="otable" style={{ fontSize: 12.5 }}><tbody>{[...s.winners].reverse().filter(x => x.year >= a && x.year <= b).map(x => <tr key={x.year}><td>{x.year}</td>{x.cancelled ? <td colSpan={2} style={{ color: 'var(--o-ink3)' }}>Cancelled</td> : <><td><b>{x[cat]?.name ?? '–'}</b> <small style={{ color: 'var(--o-ink3)' }}>{x[cat]?.nation}</small></td><td><span style={{ display: 'inline-block', width: 4, height: 12, background: ink(x[cat]?.make), marginRight: 5, verticalAlign: -1 }} />{x[cat]?.make}</td></>}<td style={{ color: 'var(--o-ink3)', fontSize: 11 }}>{x.route}</td></tr>)}</tbody></table>
          </div>
        ))}
        <Src>Source: Wikipedia, Dakar Rally</Src>
      </section>
    </>
  );
}

export function HowScreen() {
  const P = ({ children }: { children: ReactNode }) => <p style={{ margin: '0 0 10px', lineHeight: 1.55, fontSize: 14 }}>{children}</p>;
  return (
    <section className="s-two">
      <div className="ocard">
        <h2>The race</h2>
        <P>Two weeks, a dozen stages and one rest day. Each day has a <b>special</b> (the timed part, off road through dunes, rocks and gravel) and <b>liaisons</b> on public roads. The winner has the lowest total time over all the specials, penalties included.</P>
        <P><b>Navigation</b> is part of the race: crews get the road book (the paper or digital route notes) only shortly before each stage, and missing a waypoint costs time.</P>
        <P><b>Marathon stages</b>: two days without the team's mechanics, the crew repairs the car or bike alone in a common bivouac.</P>
      </div>
      <div className="ocard">
        <h2>The categories</h2>
        <P><b>Bikes</b> (450 cc rally motorcycles), <b>Cars</b> (the Ultimate class: four-wheel-drive prototypes like the Toyota Hilux, Dacia Sandrider, Ford Raptor), <b>Challenger</b> and <b>SSV</b> (lighter side-by-side vehicles), <b>Trucks</b>, and the <b>Classic</b> for historic vehicles on a regularity format.</P>
        <P><b>Future Mission</b> is the class for alternative energy prototypes (hydrogen, electric, hybrid).</P>
      </div>
    </section>
  );
}
