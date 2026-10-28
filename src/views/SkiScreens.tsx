// Alpine skiing screens beyond the home: the season race by race, who is strongest in
// which discipline, athletes, venues, the World Championships, history and the rules.
// Data: ski.json (calendar), ski-season.json and ski-races/<season>/<id>.json (FIS, Wikipedia).
import { useState, type ReactNode } from 'react';
import { MultiLine } from '../components/charts';
import { Dumbbells, PercentileGrid, QuadrantScatter, RankStrips, ordinal, type GridCol, type StripMetric } from '../components/power';
import { Chips, usePick } from '../components/tabs';
import { dayLong, dayShort, fmt, hhmm } from '../core/time';
import { discShort, type SkiData, type SkiRace } from '../sources/ski';
import { fisName, useSkiRace, type CupRow, type SkiSeasonFile } from '../sources/skiSeason';

export const SKI_TABS = [['now', 'Now'], ['season', 'Season'], ['power', 'Power'], ['athletes', 'Athletes'], ['venues', 'Venues'], ['worlds', 'Crans-Montana 2027'], ['history', 'History'], ['how', 'How it works']] as const;
export type SkiTab = typeof SKI_TABS[number][0];

const Src = ({ children }: { children: ReactNode }) => <div className="osrc">{children}</div>;
const DISC_COLOR: Record<string, string> = { DH: 'var(--o-s1)', SG: 'var(--o-s3)', GS: 'var(--o-s2)', SL: 'var(--o-s4)', AC: 'var(--oc-tech)', PAR: 'var(--oc-cul)' };
const DISCS: [string, string][] = [['DH', 'Downhill'], ['SG', 'Super-G'], ['GS', 'Giant slalom'], ['SL', 'Slalom']];
const Chip = ({ d }: { d: string }) => { const k = discShort(d); return <span style={{ display: 'inline-block', fontFamily: 'var(--f-chart)', fontSize: 10.5, fontWeight: 700, color: '#fff', background: DISC_COLOR[k] ?? 'var(--o-ink3)', borderRadius: 4, padding: '1px 5px', verticalAlign: 1 }}>{k}</span>; };
const ITA = 'ITA';
const G = (g: string) => (g === 'men' ? 'Men' : g === 'women' ? 'Women' : 'Mixed');
const seasonLabel = (y: number) => `${y - 1}–${String(y).slice(2)}`;

/**
 * Which season's Cup table to use for a gender: this one once it has six races (before
 * that a single result decides everything), else last season's. `force` picks one.
 */
function tableFor(d: SkiSeasonFile, gender: 'men' | 'women', force?: number) {
  const raced = d.races.filter(r => r.gender === gender && r.category === 'WC').length;
  const y = force ?? (raced >= 6 ? d.season : d.season - 1);
  return { y, rows: d.standings[y]?.[gender] ?? [], raced };
}
function SeasonChips({ d, value, set }: { d: SkiSeasonFile; value: number; set: (y: number) => void }) {
  return <Chips label="Season" items={[d.season - 1, d.season].filter(y => d.standings[y]).map(y => ({ k: y, label: seasonLabel(y) }))} value={value} set={set} />;
}

/* ───────────────────────────── Season ───────────────────────────── */

