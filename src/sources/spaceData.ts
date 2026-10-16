// Shape of public/data/space.json (scripts/collect/space.mjs) and its calendar events.
import { getJSON } from '../core/fetcher';
import { MIN } from '../core/time';
import type { NewsItem, ObsEvent } from '../core/types';
import type { InOrbit } from './space';

export interface Launch { id: string; name: string; mission: string; description: string; rocket: string; provider: string; net: string; precision: string | null; tbc: boolean; status: string; statusName: string; crewed: boolean; starship: boolean; artemis: boolean; orbit: string; pad: string; location: string; loc: [number, number] | null; webcast: boolean; past: boolean }
export interface StationEvent { id: string; name: string; type: string; date: string; description: string; location: string; webcast: boolean }
export interface Person { name: string; agency: string; nationality: string; lastFlight: string | null; timeInSpace: string | null; image: string | null }
export interface SpaceData {
  updated: string;
  crewed: Launch[] | null;
  starship: { upcoming: Launch[]; previous: Launch[] } | null;
  artemis: Launch[] | null;
  recentCrewed: Launch[] | null;
  events: StationEvent[] | null;
  people: Person[] | null;
  stations: { id: number; name: string; onboard: number | null; owners: string }[] | null;
  news: { title: string; source: string; time: string; url: string }[] | null;
}

export const loadSpace = () => getJSON<SpaceData>('/data/space.json', 10 * MIN);

export function spaceEvents(d: SpaceData): ObsEvent[] {
  const launches = new Map<string, Launch>();
  [...(d.crewed ?? []), ...(d.starship?.upcoming ?? []), ...(d.artemis ?? []).filter(l => !l.past), ...(d.recentCrewed ?? [])].forEach(l => launches.set(l.id, l));
  const out: ObsEvent[] = [...launches.values()].map(l => ({
    id: `ll:${l.id}`, passion: 'space', title: l.mission || l.name, sub: `${l.rocket} · ${l.provider}${l.status ? ' · ' + l.status : ''}`,
    start: Date.parse(l.net), state: l.past ? 'post' : 'pre', weight: l.crewed || l.artemis ? 3 : 2, tbc: l.tbc,
    place: l.location || l.pad, loc: l.loc ?? undefined,
  }));
  for (const e of d.events ?? []) {
    out.push({ id: `llev:${e.id}`, passion: 'space', title: e.name, sub: e.type, start: Date.parse(e.date), state: 'pre', weight: /spacewalk|eva|dock|splashdown/i.test(e.type + e.name) ? 2 : 1, place: e.location });
  }
  return out;
}

export function orbitOf(d: SpaceData): InOrbit | undefined {
  if (!d.people) return undefined;
  const counts = new Map<string, number>();
  d.people.forEach(p => counts.set(p.agency || 'Other', (counts.get(p.agency || 'Other') ?? 0) + 1));
  return { total: d.people.length, byAgency: [...counts.entries()].sort((a, b) => b[1] - a[1]), names: d.people.map(p => p.name) };
}

export const nasaNews = (d: SpaceData): NewsItem[] => (d.news ?? []).map(n => ({ id: `nasa:${n.url}`, passion: 'space', title: n.title, source: n.source, time: Date.parse(n.time), url: n.url }));
