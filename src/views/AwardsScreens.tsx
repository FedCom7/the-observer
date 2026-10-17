import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useWidth } from '../components/charts';
import { Score } from '../components/common';
import { getJSON } from '../core/fetcher';
import { awardTimes, contenderKey, evidence, forecastCategory, raceSeries, recordAt, type ForecastRow, type History } from '../core/oscarModel';
import { DAY, dayShort, fmt } from '../core/time';
import { PERSON_CATS, filmOf, personOf, tmdbImg, type Award, type AwardsData } from '../sources/awards';

export type AwardsTab = 'overview' | 'tracker' | 'forecast' | 'race' | 'study';
const TABS: [AwardsTab, string][] = [['overview', 'Overview'], ['tracker', 'Tracker'], ['forecast', 'Forecast'], ['race', 'The race'], ['study', 'The study']];
const MAIN = ['picture', 'director', 'actor', 'actress', 'supActor', 'supActress', 'origScreenplay', 'adaptScreenplay'];
const SRC = { model: 'var(--o-ink)', gd: 'var(--oc-cul)', poly: 'var(--o-s1)', kalshi: 'var(--o-s3)' };
const pct = (p: number | null | undefined) => (p == null ? '–' : `${Math.round(p * 100)}%`);

export function AwardsTabs({ tab, set }: { tab: AwardsTab; set: (t: AwardsTab) => void }) {
  return (
    <nav className="ocard" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 12px', gridColumn: '1 / -1' }} aria-label="Awards season screens">
      {TABS.map(([k, label]) => <button key={k} className="btn" aria-pressed={tab === k} onClick={() => set(k)} style={{ color: 'var(--o-ink)', background: tab === k ? 'var(--o-accent-soft)' : 'transparent', borderColor: tab === k ? 'var(--o-accent)' : 'var(--o-line)', fontSize: 12.5, letterSpacing: '.04em' }}>{label}</button>)}
    </nav>
  );
}

/** The study (precursor weights, back-test), loaded only when a screen needs it. */
export function useHistory(on: boolean) {
  const [h, setH] = useState<History | null>(null);
  useEffect(() => { if (on && !h) getJSON<History>('/data/awards-history.json', 60 * 60e3).then(setH).catch(() => {}); }, [on, h]);
  return h;
}

function CatChips({ d, cat, set, only }: { d: AwardsData; cat: string; set: (c: string) => void; only?: string[] }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 14px' }}>
      {d.categories.filter(c => !only || only.includes(c.id)).map(c => <button key={c.id} className="btn" aria-pressed={cat === c.id} onClick={() => set(c.id)} style={{ color: 'var(--o-ink)', background: cat === c.id ? 'var(--o-accent-soft)' : 'transparent', borderColor: 'var(--o-line)', textTransform: 'none', letterSpacing: 0 }}>{c.name}</button>)}
    </div>
  );
}

function Thumb({ d, cat, name, h = 24 }: { d: AwardsData; cat: string; name: string; h?: number }) {
  const person = PERSON_CATS.has(cat);
  const src = person ? tmdbImg(personOf(d, name)?.photo, 'w92') : tmdbImg(filmOf(d, name)?.poster, 'w92');
  const w = person ? h : Math.round(h * 0.67);
  return src ? <img src={src} alt="" loading="lazy" style={{ width: w, height: h, objectFit: 'cover', borderRadius: person ? '50%' : 3, flex: 'none' }} /> : <span style={{ width: w, height: h, borderRadius: person ? '50%' : 3, background: 'var(--o-grid)', flex: 'none', display: 'inline-block' }} />;
}

const catName = (d: AwardsData, c: string) => d.categories.find(x => x.id === c)?.name ?? c;

// ===================================================================== Tracker

/** The awards that speak to a category, in the order they announce. */
function relevantAwards(d: AwardsData, h: History | null, cat: string) {
  return d.awards
    .filter(a => a.id !== 'oscars' && ((a.edition?.categories ?? []).some(c => c.oscar === cat) || h?.lr[a.id]?.[cat]))
    .map(a => ({ a, t: awardTimes(a).nom ?? awardTimes(a).win ?? Infinity }))
    .sort((x, y) => x.t - y.t).map(x => x.a);
}

export function TrackerScreen({ d, h, now }: { d: AwardsData; h: History | null; now: number }) {
  const [mode, setMode] = useState<'category' | 'award'>('category');
  const [cat, setCat] = useState('picture');
  const [aw, setAw] = useState(() => d.awards.filter(a => a.state !== 'pending').slice(-1)[0]?.id ?? d.awards[0].id);
  return (
    <section className="ocard" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ marginRight: 'auto' }}>The tracker</h2>
        {(['category', 'award'] as const).map(m => <button key={m} className="btn" aria-pressed={mode === m} onClick={() => setMode(m)} style={{ color: 'var(--o-ink)', background: mode === m ? 'var(--o-accent-soft)' : 'transparent', borderColor: 'var(--o-line)' }}>By {m}</button>)}
      </div>
      {mode === 'category' ? <>
        <p className="dek">Every contender against every precursor that speaks to the category, in the order they announce. ★ won, ● nominated, – left out; empty columns have not announced yet. Rows ordered by the Observer forecast.</p>
        <CatChips d={d} cat={cat} set={setCat} />
        <Scorecard d={d} h={h} cat={cat} now={now} />
      </> : <>
        <p className="dek">One award at a time: every category it gives, nominees and winners (★).</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 14px' }}>
          {d.awards.filter(a => (a.edition?.categories ?? []).length).map(a => <button key={a.id} className="btn" aria-pressed={aw === a.id} onClick={() => setAw(a.id)} style={{ color: 'var(--o-ink)', background: aw === a.id ? 'var(--o-accent-soft)' : 'transparent', borderColor: 'var(--o-line)', textTransform: 'none', letterSpacing: 0 }}>{a.short}</button>)}
        </div>
        <AwardBoard d={d} a={d.awards.find(a => a.id === aw)!} />
      </>}
    </section>
  );
}

