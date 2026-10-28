// Charts for "who is strongest, at what": shared by every league's Power screen.
// NYT conventions: hairline grid, direct labels instead of legends, one colour for
// the team that matters and grey for the rest, a caption that says what to look at.
import { useState, type ReactNode } from 'react';
import { useWidth } from './charts';

export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** Rank (1 = best) of every value; `low` when a smaller value is better. Ties share the rank. */
export function ranks(values: Record<string, number | null | undefined>, low = false): Record<string, number> {
  const xs = Object.entries(values).filter((e): e is [string, number] => e[1] != null && Number.isFinite(e[1]));
  xs.sort((a, b) => (low ? a[1] - b[1] : b[1] - a[1]));
  const out: Record<string, number> = {};
  xs.forEach(([k, v], i) => { out[k] = i > 0 && xs[i - 1][1] === v ? out[xs[i - 1][0]] : i + 1; });
  return out;
}

/** Diverging cell colour: blue for the good end, orange for the bad end, card colour in the middle. */
export function goodBad(p: number | null): string {
  if (p == null) return 'transparent';
  const d = Math.abs(p - 0.5) * 2;
  return `color-mix(in srgb, ${p >= 0.5 ? 'var(--o-s1)' : 'var(--o-s2)'} ${Math.round(d * 78)}%, var(--o-card))`;
}
/** Ink that stays readable on a goodBad() cell. */
export const goodBadInk = (p: number | null) => (p != null && Math.abs(p - 0.5) > 0.36 ? '#fff' : 'var(--o-ink)');

export interface QPoint { id: string; label: string; x: number; y: number; tip: ReactNode; color?: string }

/**
 * Two qualities at once: one dot per team, average lines through the middle,
 * each corner named. With `invertY` a smaller y is drawn higher (a defence allowing less).
 */
