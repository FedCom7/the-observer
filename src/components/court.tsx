// A half court split into the five shot zones (rim, paint, mid-range, corner three,
// above-the-break three), coloured by the team's rank in the league.
import { goodBad, goodBadInk, ordinal, ranks } from './power';

export interface ZoneStat { freq: number; pct: number; att: number }
type Zones = Record<string, ZoneStat>;
export const ZONES: [string, string][] = [['rim', 'At the rim'], ['paint', 'Paint'], ['mid', 'Mid-range'], ['corner3', 'Corner three'], ['above3', 'Above-the-break three']];

/**
 * `mode`: "pct" colours by shooting accuracy (blue = among the best; for a defence,
 * among the best at keeping it low), "freq" by how often the zone is used (style, no better end).
 */
export function ShotCourt({ all, me, side, mode }: { all: Record<string, Zones>; me: string; side: 'off' | 'def'; mode: 'pct' | 'freq' }) {
  const z = all[me] ?? {};
  const rank = (k: string) => {
    const vals = Object.fromEntries(Object.entries(all).map(([t, zs]) => [t, zs[k]?.[mode] ?? null]));
    const rk = ranks(vals, mode === 'pct' && side === 'def')[me];
    const n = Object.values(vals).filter(v => v != null).length;
    return { rk, n, p: rk ? 1 - (rk - 1) / Math.max(1, n - 1) : null };
  };
  const fill = (k: string) => {
    const { p } = rank(k);
    if (p == null) return 'var(--o-grid)';
    return mode === 'pct' ? goodBad(p) : `color-mix(in srgb, var(--o-s1) ${Math.round(p * 80 + 5)}%, var(--o-card))`;
  };
  const ink = (k: string) => { const { p } = rank(k); return mode === 'pct' ? goodBadInk(p) : p != null && p > 0.6 ? '#fff' : 'var(--o-ink)'; };
  const label = (k: string, x: number, y: number) => {
    const s = z[k], { rk } = rank(k);
    if (!s) return null;
    return (
      <g style={{ pointerEvents: 'none' }}>
        <text x={x} y={y} textAnchor="middle" style={{ fontSize: 2.6, fontWeight: 700, fill: ink(k) }}>{Math.round((mode === 'pct' ? s.pct : s.freq) * 100)}%</text>
        <text x={x} y={y + 2.5} textAnchor="middle" style={{ fontSize: 1.6, fill: ink(k) }}>{mode === 'pct' ? `${s.att} shots` : `of shots`}{rk ? ` · ${ordinal(rk)}` : ''}</text>
      </g>
    );
  };
  const tip = (k: string) => { const s = z[k], { rk, n } = rank(k); return s ? `${ZONES.find(x => x[0] === k)?.[1]}: ${Math.round(s.freq * 100)}% of shots, ${Math.round(s.pct * 100)}% made (${s.att} shots)${rk ? ` · ${ordinal(rk)} of ${n}` : ''}` : ''; };
  const line = 'var(--o-card)';
  return (
    <svg viewBox="-1 -1 52 35" width="100%" style={{ display: 'block', maxWidth: 520, margin: '0 auto', fontFamily: 'var(--f-chart)' }} role="img" aria-label="Shot zones on a half court">
      <rect x={0} y={0} width={50} height={33} fill={fill('above3')} stroke={line} strokeWidth={0.4}><title>{tip('above3')}</title></rect>
      <rect x={0} y={0} width={3} height={14} fill={fill('corner3')} stroke={line} strokeWidth={0.4}><title>{tip('corner3')}</title></rect>
      <rect x={47} y={0} width={3} height={14} fill={fill('corner3')} stroke={line} strokeWidth={0.4}><title>{tip('corner3')}</title></rect>
      <path d="M3,0 L3,14 A23.75,23.75 0 0 0 47,14 L47,0 Z" fill={fill('mid')} stroke={line} strokeWidth={0.4}><title>{tip('mid')}</title></path>
      <rect x={17} y={0} width={16} height={19} fill={fill('paint')} stroke={line} strokeWidth={0.4}><title>{tip('paint')}</title></rect>
      <circle cx={25} cy={5.25} r={4.5} fill={fill('rim')} stroke={line} strokeWidth={0.4}><title>{tip('rim')}</title></circle>
      <path d="M19,19 A6,6 0 0 0 31,19" fill="none" stroke={line} strokeWidth={0.3} />
      <line x1={22} x2={28} y1={4} y2={4} stroke="var(--o-ink3)" strokeWidth={0.4} />
      <circle cx={25} cy={5.25} r={0.75} fill="none" stroke="var(--o-ink3)" strokeWidth={0.3} />
      {label('above3', 25, 29.5)}
      {label('mid', 9.5, 19)}
      {label('paint', 25, 15)}
      {label('rim', 25, 8.6)}
      <g style={{ pointerEvents: 'none' }}>
        <text x={1.5} y={11} textAnchor="middle" style={{ fontSize: 2, fontWeight: 700, fill: ink('corner3') }}>{z.corner3 ? `${Math.round((mode === 'pct' ? z.corner3.pct : z.corner3.freq) * 100)}%` : ''}</text>
        <text x={48.5} y={11} textAnchor="middle" style={{ fontSize: 1.5, fill: ink('corner3') }}>corners</text>
      </g>
    </svg>
  );
}
