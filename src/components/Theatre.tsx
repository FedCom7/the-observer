import { geoCircle, geoGraticule10, geoMercator, geoNaturalEarth1, geoPath } from 'd3-geo';
import { useEffect, useMemo, useRef, useState } from 'react';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import landTopo from 'world-atlas/land-110m.json';
import { PASSION, passionColor } from '../core/passions';
import { useData } from '../core/store';
import { DAY, countdown, dayShort } from '../core/time';
import type { ObsEvent, PassionId } from '../core/types';

const topo = landTopo as unknown as Topology<{ land: GeometryCollection }>;
const LAND = feature(topo, topo.objects.land);

const ISS_API = 'https://api.wheretheiss.at/v1/satellites/25544';

interface Iss { pos: [number, number]; sun: [number, number]; track: [number, number][] }

/** Live ISS position every 10 s and its ground track for the next ~90 minutes. */
function useIss(): Iss | null {
  const [iss, setIss] = useState<Iss | null>(null);
  useEffect(() => {
    let alive = true;
    const pos = async () => {
      try {
        const j = await (await fetch(ISS_API)).json();
        if (alive) setIss(s => ({ track: s?.track ?? [], pos: [j.longitude, j.latitude], sun: [j.solar_lon > 180 ? j.solar_lon - 360 : j.solar_lon, j.solar_lat] }));
      } catch { /* keep last position */ }
    };
    const track = async () => {
      const t0 = Math.floor(Date.now() / 1000);
      const ts = Array.from({ length: 10 }, (_, i) => t0 + i * 600).join(',');
      try {
        const j: { longitude: number; latitude: number }[] = await (await fetch(`${ISS_API}/positions?timestamps=${ts}&units=kilometers`)).json();
        if (alive) setIss(s => (s ? { ...s, track: j.map(p => [p.longitude, p.latitude]) } : s));
      } catch { /* optional */ }
    };
    pos().then(track);
    const a = setInterval(pos, 10e3), b = setInterval(track, 5 * 60e3);
    return () => { alive = false; clearInterval(a); clearInterval(b); };
  }, []);
  return iss;
}

type View = 'atl' | 'world';

/** A numbered stop on a route drawn over a single-country map. */
export interface RouteStop { label: string; loc: [number, number]; n?: string }

type CountryShapes = import('geojson').FeatureCollection<import('geojson').Geometry, { name: string }>;

/** Borders of every country (loaded only when a single-country map is asked for). */
export function useCountries(wanted: boolean) {
  const [shapes, setShapes] = useState<CountryShapes | null>(null);
  useEffect(() => {
    if (!wanted || shapes) return;
    let alive = true;
    import('world-atlas/countries-50m.json').then(m => {
      const t = (m.default ?? m) as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
      if (alive) setShapes(feature(t, t.objects.countries) as unknown as CountryShapes);
    });
    return () => { alive = false; };
  }, [wanted, shapes]);
  return shapes;
}

/** Route stops with the stages that touch the same place merged into one dot. */
function stops(route?: RouteStop[]): RouteStop[] {
  const by = new Map<string, RouteStop>();
  for (const r of route ?? []) {
    const o = by.get(r.label);
    by.set(r.label, o ? { ...o, n: [o.n, r.n].filter(Boolean).join(', ') } : r);
  }
  return [...by.values()];
}