export function QuadrantScatter({ points, xLabel, yLabel, invertY = false, corners, fmt = (v: number) => v.toFixed(2), fmtX, height = 440 }: {
  points: QPoint[]; xLabel: string; yLabel: string; invertY?: boolean; corners: [string, string, string, string]; fmt?: (v: number) => string; fmtX?: (v: number) => string; height?: number;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hot, setHot] = useState<string | null>(null);
  if (!points.length) return null;
  const H = height, l = 46, r = 16, t = 16, b = 40;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const pad = (lo: number, hi: number) => { const d = (hi - lo || 1) * 0.08; return [lo - d, hi + d]; };
  const [x0, x1] = pad(Math.min(...xs), Math.max(...xs)), [y0, y1] = pad(Math.min(...ys), Math.max(...ys));
  const x = (v: number) => l + ((v - x0) / (x1 - x0)) * (W - l - r);
  const y = (v: number) => (invertY ? t + ((v - y0) / (y1 - y0)) * (H - t - b) : t + ((y1 - v) / (y1 - y0)) * (H - t - b));
  const mx = xs.reduce((a, v) => a + v, 0) / xs.length, my = ys.reduce((a, v) => a + v, 0) / ys.length;
  const ticks = (lo: number, hi: number) => { const s = niceStep((hi - lo) / 5); const out = []; for (let v = Math.ceil(lo / s) * s; v <= hi; v += s) out.push(+v.toFixed(6)); return out; };
  const hp = points.find(p => p.id === hot);
  const cs = { fontSize: 11, fontWeight: 600, fill: 'var(--o-ink2)', letterSpacing: '.04em', textTransform: 'uppercase' } as const;
  return (
    <div ref={ref} className="ochart" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`${xLabel} against ${yLabel}`}>
        {ticks(x0, x1).map(v => <g key={`x${v}`}><line x1={x(v)} x2={x(v)} y1={t} y2={H - b} stroke="var(--o-grid)" /><text x={x(v)} y={H - b + 14} textAnchor="middle">{(fmtX ?? fmt)(v)}</text></g>)}
        {ticks(y0, y1).map(v => <g key={`y${v}`}><line x1={l} x2={W - r} y1={y(v)} y2={y(v)} stroke="var(--o-grid)" /><text x={l - 6} y={y(v) + 4} textAnchor="end">{fmt(v)}</text></g>)}
        <line x1={x(mx)} x2={x(mx)} y1={t} y2={H - b} stroke="var(--o-ink3)" strokeDasharray="3 3" />
        <line x1={l} x2={W - r} y1={y(my)} y2={y(my)} stroke="var(--o-ink3)" strokeDasharray="3 3" />
        <text x={W - r - 4} y={t + 12} textAnchor="end" style={cs}>{corners[0]}</text>
        <text x={l + 6} y={t + 12} style={cs}>{corners[1]}</text>
        <text x={W - r - 4} y={H - b - 8} textAnchor="end" style={cs}>{corners[2]}</text>
        <text x={l + 6} y={H - b - 8} style={cs}>{corners[3]}</text>
        <text x={(l + W - r) / 2} y={H - 6} textAnchor="middle" style={{ fill: 'var(--o-ink2)' }}>{xLabel} →</text>
        <text x={12} y={(t + H - b) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(t + H - b) / 2})`} style={{ fill: 'var(--o-ink2)' }}>{yLabel} →</text>
        {[...points].sort((a, b) => Number(Boolean(a.color)) - Number(Boolean(b.color))).map(p => (
          <g key={p.id} onPointerEnter={() => setHot(p.id)} onPointerLeave={() => setHot(null)}>
            <circle cx={x(p.x)} cy={y(p.y)} r={12} fill="transparent" />
            <circle cx={x(p.x)} cy={y(p.y)} r={p.color ? 6 : 4.5} fill={p.color ?? 'var(--o-other)'} stroke="var(--o-card)" strokeWidth={1.5} opacity={hot && hot !== p.id ? 0.35 : 1} />
            <text x={x(p.x) + 7} y={y(p.y) + 4} style={{ fontSize: p.color ? 11.5 : 10, fontWeight: p.color ? 700 : 500, fill: p.color ? 'var(--o-ink)' : 'var(--o-ink2)' }} opacity={hot && hot !== p.id ? 0.35 : 1}>{p.label}</text>
          </g>
        ))}
      </svg>
      {hp && <div className="tip obs" style={{ position: 'absolute', left: Math.min(W - 230, x(hp.x) + 14), top: Math.max(0, y(hp.y) - 30) }}>{hp.tip}</div>}
    </div>
  );
}

function niceStep(raw: number) {
  const p = 10 ** Math.floor(Math.log10(raw || 1)), m = raw / p;
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
}

/** `neutral`: a style column (more is not better), shown without colour. */
export interface GridCol { key: string; label: string; group?: string; low?: boolean; fmt?: (v: number) => string; title?: string; neutral?: boolean }
export interface GridRow { id: string; label: ReactNode; values: Record<string, number | null | undefined>; me?: boolean }

/**
 * Teams × metrics, each cell coloured by rank (blue = among the best, orange = among
 * the worst). Click a column to sort by it.
 */
export function PercentileGrid({ rows, cols, initial }: { rows: GridRow[]; cols: GridCol[]; initial?: string }) {
  const [sort, setSort] = useState(initial ?? cols[0].key);
  const rk = Object.fromEntries(cols.map(c => [c.key, ranks(Object.fromEntries(rows.map(r => [r.id, r.values[c.key]])), c.low)]));
  const n = rows.length;
  const sorted = [...rows].sort((a, b) => (rk[sort][a.id] ?? 99) - (rk[sort][b.id] ?? 99));
  const groups: { g: string; span: number }[] = [];
  for (const c of cols) { const g = c.group ?? ''; if (groups.length && groups[groups.length - 1].g === g) groups[groups.length - 1].span++; else groups.push({ g, span: 1 }); }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="otable" style={{ fontSize: 12, minWidth: 140 + cols.length * 58 }}>
        <thead>
          {groups.some(g => g.g) && <tr><th style={{ border: 0 }} />{groups.map((g, i) => <th key={i} colSpan={g.span} style={{ textAlign: 'center', borderBottom: g.g ? '1px solid var(--o-line)' : 0 }}>{g.g}</th>)}</tr>}
          <tr><th>Team</th>{cols.map(c => <th key={c.key} className="n" title={c.title} style={{ cursor: 'pointer', color: sort === c.key ? 'var(--o-ink)' : undefined, whiteSpace: 'nowrap' }} onClick={() => setSort(c.key)}>{c.label}{sort === c.key ? ' ↓' : ''}</th>)}</tr>
        </thead>
        <tbody>
          {sorted.map(r => (
            <tr key={r.id} className={r.me ? 'me' : ''}>
              <td style={{ whiteSpace: 'nowrap' }}>{r.label}</td>
              {cols.map(c => {
                const v = r.values[c.key], k = rk[c.key][r.id];
                const p = k && !c.neutral ? 1 - (k - 1) / Math.max(1, n - 1) : null;
                return <td key={c.key} className="n" title={k ? `${ordinal(k)} of ${n}` : ''} style={{ background: goodBad(p), color: goodBadInk(p), fontWeight: sort === c.key ? 700 : 500 }}>{v == null ? '–' : c.fmt ? c.fmt(v) : v}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** `neutral`: a style, not a quality (more is not better); the rank then reads “3rd most”. */
export interface StripMetric { key: string; label: string; low?: boolean; fmt: (v: number) => string; note?: string; neutral?: boolean }

/**
 * One line per metric with a dot for every team (a strip plot): where the chosen
 * team sits in the league, and its rank, at a glance. Better is always to the right.
 */
export function RankStrips({ metrics, values, me, color, labelOf, compare = [], axis = 'better →' }: {
  metrics: StripMetric[]; values: Record<string, Record<string, number | null | undefined>>; me: string; color: string; labelOf: (id: string) => string;
  compare?: { id: string; color: string }[]; axis?: string;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ m: string; id: string } | null>(null);
  const row = 44, l = Math.min(190, W * 0.34), r = 78, H = metrics.length * row + 8;
  const ids = Object.keys(values);
  return (
    <div ref={ref} className="ochart" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Rank in each metric">
        {metrics.map((m, i) => {
          const vals = ids.map(id => values[id][m.key]).filter((v): v is number => v != null);
          if (!vals.length) return null;
          const lo = Math.min(...vals), hi = Math.max(...vals);
          const x = (v: number) => { const f = (v - lo) / (hi - lo || 1); return l + (m.low ? 1 - f : f) * (W - l - r); };
          const rk = ranks(Object.fromEntries(ids.map(id => [id, values[id][m.key]])), m.low);
          const yy = i * row + row / 2 + 2, mine = values[me]?.[m.key];
          return (
            <g key={m.key}>
              <text x={0} y={yy - 2} style={{ fill: 'var(--o-ink)', fontSize: 12 }}>{m.label}</text>
              {m.note && <text x={0} y={yy + 11} style={{ fontSize: 10 }}>{m.note}</text>}
              <line x1={l} x2={W - r} y1={yy} y2={yy} stroke="var(--o-grid)" />
              {ids.filter(id => id !== me && !compare.some(c => c.id === id)).map(id => values[id][m.key] == null ? null : (
                <circle key={id} cx={x(values[id][m.key]!)} cy={yy} r={4} fill="var(--o-other)" opacity={0.55} onPointerEnter={() => setHover({ m: m.key, id })} onPointerLeave={() => setHover(null)} />
              ))}
              {compare.map(c => values[c.id]?.[m.key] == null ? null : <circle key={c.id} cx={x(values[c.id][m.key]!)} cy={yy} r={5} fill={c.color} stroke="var(--o-card)" strokeWidth={1.5} onPointerEnter={() => setHover({ m: m.key, id: c.id })} onPointerLeave={() => setHover(null)} />)}
              {mine != null && <>
                <circle cx={x(mine)} cy={yy} r={7} fill={color} stroke="var(--o-card)" strokeWidth={2} onPointerEnter={() => setHover({ m: m.key, id: me })} onPointerLeave={() => setHover(null)} />
                <text x={W} y={yy + 4} textAnchor="end" style={{ fill: 'var(--o-ink)', fontWeight: 700, fontSize: 12 }}>{ordinal(rk[me])}{m.neutral ? ' most' : ''}</text>
                <text x={x(mine)} y={yy + 18} textAnchor="middle" style={{ fill: 'var(--o-ink2)', fontSize: 10.5, fontWeight: 600 }}>{m.fmt(mine)}</text>
              </>}
              {hover?.m === m.key && values[hover.id]?.[m.key] != null && (
                <text x={x(values[hover.id][m.key]!)} y={yy - 10} textAnchor="middle" style={{ fill: 'var(--o-ink)', fontWeight: 600 }}>{labelOf(hover.id)} {m.fmt(values[hover.id][m.key]!)} · {ordinal(rk[hover.id])}</text>
              )}
            </g>
          );
        })}
        <text x={W - r} y={H - 1} textAnchor="end" style={{ fontSize: 10 }}>{axis}</text>
      </svg>
    </div>
  );
}

export interface SpaghettiSeries { id: string; label: string; values: (number | null)[]; color?: string }

/**
 * Every team as a thin grey line, the ones that matter in colour with a label at
 * the end: a NYT "many lines, one story" chart. Values may go below zero.
 */
export function Spaghetti({ steps, series, fmt = (v: number) => v.toFixed(2), zero = true, height = 300 }: { steps: string[]; series: SpaghettiSeries[]; fmt?: (v: number) => string; zero?: boolean; height?: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hot, setHot] = useState<string | null>(null);
  const all = series.flatMap(s => s.values.filter((v): v is number => v != null));
  if (!all.length || steps.length < 2) return null;
  const H = height, l = 40, r = 110, t = 12, b = 24;
  let lo = Math.min(...all), hi = Math.max(...all);
  if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  const s = niceStep((hi - lo) / 5); lo = Math.floor(lo / s) * s; hi = Math.ceil(hi / s) * s;
  const x = (i: number) => l + (i / (steps.length - 1)) * (W - l - r);
  const y = (v: number) => t + ((hi - v) / (hi - lo || 1)) * (H - t - b);
  const path = (vs: (number | null)[]) => { let d = '', pen = false; vs.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i)},${y(v)} `; pen = true; }); return d; };
  const lastI = (vs: (number | null)[]) => vs.reduce<number>((a, v, i) => (v != null ? i : a), -1);
  const lit = series.filter(z => z.color || z.id === hot);
  const ends = lit.map(z => ({ z, i: lastI(z.values) })).filter(e => e.i >= 0).map(e => ({ ...e, yy: y(e.z.values[e.i]!) })).sort((a, b) => a.yy - b.yy);
  for (let k = 1; k < ends.length; k++) if (ends[k].yy - ends[k - 1].yy < 13) ends[k].yy = ends[k - 1].yy + 13;
  const ticks: number[] = []; for (let v = lo; v <= hi + 1e-9; v += s) ticks.push(+v.toFixed(6));
  const every = Math.ceil(steps.length / Math.max(1, Math.floor((W - l - r) / 34)));
  return (
    <div ref={ref} className="ochart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Trend for every team">
        {ticks.map(v => <g key={v}><line x1={l} x2={W - r} y1={y(v)} y2={y(v)} stroke={v === 0 && zero ? 'var(--o-ink3)' : 'var(--o-grid)'} /><text x={l - 6} y={y(v) + 4} textAnchor="end">{fmt(v)}</text></g>)}
        {steps.map((st, i) => (i % every === 0 || i === steps.length - 1 ? <text key={i} x={x(i)} y={H - 6} textAnchor="middle">{st}</text> : null))}
        {series.filter(z => !z.color && z.id !== hot).map(z => (
          <g key={z.id} onPointerEnter={() => setHot(z.id)} onPointerLeave={() => setHot(null)}>
            <path d={path(z.values)} fill="none" stroke="transparent" strokeWidth={8} />
            <path d={path(z.values)} fill="none" stroke="var(--o-other)" strokeWidth={1} opacity={0.6} />
          </g>
        ))}
        {lit.map(z => <path key={z.id} d={path(z.values)} fill="none" stroke={z.color ?? 'var(--o-ink2)'} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" onPointerLeave={() => setHot(null)} />)}
        {ends.map(({ z, i, yy }) => <g key={z.id}><circle cx={x(i)} cy={y(z.values[i]!)} r={3.5} fill={z.color ?? 'var(--o-ink2)'} /><text className="lbl" x={x(i) + 8} y={yy + 4} style={{ fontSize: 11.5 }}>{z.label} {fmt(z.values[i]!)}</text></g>)}
      </svg>
    </div>
  );
}

/** The chance of winning through a game: the line above the middle favours the home team. */
export function WinProb({ points, home, away, homeColor, awayColor, periods = 4, prefix = 'Q' }: { points: { t: number; p: number }[]; home: string; away: string; homeColor: string; awayColor: string; periods?: number; prefix?: string }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  if (points.length < 2) return null;
  const H = 200, l = 40, r = 10, t = 12, b = 22;
  const x = (v: number) => l + v * (W - l - r);
  const y = (p: number) => t + (1 - p) * (H - t - b);
  const line = points.map(q => `${x(q.t)},${y(q.p)}`).join(' ');
  const clip = (above: boolean) => `M${x(0)},${y(0.5)} ${points.map(q => `L${x(q.t)},${y(above ? Math.max(0.5, q.p) : Math.min(0.5, q.p))}`).join(' ')} L${x(points[points.length - 1].t)},${y(0.5)}Z`;
  return (
    <div ref={ref} className="ochart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Win probability">
        {[0, 0.25, 0.5, 0.75, 1].map(p => <g key={p}><line x1={l} x2={W - r} y1={y(p)} y2={y(p)} stroke={p === 0.5 ? 'var(--o-ink3)' : 'var(--o-grid)'} /><text x={l - 6} y={y(p) + 4} textAnchor="end">{p === 0.5 ? '50%' : `${Math.round(Math.abs(p - 0.5) * 200)}%`}</text></g>)}
        {Array.from({ length: periods - 1 }, (_, i) => <line key={i} x1={x((i + 1) / periods)} x2={x((i + 1) / periods)} y1={t} y2={H - b} stroke="var(--o-grid)" />)}
        {Array.from({ length: periods }, (_, i) => <text key={i} x={x((i + 0.5) / periods)} y={H - 6} textAnchor="middle">{prefix}{i + 1}</text>)}
        <path d={clip(true)} fill={homeColor} fillOpacity={0.18} />
        <path d={clip(false)} fill={awayColor} fillOpacity={0.18} />
        <polyline points={line} fill="none" stroke="var(--o-ink)" strokeWidth={1.6} strokeLinejoin="round" />
        <text x={l + 6} y={t + 12} style={{ fill: 'var(--o-ink)', fontWeight: 700 }}>{home}</text>
        <text x={l + 6} y={H - b - 6} style={{ fill: 'var(--o-ink)', fontWeight: 700 }}>{away}</text>
      </svg>
    </div>
  );
}

/** A probability as a shaded bar inside a table cell (Upshot style). */
export function ProbCell({ p, color = 'var(--o-s1)' }: { p: number | null | undefined; color?: string }) {
  if (p == null) return <td className="n">–</td>;
  const label = p >= 99.5 ? '>99%' : p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`;
  return (
    <td className="n" style={{ position: 'relative', minWidth: 62 }}>
      <span style={{ position: 'absolute', left: 4, right: 4, top: 6, bottom: 6, background: `linear-gradient(90deg, color-mix(in srgb, ${color} 35%, transparent) ${p}%, transparent ${p}%)`, borderRadius: 3 }} />
      <span style={{ position: 'relative' }}>{label}</span>
    </td>
  );
}

/** Two values joined by a line, for many rows (a dumbbell / dot plot). */
export function Dumbbells({ rows, aLabel, bLabel, aColor, bColor, fmt = (v: number) => v.toFixed(2), better = 'high' }: {
  rows: { id: string; label: string; a: number; b: number; me?: boolean }[]; aLabel: string; bLabel: string; aColor: string; bColor: string; fmt?: (v: number) => string; better?: 'high' | 'low';
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  if (!rows.length) return null;
  const row = 20, l = 70, r = 20, t = 22, H = rows.length * row + t + 18;
  const vals = rows.flatMap(z => [z.a, z.b]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const x = (v: number) => { const f = (v - lo) / (hi - lo || 1); return l + (better === 'low' ? 1 - f : f) * (W - l - r); };
  return (
    <div ref={ref} className="ochart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`${aLabel} and ${bLabel}`}>
        <circle cx={l} cy={8} r={4.5} fill={aColor} /><text x={l + 8} y={12} style={{ fill: 'var(--o-ink2)' }}>{aLabel}</text>
        <circle cx={l + 130} cy={8} r={4.5} fill={bColor} /><text x={l + 138} y={12} style={{ fill: 'var(--o-ink2)' }}>{bLabel}</text>
        <text x={W - r} y={12} textAnchor="end" style={{ fontSize: 10 }}>better →</text>
        {rows.map((z, i) => {
          const yy = t + i * row + row / 2;
          return (
            <g key={z.id}>
              <text x={0} y={yy + 4} style={{ fill: z.me ? 'var(--o-ink)' : 'var(--o-ink2)', fontWeight: z.me ? 700 : 400, fontSize: 11.5 }}>{z.label}</text>
              <line x1={l} x2={W - r} y1={yy} y2={yy} stroke="var(--o-grid)" />
              <line x1={x(z.a)} x2={x(z.b)} y1={yy} y2={yy} stroke="var(--o-ink3)" strokeWidth={2} />
              <circle cx={x(z.a)} cy={yy} r={4.5} fill={aColor}><title>{`${aLabel}: ${fmt(z.a)}`}</title></circle>
              <circle cx={x(z.b)} cy={yy} r={4.5} fill={bColor}><title>{`${bLabel}: ${fmt(z.b)}`}</title></circle>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