export function SeasonScreen({ d, cal, now }: { d: SkiSeasonFile; cal: SkiData; now: number }) {
  const [gender, setGender] = useState<'women' | 'men'>('women');
  const [pick, setPick] = usePick('race');
  const done = d.races;
  const sel = done.find(r => r.raceid === pick) ?? [...done].reverse()[0] ?? null;
  const races = cal.races.filter(r => !r.cancelled && r.category === 'WC');
  const months = new Map<string, SkiRace[]>();
  for (const r of races) { const k = fmt(Date.parse(r.start), { month: 'long', year: 'numeric' }); months.set(k, [...(months.get(k) ?? []), r]); }
  // Cumulative cup points race by race, top eight of the gender
  const mine = done.filter(r => r.gender === gender && r.category === 'WC');
  const totals = new Map<string, number>();
  const series = new Map<string, (number | null)[]>();
  mine.forEach((r, i) => { for (const [n, , p] of r.points) totals.set(n, (totals.get(n) ?? 0) + p); for (const [n, t] of totals) { const s = series.get(n) ?? Array(mine.length).fill(null); s[i] = t; series.set(n, s); } });
  const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n]) => n);
  const COLORS = ['var(--o-s1)', 'var(--o-s2)', 'var(--o-s3)', 'var(--o-s4)', 'var(--oc-tech)', 'var(--oc-cul)', 'var(--o-ink2)', 'var(--o-rep)'];
  return (
    <>
      {sel && <RaceDetail d={d} id={sel.raceid} done={done} setPick={setPick} />}
      {mine.length >= 2 && <section className="ocard">
        <h2>The Cup race</h2>
        <Chips label="Gender" items={[{ k: 'women', label: 'Women' }, { k: 'men', label: 'Men' }]} value={gender} set={setGender} />
        <p className="dek">World Cup points after every race, the top eight.</p>
        <MultiLine steps={mine.map(r => `${discShort(r.discipline)} ${r.place.slice(0, 4)}`)} unit="points" series={top.map((n, i) => ({ name: fisName(n).split(' ').slice(-1)[0], color: COLORS[i], values: series.get(n) ?? [] }))} />
      </section>}
      <section className="ocard">
        <h2>The {seasonLabel(d.season)} calendar</h2>
        <p className="dek">Every World Cup race, month by month, with the podium once it is run. Click a finished race for the full result.</p>
        {[...months.entries()].map(([m, rs]) => (
          <div key={m} style={{ marginBottom: 12 }}>
            <div className="lab">{m}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 6 }}>
              {rs.map(r => { const res = done.find(x => x.raceid === r.raceid); return (
                <button key={r.raceid} className="btn" onClick={() => res && setPick(r.raceid)} disabled={!res} aria-pressed={res?.raceid === sel?.raceid} style={{ textAlign: 'left', textTransform: 'none', letterSpacing: 0, color: 'var(--o-ink)', background: res?.raceid === sel?.raceid ? 'var(--o-accent-soft)' : 'transparent', borderColor: 'var(--o-line)', padding: '5px 8px', fontSize: 12, opacity: res || Date.parse(r.start) > now ? 1 : 0.6 }}>
                  <Chip d={r.discipline} /> <b>{r.place}</b> · {G(r.gender)} · {dayShort(Date.parse(r.start))}
                  <div style={{ fontSize: 11, color: 'var(--o-ink3)', marginTop: 2 }}>{res ? res.podium.map(p => `${p.rank}. ${fisName(p.name).split(' ').slice(-1)[0]} (${p.nation})`).join(' · ') : `${hhmm(Date.parse(r.start))} Rome`}</div>
                </button>
              ); })}
            </div>
          </div>
        ))}
        <Src>Source: FIS</Src>
      </section>
    </>
  );
}

const secs = (t: string | null) => { if (!t) return null; const [a, b] = t.includes(':') ? t.split(':') : ['0', t]; return +a * 60 + +b; };

