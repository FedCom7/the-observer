// US maps for the elections page: states (forecast or results) and the counties of one state.
import { geoIdentity, geoPath } from 'd3-geo';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import statesTopo from 'us-atlas/states-albers-10m.json';
import { STATE_NAME } from '../core/elections';
import type { LiveCand } from '../sources/electionsLive';
import { useWidth } from './charts';

const topo = statesTopo as unknown as Topology<{ states: GeometryCollection<{ name: string }> }>;
const ABBR = Object.fromEntries(Object.entries(STATE_NAME).map(([k, v]) => [v, k]));
const STATES = feature(topo, topo.objects.states).features.map(f => ({ f, st: ABBR[f.properties!.name] as string, fips: String(f.id) }));
const BORDERS = mesh(topo, topo.objects.states, (a, b) => a !== b);
export const FIPS = Object.fromEntries(STATES.map(s => [s.st, s.fips]));

/** Blue for a Democratic margin, red for a Republican one, stronger with the size of the lead (in points). */
export function marginFill(m: number | null | undefined, cap = 20) {
  if (m == null) return 'var(--o-grid)';
  const c = m >= 0 ? 'var(--o-dem)' : 'var(--o-rep)';
  const k = Math.round(32 + Math.min(1, Math.abs(m) / cap) * 63);
  return `color-mix(in srgb, ${c} ${k}%, var(--o-card))`;
}

export interface StateCell { fill: string; tip: ReactNode; stroke?: string }

/** The 50 states, colored by the caller; hover for a tooltip, click to drill down. */
export function UsMap({ cells, selected, onPick, legend }: { cells: Record<string, StateCell>; selected?: string | null; onPick?: (st: string) => void; legend?: ReactNode }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ st: string; x: number; y: number } | null>(null);
  const H = Math.round(W * 0.625);
  const path = useMemo(() => geoPath(geoIdentity().fitSize([W, H], { type: 'FeatureCollection', features: STATES.map(s => s.f) })), [W, H]);
  return (
    <div ref={ref} className="ochart" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Map of the United States">
        {STATES.map(({ f, st }) => {
          const c = cells[st];
          return (
            <path key={st} d={path(f) ?? ''} fill={c?.fill ?? 'var(--o-bg)'} stroke={selected === st ? 'var(--o-ink)' : c?.stroke ?? 'none'} strokeWidth={selected === st ? 2 : 1.5}
              style={{ cursor: c && onPick ? 'pointer' : 'default' }}
              onPointerMove={ev => { const b = (ev.currentTarget.ownerSVGElement!.parentElement as HTMLDivElement).getBoundingClientRect(); setHover({ st, x: ev.clientX - b.left, y: ev.clientY - b.top }); }}
              onPointerLeave={() => setHover(null)}
              onClick={() => c && onPick?.(st)} />
          );
        })}
        <path d={path(BORDERS) ?? ''} fill="none" stroke="var(--o-line)" strokeWidth={0.8} />
      </svg>
      {legend}
      {hover && cells[hover.st] && (
        <div className="tip obs" style={{ position: 'absolute', left: Math.min(hover.x + 12, W - 230), top: Math.max(0, hover.y - 10) }}>
          <b>{STATE_NAME[hover.st]}</b>
          <div>{cells[hover.st].tip}</div>
        </div>
      )}
    </div>
  );
}

type CountyRow = { name: string; reporting: number; cands: LiveCand[] };
const norm = (s: string) => s.toLowerCase().replace(/county|parish|borough|census area|city and borough|municipality/g, '').replace(/[^a-z]/g, '');

/** One state's counties, colored by the leader's margin in the results. */
export function CountyMap({ st, rows }: { st: string; rows: Record<string, CountyRow> }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [geo, setGeo] = useState<GeoJSON.Feature[] | null>(null);
  const [hover, setHover] = useState<{ row: CountyRow | undefined; name: string; x: number; y: number } | null>(null);
  useEffect(() => {
    let on = true;
    import('us-atlas/counties-albers-10m.json').then(m => {
      const t = (m.default ?? m) as unknown as Topology<{ counties: GeometryCollection<{ name: string }> }>;
      const fips = FIPS[st];
      if (on) setGeo(feature(t, t.objects.counties).features.filter(f => String(f.id).startsWith(fips)));
    });
    return () => { on = false; };
  }, [st]);
  const byName = useMemo(() => Object.fromEntries(Object.values(rows).map(r => [norm(r.name), r])), [rows]);
  const H = Math.round(W * 0.6);
  const path = useMemo(() => (geo?.length ? geoPath(geoIdentity().fitSize([W, H], { type: 'FeatureCollection', features: geo })) : null), [geo, W, H]);
  if (!geo || !path) return <div ref={ref} className="ochart" style={{ height: 200 }}><p className="dek">Loading the county map…</p></div>;
  return (
    <div ref={ref} className="ochart" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`Counties of ${STATE_NAME[st]}`}>
        {geo.map(f => {
          const name = (f.properties as { name: string }).name, row = byName[norm(name)];
          const [a, b] = row?.cands ?? [];
          const m = a && b && row!.reporting > 0 ? (a.party === 'D' ? a.pct - b.pct : b.party === 'D' ? b.pct - a.pct : -(a.pct - b.pct)) : null;
          return <path key={String(f.id)} d={path(f) ?? ''} fill={marginFill(m, 40)} stroke="var(--o-card)" strokeWidth={0.6}
            onPointerMove={ev => { const bx = (ev.currentTarget.ownerSVGElement!.parentElement as HTMLDivElement).getBoundingClientRect(); setHover({ row, name, x: ev.clientX - bx.left, y: ev.clientY - bx.top }); }}
            onPointerLeave={() => setHover(null)} />;
        })}
      </svg>
      {hover && (
        <div className="tip obs" style={{ position: 'absolute', left: Math.min(hover.x + 12, W - 220), top: Math.max(0, hover.y - 10) }}>
          <b>{hover.name}</b>
          {hover.row ? <>{hover.row.cands.slice(0, 3).map(c => <div key={c.name}>{c.name} {c.pct.toFixed(1)}%</div>)}<div className="k">{Math.round(hover.row.reporting)}% reporting</div></> : <div>No results yet</div>}
        </div>
      )}
    </div>
  );
}