function Scorecard({ d, h, cat, now }: { d: AwardsData; h: History | null; cat: string; now: number }) {
  const cols = relevantAwards(d, h, cat);
  const rows = useMemo(() => (h ? forecastCategory(d, h, cat, now) : null), [d, h, cat, now]);
  const people = rows ?? [];
  // Without the study yet, order by wins and nominations
  const list = people.map(r => {
    const rec = cols.map(a => recordAt(d, a, cat, r.key, now));
    return { r, rec, wins: rec.filter(x => x === 'win').length, noms: rec.filter(x => x === 'win' || x === 'nom').length };
  }).filter(x => x.noms > 0 || x.r.p > 0.02).slice(0, 16);
  if (!list.length) return <p className="dek">No precursor has spoken in this category yet.</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="otable" style={{ minWidth: 640 }}>
        <thead>
          <tr>
            <th>Contender</th>
            {cols.map(a => { const t = awardTimes(a); const future = (t.nom ?? t.win ?? 0) > now; return <th key={a.id} className="n" title={a.name} style={{ textAlign: 'center', color: future ? 'var(--o-ink3)' : undefined, fontWeight: 500, writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap', padding: '6px 2px', height: 118 }}>{a.short}{future && (t.nom ?? t.win) ? ` · ${fmt(t.nom ?? t.win!, { day: 'numeric', month: 'short' })}` : ''}</th>; })}
            <th className="n">Wins</th><th className="n">Noms</th><th className="n">Forecast</th>
          </tr>
        </thead>
        <tbody>{list.map(({ r, rec, wins, noms }) => (
          <tr key={r.key}>
            <td><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Thumb d={d} cat={cat} name={r.name} /><span><b>{r.name}</b>{r.film && PERSON_CATS.has(cat) ? <small style={{ color: 'var(--o-ink3)' }}> · {r.film}</small> : null}</span></span></td>
            {rec.map((s, i) => <td key={cols[i].id} style={{ textAlign: 'center', fontSize: 15, color: s === 'win' ? 'var(--oc-cul)' : s === 'nom' ? 'var(--o-ink)' : 'var(--o-ink3)', background: s == null ? 'color-mix(in srgb, var(--o-grid) 40%, transparent)' : undefined }}>{s === 'win' ? '★' : s === 'nom' ? '●' : s === 'none' ? '–' : ''}</td>)}
            <td className="n"><b>{wins}</b></td><td className="n">{noms}</td>
            <td className="n"><Score><b>{h ? pct(r.p) : '…'}</b></Score></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function AwardBoard({ d, a }: { d: AwardsData; a: Award }) {
  const cats = a.edition?.categories ?? [];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
      {cats.map(c => (
        <div key={c.name} className="cy-tile" style={{ borderTopColor: c.oscar ? 'var(--oc-cul)' : 'var(--o-line)' }}>
          <small>{c.oscar ? `→ Oscar: ${catName(d, c.oscar)}` : 'Not an Oscar category'}</small>
          <b style={{ fontSize: 13 }}>{c.name}</b>
          {c.nominees.slice(0, 10).map((n, i) => {
            const label = (c.oscar && PERSON_CATS.has(c.oscar) ? n.people : n.song ?? n.film ?? n.people) ?? '';
            return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: n.winner ? 700 : 400, color: n.winner ? 'var(--o-ink)' : 'var(--o-ink2)' }}>{c.oscar ? <Thumb d={d} cat={c.oscar} name={label} h={20} /> : null}<Score>{n.winner ? '★ ' : ''}{label}{c.oscar && PERSON_CATS.has(c.oscar) && n.film ? <small style={{ color: 'var(--o-ink3)', fontWeight: 400 }}> · {n.film}</small> : null}</Score></div>;
          })}
        </div>
      ))}
    </div>
  );
}

// ===================================================================== Forecast

interface Compared { key: string; name: string; model: number | null; gd: number | null; poly: number | null; kalshi: number | null; row?: ForecastRow }

function compare(d: AwardsData, rows: ForecastRow[], cat: string): Compared[] {
  const by = new Map<string, Compared>();
  const get = (name: string) => { const k = contenderKey(d, cat, name); if (!by.has(k)) by.set(k, { key: k, name, model: null, gd: null, poly: null, kalshi: null }); return by.get(k)!; };
  rows.slice(0, 10).forEach(r => { const c = get(r.name); c.model = r.p; c.row = r; });
  if (d.odds?.stage === 'winners') (d.odds?.categories[cat]?.experts ?? []).slice(0, 8).forEach(r => { get(r.name).gd = r.pct / 100; });
  (d.markets?.polymarket?.[cat]?.winner ?? []).slice(0, 8).forEach(r => { get(r.name).poly = r.p; });
  (d.markets?.kalshi?.[cat]?.winner ?? []).slice(0, 8).forEach(r => { get(r.name).kalshi = r.p; });
  for (const c of by.values()) if (c.model == null) { const r = rows.find(x => x.key === c.key); if (r) { c.model = r.p; c.row = r; } }
  return [...by.values()].sort((a, b) => Math.max(b.model ?? 0, b.poly ?? 0, b.kalshi ?? 0) - Math.max(a.model ?? 0, a.poly ?? 0, a.kalshi ?? 0)).slice(0, 12);
}

export function ForecastScreen({ d, h, now }: { d: AwardsData; h: History | null; now: number }) {
  const [cat, setCat] = useState('picture');
  const [pick, setPick] = useState<string | null>(null);
  const rows = useMemo(() => (h ? forecastCategory(d, h, cat, now) : []), [d, h, cat, now]);
  if (!h) return <section className="ocard" style={{ gridColumn: '1 / -1' }}><p className="dek">Loading the study…</p></section>;
  const cmp = compare(d, rows, cat);
  const ev = evidence(rows);
  const sel = rows.find(r => r.key === pick) ?? rows[0];
  const acc = h.accuracy[cat];
  return (
    <>
      <section className="ocard" style={{ gridColumn: '1 / -1' }}>
        <h2>Who wins? Every category at a glance</h2>
        <p className="dek">The Observer forecast weighs each contender's record at the precursors by how well those precursors have called the Oscar since 2005. Next to it, the favourites of Gold Derby's experts{d.odds?.stage === 'winners' ? '' : ' (their top pick: until the nominations they rank chances of a nomination, not of a win)'} and of the two prediction markets, with their chance to win.</p>
        <Glance d={d} h={h} now={now} onPick={c => { setCat(c); setPick(null); }} />
      </section>
      <section className="ocard" style={{ gridColumn: '1 / -1' }}>
        <h2>{catName(d, cat)}: four forecasts side by side</h2>
        <p className="dek">Each row a contender, each dot a forecast. {ev ? `The Observer model has heard from ${ev} precursor${ev > 1 ? 's' : ''} so far` : 'No precursor has announced in this category yet, so the Observer model has nothing to go on'}{d.odds?.stage === 'winners' ? '' : '. Gold Derby joins the chart once the nominations are out: until then its experts rank chances of a nomination'}. Click a row for the reasons behind the Observer number.</p>
        <CatChips d={d} cat={cat} set={c => { setCat(c); setPick(null); }} />
        <DotCompare d={d} cat={cat} rows={cmp} onPick={setPick} sel={sel?.key ?? null} />
        {acc && <div className="osrc">Track record in this category: the model picked the winner {acc.hits} times out of {acc.n} since 2005 ({acc.recentHits} of {acc.recent} since 2016), re-forecasting each season with the weights of the others.</div>}
      </section>
      {sel && sel.factors.length > 0 && (
        <section className="ocard" style={{ gridColumn: '1 / -1' }}>
          <h2>Why {sel.name} is at {pct(sel.p)}</h2>
          <p className="dek">Each bar is one precursor's evidence: to the right, records more common among past Oscar winners than among the other nominees; to the left, the opposite. The number is how many times more common.</p>
          <WhyBars row={sel} />
        </section>
      )}
    </>
  );
}

function Glance({ d, h, now, onPick }: { d: AwardsData; h: History; now: number; onPick: (c: string) => void }) {
  const cats = d.categories.filter(c => !['casting', 'docShort', 'liveShort', 'animShort'].includes(c.id) || d.markets?.polymarket?.[c.id]);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="otable">
        <thead><tr><th>Category</th><th>Observer</th><th>Gold Derby experts</th><th>Polymarket</th><th>Kalshi</th><th className="n">Agree</th></tr></thead>
        <tbody>{cats.map(c => {
          const rows = forecastCategory(d, h, c.id, now);
          const ev = evidence(rows);
          const m = ev ? rows[0] : null;
          const gd = d.odds?.categories[c.id]?.experts?.[0];
          const po = d.markets?.polymarket?.[c.id]?.winner?.[0];
          const ka = d.markets?.kalshi?.[c.id]?.winner?.[0];
          const keys = [m?.name, gd?.name, po?.name, ka?.name].filter(Boolean).map(n => contenderKey(d, c.id, n));
          const agree = keys.length > 1 ? Math.max(...keys.map(k => keys.filter(x => x === k).length)) : 0;
          const cell = (name?: string, p?: number | null, color?: string) => name ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Thumb d={d} cat={c.id} name={name} h={20} /><span>{name} <Score><b style={{ color }}>{p != null ? pct(p) : ''}</b></Score></span></span> : <span style={{ color: 'var(--o-ink3)' }}>–</span>;
          return (
            <tr key={c.id} onClick={() => onPick(c.id)} style={{ cursor: 'pointer' }}>
              <td><b>{c.name}</b>{ev ? <small style={{ color: 'var(--o-ink3)' }}> · {ev} precursor{ev > 1 ? 's' : ''}</small> : null}</td>
              <td>{m ? cell(m.name, m.p, SRC.model) : <small style={{ color: 'var(--o-ink3)' }}>waiting for precursors</small>}</td>
              <td>{cell(gd?.name, gd && d.odds?.stage === 'winners' ? gd.pct / 100 : null, SRC.gd)}</td>
              <td>{cell(po?.name, po?.p, SRC.poly)}</td>
              <td>{cell(ka?.name, ka?.p, SRC.kalshi)}</td>
              <td className="n">{agree > 1 ? `${agree} of ${keys.length}` : '–'}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

/** NYT-style dot plot: one row per contender, one dot per forecast on a 0–100% scale. */
function DotCompare({ d, cat, rows, onPick, sel }: { d: AwardsData; cat: string; rows: Compared[]; onPick: (k: string) => void; sel: string | null }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const l = Math.min(230, W * 0.36), r = 40, rowH = 30, top = 26;
  const H = top + rows.length * rowH + 10;
  const x = (p: number) => l + p * (W - l - r);
  const marks = ([['model', SRC.model, 'Observer'], ['gd', SRC.gd, 'Gold Derby experts'], ['poly', SRC.poly, 'Polymarket'], ['kalshi', SRC.kalshi, 'Kalshi']] as [keyof Compared, string, string][]).filter(([k]) => rows.some(r => r[k] != null));
  return (
    <div ref={ref} className="ochart">
      <div className="olegend">{marks.map(([k, c, label]) => <span key={k}><i style={{ background: c, width: 10, height: 10, borderRadius: k === 'gd' ? 2 : 5 }} />{label}</span>)}</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Forecasts compared">
        {[0, 0.25, 0.5, 0.75, 1].map(v => <g key={v}><line x1={x(v)} x2={x(v)} y1={top - 6} y2={H - 4} stroke="var(--o-grid)" /><text x={x(v)} y={12} textAnchor="middle">{v * 100}%</text></g>)}
        {rows.map((c, i) => {
          const cy = top + i * rowH + rowH / 2;
          const vals = marks.map(([k]) => c[k] as number | null).filter((v): v is number => v != null);
          return (
            <g key={c.key} onClick={() => onPick(c.key)} style={{ cursor: 'pointer' }}>
              <rect x={0} y={cy - rowH / 2} width={W} height={rowH} fill={sel === c.key ? 'var(--o-accent-soft)' : 'transparent'} opacity={0.6} />
              <text x={l - 10} y={cy + 4} textAnchor="end" style={{ fill: 'var(--o-ink)', fontSize: 12.5, fontWeight: 600 }}>{c.name.length > 30 ? c.name.slice(0, 29) + '…' : c.name}</text>
              {vals.length > 1 && <line x1={x(Math.min(...vals))} x2={x(Math.max(...vals))} y1={cy} y2={cy} stroke="var(--o-line)" strokeWidth={3} strokeLinecap="round" />}
              {marks.map(([k, color]) => {
                const v = c[k] as number | null;
                if (v == null) return null;
                return k === 'gd' ? <rect key={k} x={x(v) - 5} y={cy - 5} width={10} height={10} rx={2} fill={color} stroke="var(--o-card)" strokeWidth={1.5}><title>{`Gold Derby: ${pct(v)}`}</title></rect>
                  : <circle key={k} cx={x(v)} cy={cy} r={k === 'model' ? 6.5 : 5.5} fill={color} stroke="var(--o-card)" strokeWidth={1.5}><title>{`${k}: ${pct(v)}`}</title></circle>;
              })}
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'none' }}>{d.season}{cat}</div>
    </div>
  );
}

const ST_LABEL = { win: 'won', nom: 'nominated, lost', none: 'left out' };

function WhyBars({ row }: { row: ForecastRow }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const f = [...row.factors].sort((a, b) => Math.abs(Math.log(b.lr)) - Math.abs(Math.log(a.lr)));
  const max = Math.max(1, ...f.map(x => Math.abs(Math.log(x.lr))));
  const l = Math.min(220, W * 0.4), rowH = 26;
  const H = f.length * rowH + 20;
  const mid = l + (W - l) / 2;
  const x = (v: number) => mid + (v / max) * ((W - l) / 2 - 50);
  return (
    <div ref={ref} className="ochart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Evidence by precursor">
        <line x1={mid} x2={mid} y1={0} y2={H} stroke="var(--o-ink3)" />
        {f.map((x0, i) => {
          const v = Math.log(x0.lr), cy = 10 + i * rowH + rowH / 2;
          return (
            <g key={x0.award}>
              <text x={l - 10} y={cy + 4} textAnchor="end" style={{ fill: 'var(--o-ink)', fontSize: 12.5 }}><tspan fontWeight={600}>{x0.short}</tspan> · {ST_LABEL[x0.status]}</text>
              <rect x={Math.min(x(v), mid)} y={cy - 8} width={Math.abs(x(v) - mid)} height={16} rx={3} fill={v >= 0 ? 'var(--o-s3)' : 'var(--o-s2)'} />
              <text x={v >= 0 ? x(v) + 6 : x(v) - 6} y={cy + 4} textAnchor={v >= 0 ? 'start' : 'end'} style={{ fontSize: 11.5, fill: 'var(--o-ink2)' }}>{x0.lr >= 1 ? `×${x0.lr.toFixed(1)}` : `÷${(1 / x0.lr).toFixed(1)}`}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ===================================================================== The race

export function RaceScreen({ d, h }: { d: AwardsData; h: History | null }) {
  const [cat, setCat] = useState('picture');
  const race = useMemo(() => (h ? raceSeries(d, h, cat) : null), [d, h, cat]);
  const gd = d.odds?.history[cat]?.experts ?? [];
  const poly = d.markets?.history?.polymarket?.[cat] ?? [];
  const kal = d.markets?.history?.kalshi?.[cat] ?? [];
  return (
    <>
      <section className="ocard" style={{ gridColumn: '1 / -1' }}>
        <h2>The race, announcement by announcement</h2>
        <p className="dek">The Observer forecast re-run after every nomination list and every winner of the season, so you can see who opened strong and faded, and who surged late. Each step is an announcement, named along the bottom.</p>
        <CatChips d={d} cat={cat} set={setCat} />
        {!h ? <p className="dek">Loading the study…</p> : race && race.events.length ? <StepChart race={race} /> : <p className="dek">No precursor has announced in {catName(d, cat).toLowerCase()} yet: the line starts with the first one (the critics in late November, Critics Choice and the guilds in December and January).</p>}
      </section>
      <section className="ocard" style={{ gridColumn: '1 / -1' }}>
        <h2>What the experts and the money say, day by day</h2>
        <p className="dek">One reading a day since the tracker started: Gold Derby's experts (chance {d.odds?.stage === 'winners' ? 'to win' : 'of a nomination'}), Polymarket and Kalshi (chance to win).</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
          <Mini title="Gold Derby experts" hist={gd.map(p => ({ d: p.d, v: Object.fromEntries(Object.entries(p.v).map(([k, v]) => [k, v / 100])) }))} />
          <Mini title="Polymarket" hist={poly} />
          <Mini title="Kalshi" hist={kal} />
        </div>
      </section>
      <section className="ocard" style={{ gridColumn: '1 / -1' }}>
        <h2>Risers and fallers</h2>
        <p className="dek">Polymarket's chance to win, first reading against the latest, for the contenders that moved most.</p>
        <Slope hist={poly.length > 1 ? poly : gd.map(p => ({ d: p.d, v: Object.fromEntries(Object.entries(p.v).map(([k, v]) => [k, v / 100])) }))} />
      </section>
    </>
  );
}

const LINE_COLORS = ['var(--oc-cul)', 'var(--o-s1)', 'var(--o-s3)', 'var(--o-s4)', 'var(--o-s2)', 'var(--oc-tech)'];

function StepChart({ race }: { race: ReturnType<typeof raceSeries> }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const ev = race.events;
  const H = 300, l = 40, r = 150, t = 14, b = 60;
  const t0 = ev[0].t - 5 * DAY, t1 = Math.max(Date.now(), ev[ev.length - 1].t + 5 * DAY);
  const x = (tt: number) => l + ((tt - t0) / (t1 - t0)) * (W - l - r);
  const y = (p: number) => t + (1 - p) * (H - t - b);
  const ends = race.series.map((s, i) => ({ s, i, yy: y(s.values[s.values.length - 1]) })).sort((a, z) => a.yy - z.yy);
  for (let k = 1; k < ends.length; k++) if (ends[k].yy - ends[k - 1].yy < 13) ends[k].yy = ends[k - 1].yy + 13;
  return (
    <div ref={ref} className="ochart" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Forecast after each announcement">
        {[0, 0.25, 0.5, 0.75, 1].map(v => <g key={v}><line x1={l} x2={W - r} y1={y(v)} y2={y(v)} stroke="var(--o-grid)" /><text x={l - 6} y={y(v) + 4} textAnchor="end">{v * 100}%</text></g>)}
        {ev.map((e, i) => (
          <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <line x1={x(e.t)} x2={x(e.t)} y1={t} y2={H - b} stroke={hover === i ? 'var(--o-ink3)' : 'var(--o-grid)'} strokeDasharray="2 3" />
            <text x={x(e.t)} y={H - b + 12} textAnchor="end" transform={`rotate(-45 ${x(e.t)} ${H - b + 12})`} style={{ fontSize: 10.5, fill: e.kind === 'winners' ? 'var(--o-ink)' : 'var(--o-ink3)', fontWeight: e.kind === 'winners' ? 600 : 400 }}>{e.short}{e.kind === 'winners' ? ' ★' : ''}</text>
          </g>
        ))}
        {race.series.map((s, i) => {
          let dd = '';
          s.values.forEach((v, k) => { const xx = x(ev[k].t); dd += k ? ` H${xx} V${y(v)}` : `M${xx},${y(v)}`; });
          dd += ` H${x(t1)}`;
          return <path key={s.key} d={dd} fill="none" stroke={LINE_COLORS[i]} strokeWidth={i === 0 ? 2.5 : 2} />;
        })}
        {ends.map(e => <text key={e.s.key} x={W - r + 6} y={e.yy + 4} style={{ fontSize: 11.5, fill: LINE_COLORS[e.i], fontWeight: 600 }}>{e.s.name.length > 18 ? e.s.name.slice(0, 17) + '…' : e.s.name} {pct(e.s.values[e.s.values.length - 1])}</text>)}
      </svg>
      {hover != null && (
        <div className="tip obs" style={{ position: 'absolute', left: Math.min(x(ev[hover].t) + 10, W - 220), top: 20 }}>
          <b>{ev[hover].short} {ev[hover].kind === 'winners' ? 'winners' : 'nominations'}</b>
          <div className="k">{dayShort(ev[hover].t)}</div>
          {race.series.map((s, i) => <div key={s.key} style={{ color: LINE_COLORS[i] }}>{s.name}: {pct(s.values[hover])}</div>)}
        </div>
      )}
    </div>
  );
}

type Hist = { d: string; v: Record<string, number> }[];

function Mini({ title, hist }: { title: string; hist: Hist }) {
  const [ref, W] = useWidth<HTMLDivElement>(300);
  if (!hist.length) return <div><div className="lab">{title}</div><p className="dek">No readings yet.</p></div>;
  const last = hist[hist.length - 1].v;
  const names = Object.entries(last).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n]) => n);
  const H = 170, l = 30, r = 96, t = 8, b = 18;
  const t0 = Date.parse(hist[0].d), t1 = Math.max(t0 + DAY, Date.parse(hist[hist.length - 1].d));
  const x = (dd: string) => l + ((Date.parse(dd) - t0) / (t1 - t0)) * (W - l - r);
  const y = (p: number) => t + (1 - p) * (H - t - b);
  const ends = names.map((n, i) => ({ n, i, yy: y(last[n]) })).sort((a, z) => a.yy - z.yy);
  for (let k = 1; k < ends.length; k++) if (ends[k].yy - ends[k - 1].yy < 12) ends[k].yy = ends[k - 1].yy + 12;
  return (
    <div ref={ref} className="ochart">
      <div className="lab">{title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
        {[0, 0.5, 1].map(v => <g key={v}><line x1={l} x2={W - r} y1={y(v)} y2={y(v)} stroke="var(--o-grid)" /><text x={l - 4} y={y(v) + 4} textAnchor="end">{v * 100}%</text></g>)}
        {names.map((n, i) => {
          const pts = hist.filter(p => p.v[n] != null);
          return pts.length === 1 ? <circle key={n} cx={x(pts[0].d)} cy={y(pts[0].v[n])} r={3.5} fill={LINE_COLORS[i]} /> : <path key={n} d={pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.d)},${y(p.v[n])}`).join(' ')} fill="none" stroke={LINE_COLORS[i]} strokeWidth={2} />;
        })}
        {ends.map(e => <text key={e.n} x={W - r + 6} y={e.yy + 4} style={{ fontSize: 10.5, fill: LINE_COLORS[e.i] }}>{e.n.length > 15 ? e.n.slice(0, 14) + '…' : e.n} {pct(last[e.n])}</text>)}
        <text x={l} y={H - 3}>{fmt(t0, { day: 'numeric', month: 'short' })}</text>
      </svg>
    </div>
  );
}

/** NYT slope chart: first reading on the left, the latest on the right. */
function Slope({ hist }: { hist: Hist }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  if (hist.length < 2) return <div ref={ref}><p className="dek">Comes alive after a few days of readings.</p></div>;
  const a = hist[0].v, z = hist[hist.length - 1].v;
  const names = Object.keys(z).filter(n => a[n] != null && Math.abs(z[n] - a[n]) >= 0.01).sort((p, q) => Math.abs(z[q] - a[q]) - Math.abs(z[p] - a[p])).slice(0, 8);
  if (!names.length) return <div ref={ref}><p className="dek">Nobody has moved by a point or more since {dayShort(Date.parse(hist[0].d))}.</p></div>;
  const H = 260, l = Math.min(200, W * 0.32), r = Math.min(200, W * 0.32), t = 24, b = 10;
  const y = (p: number) => t + (1 - p) * (H - t - b);
  const spread = (vals: Record<string, number>) => {
    const o = names.map(n => ({ n, yy: y(vals[n]) })).sort((p, q) => p.yy - q.yy);
    for (let k = 1; k < o.length; k++) if (o[k].yy - o[k - 1].yy < 13) o[k].yy = o[k - 1].yy + 13;
    return Object.fromEntries(o.map(e => [e.n, e.yy]));
  };
  const ya = spread(a), yz = spread(z);
  return (
    <div ref={ref} className="ochart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="First and latest readings">
        <text x={l} y={14} textAnchor="middle">{dayShort(Date.parse(hist[0].d))}</text><text x={W - r} y={14} textAnchor="middle">{dayShort(Date.parse(hist[hist.length - 1].d))}</text>
        {names.map(n => {
          const up = z[n] >= a[n];
          return (
            <g key={n}>
              <line x1={l} x2={W - r} y1={y(a[n])} y2={y(z[n])} stroke={up ? 'var(--o-s3)' : 'var(--o-s2)'} strokeWidth={2} />
              <circle cx={l} cy={y(a[n])} r={4} fill={up ? 'var(--o-s3)' : 'var(--o-s2)'} /><circle cx={W - r} cy={y(z[n])} r={4} fill={up ? 'var(--o-s3)' : 'var(--o-s2)'} />
              <text x={l - 8} y={ya[n] + 4} textAnchor="end" style={{ fontSize: 11 }}>{n.slice(0, 22)} {pct(a[n])}</text>
              <text x={W - r + 8} y={yz[n] + 4} style={{ fontSize: 11, fill: 'var(--o-ink)' }}>{pct(z[n])} {up ? '▲' : '▼'}{Math.abs(Math.round((z[n] - a[n]) * 100))}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ===================================================================== The study

const ROLE_OF: Record<string, string> = {
  cannes: 'Launch pad', venice: 'Launch pad', telluride: 'Launch pad', tiff: 'Launch pad', nyff: 'Launch pad', sundance: 'Launch pad',
  gotham: 'Early critics', nbr: 'Early critics', nyfcc: 'Early critics', lafca: 'Early critics', nsfc: 'Early critics', ccda: 'Early critics',
  cca: 'Televised precursors', globes: 'Televised precursors', spirit: 'Televised precursors',
};

export function StudyScreen({ d, h }: { d: AwardsData; h: History | null }) {
  if (!h) return <section className="ocard" style={{ gridColumn: '1 / -1' }}><p className="dek">Loading the study…</p></section>;
  const best = MAIN.map(c => {
    const list = Object.entries(h.lr).map(([pid, cats]) => ({ pid, L: cats[c] })).filter(x => x.L && x.L.n >= 10).sort((a, b) => b.L!.hit - a.L!.hit);
    return { c, top: list[0] };
  }).filter(x => x.top);
  const short = (pid: string) => h.precursors.find(p => p.id === pid)?.short ?? pid;
  return (
    <>
      <section className="ocard" style={{ gridColumn: '1 / -1' }}>
        <h2>What twenty seasons teach</h2>
        <p className="dek">{h.years[0]}–{h.years[1]}: every Oscar nominee's record at {h.precursors.length} precursors, read from Wikipedia. Seasons since 2016, with the larger and more international Academy, count double.</p>
        <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
          {best.map(({ c, top }) => <div key={c} className="kpi"><b>{pct(top!.L!.hit)}</b><span>{catName(d, c)}: the {short(top!.pid)} winner went on to win the Oscar</span></div>)}
        </div>
        <ul style={{ margin: '14px 0 0', paddingLeft: 18, lineHeight: 1.55, fontSize: 13.5, maxWidth: '90ch' }}>
          <li><b>Who votes matters.</b> The guilds' members are Academy members too: the actors' branch is the Academy's largest, so the Actor Awards (SAG) weigh on the acting races; directors, writers, editors and craftspeople vote in their own branches' nominations.</li>
          <li><b>How they vote matters.</b> The Producers Guild counts Best Picture with the same preferential ballot as the Academy, which favours the film most voters rank high rather than the one a passionate minority loves: that is why PGA is the strongest Best Picture signal.</li>
          <li><b>BAFTA moved closer.</b> Since it moved its ceremony to February and with hundreds of voters who are also Academy members, BAFTA tracks the Oscars well, except where its juries pick the acting nominees.</li>
          <li><b>Critics launch, guilds decide.</b> Festivals and critics' groups put films in the conversation but rarely call the winner; the guilds and BAFTA, voting in January and February, are the late, decisive signals.</li>
        </ul>
      </section>
      <section className="ocard" style={{ gridColumn: '1 / -1' }}>
        <h2>How often each precursor's winner wins the Oscar</h2>
        <p className="dek">Share of seasons in which the precursor's winner went on to win the Oscar in the same category (recent seasons weighted double). Darker is more reliable; empty where the precursor has no matching category or fewer than three seasons of data.</p>
        <Heatmap d={d} h={h} />
      </section>
      <section className="ocard" style={{ gridColumn: '1 / -1' }}>
        <h2>When they speak, and how much they tell</h2>
        <p className="dek">Each award placed by the date it announces this season and by how reliable its winner has been in its strongest Oscar category. The season opens with festivals and critics that say little, and ends with the guilds and BAFTA that say a lot.</p>
        <RoleScatter d={d} h={h} />
      </section>
      <section className="s-two" style={{ display: 'contents' }}>
        <div className="ocard">
          <h2>How good is the model?</h2>
          <p className="dek">Each past season forecast with the weights learned from the others: share of categories where the favourite won. Grey: all seasons; dark: since 2016.</p>
          <Backtest d={d} h={h} />
        </div>
        <div className="ocard">
          <h2>The upsets the precursors did not see</h2>
          <p className="dek">The winners the model gave the least chance, and its favourite that year.</p>
          <table className="otable"><tbody>{h.upsets.slice(0, 12).map(u => (
            <tr key={u.year + u.cat}><td>{u.year}</td><td><b>{u.winner}</b><br /><small style={{ color: 'var(--o-ink3)' }}>{catName(d, u.cat)} · favourite {u.favorite} ({pct(u.favoriteP)})</small></td><td className="n">{pct(u.winnerP)}</td></tr>
          ))}</tbody></table>
        </div>
      </section>
      <section className="ocard" style={{ gridColumn: '1 / -1' }}>
        <div className="lab">Read more</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
          <li><a href="https://www.theringer.com/2026/01/16/oscars/oscars-academy-award-show-predictors-golden-globes-bafta-sag" target="_blank" rel="noreferrer">The Ringer: Which awards are the best predictors of the Oscars?</a></li>
          <li><a href="https://www.goldderby.com/film/2026/oscar-precursors-best-worst-predictors/" target="_blank" rel="noreferrer">Gold Derby: the best and worst precursors of the 2026 nominations</a></li>
          <li><a href="https://awards.substack.com/p/what-awards-are-getting-better-at" target="_blank" rel="noreferrer">Numlock Awards: what awards are getting better at predicting the Oscars</a></li>
          <li><a href="https://www.hollywoodreporter.com/movies/movie-news/oscars-predictions-2023-math-ben-zauzmer-1235342656/" target="_blank" rel="noreferrer">Ben Zauzmer (THR): predicting the Oscars using math</a></li>
          <li><a href="https://fivethirtyeight.com/features/how-our-oscar-predictions-did/" target="_blank" rel="noreferrer">FiveThirtyEight: how our Oscar predictions did</a></li>
          <li><a href="https://www.thewrap.com/what-can-directors-guild-and-bafta-awards-tell-us-about-the-oscars/" target="_blank" rel="noreferrer">TheWrap: what the DGA and BAFTA tell us about the Oscars</a></li>
        </ul>
      </section>
    </>
  );
}

function Heatmap({ d, h }: { d: AwardsData; h: History }) {
  const cats = d.categories.filter(c => Object.values(h.lr).some(x => x[c.id] && x[c.id].n >= 3));
  const order = h.precursors.filter(p => Object.keys(h.lr[p.id] ?? {}).length);
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 2, fontFamily: 'var(--f-chart)', fontSize: 11 }}>
        <thead><tr><th />{cats.map(c => <th key={c.id} style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontWeight: 500, color: 'var(--o-ink2)', height: 110, textAlign: 'left', padding: 2 }}>{c.name}</th>)}</tr></thead>
        <tbody>{order.map(p => (
          <tr key={p.id}>
            <th style={{ textAlign: 'right', paddingRight: 8, fontWeight: 600, color: 'var(--o-ink)', whiteSpace: 'nowrap' }}>{p.short}</th>
            {cats.map(c => {
              const L = h.lr[p.id]?.[c.id];
              const ok = L && L.n >= 3;
              const k = `${p.id}:${c.id}`;
              return <td key={c.id} onPointerEnter={() => setHover(k)} onPointerLeave={() => setHover(null)} title={ok ? `${p.short} → ${c.name}: winner matched ${pct(L!.hit)} of seasons (weighted n=${L!.n}); a win multiplies the odds by ${L!.win.toFixed(1)}` : ''}
                style={{ width: 34, height: 26, textAlign: 'center', borderRadius: 3, color: ok && L!.hit > 0.55 ? '#fff' : 'var(--o-ink2)', background: ok ? `color-mix(in srgb, var(--oc-cul) ${Math.round(8 + L!.hit * 88)}%, var(--o-card))` : 'transparent', outline: hover === k ? '1.5px solid var(--o-ink)' : 'none' }}>{ok ? Math.round(L!.hit * 100) : ''}</td>;
            })}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function RoleScatter({ d, h }: { d: AwardsData; h: History }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const S = d.season, C = d.ceremonyYear;
  const t0 = Date.UTC(S, 4, 1), t1 = Date.UTC(C, 2, 20);
  const pts = d.awards.filter(a => a.id !== 'oscars').map(a => {
    const tt = awardTimes(a);
    const when = tt.win ?? tt.nom;
    const cats = Object.entries(h.lr[a.id] ?? {}).filter(([, L]) => L.n >= 5);
    const top = cats.sort((p, q) => q[1].hit - p[1].hit)[0];
    return when && top ? { a, when, hit: top[1].hit, cat: top[0], n: cats.length } : null;
  }).filter(Boolean) as { a: Award; when: number; hit: number; cat: string; n: number }[];
  const H = 360, l = 40, r = 20, t = 30, b = 30;
  const x = (tt: number) => l + ((tt - t0) / (t1 - t0)) * (W - l - r);
  const y = (v: number) => t + (1 - v) * (H - t - b);
  const lab = pts.map(p => ({ id: p.a.id, x: x(p.when), y: y(p.hit) })).sort((p, q) => p.y - q.y);
  for (let k = 0; k < lab.length; k++) for (let j = 0; j < k; j++) if (Math.abs(lab[k].x - lab[j].x) < 60 && Math.abs(lab[k].y - lab[j].y) < 12) lab[k].y = lab[j].y + 12;
  const labY = Object.fromEntries(lab.map(e => [e.id, e.y]));
  const bands: [number, number, string][] = [[t0, Date.UTC(S, 9, 20), 'Festivals launch the films'], [Date.UTC(S, 9, 20), Date.UTC(S, 11, 20), 'Critics and first nominations'], [Date.UTC(S, 11, 20), t1, 'Guilds and BAFTA decide']];
  return (
    <div ref={ref} className="ochart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Timing and reliability of the precursors">
        {bands.map(([a, z, label], i) => <g key={label}><rect x={x(a)} y={t} width={x(z) - x(a)} height={H - t - b} fill={i % 2 ? 'var(--o-grid)' : 'transparent'} opacity={0.5} /><text x={x(a) + 6} y={t - 10} style={{ fontSize: 11.5, fill: 'var(--o-ink2)', fontWeight: 600 }}>{label}</text></g>)}
        {[0, 0.25, 0.5, 0.75, 1].map(v => <g key={v}><line x1={l} x2={W - r} y1={y(v)} y2={y(v)} stroke="var(--o-grid)" /><text x={l - 6} y={y(v) + 4} textAnchor="end">{v * 100}%</text></g>)}
        {Array.from({ length: 11 }, (_, k) => Date.UTC(S, 4 + k, 1)).map(m => <text key={m} x={x(m)} y={H - 10} textAnchor="middle">{fmt(m + 15 * DAY, { month: 'short' })}</text>)}
        {pts.map(p => (
          <g key={p.a.id}>
            <circle cx={x(p.when)} cy={y(p.hit)} r={4 + Math.min(8, p.n)} fill={ROLE_OF[p.a.id] ? 'var(--o-other)' : 'var(--oc-cul)'} fillOpacity={0.75} stroke="var(--o-card)" strokeWidth={1.5}><title>{`${p.a.name}: its winner won the Oscar for ${catName(d, p.cat)} ${pct(p.hit)} of the time · speaks to ${p.n} categories`}</title></circle>
            <text x={x(p.when) + 8 + Math.min(8, p.n)} y={labY[p.a.id] + 4} style={{ fontSize: 11, fill: 'var(--o-ink)' }}>{p.a.short}</text>
          </g>
        ))}
      </svg>
      <div className="osrc">Dot size: how many Oscar categories the award speaks to. Grey: festivals, critics and televised precursors; colour: guilds and BAFTA.</div>
    </div>
  );
}

function Backtest({ d, h }: { d: AwardsData; h: History }) {
  const rows = d.categories.map(c => ({ c, a: h.accuracy[c.id] })).filter(x => x.a && x.a.n >= 5) as { c: { id: string; name: string }; a: NonNullable<History['accuracy'][string]> }[];
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      {rows.map(({ c, a }) => {
        const all = a.hits / a.n, rec = a.recent ? a.recentHits / a.recent : null;
        return (
          <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 70px', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
            <span>{c.name}</span>
            <div style={{ position: 'relative', height: 14 }}>
              <div style={{ position: 'absolute', inset: '6px 0', background: 'var(--o-grid)', borderRadius: 2 }} />
              <span title={`All seasons: ${a.hits}/${a.n}`} style={{ position: 'absolute', left: `calc(${all * 100}% - 5px)`, top: 2, width: 10, height: 10, borderRadius: 5, background: 'var(--o-other)' }} />
              {rec != null && <span title={`Since 2016: ${a.recentHits}/${a.recent}`} style={{ position: 'absolute', left: `calc(${rec * 100}% - 5px)`, top: 2, width: 10, height: 10, borderRadius: 5, background: 'var(--o-ink)' }} />}
            </div>
            <Score><span style={{ textAlign: 'right', display: 'block' }}>{a.hits}/{a.n}</span></Score>
          </div>
        );
      })}
    </div>
  );
}

export const Section = ({ children }: { children: ReactNode }) => <>{children}</>;
