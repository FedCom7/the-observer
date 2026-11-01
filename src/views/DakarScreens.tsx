// Dakar screens beyond the home: the last edition stage by stage, the manufacturers, the
// route on small maps, the history and the rules.
// Data: dakar.json (route, rankings with every stage) and dakar-season.json (winners since 1979).
import { geoBounds, geoMercator, geoPath } from 'd3-geo';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useWidth } from '../components/charts';
import { Score } from '../components/common';
import { Chips } from '../components/tabs';
import { useCountries } from '../components/Theatre';
import { getJSON } from '../core/fetcher';
import { useData } from '../core/store';
import { dayShort } from '../core/time';
import { racing, type DakarData, type DakarEvolution, type DakarRankings, type DakarStage } from '../sources/dakar';
import { TRACKS } from '../sources/dakarTrack';

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
export const MAKES: Record<string, string> = { Toyota: '#eb0a1e', Dacia: '#646b52', Ford: '#003478', Mini: '#111', Peugeot: '#1c3f94', Mitsubishi: '#d0021b', Volkswagen: '#00b0f0', Audi: '#bb0a30', Citroën: '#a50034', KTM: '#ff6600', Honda: '#cc0000', Yamaha: '#0a2d8c', BMW: '#1c69d4', Hero: '#e2231a', Husqvarna: '#002550', 'Gas Gas': '#c8102e', Kamaz: '#1e5aa8', Iveco: '#0b3b8c', Tatra: '#b8860b', 'Can-Am': '#d9a400', Polaris: '#5b7fd6', Defender: '#2f6b4f' };
export const ink = (m: string | null | undefined) => (m && MAKES[m]) || 'var(--o-other)';
const title = (s: string) => s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
/** The make from the team name in the official classification ("RED BULL KTM FACTORY RACING" → KTM); else the team. */
export const makeOfTeam = (t: string) => Object.keys(MAKES).find(m => t.toUpperCase().includes(m.toUpperCase()))
  ?? (/\bX-RAID\b/i.test(t) ? 'Mini' : /SANDRIDER/i.test(t) ? 'Dacia' : /HILUX|GAZOO|LAND CRUISER/i.test(t) ? 'Toyota' : /RAPTOR/i.test(t) ? 'Ford' : /RZR/i.test(t) ? 'Polaris' : /DE ROOY/i.test(t) ? 'Iveco' : title(t).slice(0, 22));

/** The organiser's categories, the main ones first. */
export const CAT_ORDER = ['Bikes', 'Cars', 'Trucks', 'Challenger', 'SSV', 'Stock', 'Quads', 'Classic', 'Future Mission'];
export const byCat = (a: string, b: string) => (CAT_ORDER.indexOf(a) + 1 || 99) - (CAT_ORDER.indexOf(b) + 1 || 99);

/** Gap as the organiser writes it (+1h 05' 12") in seconds. */
export const secs = (g: string) => {
  const m = g.match(/(?:(\d+)h\s*)?(\d+)'\s*(\d+)"/);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
};
export const gapText = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = Math.round(s % 60);
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : m ? `${m} min ${String(x).padStart(2, '0')} s` : `${x} s`;
};
const clock = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}' ${String(s % 60).padStart(2, '0')}"`; };
const stageName = (n: number) => (n === 0 ? 'Prologue' : `Stage ${n}`);
const stageCode = (n: number) => (n === 0 ? 'P' : String(n));
const Bar = ({ m }: { m: string }) => <span style={{ display: 'inline-block', width: 4, height: 12, background: ink(m), marginRight: 6, verticalAlign: -1, borderRadius: 1 }} />;
/** Categories timed to the second (the Classic is a regularity contest, its gaps are all zero). */
const timed = (r: DakarRankings) => Object.keys(r.general).filter(c => (r.general[c] ?? []).some(x => secs(x.gap) > 0)).sort(byCat);

/** Who is who in the stage-by-stage data. */
const who = (ev: DakarEvolution, cat: string, bib: number) => {
  const [crew = `#${bib}`, nation = '', team = ''] = ev.bibs[`${cat}:${bib}`] ?? [];
  return { crew, first: crew.split(' / ')[0], nation, team, make: makeOfTeam(team) };
};

// ---------------------------------------------------------------- Last edition

