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
export function PointsBars({ rows, color, unit = 'pts' }: { rows: { name: string; value: number; sub?: string }[]; color: string; unit?: string }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const row = 26, H = rows.length * row + 6, l = 110, r = 130;
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