/** The map; `only` restricts it to one passion (the passion view of the terminal). */
export function Theatre({ open, only, initial = 'atl', country, route, fit, keep }: { open: (p: PassionId) => void; only?: PassionId; initial?: 'atl' | 'world'; country?: string; route?: RouteStop[]; fit?: boolean; keep?: Set<string> }) {
  const { events, now, orbit } = useData();
  const iss = useIss();
  const [view, setView] = useState<View>(initial);
  const [size, setSize] = useState({ w: 800, h: 380 });
  const [tip, setTip] = useState<{ x: number; y: number; k: string; t: string; w: string } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: Math.max(300, entry.contentRect.width), h: Math.max(240, entry.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // `fit`: zoom on the route's own extent (whatever countries it crosses) instead of on one country
  const local = !!country || !!fit;
  const countries = useCountries(local);
  const home = useMemo(() => countries?.features.find(f => f.properties.name === country), [countries, country]);

  const { path, proj } = useMemo(() => {
    if (country && home) {
      const m = geoMercator();
      m.fitExtent([[24, 24], [size.w - 24, size.h - 24]], home);
      return { path: geoPath(m), proj: m };
    }
    if (fit && route?.length) {
      const lons = route.map(r => r.loc[0]), lats = route.map(r => r.loc[1]);
      // Never tighter than a few degrees, so a single town still shows its surroundings
      const cx = (Math.min(...lons) + Math.max(...lons)) / 2, cy = (Math.min(...lats) + Math.max(...lats)) / 2;
      const hx = Math.max(2.5, (Math.max(...lons) - Math.min(...lons)) / 2), hy = Math.max(1.8, (Math.max(...lats) - Math.min(...lats)) / 2);
      const m = geoMercator();
      m.fitExtent([[40, 36], [size.w - 40, size.h - 36]], { type: 'MultiPoint', coordinates: [[cx - hx, cy - hy], [cx + hx, cy - hy], [cx - hx, cy + hy], [cx + hx, cy + hy]] });
      return { path: geoPath(m), proj: m };
    }
    const p = geoNaturalEarth1();
    const pad: [[number, number], [number, number]] = [[10, 10], [size.w - 10, size.h - 10]];
    // A set of races close together (cycling sections): zoom on them, with some context around
    const pts = keep ? events.filter(e => e.passion === only && e.loc && keep.has(e.id.split(':')[1])).map(e => e.loc!) : [];
    const lons = pts.map(q => q[0]), lats = pts.map(q => q[1]);
    if (pts.length && Math.max(...lons) - Math.min(...lons) < 70 && Math.max(...lats) - Math.min(...lats) < 40) {
      const cx = (Math.min(...lons) + Math.max(...lons)) / 2, cy = (Math.min(...lats) + Math.max(...lats)) / 2;
      const hx = Math.max(8, (Math.max(...lons) - Math.min(...lons)) / 2 + 4), hy = Math.max(5, (Math.max(...lats) - Math.min(...lats)) / 2 + 3);
      p.fitExtent(pad, { type: 'MultiPoint', coordinates: [[cx - hx, cy - hy], [cx + hx, cy - hy], [cx - hx, cy + hy], [cx + hx, cy + hy]] });
    } else if (view === 'atl') {
      p.fitExtent(pad, { type: 'MultiPoint', coordinates: [[-125, 22], [55, 22], [-125, 58], [55, 58]] });
      // The panel is taller than the North Atlantic band: instead of leaving empty space above
      // the pole, pin the map's top near 84°N and let the extra height show more of the south.
      const top = p([-35, 84])?.[1] ?? 0;
      if (top > 0) { const [tx, ty] = p.translate(); p.translate([tx, ty - top]); }
    } else p.fitExtent(pad, { type: 'Sphere' });
    return { path: geoPath(p), proj: p };
  }, [size, view, country, home, fit, route, keep, events, only]);

  // Motor-racing views also show the rounds already run, one dot per circuit
  const withPast = only === 'f1' || only === 'wec' || only === 'cicl';
  const year = new Date(now).getFullYear();
  const markers = local ? [] : events.filter(e => e.loc && (!only || e.passion === only) && (e.state === 'in' || (e.state === 'pre' && e.start - now < (only ? 120 : 14) * DAY)));
  if (keep && !local) {
    // A set of races (cycling sections): one dot per race, live first, then the next to come, else the last run
    markers.length = 0;
    const by = new Map<string, ObsEvent>();
    const rank = (e: ObsEvent) => (e.state === 'in' ? 0 : e.state === 'pre' ? 1 : 2);
    for (const e of [...events].sort((a, b) => a.start - b.start)) {
      const id = e.id.split(':')[1];
      if (e.passion !== only || !e.loc || !keep.has(id)) continue;
      const o = by.get(id);
      if (!o || rank(e) < rank(o) || (e.state === 'post' && o.state === 'post')) by.set(id, e);
    }
    markers.push(...by.values());
  } else if (withPast && !local) {
    // One dot per place, the most recent session of it; cycling stages share their race's spot
    const seen = new Set(markers.map(e => e.loc!.join()));
    for (const e of [...events].sort((a, b) => b.start - a.start)) {
      if (e.passion !== only || e.state !== 'post' || !e.loc || new Date(e.start).getFullYear() !== year || seen.has(e.loc.join())) continue;
      seen.add(e.loc.join());
      markers.push(e);
    }
  }
  const showIss = !local && (!only || only === 'space');
  const night = iss ? geoCircle().center([iss.sun[0] + 180, -iss.sun[1]]).radius(90)() : null;
  const labelled = new Set<string>();

  const hover = (ev: React.PointerEvent, e: ObsEvent) => setTip({
    x: ev.clientX, y: ev.clientY,
    k: `${e.state === 'in' ? 'LIVE · ' : ''}${PASSION[e.passion].name}${e.place ? ' · ' + e.place : ''}`,
    t: e.home && e.state === 'in' ? `${e.away?.name} ${e.away?.score ?? ''} – ${e.home.name} ${e.home.score ?? ''}` : e.title,
    w: e.state === 'in' ? e.clock ?? 'Live' : e.state === 'post' ? `Done · ${dayShort(e.start)}` : `${dayShort(e.start)} · in ${countdown(e.start - now)}`,
  });

  return (
    <>
      <div className="ph">{fit ? 'Route' : 'Theatre'}{only ? ` · ${PASSION[only].name}` : ''}
        {!local && <div className="map-tools">
          {(['atl', 'world'] as View[]).map(v => (
            <button key={v} className="btn" aria-pressed={view === v} onClick={() => setView(v)}>{v === 'atl' ? 'Atlantic' : 'World'}</button>
          ))}
        </div>}
      </div>
      <div ref={box} style={{ position: 'relative', flex: 1, display: 'flex', minHeight: 330 }}>
        <svg viewBox={`0 0 ${size.w} ${size.h}`} width="100%" height={size.h} style={{ position: 'absolute', inset: 0 }} role="img" aria-label="Map of live and upcoming events, the ISS and the day-night line" onPointerLeave={() => setTip(null)}>
          {local ? (
            <>
              <rect width={size.w} height={size.h} fill="var(--panel)" />
              {countries?.features.map(f => <path key={f.properties.name} d={path(f) ?? ''} fill={f === home ? 'var(--land-hi, var(--land))' : 'var(--land)'} fillOpacity={f === home ? 1 : 0.55} stroke="var(--land-edge)" strokeWidth={f === home ? 1.2 : 0.6} />)}
              {route && route.length > 1 && <path d={path({ type: 'LineString', coordinates: route.map(r => r.loc) }) ?? ''} fill="none" stroke={only ? passionColor(only) : 'var(--signal)'} strokeWidth={2} strokeLinejoin="round" strokeOpacity={0.85} />}
              {stops(route).map(r => {
                const p = proj(r.loc);
                if (!p) return null;
                return (
                  <g key={r.label} className="marker" onPointerMove={ev => setTip({ x: ev.clientX, y: ev.clientY, k: only ? PASSION[only].name : '', t: r.label, w: r.n ?? '' })}>
                    <circle cx={p[0]} cy={p[1]} r={4.5} fill={only ? passionColor(only) : 'var(--signal)'} stroke="var(--bg)" strokeWidth={1.5} />
                    <text className="mk-label" x={p[0] + 9} y={p[1] + 3.5}>{fit && (route?.length ?? 0) > 8 ? r.n : <>{r.label}{r.n ? ` · ${r.n}` : ''}</>}</text>
                    <circle cx={p[0]} cy={p[1]} r={12} fill="transparent" />
                  </g>
                );
              })}
            </>
          ) : (
            <>
              <path d={path({ type: 'Sphere' }) ?? ''} fill="var(--panel)" />
              <path d={path(geoGraticule10()) ?? ''} fill="none" stroke="var(--grid)" strokeWidth={0.6} />
              <path d={path(LAND) ?? ''} fill="var(--land)" stroke="var(--land-edge)" strokeWidth={0.7} />
            </>
          )}
          {!local && night && <path d={path(night) ?? ''} fill="var(--night)" />}
          {showIss && iss && iss.track.length > 1 && <path d={path({ type: 'LineString', coordinates: iss.track }) ?? ''} fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={1} strokeDasharray="2 3" />}
          {markers.map(e => {
            const p = proj(e.loc!);
            if (!p) return null;
            const isLive = e.state === 'in';
            const done = e.state === 'post';
            const color = isLive ? 'var(--signal)' : done ? 'var(--ink-3, #777)' : passionColor(e.passion);
            const r = isLive ? 5 : (e.weight ?? 1) >= 3 ? 4.5 : 3;
            const key = e.place ?? e.title;
            const showLabel = (keep ? keep.size <= 12 : isLive || ((e.weight ?? 1) >= 3 && e.start - now < 7 * DAY)) && !labelled.has(key) && (labelled.add(key), true);
            const label = isLive && e.home ? `${e.away?.abbr} ${e.away?.score ?? ''}–${e.home.score ?? ''} ${e.home.abbr}` : e.title.split(' · ')[0];
            return (
              <g key={e.id} className="marker" onPointerMove={ev => hover(ev, e)} onClick={() => open(e.passion)}>
                {isLive && <circle className="ring" cx={p[0]} cy={p[1]} r={r + 2} stroke={color} />}
                <circle cx={p[0]} cy={p[1]} r={r} fill={color} stroke="var(--bg)" strokeWidth={1.5} />
                {showLabel && <text className="mk-label" x={p[0] + r + 5} y={p[1] + 3.5}>{label}</text>}
                <circle cx={p[0]} cy={p[1]} r={12} fill="transparent" />
              </g>
            );
          })}
          {showIss && iss && (() => {
            const p = proj(iss.pos);
            if (!p) return null;
            return (
              <g className="marker" onClick={() => open('space')}
                onPointerMove={ev => setTip({ x: ev.clientX, y: ev.clientY, k: 'Space · live position', t: 'International Space Station', w: orbit ? `${orbit.total} people in orbit now` : '' })}>
                <circle cx={p[0]} cy={p[1]} r={9} fill="#fff" fillOpacity={0.15} />
                <circle cx={p[0]} cy={p[1]} r={3.5} fill="#fff" />
                <text className="mk-label" x={p[0] + 10} y={p[1] + 3.5} style={{ fill: '#fff' }}>ISS</text>
              </g>
            );
          })()}
        </svg>
        {!local && <div className="map-legend">
          <span><i style={{ background: 'var(--signal)' }} />Live</span>
          <span><i style={{ background: 'var(--ink-2)' }} />{only ? 'Coming up' : 'Next 14 days'}</span>
          {withPast && <span><i style={{ background: 'var(--ink-3, #777)' }} />Already run</span>}
          {showIss && iss && <span><i style={{ background: '#fff', boxShadow: '0 0 6px #fff' }} />ISS (live)</span>}
          <span>Shaded: night</span>
        </div>}
      </div>
      {tip && (
        <div className="tip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 270), top: tip.y - 70 }}>
          <div className="k">{tip.k}</div><b>{tip.t}</b><div className="mono" style={{ color: 'var(--ink-2)' }}>{tip.w}</div>
        </div>
      )}
    </>
  );
}