export function ResultsScreen({ dk }: { dk: DakarData }) {
  const r = dk.rankings;
  const cats = r ? Object.keys(r.general).sort(byCat) : [];
  const [cat, setCat] = useState(cats.includes('Cars') ? 'Cars' : cats[0] ?? '');
  if (!r) return <section className="ocard"><p className="dek">No classification available.</p></section>;
  const live = r.edition === dk.edition;
  const g = r.general[cat] ?? [];
  const ev = r.evolution;
  const isTimed = timed(r).includes(cat);
  return (
    <>
      <section className="ocard dk-full">
        <h2>Dakar {r.edition}{live ? `, after stage ${r.stage}` : ': how the race was won'}</h2>
        <Chips label="Category" items={cats.map(c => ({ k: c, label: c }))} value={cat} set={setCat} />
        {ev && isTimed ? <GapStory ev={ev} cat={cat} live={live} /> : <p className="dek">{isTimed ? 'The stage-by-stage data is not available.' : `The ${cat} category is decided on regularity points rather than time, so there are no gaps to chart.`}</p>}
      </section>
      {ev && isTimed && <LeadersAndWinners ev={ev} cat={cat} />}
      <section className="ocard">
        <h2>{live ? `General classification after stage ${r.stage}` : 'The final classification'} · {cat}</h2>
        <p className="dek">Time is the total of every special stage plus penalties; the gap is to the {live ? 'leader' : 'winner'}.</p>
        <table className="otable" style={{ fontSize: 12.5 }}>
          <thead><tr><th className="n">Pos</th><th className="n">Bib</th><th>Crew</th><th>Team</th><th className="n">Time</th><th className="n">Gap</th><th className="n">Penalty</th></tr></thead>
          <tbody>{g.map(x => <tr key={x.bib}><td className="n">{x.pos}</td><td className="n">{x.bib}</td><td><Score>{x.crew.join(' / ')}</Score> <small style={{ color: 'var(--o-ink3)' }}>{x.nation}</small></td><td><Bar m={makeOfTeam(x.team)} />{x.team}</td><td className="n"><Score>{x.time}</Score></td><td className="n"><Score>{x.gap}</Score></td><td className="n">{x.penalty}</td></tr>)}</tbody>
        </table>
        <Src>Source: dakar.com official rankings</Src>
      </section>
      {ev && <Attrition ev={ev} />}
    </>
  );
}

const PALETTE = ['var(--o-s1)', 'var(--o-s2)', 'var(--o-s3)', 'var(--o-s4)', 'var(--oc-cul)', 'var(--oc-int)'];

/** The final (or current) top six, their gap to the leader after every stage. */
function GapStory({ ev, cat, live }: { ev: DakarEvolution; cat: string; live: boolean }) {
  const st = ev.stages.filter(s => s.cats[cat]?.top.length);
  const last = st[st.length - 1]?.cats[cat];
  if (!last) return null;
  const bibs = last.top.slice(0, 6).map(t => t[0]);
  const series = bibs.map((b, i) => ({
    name: who(ev, cat, b).first, color: PALETTE[i],
    values: st.map(s => {
      const top = s.cats[cat].top, me = top.find(t => t[0] === b), lead = top[0]?.[1];
      return me?.[1] != null && lead != null ? (me[1] - lead) / 60000 : null;
    }),
  }));
  return (
    <>
      <p className="dek">Minutes behind the {live ? 'leader' : 'leader of the moment'} after each stage, for the {live ? 'current' : 'final'} top six. A line at the top is a car or bike in front; gaps only show while the crew is inside the top fifteen.</p>
      <GapLines steps={st.map(s => stageCode(s.stage))} series={series} />
      <Src>Source: dakar.com, general classification after each stage</Src>
    </>
  );
}