function RaceDetail({ d, id, done, setPick }: { d: SkiSeasonFile; id: string; done: SkiSeasonFile['races']; setPick: (v: string | null) => void }) {
  const r = useSkiRace(d.season, id);
  if (!r) return <section className="ocard"><p className="dek">Loading the result…</p></section>;
  const two = r.rows.some(x => x.run2);
  // Rank after run 1, to see who moved in run 2
  const r1 = r.rows.filter(x => x.run1).sort((a, b) => secs(a.run1)! - secs(b.run1)!);
  const r1rank = new Map(r1.map((x, i) => [x.name, i + 1]));
  const r2 = r.rows.filter(x => x.run2).sort((a, b) => secs(a.run2)! - secs(b.run2)!);
  const r2rank = new Map(r2.map((x, i) => [x.name, i + 1]));
  const ranked = r.rows.filter(x => x.rank).sort((a, b) => a.rank! - b.rank!);
  const out = r.rows.filter(x => !x.rank);
  const skis = Object.entries(ranked.slice(0, 10).reduce<Record<string, number>>((a, x) => { const k = x.skis ?? '–'; a[k] = (a[k] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const idx = done.findIndex(x => x.raceid === id);
  return (
    <section className="ocard">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn" disabled={idx <= 0} onClick={() => setPick(done[idx - 1].raceid)}>‹</button>
        <h2 style={{ margin: 0 }}><Chip d={r.discipline} /> {r.place} · {G(r.gender)}'s {r.discipline.toLowerCase()}</h2>
        <button className="btn" disabled={idx >= done.length - 1} onClick={() => setPick(done[idx + 1].raceid)}>›</button>
      </div>
      <p className="dek">{dayLong(Date.parse(r.start))} · {r.country} · {ranked.length} classified, {out.length} out. Italians highlighted.</p>
      <div className="s-two">
        <div style={{ overflowX: 'auto' }}>
          <table className="otable" style={{ fontSize: 12 }}>
            <thead><tr><th className="n">#</th><th>Athlete</th><th>Nat</th><th>Skis</th>{two && <><th className="n">Run 1</th><th className="n">Run 2</th></>}<th className="n">Time</th><th className="n">Gap</th><th className="n">Pts</th></tr></thead>
            <tbody>
              {ranked.map(x => <tr key={x.name} className={x.nation === ITA ? 'me' : ''}><td className="n">{x.rank}</td><td style={{ whiteSpace: 'nowrap' }}>{fisName(x.name)} <small style={{ color: 'var(--o-ink3)' }}>{x.year}</small></td><td>{x.nation}</td><td style={{ color: 'var(--o-ink3)' }}>{x.skis}</td>
                {two && <><td className="n">{x.run1} <small style={{ color: 'var(--o-ink3)' }}>({r1rank.get(x.name)})</small></td><td className="n">{x.run2} <small style={{ color: 'var(--o-ink3)' }}>({r2rank.get(x.name)})</small></td></>}
                <td className="n"><b>{x.time}</b></td><td className="n">{x.rank === 1 ? '' : x.gap}</td><td className="n">{x.points ?? ''}</td></tr>)}
              {out.map(x => <tr key={x.name} style={{ color: 'var(--o-ink3)' }}><td /><td>{fisName(x.name)}</td><td>{x.nation}</td><td>{x.skis}</td>{two && <><td className="n">{x.run1 ?? ''}</td><td /></>}<td colSpan={3}>{x.status}</td></tr>)}
            </tbody>
          </table>
        </div>
        <div>
          {two && ranked.length > 5 && <>
            <div className="lab">Who moved in the second run</div>
            <p className="dek" style={{ fontSize: 12 }}>Place after run 1 (grey) and at the finish (blue), the top 15. A long blue-to-the-left line is a big comeback.</p>
            <Dumbbells aLabel="After run 1" bLabel="Final" aColor="var(--o-other)" bColor="var(--o-s1)" better="low" fmt={v => ordinal(v)} rows={ranked.slice(0, 15).map(x => ({ id: x.name, label: fisName(x.name).split(' ').slice(-1)[0], a: r1rank.get(x.name) ?? 30, b: x.rank!, me: x.nation === ITA }))} />
          </>}
          <div className="lab" style={{ marginTop: 12 }}>Skis in the top ten</div>
          {skis.map(([k, n]) => <div key={k} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 20px', gap: 8, alignItems: 'center', fontSize: 12, margin: '2px 0' }}><span>{k}</span><span style={{ height: 9, width: `${n * 10}%`, background: 'var(--o-s1)', borderRadius: 2 }} /><b>{n}</b></div>)}
        </div>
      </div>
      <Src>Source: FIS results</Src>
    </section>
  );
}

/* ───────────────────────────── Power ───────────────────────────── */

const pts = (r: CupRow, k: string) => (r as unknown as Record<string, { points: number | null } | null>)[k]?.points ?? null;

export function PowerScreen({ d }: { d: SkiSeasonFile }) {
  const [gender, setGender] = useState<'men' | 'women'>('women');
  const [force, setForce] = useState<number | undefined>(undefined);
  const { y, rows, raced } = tableFor(d, gender, force);
  const top = rows.slice(0, 40);
  const grid = top.map(r => ({ id: r.name, label: <>{fisName(r.name)} <small style={{ color: 'var(--o-ink3)' }}>{r.nation}</small></>, me: r.nation === ITA, values: { ALL: pts(r, 'ALL'), DH: pts(r, 'DH'), SG: pts(r, 'SG'), GS: pts(r, 'GS'), SL: pts(r, 'SL') } }));
  const cols: GridCol[] = [{ key: 'ALL', label: 'Overall', fmt: v => String(v) }, ...DISCS.map(([k, l]) => ({ key: k, label: l, fmt: (v: number) => String(v) }))];
  const nat = (d.standings[y]?.[gender === 'men' ? 'nationsMen' : 'nationsWomen'] ?? []).slice(0, 16);
  const natAll = (d.standings[y]?.nations ?? []).slice(0, 16);
  // This season's races: skis and second-run movers
  const mine = d.races.filter(r => r.gender === gender);
  const brands = Object.entries(mine.flatMap(r => r.points.map(p => [p[3] ?? '–', p[2]] as const)).reduce<Record<string, number>>((a, [k, p]) => { a[k] = (a[k] ?? 0) + p; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const wins = (k: string) => mine.filter(r => r.podium.find(p => p.rank === 1)?.skis === k).length;
  const leader = (k: string) => rows.filter(r => pts(r, k)).sort((a, b) => pts(b, k)! - pts(a, k)!)[0];
  return (
    <>
      <section className="ocard">
        <h2>Who is strongest, and in which discipline</h2>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Chips label="Gender" items={[{ k: 'women', label: 'Women' }, { k: 'men', label: 'Men' }]} value={gender} set={setGender} />
          <SeasonChips d={d} value={y} set={setForce} />
        </div>
        <p className="dek">{y < d.season ? `${raced ? `Only ${raced} ${gender}'s race${raced > 1 ? 's' : ''} so far this season, too few to judge: ` : `The ${gender}'s World Cup ${seasonLabel(d.season)} has not started yet: `}these are the final standings of ${seasonLabel(y)}.` : `World Cup ${seasonLabel(y)} so far.`} Overall leader: <b>{rows[0] ? fisName(rows[0].name) : '–'}</b>. {DISCS.map(([k, l]) => { const x = leader(k); return x ? <span key={k}>{l}: <b>{fisName(x.name)}</b>. </span> : null; })}</p>
      </section>

      <section className="ocard">
        <h2>Speed against technique</h2>
        <p className="dek">Each skier's points in the speed disciplines (downhill and super-G) against the technical ones (giant slalom and slalom). The all-rounders who can win the big globe sit in the middle and to the top right; specialists hug the axes.</p>
        <QuadrantScatter xLabel="Speed points (DH + SG)" yLabel="Technical points (GS + SL)" fmt={v => v.toFixed(0)} corners={['All-rounders', 'Technical specialists', 'Speed specialists', 'Rest of the field']}
          points={top.map(r => { const sp = (pts(r, 'DH') ?? 0) + (pts(r, 'SG') ?? 0), te = (pts(r, 'GS') ?? 0) + (pts(r, 'SL') ?? 0); return { id: r.name, label: r.ALL?.rank && r.ALL.rank <= 12 || r.nation === ITA ? fisName(r.name).split(' ').slice(-1)[0] : '', x: sp, y: te, color: r.nation === ITA ? '#009246' : r.ALL?.rank && r.ALL.rank <= 5 ? 'var(--o-s1)' : undefined, tip: <><div className="k">{fisName(r.name)} · {r.nation}</div>Overall {r.ALL?.rank ? ordinal(r.ALL.rank) : '–'}, {pts(r, 'ALL')} pts · DH {pts(r, 'DH') ?? 0} · SG {pts(r, 'SG') ?? 0} · GS {pts(r, 'GS') ?? 0} · SL {pts(r, 'SL') ?? 0}</> }; })} />
        <p className="dek" style={{ fontSize: 11.5 }}>Green: Italians. Blue: the top five overall.</p>
        <Src>Source: FIS World Cup standings</Src>
      </section>

      <section className="ocard">
        <h2>The top 40, discipline by discipline</h2>
        <p className="dek">World Cup points; the colour is the rank among these 40 (blue among the best). Italians highlighted. Click a column to sort.</p>
        <PercentileGrid rows={grid} cols={cols} initial="ALL" />
      </section>

      <section className="ocard">
        <h2>The nations</h2>
        <p className="dek">Nations Cup: the points of all of a country's skiers. {gender === 'men' ? 'Men' : 'Women'} by discipline, and the combined table.</p>
        <div className="s-two">
          <PercentileGrid rows={nat.map(r => ({ id: r.name, label: r.name, me: r.nation === ITA, values: { ALL: pts(r, 'ALL'), DH: pts(r, 'DH'), SG: pts(r, 'SG'), GS: pts(r, 'GS'), SL: pts(r, 'SL') } }))} cols={cols} initial="ALL" />
          <div>
            <div className="lab">Men and women together</div>
            {natAll.map((r, i) => { const max = pts(natAll[0], 'ALL') ?? 1; return <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '18px 130px 1fr 54px', gap: 8, alignItems: 'center', fontSize: 12, margin: '3px 0', fontWeight: r.nation === ITA ? 700 : 400 }}><span style={{ color: 'var(--o-ink3)' }}>{i + 1}</span><span>{r.name}</span><span style={{ height: 10, width: `${((pts(r, 'ALL') ?? 0) / max) * 100}%`, background: r.nation === ITA ? '#009246' : 'var(--o-other)', borderRadius: 2 }} /><b>{pts(r, 'ALL')?.toLocaleString('en-GB')}</b></div>; })}
          </div>
        </div>
        <Src>Source: FIS Nations Cup</Src>
      </section>

      {mine.length > 0 && <section className="ocard">
        <h2>The skis</h2>
        <p className="dek">World Cup points won this season on each make of ski, and wins.</p>
        {brands.map(([k, p]) => <div key={k} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 60px 50px', gap: 8, alignItems: 'center', fontSize: 12, margin: '3px 0' }}><span>{k}</span><span style={{ height: 10, width: `${(p / brands[0][1]) * 100}%`, background: 'var(--o-s1)', borderRadius: 2 }} /><b>{p}</b><span style={{ color: 'var(--o-ink3)' }}>{wins(k) ? `${wins(k)} win${wins(k) > 1 ? 's' : ''}` : ''}</span></div>)}
        <Src>Source: FIS results</Src>
      </section>}
    </>
  );
}

/* ───────────────────────────── Athletes ───────────────────────────── */

export function AthletesScreen({ d }: { d: SkiSeasonFile }) {
  const [gender, setGender] = useState<'men' | 'women'>('women');
  const [pick, setPick] = usePick('athlete');
  const { y, rows } = tableFor(d, gender);
  const last = d.standings[y - 1]?.[gender] ?? [];
  const list = rows.slice(0, 60);
  const a = list.find(r => r.name === pick) ?? list.find(r => r.nation === ITA) ?? list[0];
  const H = d.history[gender];
  const pretty = a ? fisName(a.name) : '';
  const globes = H.flatMap(h => (Object.entries(h).filter(([k, v]) => k !== 'year' && typeof v === 'object' && (v as { name: string }).name === pretty).map(([k]) => `${k === 'ALL' ? 'Overall' : k} ${h.year}`)));
  const prev = last.find(r => r.name === a?.name);
  const V = Object.fromEntries(list.map(r => [r.name, { ALL: pts(r, 'ALL'), DH: pts(r, 'DH'), SG: pts(r, 'SG'), GS: pts(r, 'GS'), SL: pts(r, 'SL') }]));
  const M: StripMetric[] = [{ key: 'ALL', label: 'Overall', fmt: v => `${v} pts` }, ...DISCS.map(([k, l]) => ({ key: k, label: l, fmt: (v: number) => `${v} pts` }))];
  const results = d.races.filter(r => r.points.some(p => p[0] === a?.name)).map(r => ({ r, p: r.points.find(p => p[0] === a?.name)!, rank: r.podium.find(p => p.name === a?.name)?.rank }));
  return (
    <>
      <section className="ocard">
        <h2>Pick an athlete</h2>
        <Chips label="Gender" items={[{ k: 'women', label: 'Women' }, { k: 'men', label: 'Men' }]} value={gender} set={g => { setGender(g); setPick(null); }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {list.map(r => <button key={r.name} className="btn" aria-pressed={r.name === a?.name} onClick={() => setPick(r.name)} style={{ textTransform: 'none', letterSpacing: 0, fontSize: 11.5, padding: '3px 7px', color: 'var(--o-ink)', fontWeight: r.nation === ITA ? 700 : 400, background: r.name === a?.name ? 'var(--o-accent-soft)' : 'transparent', borderColor: r.name === a?.name ? 'var(--o-accent)' : 'var(--o-line)' }}>{r.ALL?.rank}. {fisName(r.name)} <span style={{ color: 'var(--o-ink3)' }}>{r.nation}</span></button>)}
        </div>
      </section>
      {a && <section className="ocard">
        <h2>{pretty} <span style={{ color: 'var(--o-ink3)', fontWeight: 400 }}>{a.nation}</span></h2>
        <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', margin: '6px 0 12px' }}>
          <div className="kpi"><b>{a.ALL?.rank ? ordinal(a.ALL.rank) : '–'}</b><span>Overall, {seasonLabel(y)}</span></div>
          <div className="kpi"><b>{pts(a, 'ALL') ?? 0}</b><span>Points</span></div>
          {DISCS.map(([k, l]) => { const x = (a as unknown as Record<string, { rank: number | null } | null>)[k]; return x?.rank ? <div key={k} className="kpi"><b>{ordinal(x.rank)}</b><span>{l}</span></div> : null; })}
          {prev && <div className="kpi"><b>{prev.ALL?.rank ? ordinal(prev.ALL.rank) : '–'}</b><span>Overall, {seasonLabel(y - 1)}</span></div>}
          <div className="kpi"><b>{globes.length}</b><span>Crystal globes</span></div>
        </div>
        {globes.length > 0 && <p className="dek">Globes: {globes.join(', ')}.</p>}
        <RankStrips metrics={M} values={V} me={a.name} color={a.nation === ITA ? '#009246' : 'var(--o-s1)'} labelOf={n => fisName(n).split(' ').slice(-1)[0]} />
        <p className="dek" style={{ fontSize: 11.5 }}>Among the top 60 of the {gender}'s World Cup; a dot at the far left is no points in that discipline.</p>
        {results.length > 0 && <>
          <div className="lab" style={{ marginTop: 10 }}>This season</div>
          <table className="otable" style={{ fontSize: 12, maxWidth: 560 }}><tbody>{results.map(({ r, p, rank }) => <tr key={r.raceid}><td>{dayShort(Date.parse(r.start))}</td><td><Chip d={r.discipline} /> {r.place}</td><td className="n">{rank ? ordinal(rank) : ''}</td><td className="n"><b>{p[2]} pts</b></td></tr>)}</tbody></table>
        </>}
        <Src>Sources: FIS, Wikipedia (globes)</Src>
      </section>}
    </>
  );
}

/* ───────────────────────────── Venues ───────────────────────────── */

// The great courses, by venue (stable facts: the name of the piste)
const PISTE: Record<string, string> = {
  Soelden: 'Rettenbach glacier', Levi: 'Levi Black', Gurgl: 'Kirchenkar', 'Copper Mountain': 'Golden Peak', 'Beaver Creek': 'Birds of Prey', Killington: 'Superstar', Tremblant: 'Flying Mile', 'Val d Isere': 'Face de Bellevarde / OK', "Val d'Isere": 'Face de Bellevarde / OK',
  'Val Gardena': 'Saslong', 'Groeden': 'Saslong', 'Alta Badia': 'Gran Risa', 'Madonna di Campiglio': 'Canalone Miramonti', Bormio: 'Stelvio', Semmering: 'Panorama', Adelboden: 'Chuenisbärgli', Wengen: 'Lauberhorn',
  Kitzbuehel: 'Streif / Ganslern', Kitzbühel: 'Streif / Ganslern', Schladming: 'Planai', 'Cortina d Ampezzo': 'Olimpia delle Tofane', "Cortina d'Ampezzo": 'Olimpia delle Tofane', 'Garmisch-Partenkirchen': 'Kandahar', 'Crans Montana': 'Mont Lachaux', 'Kranjska Gora': 'Podkoren',
  Flachau: 'Hermann Maier', 'Zagreb Sljeme': 'Crveni spust', 'St. Moritz': 'Corviglia', 'St Moritz': 'Corviglia', Saalbach: 'Zwölferkogel', Sestriere: 'Kandahar Banchetta', 'La Thuile': '3 Franco Berthod', Aspen: 'Ajax', 'Lake Louise': 'Men’s / Women’s Olympic',
  Chamonix: 'Verte des Houches', Courchevel: 'Eclipse', Meribel: 'Roc de Fer', 'Are': 'Olympia', Kvitfjell: 'Olympiabakken', Lienz: 'Schlossberg', 'Spindleruv Mlyn': 'Svaty Petr', Jasna: 'Jasna', Hafjell: 'Olympia',
};

export function VenuesScreen({ d, cal }: { d: SkiSeasonFile; cal: SkiData }) {
  const races = cal.races.filter(r => !r.cancelled);
  const venues = new Map<string, SkiRace[]>();
  for (const r of races) venues.set(r.place, [...(venues.get(r.place) ?? []), r]);
  const [pick, setPick] = usePick('venue');
  const list = [...venues.entries()];
  const [name, rs] = list.find(([n]) => n === pick) ?? list[0] ?? ['', []];
  return (
    <>
      <section className="ocard">
        <h2>The venues of {seasonLabel(cal.season)}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 6 }}>
          {list.map(([n, xs]) => <button key={n} className="btn" aria-pressed={n === name} onClick={() => setPick(n)} style={{ textAlign: 'left', textTransform: 'none', letterSpacing: 0, color: 'var(--o-ink)', background: n === name ? 'var(--o-accent-soft)' : 'transparent', borderColor: n === name ? 'var(--o-accent)' : 'var(--o-line)', padding: '5px 8px' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>{n} <span style={{ color: 'var(--o-ink3)', fontWeight: 400 }}>{xs[0].country}</span></div>
            <div style={{ fontSize: 11 }}>{[...new Set(xs.map(x => discShort(x.discipline)))].map(k => <span key={k} style={{ marginRight: 3 }}><Chip d={k} /></span>)} {fmt(Date.parse(xs[0].start), { day: 'numeric', month: 'short' })}</div>
          </button>)}
        </div>
      </section>
      {name && <section className="ocard">
        <h2>{name} <span style={{ color: 'var(--o-ink3)', fontWeight: 400 }}>{rs[0].country}</span></h2>
        {PISTE[name] && <p className="dek">Piste: <b>{PISTE[name]}</b>.</p>}
        <table className="otable" style={{ fontSize: 12.5 }}>
          <thead><tr><th>Date</th><th>Race</th><th>Start (Rome)</th><th>Podium</th></tr></thead>
          <tbody>{rs.map(r => { const res = d.races.find(x => x.raceid === r.raceid); return <tr key={r.raceid}><td>{dayShort(Date.parse(r.start))}</td><td><Chip d={r.discipline} /> {G(r.gender)} · {r.discipline}{r.category === 'WSC' ? ' · Worlds' : ''}</td><td>{r.runs.length ? r.runs.map(x => `${x.run} ${hhmm(Date.parse(x.start))}`).join(' · ') : `${r.approxTime ? '≈ ' : ''}${hhmm(Date.parse(r.start))}`}</td><td>{res ? res.podium.map(p => `${p.rank}. ${fisName(p.name)} (${p.nation})`).join(' · ') : ''}</td></tr>; })}</tbody>
        </table>
        <Src>Source: FIS calendar and results</Src>
      </section>}
    </>
  );
}

/* ───────────────────────────── Worlds ───────────────────────────── */

export function WorldsScreen({ d, cal, now }: { d: SkiSeasonFile; cal: SkiData; now: number }) {
  const w = cal.worlds;
  const races = cal.races.filter(r => r.category === 'WSC' && !r.cancelled);
  const days = Math.max(0, Math.ceil(((w ? Date.parse(w.from) : now) - now) / 86400e3));
  // Contenders: the top five in each discipline (this season once it has races, else last)
  const cont = (g: 'men' | 'women', k: string) => tableFor(d, g).rows.filter(r => pts(r, k)).sort((a, b) => pts(b, k)! - pts(a, k)!).slice(0, 6);
  return (
    <>
      <section className="ocard">
        <h2>World Championships, {w?.place ?? 'Crans-Montana'} 2027</h2>
        <p className="dek">{w ? `${dayLong(Date.parse(w.from))} to ${dayLong(Date.parse(w.to))}` : ''}{days ? ` · in ${days} days` : ''}. One race per discipline and gender, plus the team events: the gold medal counts more than any World Cup race.</p>
        <table className="otable" style={{ fontSize: 12.5 }}>
          <thead><tr><th>Day</th><th>Race</th><th>Start (Rome)</th><th>Result</th></tr></thead>
          <tbody>{races.map(r => { const res = d.races.find(x => x.raceid === r.raceid); return <tr key={r.raceid}><td>{dayShort(Date.parse(r.start))}</td><td><Chip d={r.discipline} /> {G(r.gender)} · {r.discipline}</td><td>{r.runs.length ? r.runs.map(x => `${x.run} ${hhmm(Date.parse(x.start))}`).join(' · ') : `${r.approxTime ? '≈ ' : ''}${hhmm(Date.parse(r.start))}`}</td><td>{res ? res.podium.map(p => `${['🥇', '🥈', '🥉'][p.rank - 1] ?? p.rank} ${fisName(p.name)} (${p.nation})`).join('  ') : ''}</td></tr>; })}</tbody>
        </table>
        <Src>Source: FIS</Src>
      </section>
      <section className="ocard">
        <h2>Who can win a medal</h2>
        <p className="dek">The top six in each discipline by World Cup points. Italians in green.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 18 }}>
          {(['women', 'men'] as const).flatMap(g => DISCS.map(([k, l]) => (
            <div key={g + k}>
              <div className="lab"><Chip d={k} /> {G(g)} · {l}</div>
              {cont(g, k).map((r, i) => <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '14px 1fr auto', gap: 6, fontSize: 12.5, padding: '2px 0', color: r.nation === ITA ? '#009246' : undefined, fontWeight: r.nation === ITA ? 700 : 400 }}><span style={{ color: 'var(--o-ink3)' }}>{i + 1}</span><span>{fisName(r.name)} <small style={{ color: 'var(--o-ink3)' }}>{r.nation}</small></span><b>{pts(r, k)}</b></div>)}
            </div>
          )))}
        </div>
        <Src>Source: FIS World Cup standings</Src>
      </section>
    </>
  );
}

/* ───────────────────────────── History ───────────────────────────── */

export function HistoryScreen({ d }: { d: SkiSeasonFile }) {
  const [gender, setGender] = useState<'men' | 'women'>('women');
  const H = d.history[gender];
  const count = (pred: (k: string) => boolean) => Object.entries(H.flatMap(h => Object.entries(h).filter(([k, v]) => k !== 'year' && pred(k) && v).map(([, v]) => `${(v as { name: string }).name}|${(v as { nation: string }).nation}`)).reduce<Record<string, number>>((a, k) => { a[k] = (a[k] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const overall = count(k => k === 'ALL').slice(0, 12), all = count(() => true).slice(0, 15);
  const nations = Object.entries(H.reduce<Record<string, number>>((a, h) => { const n = h.ALL?.nation ?? '–'; a[n] = (a[n] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const bars = (rows: [string, number][], colour: string) => rows.map(([k, v]) => { const [n, nat] = k.split('|'); return <div key={k} style={{ display: 'grid', gridTemplateColumns: '170px 1fr 30px', gap: 8, alignItems: 'center', fontSize: 12, margin: '3px 0', fontWeight: nat === ITA ? 700 : 400 }}><span>{n} <small style={{ color: 'var(--o-ink3)' }}>{nat === 'null' ? '' : nat}</small></span><span style={{ height: 10, width: `${(v / rows[0][1]) * 100}%`, background: nat === ITA ? '#009246' : colour, borderRadius: 2 }} /><b>{v}</b></div>; });
  const DCOL: [string, string][] = [['ALL', 'Overall'], ['DH', 'Downhill'], ['SG', 'Super-G'], ['GS', 'Giant'], ['SL', 'Slalom'], ['AC', 'Combined']];
  return (
    <>
      <section className="ocard">
        <h2>The crystal globes</h2>
        <Chips label="Gender" items={[{ k: 'women', label: 'Women' }, { k: 'men', label: 'Men' }]} value={gender} set={setGender} />
        <div className="s-two" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div><div className="lab">Overall titles (the big globe)</div>{bars(overall, 'var(--o-s1)')}</div>
          <div><div className="lab">All globes, overall and disciplines</div>{bars(all, 'var(--o-s3)')}</div>
        </div>
        <div className="lab" style={{ marginTop: 12 }}>Overall titles by country</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12.5 }}>{nations.map(([n, c]) => <span key={n} style={{ fontWeight: n === ITA ? 700 : 400 }}>{n} <b>{c}</b></span>)}</div>
        <Src>Source: Wikipedia, List of FIS Alpine Ski World Cup champions</Src>
      </section>
      <section className="ocard">
        <h2>Every season</h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="otable" style={{ fontSize: 12 }}>
            <thead><tr><th>Season</th>{DCOL.map(([, l]) => <th key={l}>{l}</th>)}</tr></thead>
            <tbody>{[...H].reverse().map(h => <tr key={h.year}><td>{h.year}</td>{DCOL.map(([k]) => { const v = (h as unknown as Record<string, { name: string; nation: string | null } | undefined>)[k]; return <td key={k} style={{ whiteSpace: 'nowrap', color: v?.nation === ITA ? '#009246' : undefined, fontWeight: v?.nation === ITA ? 700 : 400 }}>{v ? <>{v.name} <small style={{ color: 'var(--o-ink3)' }}>{v.nation}</small></> : ''}</td>; })}</tr>)}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/* ───────────────────────────── How it works ───────────────────────────── */

export function HowScreen() {
  const P = ({ children }: { children: ReactNode }) => <p style={{ margin: '0 0 10px', lineHeight: 1.55, fontSize: 14 }}>{children}</p>;
  const POINTS = [100, 80, 60, 50, 45, 40, 36, 32, 29, 26, 24, 22, 20, 18, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  return (
    <>
      <section className="ocard">
        <h2>The four disciplines</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {[
            ['DH', 'Downhill', 'The fastest: one run, top speeds above 130 km/h, long jumps. Official training runs in the days before.'],
            ['SG', 'Super-G', 'Speed with more turns: one run, no training runs: skiers only inspect the course, side-slipping down it, on the morning of the race.'],
            ['GS', 'Giant slalom', 'Technical: two runs on the same day, wide gates, rhythm and edge grip.'],
            ['SL', 'Slalom', 'The most technical: two runs, tight gates, fast changes of direction.'],
          ].map(([k, n, t]) => <div key={k}><div style={{ fontWeight: 700, marginBottom: 4 }}><Chip d={k} /> {n}</div><div style={{ fontSize: 13, color: 'var(--o-ink2)', lineHeight: 1.5 }}>{t}</div></div>)}
        </div>
        <P><b>Team combined:</b> two skiers of the same country, one runs the downhill or super-G, the other the slalom; times are added.</P>
      </section>
      <section className="s-two">
        <div className="ocard">
          <h2>The World Cup</h2>
          <P>From late October in Sölden to the finals in March. Every race gives points to the top 30; the overall leader wins the <b>big crystal globe</b>, each discipline leader a <b>small globe</b>.</P>
          <div style={{ display: 'flex', alignItems: 'end', gap: 2, height: 80, margin: '6px 0 4px' }}>{POINTS.map((p, i) => <div key={i} title={`${i + 1}: ${p}`} style={{ flex: 1, height: `${p}%`, background: i < 3 ? ['#d4af37', '#a8a9ad', '#b0764a'][i] : 'var(--o-s1)', borderRadius: '2px 2px 0 0' }} />)}</div>
          <div style={{ fontSize: 11, color: 'var(--o-ink3)', marginBottom: 10 }}>Points from 1st (100) to 30th (1).</div>
          <P><b>Second run:</b> in giant slalom and slalom only the top 30 of the first run go again, in reverse order (30th starts first), so the leader skis last on the most worn course.</P>
          <P><b>Start order:</b> the best-ranked skiers in the discipline start in the first group, with the order inside it drawn, so the start list follows the World Cup ranking.</P>
        </div>
        <div className="ocard">
          <h2>World Championships and Olympics</h2>
          <P>The <b>World Championships</b> are every two years, in odd years (Crans-Montana, February 2027): one race per discipline, medals instead of points, and they do not count for the World Cup.</P>
          <P>The <b>Olympic Games</b> (next: the French Alps, February 2030) work the same way.</P>
          <P><b>FIS points</b> are a different ranking, used for start lists and qualification: the lower, the better.</P>
        </div>
      </section>
    </>
  );
}

