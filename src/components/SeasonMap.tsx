import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { useMemo, useRef, useState, useEffect } from 'react';
import { useCountries } from './Theatre';
import { Score } from './common';
import { dayShort } from '../core/time';
import type { ObsEvent } from '../core/types';

interface Spot { loc: [number, number]; games: ObsEvent[]; next: boolean }

const result = (e: ObsEvent): 'W' | 'L' | 'D' | null => {
  const m = e.home?.mine ? e.home : e.away?.mine ? e.away : null, o = m === e.home ? e.away : e.home;
  if (!m || !o || e.state !== 'post' || m.score === undefined || o.score === undefined) return null;
  return +m.score > +o.score ? 'W' : +m.score < +o.score ? 'L' : 'D';
};

/**
 * A small map with a dot for every game of the season, the team's home ground as fallback
 * for home games the source gives no coordinates for. Played games take the colour of the
 * result, games to come are hollow, the next one pulses.
 */
export function SeasonMap({ games, next, home, color }: { games: ObsEvent[]; next?: ObsEvent; home: [number, number]; color: string }) {
  const countries = useCountries(true);
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(420);
  const [tip, setTip] = useState<Spot | null>(null);
  const H = 230;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([x]) => setW(Math.max(240, x.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { spots, missing } = useMemo(() => {
    const by = new Map<string, Spot>();
    let missing = 0;
    for (const g of games) {
      const loc = g.loc ?? (g.home?.mine ? home : undefined);
      if (!loc) { missing++; continue; }
      const k = loc.join(',');
      const s = by.get(k) ?? { loc, games: [], next: false };
      s.games.push(g);
      if (next && g.id === next.id) s.next = true;
      by.set(k, s);
    }
    return { spots: [...by.values()], missing };
  }, [games, next, home]);

  const proj = useMemo(() => {
    const p = geoNaturalEarth1();
    const pts = spots.map(s => s.loc);
    if (!pts.length) return p.fitExtent([[8, 8], [w - 8, H - 8]], { type: 'Sphere' });
    // Always show a little context around the dots, even when they all sit in one town
    const lons = pts.map(q => q[0]), lats = pts.map(q => q[1]);
    const cx = (Math.min(...lons) + Math.max(...lons)) / 2, cy = (Math.min(...lats) + Math.max(...lats)) / 2;
    const hx = Math.max(6, (Math.max(...lons) - Math.min(...lons)) / 2 + 3), hy = Math.max(3.5, (Math.max(...lats) - Math.min(...lats)) / 2 + 2);
    return p.fitExtent([[14, 14], [w - 14, H - 14]], { type: 'MultiPoint', coordinates: [[cx - hx, cy - hy], [cx + hx, cy - hy], [cx - hx, cy + hy], [cx + hx, cy + hy]] });
  }, [spots, w]);
  const path = geoPath(proj);

  const fill = (s: Spot) => {
    const rs = s.games.map(result).filter(Boolean);
    if (!rs.length) return 'none';
    const win = rs.filter(r => r === 'W').length, loss = rs.filter(r => r === 'L').length;
    return win > loss ? 'var(--o-s3)' : loss > win ? 'var(--o-s2)' : 'var(--o-other)';
  };
  const played = games.filter(g => result(g)).length;

  return (
    <div ref={box} style={{ position: 'relative' }} onPointerLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${w} ${H}`} width="100%" height={H} role="img" aria-label="Where the season is played">
        <rect width={w} height={H} rx={8} fill="var(--o-bg)" />
        {countries?.features.map(f => <path key={f.properties.name} d={path(f) ?? ''} fill="var(--land)" stroke="var(--land-edge)" strokeWidth={0.6} />)}
        {spots.map(s => {
          const p = proj(s.loc);
          if (!p) return null;
          const r = 4 + Math.min(4, (s.games.length - 1) * 0.8);
          const solid = fill(s);
          return (
            <g key={s.loc.join()} className="marker" onPointerMove={() => setTip(s)}>
              {s.next && <circle className="ring" cx={p[0]} cy={p[1]} r={r + 2} stroke="var(--signal)" />}
              <circle cx={p[0]} cy={p[1]} r={r} fill={solid} stroke={solid === 'none' ? color : 'var(--bg)'} strokeWidth={solid === 'none' ? 2 : 1.5} />
              <circle cx={p[0]} cy={p[1]} r={12} fill="transparent" />
            </g>
          );
        })}
      </svg>
      <div className="olegend" style={{ marginTop: 6 }}>
        <span><i style={{ background: 'var(--o-s3)' }} />Win</span><span><i style={{ background: 'var(--o-s2)' }} />Loss</span>
        <span><i style={{ border: `2px solid ${color}`, background: 'transparent', width: 8, height: 8, borderRadius: 5 }} />To play</span>
        <span>{played} of {games.length} played{missing ? ` · ${missing} without a venue` : ''}</span>
      </div>
      {tip && (
        <div className="tip obs" style={{ position: 'absolute', left: Math.min((proj(tip.loc)?.[0] ?? 0) + 12, w - 220), top: Math.max(0, (proj(tip.loc)?.[1] ?? 0) - 40), maxWidth: 220, zIndex: 3 }}>
          <b>{tip.games[0].place?.split(',').slice(-1)[0].trim() ?? tip.games[0].title}</b>
          {tip.games.slice(0, 5).map(g => {
            const r = result(g), m = g.home?.mine ? g.home : g.away, o = g.home?.mine ? g.away : g.home;
            return <div key={g.id}>{dayShort(g.start)} · {g.home?.mine ? 'vs' : 'at'} {o?.name}{r && m && o ? <> · <Score>{r} {m.score}–{o.score}</Score></> : ''}</div>;
          })}
          {tip.games.length > 5 && <div>+{tip.games.length - 5} more</div>}
        </div>
      )}
    </div>
  );
}