/** Lines of the gap to the leader, the leader along the top edge. */
function GapLines({ steps, series }: { steps: string[]; series: { name: string; color: string; values: (number | null)[] }[] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const H = 290, l = 44, r = 130, t = 14, b = 24, n = steps.length;
  const max = Math.max(1, ...series.flatMap(s => s.values.filter((v): v is number => v != null)));
  const step = [1, 2, 5, 10, 15, 30, 60, 120, 180, 240, 300, 600].find(s => max / s <= 6) ?? 600;
  const hi = Math.ceil(max / step) * step;
  const x = (i: number) => l + (i / Math.max(1, n - 1)) * (W - l - r);
  const y = (v: number) => t + (v / hi) * (H - t - b);
  const fmt = (v: number) => (v >= 60 ? `${Math.floor(v / 60)}h${v % 60 ? String(Math.round(v % 60)).padStart(2, '0') : ''}` : `${Math.round(v)}′`);
  const ends = series.map(s => { const i = s.values.reduce<number>((a, v, k) => (v != null ? k : a), -1); return { s, i, yy: i >= 0 ? y(s.values[i]!) : 0 }; }).filter(e => e.i >= 0).sort((a, b2) => a.yy - b2.yy);
  for (let k = 1; k < ends.length; k++) if (ends[k].yy - ends[k - 1].yy < 13) ends[k].yy = ends[k - 1].yy + 13;
  return (
    <div ref={ref} className="ochart">
      <Score as="div">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Gap to the leader after each stage">
          {Array.from({ length: hi / step + 1 }, (_, k) => k * step).map(v => <g key={v}><line x1={l} x2={W - r} y1={y(v)} y2={y(v)} stroke="var(--o-grid)" /><text x={l - 6} y={y(v) + 4} textAnchor="end">{v === 0 ? 'Lead' : fmt(v)}</text></g>)}
          {steps.map((s, i) => <text key={i} x={x(i)} y={H - 6} textAnchor="middle">{s}</text>)}
          {series.map(s => {
            let d = '', pen = false;
            s.values.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i)},${y(v)} `; pen = true; });
            return <g key={s.name}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => v != null && <circle key={i} cx={x(i)} cy={y(v)} r={2.4} fill={s.color}><title>{`${s.name}, after ${steps[i] === 'P' ? 'the prologue' : `stage ${steps[i]}`}: ${v === 0 ? 'leader' : `+${gapText(v * 60)}`}`}</title></circle>)}
            </g>;
          })}
          {ends.map(({ s, i, yy }) => <text key={s.name} className="lbl" x={W - r + 8} y={yy + 4} style={{ fontSize: 11.5, fill: s.color }}>{s.name} <tspan style={{ fill: 'var(--o-ink3)', fontWeight: 400 }}>{s.values[i] ? `+${fmt(s.values[i]!)}` : 'leads'}</tspan></text>)}
        </svg>
      </Score>
    </div>
  );
}

/** Who led after each stage, and who won each stage. */
function LeadersAndWinners({ ev, cat }: { ev: DakarEvolution; cat: string }) {
  const st = ev.stages.filter(s => s.cats[cat]?.top.length);
  // Spells in the lead: the same leader on consecutive stages
  const spells: { bib: number; from: number; to: number }[] = [];
  for (const s of st) {
    const b = s.cats[cat].top[0][0], o = spells[spells.length - 1];
    if (o && o.bib === b) o.to = s.stage; else spells.push({ bib: b, from: s.stage, to: s.stage });
  }
  const wins = Object.entries(st.reduce<Record<number, number>>((a, s) => { const w = s.cats[cat].podium[0]?.[0]; if (w != null) a[w] = (a[w] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <section className="ocard">
        <h2>In the lead</h2>
        <p className="dek">The leader of the general after each stage, in the make's color.</p>
        <Score as="div"><div className="dk-tiles" style={{ gridTemplateColumns: `repeat(${st.length}, minmax(0, 1fr))` }}>
          {st.map(s => { const w = who(ev, cat, s.cats[cat].top[0][0]); return <span key={s.stage} title={`${stageName(s.stage)}: ${w.crew}`} style={{ background: ink(w.make), height: 26, fontSize: 10 }}>{stageCode(s.stage)}</span>; })}
        </div></Score>
        <div className="dk-spells">
          {spells.map((x, i) => { const w = who(ev, cat, x.bib); return <div key={i}><Bar m={w.make} /><Score as="b">{w.crew}</Score> <small>{w.nation} · {w.make}</small><span>{x.from === x.to ? `after ${stageName(x.from).toLowerCase()}` : `${stageCode(x.from)}–${x.to}`}</span></div>; })}
        </div>
        {wins.length > 0 && <>
          <div className="lab" style={{ marginTop: 14 }}>Stage wins</div>
          {wins.slice(0, 8).map(([b, n]) => { const w = who(ev, cat, Number(b)); return <div key={b} className="dk-hbar"><span><Score>{w.first}</Score></span><span><i style={{ width: `${(n / wins[0][1]) * 100}%`, background: ink(w.make) }} /></span><b>{n}</b></div>; })}
        </>}
        <Src>Source: dakar.com</Src>
      </section>
      <section className="ocard">
        <h2>Stage by stage</h2>
        <table className="otable" style={{ fontSize: 12 }}>
          <thead><tr><th>Stage</th><th>Winner</th><th className="n">Time</th><th className="n">Margin</th><th>Leader after</th></tr></thead>
          <tbody>{st.map(s => {
            const [a, b] = s.cats[cat].podium, w = a && who(ev, cat, a[0]), l = who(ev, cat, s.cats[cat].top[0][0]);
            return <tr key={s.stage}><td>{stageCode(s.stage)}</td><td>{w ? <><Bar m={w.make} /><Score>{w.first}</Score></> : '–'}</td><td className="n"><Score>{a?.[1] != null ? clock(a[1]) : ''}</Score></td><td className="n"><Score>{a?.[1] != null && b?.[1] != null ? gapText((b[1] - a[1]) / 1000) : ''}</Score></td><td><Score>{l.first}</Score></td></tr>;
          })}</tbody>
        </table>
      </section>
    </>
  );
}

/** How many vehicles were still classified after each stage, per category. */
function Attrition({ ev }: { ev: DakarEvolution }) {
  const cats = [...new Set(ev.stages.flatMap(s => Object.keys(s.cats)))].sort(byCat);
  return (
    <section className="ocard">
      <h2>Still in the race</h2>
      <p className="dek">Crews classified at the first stage of their category and at the end: the rest retired, were excluded or ran out of time.</p>
      {cats.map(c => {
        const seen = ev.stages.filter(s => s.cats[c]);
        const a = seen[0]?.cats[c].n ?? 0, b = seen[seen.length - 1]?.cats[c].n ?? 0;
        return (
          <div key={c} className="dk-att">
            <span>{c}</span>
            <span className="t"><i style={{ width: '100%' }} /><i style={{ width: `${(b / (a || 1)) * 100}%` }} /></span>
            <small><b>{b}</b> of {a} · {Math.round((b / (a || 1)) * 100)}%</small>
          </div>
        );
      })}
      <Src>Source: dakar.com, rankings after each stage</Src>
    </section>
  );
}

// ---------------------------------------------------------------- Manufacturers

export function PowerScreen({ dk, s }: { dk: DakarData; s: DakarSeason }) {
  const r = dk.rankings;
  const [cat, setCat] = useState<'car' | 'bike' | 'truck'>('car');
  const label = { car: 'Cars', bike: 'Bikes', truck: 'Trucks' } as const;
  const top = r?.general[label[cat]] ?? [];
  const byMake = Object.entries(top.reduce<Record<string, number[]>>((a, x) => { const m = makeOfTeam(x.team); (a[m] ??= []).push(x.pos); return a; }, {})).sort((a, b) => Math.min(...a[1]) - Math.min(...b[1]));
  const w = s.winners.filter(x => !x.cancelled && x[cat]?.make);
  const count = (list: typeof w) => Object.entries(list.reduce<Record<string, number>>((a, x) => { const m = x[cat]!.make!; a[m] = (a[m] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const wins = count(w), recentWins = count(w.filter(x => x.year >= 2016));
  const ev = r?.evolution;
  const stageWins = ev ? Object.entries(ev.stages.reduce<Record<string, number>>((a, x) => { const p = x.cats[label[cat]]?.podium[0]; if (p) { const m = who(ev, label[cat], p[0]).make; a[m] = (a[m] ?? 0) + 1; } return a; }, {})).sort((a, b) => b[1] - a[1]) : [];
  const Bars = ({ rows }: { rows: [string, number][] }) => <>{rows.map(([m, n]) => <div key={m} className="dk-hbar"><span>{m}</span><span><i style={{ width: `${(n / rows[0][1]) * 100}%`, background: ink(m) }} /></span><b>{n}</b></div>)}</>;
  return (
    <>
      <section className="ocard dk-full">
        <h2>The manufacturers</h2>
        <Chips label="Category" items={(['car', 'bike', 'truck'] as const).map(k => ({ k, label: label[k] }))} value={cat} set={setCat} />
        {top.length > 0 && <><p className="dek">Who placed where in the top ten of the last edition ({r?.edition}).</p>
          {byMake.map(([m, ps]) => <div key={m} style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 8, alignItems: 'center', fontSize: 12.5, margin: '4px 0' }}><span>{m}</span><span style={{ display: 'flex', gap: 3 }}>{Array.from({ length: 10 }, (_, i) => <span key={i} style={{ width: 22, height: 18, borderRadius: 3, background: ps.includes(i + 1) ? ink(m) : 'var(--o-grid)', color: '#fff', fontSize: 10, display: 'grid', placeItems: 'center' }}>{ps.includes(i + 1) ? i + 1 : ''}</span>)}</span></div>)}</>}
        <div className="lab" style={{ marginTop: 14 }}>The winning make, every edition</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>{s.winners.map(x => <div key={x.year} title={`${x.year}: ${x.cancelled ? 'cancelled' : x[cat]?.make ?? '–'}`} style={{ width: 26, height: 22, borderRadius: 2, background: x.cancelled ? 'transparent' : ink(x[cat]?.make), border: x.cancelled ? '1px dashed var(--o-line)' : 'none', color: '#fff', fontSize: 8.5, display: 'grid', placeItems: 'center' }}>{String(x.year).slice(2)}</div>)}</div>
        <Src>Sources: dakar.com, Wikipedia</Src>
      </section>
      <section className="ocard"><div className="lab">Wins since 1979</div><Bars rows={wins} /></section>
      <section className="ocard"><div className="lab">Wins in the last ten editions</div><Bars rows={recentWins} /></section>
      {stageWins.length > 0 && <section className="ocard"><div className="lab">Stage wins in {r?.edition}</div><Bars rows={stageWins} /><Src>Prologue included · dakar.com</Src></section>}
    </>
  );
}

// ---------------------------------------------------------------- Route

const W0 = 180, H0 = 128;

/** Every day of the rally on its own small map, the whole route in the background. */
export function RouteScreen({ dk }: { dk: DakarData }) {
  const st = dk.stages;
  const { now } = useData();
  const countries = useCountries(true);
  const track = dk.edition ? TRACKS[dk.edition] : undefined;
  const lineOf = (s: DakarStage): [number, number][] | null => {
    const k = s.transfer ? 'T' : s.num === 0 ? 'P' : s.num != null ? String(s.num) : '';
    return track?.[k] ?? (s.fromLoc && s.toLoc && s.from !== s.to ? [s.fromLoc, s.toLoc] : null);
  };
  const geo = useMemo(() => {
    const pts = st.flatMap(s => [...(lineOf(s) ?? []), ...(s.fromLoc ? [s.fromLoc] : []), ...(s.toLoc ? [s.toLoc] : [])]);
    if (!pts.length) return null;
    const proj = geoMercator().fitExtent([[8, 8], [W0 - 8, H0 - 8]], { type: 'MultiPoint', coordinates: pts });
    const path = geoPath(proj);
    const [x0, x1] = [Math.min(...pts.map(p => p[0])) - 6, Math.max(...pts.map(p => p[0])) + 6], [y0, y1] = [Math.min(...pts.map(p => p[1])) - 5, Math.max(...pts.map(p => p[1])) + 5];
    const land = countries?.features.filter(f => { const [[a, b], [c, d]] = geoBounds(f); return c >= x0 && a <= x1 && d >= y0 && b <= y1; })
      .map(f => ({ d: path(f) ?? '', host: !!dk.countries?.includes(f.properties.name) })) ?? [];
    const all = st.map(lineOf).filter((l): l is [number, number][] => !!l).map(l => path({ type: 'LineString', coordinates: l }) ?? '').join(' ');
    return { proj, path, land, all };
  }, [dk, countries]);
  const total = st.reduce((a, x) => a + (x.totalKm ?? 0), 0), special = st.reduce((a, x) => a + (x.specialKm ?? 0), 0);
  const max = Math.max(1, ...st.map(x => x.totalKm ?? 0));
  const next = st.find(s => racing(s) && Date.parse(s.date) > now - 8 * 3600e3);
  return (
    <>
      <section className="ocard dk-full">
        <h2>Dakar {dk.edition}, day by day</h2>
        <p className="dek">{total.toLocaleString('en-GB')} km in all, of which {special.toLocaleString('en-GB')} against the clock ({Math.round((special / (total || 1)) * 100)}%). Each map shows one day over the whole route; the lines follow the organiser's route map, so they are right in broad strokes, not turn by turn.</p>
        <div className="dk-maps">
          {st.map((s, i) => {
            const line = lineOf(s), p = s.fromLoc && geo ? geo.proj(s.fromLoc) : null;
            const marathon = /refuge|marathon/i.test(`${s.from} ${s.to}`);
            return (
              <div key={i} className={`dk-map ${s === next ? 'hot' : ''}`}>
                <div className="h"><b>{s.rest ? 'Rest day' : s.transfer ? 'Transfer' : s.label}</b><small>{dayShort(Date.parse(s.date))}</small></div>
                {geo && <svg viewBox={`0 0 ${W0} ${H0}`} width="100%" role="img" aria-label={`Map of ${s.label}`}>
                  {geo.land.map((f, k) => <path key={k} d={f.d} fill={f.host ? 'var(--o-grid)' : 'none'} stroke="var(--o-line)" strokeWidth={0.6} />)}
                  <path d={geo.all} fill="none" stroke="var(--o-ink3)" strokeOpacity={0.35} strokeWidth={1} />
                  {line && <path d={geo.path({ type: 'LineString', coordinates: line }) ?? ''} fill="none" stroke="var(--oc-mot)" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.transfer ? '2 4' : undefined} />}
                  {p && <circle cx={p[0]} cy={p[1]} r={s.rest ? 5 : 3} fill={s.rest ? 'none' : 'var(--oc-mot)'} stroke={s.rest ? 'var(--oc-mot)' : 'var(--o-card)'} strokeWidth={1.5} />}
                </svg>}
                <div className="f">{s.rest ? `Rest in ${s.from}` : s.from === s.to ? `Loop around ${s.from}` : `${s.from} → ${s.to}`}{marathon && <span className="tag">Marathon</span>}</div>
                {!s.rest && !s.transfer ? <>
                  <span className="bar" style={{ width: `${((s.totalKm ?? 0) / max) * 100}%` }}><i style={{ flex: s.specialKm ?? 0 }} /><i style={{ flex: (s.totalKm ?? 0) - (s.specialKm ?? 0) }} /></span>
                  <small><b>{s.specialKm ?? '–'} km</b> special · {s.totalKm ?? '–'} km in all</small>
                </> : <small>{s.rest ? 'Crews and mechanics rebuild the vehicles at the bivouac.' : 'The convoy moves to the next bivouac; nothing is timed.'}</small>}
              </div>
            );
          })}
        </div>
        <div className="olegend" style={{ marginTop: 10 }}><span><i style={{ background: 'var(--o-s4)', height: 10 }} />Special (timed)</span><span><i style={{ background: 'color-mix(in srgb, var(--o-s4) 30%, var(--o-card))', height: 10 }} />Liaison</span></div>
        <Src>Sources: dakar.com route and official route map</Src>
      </section>
    </>
  );
}

// ---------------------------------------------------------------- History

export function HistoryScreen({ s }: { s: DakarSeason }) {
  const [cat, setCat] = useState<'car' | 'bike' | 'truck'>('car');
  const label = { car: 'Cars', bike: 'Bikes', truck: 'Trucks' } as const;
  const w = s.winners.filter(x => !x.cancelled && x[cat]?.name);
  const tally = (key: (x: typeof w[number]) => string | null | undefined) => Object.entries(w.reduce<Record<string, number>>((a, x) => { const k = key(x); if (k) a[k] = (a[k] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const drivers = tally(x => x[cat]?.name).slice(0, 12);
  const nations = tally(x => x[cat]?.nation).slice(0, 10);
  // Winners in more than one category (bikes and cars, usually)
  const cross = Object.entries(s.winners.reduce<Record<string, Set<string>>>((a, x) => { for (const k of ['car', 'bike', 'truck'] as const) { const n = x[k]?.name; if (n && !x.cancelled) (a[n] ??= new Set()).add(label[k]); } return a; }, {}))
    .filter(([, v]) => v.size > 1).map(([n, v]) => ({ n, cats: [...v], wins: s.winners.filter(x => !x.cancelled && (['car', 'bike', 'truck'] as const).some(k => x[k]?.name === n)).length })).sort((a, b) => b.wins - a.wins);
  const eras = [['Africa', 1979, 2007], ['South America', 2009, 2019], ['Saudi Arabia', 2020, 2026], ['Portugal and Morocco', 2027, 2100]] as const;
  const held = eras.filter(([, a, b]) => s.winners.some(x => x.year >= a && x.year <= b));
  const Bars = ({ rows, color }: { rows: [string, number][]; color?: (k: string) => string }) => <>{rows.map(([k, n]) => <div key={k} className="dk-hbar"><span>{k}</span><span><i style={{ width: `${(n / rows[0][1]) * 100}%`, background: color?.(k) ?? 'var(--o-s4)' }} /></span><b>{n}</b></div>)}</>;
  return (
    <>
      <section className="ocard dk-full">
        <h2>The Dakar since 1979</h2>
        <Chips label="Category" items={(['car', 'bike', 'truck'] as const).map(k => ({ k, label: label[k] }))} value={cat} set={setCat} />
        <p className="dek">Three continents: Paris–Dakar and Africa until 2007 (the 2008 edition was cancelled over security threats in Mauritania), South America 2009–2019, Saudi Arabia 2020–2026, and back to Africa in 2027, from Portugal across Morocco.</p>
        <div className="dk-eras">
          {held.map(([era, a, b]) => {
            const ed = s.winners.filter(x => x.year >= a && x.year <= b && !x.cancelled);
            const top = Object.entries(ed.reduce<Record<string, number>>((m, x) => { const k = x[cat]?.make; if (k) m[k] = (m[k] ?? 0) + 1; return m; }, {})).sort((p, q) => q[1] - p[1])[0];
            return <div key={era}><div className="lab">{era}</div><b>{ed.length}</b><small>editions, {ed[0]?.year}–{ed[ed.length - 1]?.year}</small>{top && <small><Bar m={top[0]} />{top[0]} won {top[1]}</small>}</div>;
          })}
        </div>
      </section>
      <section className="ocard"><div className="lab">Most wins · {label[cat]}</div><Bars rows={drivers} /></section>
      <section className="ocard"><div className="lab">Wins by nationality · {label[cat]}</div><Bars rows={nations} /><Src>Source: Wikipedia, Dakar Rally</Src></section>
      {cross.length > 0 && (
        <section className="ocard">
          <div className="lab">Winners on two and four wheels</div>
          <p className="dek">The few who won the Dakar in more than one category.</p>
          {cross.map(x => <div key={x.n} className="dk-spells"><div><b>{x.n}</b> <small>{x.cats.join(' and ')}</small><span>{x.wins} wins</span></div></div>)}
        </section>
      )}
      <section className="ocard dk-full">
        <h2>Every winner</h2>
        {held.map(([era, a, b]) => (
          <div key={era} style={{ marginBottom: 12 }}>
            <div className="lab">{era}</div>
            <table className="otable" style={{ fontSize: 12.5 }}><tbody>{[...s.winners].reverse().filter(x => x.year >= a && x.year <= b).map(x => <tr key={x.year}><td>{x.year}</td>{x.cancelled ? <td colSpan={2} style={{ color: 'var(--o-ink3)' }}>Cancelled</td> : <><td><b>{x[cat]?.name ?? '–'}</b> <small style={{ color: 'var(--o-ink3)' }}>{x[cat]?.nation}</small></td><td><Bar m={x[cat]?.make ?? ''} />{x[cat]?.make}</td></>}<td style={{ color: 'var(--o-ink3)', fontSize: 11 }}>{x.route}</td></tr>)}</tbody></table>
          </div>
        ))}
        <Src>Source: Wikipedia, Dakar Rally</Src>
      </section>
    </>
  );
}

// ---------------------------------------------------------------- How it works

export function HowScreen() {
  const { dakar } = useData();
  const P = ({ children }: { children: ReactNode }) => <p style={{ margin: '0 0 10px', lineHeight: 1.55, fontSize: 14 }}>{children}</p>;
  const st = dakar?.stages ?? [];
  const champs = dakar?.rankings && dakar.rankings.edition !== dakar.edition ? dakar.rankings.general : null;
  const marathon = st.filter(s => /refuge|marathon/i.test(`${s.from} ${s.to}`));
  const rest = st.find(s => s.rest), transfer = st.find(s => s.transfer);
  const CLASSES: [string, string, string][] = [
    ['Bikes', 'Rally motorcycles of 450 cc. The factory riders race in RallyGP, the others in Rally2; the "Original by Motul" riders race with no assistance at all, carrying their own trunk.', 'Bikes'],
    ['Cars', 'The Ultimate class (T1): four-wheel-drive prototypes like the Toyota Hilux, Dacia Sandrider and Ford Raptor, and two-wheel-drive buggies.', 'Cars'],
    ['Stock', 'Production cars (T2) with limited changes.', 'Stock'],
    ['Challenger', 'Light prototypes (T3), the step between the side-by-sides and the Ultimate cars.', 'Challenger'],
    ['SSV', 'Side-by-side vehicles (T4) built from series models, such as the Can-Am Maverick and Polaris RZR.', 'SSV'],
    ['Trucks', 'Rally trucks (T5): they also carry spares for the cars of their team.', 'Trucks'],
    ['Classic', 'Cars and trucks of the past on a regularity format: crews keep set average speeds instead of going flat out.', 'Classic'],
    ['Future Mission', 'Prototypes with alternative energy (hydrogen, electric, hybrid), on a format of their own.', 'Future Mission'],
  ];
  return (
    <>
      <section className="ocard">
        <h2>The race</h2>
        <P>Two weeks, a dozen stages and one rest day. Each day has a <b>special</b> (the timed part, off road through dunes, rocks and gravel) and <b>liaisons</b> on public roads between the bivouac and the special. The winner has the lowest total time over all the specials, penalties included.</P>
        <P>The <b>prologue</b> is a short timed run before stage 1: it sets the starting order of the first stage, which matters, because opening the track means navigating without anyone's tyre marks to follow.</P>
        <P>The <b>bivouac</b> is the rally's travelling camp: teams, mechanics, medical staff and organisers move to a new one most nights.</P>
      </section>
      <section className="ocard">
        <h2>Navigation and rules</h2>
        <P>Crews get the <b>road book</b> (the route notes: distances, headings, dangers) only shortly before each stage. Hidden <b>waypoints</b> along the special must be passed: missing one costs a time penalty.</P>
        <P><b>Marathon stages</b>: two days without the team's mechanics. Crews sleep in a shared refuge and fix their vehicles alone.</P>
        <P>Penalties come for speeding in controlled zones, missed waypoints, outside assistance or replacing parts beyond the rules. Crews who retire from a stage can often restart the next day, but drop out of the general classification.</P>
      </section>
      {st.length > 0 && (
        <section className="ocard">
          <h2>Dakar {dakar?.edition} at a glance</h2>
          <P><b>{st.filter(racing).length} racing days</b> from {dayShort(Date.parse(st[0].date))} to {dayShort(Date.parse(st[st.length - 1].date))}, starting in {st[0].from} and finishing in {st[st.length - 1].to}.</P>
          {transfer && <P><b>Transfer</b> on {dayShort(Date.parse(transfer.date))}: the whole rally crosses from {transfer.from} to {transfer.to} without racing.</P>}
          {rest && <P><b>Rest day</b> in {rest.from} on {dayShort(Date.parse(rest.date))}.</P>}
          {marathon.length > 0 && <P><b>Marathon</b>: {marathon.map(s => s.label).join(' and ')}, through the refuge ({marathon[0].from} → {marathon[0].to} → {marathon[marathon.length - 1].to}).</P>}
        </section>
      )}
      <section className="ocard dk-full">
        <h2>The categories</h2>
        <table className="otable" style={{ fontSize: 12.5 }}>
          <thead><tr><th>Category</th><th>What races</th>{champs && <th>Holder ({dakar?.rankings?.edition})</th>}</tr></thead>
          <tbody>{CLASSES.map(([k, txt, key]) => { const c = champs?.[key]?.[0]; return <tr key={k}><td><b>{k}</b></td><td>{txt}</td>{champs && <td>{c ? <><Bar m={makeOfTeam(c.team)} /><Score>{c.crew.join(' / ')}</Score></> : '–'}</td>}</tr>; })}</tbody>
        </table>
      </section>
    </>
  );
}
