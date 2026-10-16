import { useEffect, useRef, useState } from 'react';
import { fmt } from '../core/time';

/** Width of a container, so SVG text keeps its real size instead of scaling with the viewBox. */
export function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export interface Bar { label: string; value: number; tip: string }

/** Margin per game around a zero baseline: wins in the passion color, losses in grey. */
export function DiffBars({ bars, color }: { bars: Bar[]; color: string }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 240, l = 34, r = 8, t = 20, b = 30;
  const max = Math.max(4, ...bars.map(x => Math.abs(x.value)));
  // Ticks at whole numbers: round the range up to a multiple of 2 (small) or 10 (large).
  const hi = max <= 10 ? Math.ceil(max / 2) * 2 : Math.ceil(max / 10) * 10;
  const y = (v: number) => t + ((hi - v) / (2 * hi)) * (H - t - b);
  const band = (W - l - r) / Math.max(1, bars.length), bw = Math.min(24, band * 0.55);
  const ticks = [-hi, -hi / 2, 0, hi / 2, hi];
  const every = Math.ceil(bars.length / Math.max(1, Math.floor((W - l) / 46)));
  return (
    <div ref={ref} className="ochart" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Margin of each game">
        {ticks.map(v => (
          <g key={v}>
            <line x1={l} x2={W - r} y1={y(v)} y2={y(v)} stroke={v === 0 ? 'var(--o-ink3)' : 'var(--o-grid)'} />
            <text x={l - 6} y={y(v) + 4} textAnchor="end">{v > 0 ? `+${v}` : v}</text>
          </g>
        ))}
        {bars.map((x, i) => {
          const cx = l + band * i + band / 2, y0 = y(0), y1 = y(x.value), h = Math.abs(y1 - y0), top = Math.min(y0, y1);
          const up = x.value >= 0;
          // 4px rounded data end, square at the baseline
          const d = x.value === 0 ? `M${cx - bw / 2},${y0 - 1}h${bw}v2h${-bw}Z` : up
            ? `M${cx - bw / 2},${y0}V${top + 4}q0,-4 4,-4H${cx + bw / 2 - 4}q4,0 4,4V${y0}Z`
            : `M${cx - bw / 2},${y0}V${top + h - 4}q0,4 4,4H${cx + bw / 2 - 4}q4,0 4,-4V${y0}Z`;
          return (
            <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              <rect x={cx - band / 2} y={t} width={band} height={H - t - b} fill="transparent" />
              <path d={d} fill={x.value > 0 ? color : 'var(--o-other)'} opacity={hover === null || hover === i ? 1 : 0.45} />
              {(bars.length <= 12 || hover === i) && (
                <text x={cx} y={up ? top - 5 : top + h + 13} textAnchor="middle" style={{ fill: 'var(--o-ink2)', fontWeight: 600 }}>{x.value > 0 ? `+${x.value}` : x.value}</text>
              )}
              {i % every === 0 && <text x={cx} y={H - 8} textAnchor="middle">{x.label}</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="tip obs" style={{ position: 'absolute', left: Math.min(W - 220, l + band * hover + band / 2 + 10), top: 0 }}>{bars[hover].tip}</div>
      )}
    </div>
  );
}

/** Horizontal bars for a points table (for example the F1 drivers' championship). */
export function PointsBars({ rows, color, unit = 'pts', labelWidth = 110 }: { rows: { name: string; value: number; sub?: string }[]; color: string; unit?: string; labelWidth?: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const row = 26, H = rows.length * row + 6, l = labelWidth, r = 150;
  const max = Math.max(1, ...rows.map(x => x.value));
  return (
    <div ref={ref} className="ochart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Points table">
        {rows.map((x, i) => {
          const w = ((W - l - r) * x.value) / max, yy = i * row + 4;
          return (
            <g key={x.name}>
              <text x={0} y={yy + 13} style={{ fill: 'var(--o-ink)', fontSize: 12 }}>{x.name}</text>
              <path d={w > 4 ? `M${l},${yy}H${l + w - 4}q4,0 4,4V${yy + 12}q0,4 -4,4H${l}Z` : `M${l},${yy}h${Math.max(1, w)}v16h${-Math.max(1, w)}Z`} fill={color} opacity={i === 0 ? 1 : 0.75} />
              <text x={l + w + 6} y={yy + 13} style={{ fill: 'var(--o-ink2)', fontWeight: 600 }}>{x.value} {i === 0 ? unit : ''}</text>
              {x.sub && <text x={W} y={yy + 13} textAnchor="end">{x.sub}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const LV = ['Pause', 'Low', 'Medium', 'Peak'];

/** The next twelve months of a passion, from its Jan..Dec intensity. */
export function SeasonStrip({ heat, now }: { heat: number[]; now: number }) {
  const m0 = Number(fmt(now, { month: 'numeric' })) - 1, y0 = Number(fmt(now, { year: 'numeric' }));
  const months = Array.from({ length: 12 }, (_, i) => ({ m: (m0 + i) % 12, y: y0 + Math.floor((m0 + i) / 12) }));
  const name = (m: number, y: number, style: 'short' | 'long') => new Intl.DateTimeFormat('en-GB', { month: style }).format(new Date(y, m, 15));
  return (
    <>
      <div className="oheat">
        {months.map((o, i) => <div key={i} className={i === 0 ? 'now' : ''} style={{ background: `var(--o-h${heat[o.m]})` }} title={`${name(o.m, o.y, 'long')} ${o.y}: ${LV[heat[o.m]]}`} />)}
        {months.map((o, i) => <span key={'l' + i} className={i === 0 ? 'now' : ''}>{i === 0 ? 'Now' : name(o.m, o.y, 'short')}</span>)}
      </div>
      <div className="olegend" style={{ marginTop: 10 }}>
        {LV.map((l, i) => <span key={l}><i style={{ background: `var(--o-h${i})`, height: 10 }} />{l}</span>)}
      </div>
    </>
  );
}

export interface RaceMargin { state: string; seat: string; margin: number | null; dem?: string; rep?: string; rating?: string | null }

/**
 * Polling margin per race around an "even" line (NYT dot style).
 * Works on both surfaces: pass the token set of the surface it sits on.
 */
export function MarginDots({ races, tokens, compact = false }: {
  races: RaceMargin[];
  tokens: { ink: string; ink2: string; ink3: string; grid: string; dem: string; rep: string; surface: string };
  compact?: boolean;
}) {
  const [ref, W] = useWidth<HTMLDivElement>(320);
  const [hover, setHover] = useState<number | null>(null);
  const rows = races.filter(r => r.margin !== null);
  const row = compact ? 20 : 30, l = compact ? 92 : 210, r = compact ? 44 : 56, H = rows.length * row + 24;
  // Domain fits the data but always keeps some room on both sides of "even".
  const ms = rows.map(x => x.margin!);
  const step = Math.max(...ms.map(Math.abs)) > 8 ? 4 : 2;
  const lo = Math.min(-step, Math.floor(Math.min(...ms) / step) * step), hi = Math.max(step, Math.ceil(Math.max(...ms) / step) * step);
  const x = (v: number) => l + ((v - lo) / (hi - lo)) * (W - l - r);
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
  const lab = (v: number) => (v === 0 ? 'Even' : `${v < 0 ? 'R' : 'D'}+${Math.abs(v)}`);
  const fs = compact ? 10.5 : 12;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Polling margin by Senate race" style={{ display: 'block', fontFamily: compact ? 'var(--f-mono)' : 'var(--f-chart)' }}>
        {ticks.map(v => (
          <g key={v}>
            <line x1={x(v)} x2={x(v)} y1={4} y2={H - 18} stroke={v === 0 ? tokens.ink3 : tokens.grid} />
            <text x={x(v)} y={H - 4} textAnchor="middle" style={{ fill: tokens.ink3, fontSize: 10 }}>{lab(v)}</text>
          </g>
        ))}
        {rows.map((race, i) => {
          const y = (compact ? 12 : 16) + i * row, m = race.margin!, c = m >= 0 ? tokens.dem : tokens.rep;
          return (
            <g key={race.state} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              <rect x={0} y={y - row / 2} width={W} height={row} fill="transparent" />
              <text x={0} y={y + 4} style={{ fill: tokens.ink, fontSize: fs, fontWeight: compact ? 400 : 600 }}>{race.state}</text>
              {!compact && <text x={l - 12} y={y + 4} textAnchor="end" style={{ fill: tokens.ink3, fontSize: 10.5 }}>{race.seat}</text>}
              <line x1={x(0)} x2={x(m)} y1={y} y2={y} stroke={c} strokeWidth={2} />
              <circle cx={x(m)} cy={y} r={compact ? 4.5 : 5.5} fill={c} stroke={tokens.surface} strokeWidth={2} />
              <text x={W} y={y + 4} textAnchor="end" style={{ fill: tokens.ink, fontWeight: 600, fontSize: fs }}>{lab(Math.round(m * 10) / 10)}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && rows[hover].dem && (
        <div className={`tip${compact ? '' : ' obs'}`} style={{ position: 'absolute', left: Math.min(W - 240, x(rows[hover].margin!) + 12), top: (compact ? 12 : 16) + hover * row - 10 }}>
          <div className="k">{rows[hover].state} · {rows[hover].rating ?? 'Unrated'}</div>
          <div>{rows[hover].dem} (D) vs {rows[hover].rep} (R)</div>
          <b>{lab(Math.round(rows[hover].margin! * 10) / 10)}</b>
        </div>
      )}
    </div>
  );
}

export interface TrendPoint { x: number; y: number; tip: string }

/**
 * A single series over time around a zero line, NYT style: 2px line, light area
 * wash, hairline grid, direct label at the end and at the peak, crosshair on hover.
 */
export function TrendLine({ points, color, unit, notes = [] }: { points: TrendPoint[]; color: string; unit: string; notes?: { x: number; text: string }[] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;
  const H = 260, l = 36, r = 92, t = 18, b = 26;
  const x0 = points[0].x, x1 = points[points.length - 1].x;
  const ys = points.map(p => p.y);
  const step = Math.max(...ys.map(Math.abs)) > 30 ? 10 : 5;
  const lo = Math.min(0, Math.floor(Math.min(...ys) / step) * step), hi = Math.max(step, Math.ceil(Math.max(...ys) / step) * step);
  const x = (v: number) => l + ((v - x0) / (x1 - x0 || 1)) * (W - l - r);
  const y = (v: number) => t + ((hi - v) / (hi - lo)) * (H - t - b);
  const line = points.map(p => `${x(p.x)},${y(p.y)}`).join(' ');
  const area = `${x(x0)},${y(0)} ${line} ${x(x1)},${y(0)}`;
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
  const months: number[] = [];
  // Month ticks, skipping one that would sit on top of the first point.
  for (let d = new Date(new Date(x0).getFullYear(), new Date(x0).getMonth() + 1, 1); d.getTime() <= x1; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(d.getTime());
  const peak = points.reduce((a, p) => (p.y > a.y ? p : a), points[0]);
  const last = points[points.length - 1];
  const fmtY = (v: number) => `${v > 0 ? '+' : ''}${v}`;
  return (
    <div ref={ref} className="ochart" style={{ position: 'relative' }}
      onPointerMove={ev => {
        const box = (ev.currentTarget as HTMLDivElement).getBoundingClientRect();
        const px = ev.clientX - box.left;
        let best = 0;
        points.forEach((p, i) => { if (Math.abs(x(p.x) - px) < Math.abs(x(points[best].x) - px)) best = i; });
        setHover(best);
      }}
      onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`Trend in ${unit}`}>
        {ticks.map(v => (
          <g key={v}>
            <line x1={l} x2={W - r} y1={y(v)} y2={y(v)} stroke={v === 0 ? 'var(--o-ink3)' : 'var(--o-grid)'} />
            <text x={l - 6} y={y(v) + 4} textAnchor="end">{fmtY(v)}</text>
          </g>
        ))}
        {months.map(m => <text key={m} x={x(m)} y={H - 6} textAnchor="middle">{new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(m)}</text>)}
        {notes.map(n => (
          <g key={n.text}>
            <line x1={x(n.x)} x2={x(n.x)} y1={t} y2={H - b} stroke="var(--o-ink3)" strokeDasharray="0" strokeWidth={1} />
            <text x={x(n.x) + 5} y={t + 10} style={{ fill: 'var(--o-ink2)' }}>{n.text}</text>
          </g>
        ))}
        <polygon points={area} fill={color} fillOpacity={0.1} />
        <polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {peak !== last && (
          <g>
            <circle cx={x(peak.x)} cy={y(peak.y)} r={4} fill={color} stroke="var(--o-card)" strokeWidth={2} />
            <text x={x(peak.x)} y={y(peak.y) - 9} textAnchor="middle" style={{ fill: 'var(--o-ink2)', fontWeight: 600 }}>Peak {fmtY(peak.y)}</text>
          </g>
        )}
        <circle cx={x(last.x)} cy={y(last.y)} r={4.5} fill={color} stroke="var(--o-card)" strokeWidth={2} />
        <text className="lbl" x={x(last.x) + 9} y={y(last.y) + 4}>{fmtY(last.y)} {unit}</text>
        {hover !== null && (
          <g>
            <line x1={x(points[hover].x)} x2={x(points[hover].x)} y1={t} y2={H - b} stroke="var(--o-ink3)" />
            <circle cx={x(points[hover].x)} cy={y(points[hover].y)} r={4} fill={color} stroke="var(--o-card)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="tip obs" style={{ position: 'absolute', left: Math.min(W - 230, x(points[hover].x) + 12), top: 8 }}>{points[hover].tip}</div>
      )}
    </div>
  );
}

export interface BumpSeries { id: string; name: string; ranks: (number | null)[]; color?: string }

/**
 * Rank over time (1 at the top), NYT bump-chart style: highlighted teams in
 * color, the rest in grey, labels at the right edge. Hover a line to isolate it.
 */
export function BumpChart({ weeks, series, maxRank = 25 }: { weeks: number[]; series: BumpSeries[]; maxRank?: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hot, setHot] = useState<string | null>(null);
  const H = Math.max(240, maxRank * 16), l = 30, r = 130, t = 12, b = 24;
  const x = (i: number) => l + (i / Math.max(1, weeks.length - 1)) * (W - l - r);
  const y = (rank: number) => t + ((rank - 1) / (maxRank - 1)) * (H - t - b);
  const ordered = [...series].sort((a, b) => Number(Boolean(a.color)) - Number(Boolean(b.color)));
  // End labels: sort by final rank and keep at least 13px apart
  const ends = series.map(s => ({ s, last: s.ranks[s.ranks.length - 1] })).filter(e => e.last).sort((a, b) => a.last! - b.last!);
  let prev = -Infinity;
  const labelY = new Map<string, number>();
  for (const e of ends) { const yy = Math.max(y(e.last!), prev + 13); labelY.set(e.s.id, yy); prev = yy; }
  const path = (s: BumpSeries) => {
    let d = '', pen = false;
    s.ranks.forEach((rk, i) => { if (rk == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i)},${y(rk)} `; pen = true; });
    return d;
  };
  return (
    <div ref={ref} className="ochart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Ranking by week">
        {[1, 5, 10, 15, 20, 25].filter(v => v <= maxRank).map(v => (
          <g key={v}><line x1={l} x2={W - r} y1={y(v)} y2={y(v)} stroke="var(--o-grid)" /><text x={l - 8} y={y(v) + 4} textAnchor="end">{v}</text></g>
        ))}
        {weeks.map((w, i) => <text key={w} x={x(i)} y={H - 6} textAnchor="middle">{i === 0 ? `Wk ${w}` : w}</text>)}
        {ordered.map(s => {
          const c = s.color ?? 'var(--o-other)';
          const dim = hot !== null && hot !== s.id;
          return (
            <g key={s.id} onPointerEnter={() => setHot(s.id)} onPointerLeave={() => setHot(null)} style={{ cursor: 'default' }}>
              <path d={path(s)} fill="none" stroke="transparent" strokeWidth={12} />
              <path d={path(s)} fill="none" stroke={c} strokeWidth={s.color || hot === s.id ? 2.5 : 1.5} strokeLinejoin="round" strokeLinecap="round" opacity={dim ? 0.15 : 1} />
              {s.ranks.map((rk, i) => (rk == null ? null : <circle key={i} cx={x(i)} cy={y(rk)} r={s.color || hot === s.id ? 3.5 : 2.5} fill={c} stroke="var(--o-card)" strokeWidth={1.5} opacity={dim ? 0.15 : 1} />))}
              {labelY.has(s.id) && (
                <text x={x(weeks.length - 1) + 10} y={labelY.get(s.id)! + 4} style={{ fill: s.color || hot === s.id ? 'var(--o-ink)' : 'var(--o-ink2)', fontWeight: s.color ? 700 : 500, fontSize: 11.5 }} opacity={dim ? 0.3 : 1}>
                  {s.ranks[s.ranks.length - 1]}. {s.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
