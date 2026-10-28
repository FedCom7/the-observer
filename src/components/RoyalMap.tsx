import { geoMercator, geoNaturalEarth1, geoPath } from 'd3-geo';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCountries } from './Theatre';
import { DAY, dayShort } from '../core/time';

export interface Pin { id: string; t: number; who: string; title: string; place?: string; loc: [number, number]; done?: boolean; weight?: number; rough?: boolean }
interface Spot { key: string; loc: [number, number]; pins: Pin[] }

const UK: [number, number][] = [[-8.9, 49.6], [2.3, 49.6], [-8.9, 59.2], [2.3, 59.2]];
const inUK = (l: [number, number]) => l[0] > -11 && l[0] < 3 && l[1] > 49 && l[1] < 61.5;

/**
 * The royal year on a map: a dot for every engagement still to come (filled), a hollow dot for every
 * one in the Court Circular of the last weeks. Britain by default; the World view takes in the trips abroad.
 */
export function RoyalMap({ pins, now }: { pins: Pin[]; now: number }) {
  const countries = useCountries(true);
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(480);
  const [view, setView] = useState<'uk' | 'world'>('uk');
  const [tip, setTip] = useState<Spot | null>(null);
  const H = view === 'uk' ? 470 : 300;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([x]) => setW(Math.max(260, x.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const abroad = pins.filter(p => !inUK(p.loc));
  const shown = view === 'uk' ? pins.filter(p => inUK(p.loc)) : pins;
  const spots = useMemo(() => {
    const by = new Map<string, Spot>();
    for (const p of shown) {
      const k = `${p.loc[0].toFixed(2)},${p.loc[1].toFixed(2)}`;
      const s = by.get(k) ?? { key: k, loc: p.loc, pins: [] };
      s.pins.push(p);
      by.set(k, s);
    }
    return [...by.values()];
  }, [shown]);

  const proj = useMemo(() => {
    if (view === 'world') return geoNaturalEarth1().fitExtent([[8, 8], [w - 8, H - 8]], { type: 'Sphere' });
    return geoMercator().fitExtent([[10, 10], [w - 10, H - 10]], { type: 'MultiPoint', coordinates: UK });
  }, [view, w, H]);
  const path = geoPath(proj);
  const upcoming = shown.filter(p => !p.done).length, done = shown.length - upcoming;
  const next = Math.min(...shown.filter(p => !p.done && p.t > now - 6 * 3600e3).map(p => p.t));

  return (
    <div ref={box} style={{ position: 'relative' }} onPointerLeave={() => setTip(null)}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['uk', 'world'] as const).map(v => (
          <button key={v} className="btn" aria-pressed={view === v} onClick={() => setView(v)} style={{ color: 'var(--o-ink)', background: view === v ? 'var(--o-accent-soft)' : 'transparent', borderColor: 'var(--o-line)' }}>{v === 'uk' ? 'United Kingdom' : `World${abroad.length ? ` · ${abroad.length} abroad` : ''}`}</button>
        ))}
      </div>
      <svg viewBox={`0 0 ${w} ${H}`} width="100%" height={H} role="img" aria-label="Where the royals have been and will be">
        <rect width={w} height={H} rx={8} fill="var(--o-bg)" />
        {countries?.features.map(f => <path key={f.properties.name} d={path(f) ?? ''} fill="var(--land)" stroke="var(--land-edge)" strokeWidth={0.6} />)}
        {spots.map(s => {
          const p = proj(s.loc);
          if (!p) return null;
          const up = s.pins.filter(x => !x.done);
          const big = up.some(x => (x.weight ?? 1) >= 3);
          const soon = up.some(x => x.t - now < 2 * DAY && x.t > now - 12 * 3600e3);
          const r = (view === 'world' ? 3.5 : 4) + Math.min(5, (s.pins.length - 1) * 0.9) + (big ? 2 : 0);
          return (
            <g key={s.key} className="marker" onPointerMove={() => setTip(s)} onClick={() => setTip(s)}>
              {soon && <circle className="ring" cx={p[0]} cy={p[1]} r={r + 2} stroke="var(--signal)" />}
              {up.length
                ? <circle cx={p[0]} cy={p[1]} r={r} fill="var(--oc-cul)" fillOpacity={s.pins.some(x => x.rough) && !s.pins.some(x => !x.rough) ? 0.55 : 1} stroke="var(--bg)" strokeWidth={1.5} />
                : <circle cx={p[0]} cy={p[1]} r={r} fill="none" stroke="var(--o-ink2)" strokeWidth={1.6} strokeOpacity={0.8} />}
              <circle cx={p[0]} cy={p[1]} r={12} fill="transparent" />
            </g>
          );
        })}
      </svg>
      <div className="olegend" style={{ marginTop: 6 }}>
        <span><i style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--oc-cul)' }} />Coming up ({upcoming}){Number.isFinite(next) ? ` · next ${dayShort(next)}` : ''}</span>
        <span><i style={{ width: 8, height: 8, borderRadius: '50%', boxShadow: 'inset 0 0 0 2px var(--o-ink2)' }} />Done in the last weeks ({done})</span>
        <span>Faded dot: town known, venue not</span>
      </div>
      {tip && (
        <div className="tip obs" style={{ position: 'absolute', left: Math.min(Math.max(0, (proj(tip.loc)?.[0] ?? 0) + 12), w - 250), top: Math.min(Math.max(40, (proj(tip.loc)?.[1] ?? 0)), H - 40), maxWidth: 250, zIndex: 3, pointerEvents: 'none' }}>
          <b>{tip.pins[0].place ?? tip.pins[0].title}</b>
          {tip.pins.sort((a, b) => a.t - b.t).slice(0, 6).map(p => <div key={p.id}>{dayShort(p.t)}{p.done ? ' ✓' : ''} · {p.who.replace(/^The /, '')}: {p.title.length > 70 ? `${p.title.slice(0, 68)}…` : p.title}</div>)}
          {tip.pins.length > 6 && <div>+{tip.pins.length - 6} more</div>}
        </div>
      )}
    </div>
  );
}
