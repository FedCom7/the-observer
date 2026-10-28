// Shape of public/data/space.json (scripts/collect/space.mjs) and its calendar events.
import { getJSON } from '../core/fetcher';
import { MIN } from '../core/time';
import type { NewsItem, ObsEvent } from '../core/types';
import type { InOrbit } from './space';

export interface Launch { id: string; name: string; mission: string; description: string; rocket: string; provider: string; net: string; precision: string | null; tbc: boolean; status: string; statusName: string; crewed: boolean; starship: boolean; artemis: boolean; orbit: string; pad: string; location: string; loc: [number, number] | null; webcast: boolean; past: boolean; image?: string | null; patch?: string | null; crew?: CrewSeat[] | null }
export interface CrewSeat { name: string; role: string; agency: string; image?: string | null }
/** The ISS bundle (scripts/collect/spaceDeep.mjs). */
export interface IssData {
  at: string;
  station: { name: string; image: string | null; founded: string; orbit: string; mass: number | null; volume: number | null; height: number | null; width: number | null; onboard: number | null; docked: number | null; owners: string[] };
  expedition: { name: string; start: string; end: string | null; patch: string | null; crew: { name: string; role: string; agency: string; nationality: string; image: string | null; age: number | null; firstFlight: string | null; lastFlight: string | null; inSpace: string | null; evaTime: string | null }[] } | null;
  ports: { name: string; vehicle: string | null; mission: string | null; since: string | null }[];
  traffic: { id: number; vehicle: string; mission: string; port: string; docking: string; departure: string | null }[];
  spacewalks: { id: number; name: string; start: string; end: string | null; duration: string | null; crew: string[] }[];
  stays?: { id: number; vehicle: string; mission: string; station: string; crewed: boolean; docking: string; departure: string | null }[];
}
export type SpacexKind = 'Starlink' | 'Customer' | 'Dragon' | 'Starship';
export interface SpacexLaunch { id: string; name: string; rocket: string; net: string; status: string; tbc: boolean; pad: string; location: string; orbit: string; type: string; kind: SpacexKind; webcast: boolean; boosters?: { serial: string; flight: number | null; turnaround: string | null; result: 'landed' | 'lost' | 'pending' | 'expended'; where: string }[] }
/** The SpaceX bundle (scripts/collect/spaceDeep.mjs). */
export interface SpacexData {
  at: string;
  stats: { total: number; successes: number; failures: number; streak: number; landings: number; landingAttempts: number; landingStreak: number; dragonReturns: number; pending: number };
  year: number; yearCount: number;
  byMonth: Record<SpacexKind | 'failed', number>[];
  recent: SpacexLaunch[];
  upcoming: SpacexLaunch[];
  fleet: { serial: string; flights: number; last: string; lastMission: string; status: string }[];
}
export interface StationEvent { id: string; name: string; type: string; date: string; description: string; location: string; webcast: boolean; allDay?: boolean; source?: string }
/** AstronauticAgenda (scripts/collect/spaceAgenda.mjs): the ISS plan months ahead and deep-space milestones. */
export interface Agenda { at: string; items: { id: string; kind: 'dock' | 'undock' | 'landing' | 'eva' | 'broadcast' | 'deep'; name: string; vehicle: string | null; station: string | null; eva: number | null; crewed?: boolean | null; date: string; allDay: boolean; description: string; location: string }[] }
export interface Person { name: string; agency: string; nationality: string; lastFlight: string | null; timeInSpace: string | null; image: string | null }
export interface Candidate { wiki: string; name: string; background: string; image: string | null; born: string | null; type: string; missions: string; education: string; lead: string; assignment: string | null; url: string; candidate: boolean }
export interface ClassNews { title: string; url: string; time: string; excerpt: string; tags: string[]; who: string[] }
/** NASA's newest astronaut class, from scripts/collect/spaceCorps.mjs. */
export interface AstronautClass {
  at: string;
  group: { number: number; title: string; nickname: string | null; size: number | null; wiki: string; image: string | null; applicants: number | null; announcedAt: string | null };
  status: 'selection' | 'training' | 'graduated';
  dates: { applicationsOpen: string | null; applicationsClose: string | null; announced: string | null; expectedGraduation: string | null; graduated: string | null };
  members: Candidate[];
  training: { topic: string; last: string; title: string; url: string; count: number }[];
  news: ClassNews[];
  next: { title: string; url: string; time: string | null; closes: string | null } | null;
}
/** A crewed mission in orbit now, with its patch (Launch Library, or Wikipedia's insignia). */
export interface OrbitMission { id: string; name: string; launched: string; spacecraft: string; destination: string; patch: string | null; landing: string; crew: { name: string; role: string; agency: string }[] }
/** The road to launch of the next Artemis flight (scripts/collect/spaceArtemis.mjs). */
export interface ArtemisFlow {
  at: string;
  mission: string;
  capsules?: Record<string, { vehicles: string[]; orion: string | null; name: string | null }>;
  steps: { id: string; lane: 'rocket' | 'orion' | 'pad' | 'crew' | 'traditions'; label: string; note?: string | null; status: 'done' | 'active' | 'todo'; date: string | null; title: string | null; url: string | null }[];
  log: { title: string; url: string; time: string }[];
}
export interface SpaceData {
  updated: string;
  crewed: Launch[] | null;
  starship: { upcoming: Launch[]; previous: Launch[] } | null;
  artemis: Launch[] | null;
  recentCrewed: Launch[] | null;
  events: StationEvent[] | null;
  people: Person[] | null;
  missions?: OrbitMission[] | null;
  iss?: IssData | null;
  spacex?: SpacexData | null;
  news: { title: string; source: string; time: string; url: string }[] | null;
  corps?: AstronautClass | null;
  artemisFlow?: ArtemisFlow | null;
  agenda?: Agenda | null;
}

export const loadSpace = () => getJSON<SpaceData>(`${import.meta.env.BASE_URL}data/space.json`, 10 * MIN);

// China's station is not followed: its flights and events stay out of the calendar
const tiangong = (s: string) => /tiangong|tianhe|shenzhou|tianzhou/i.test(s);

export function spaceEvents(d: SpaceData): ObsEvent[] {
  const launches = new Map<string, Launch>();
  [...(d.crewed ?? []), ...(d.starship?.upcoming ?? []), ...(d.artemis ?? []).filter(l => !l.past), ...(d.recentCrewed ?? [])].forEach(l => launches.set(l.id, l));
  const out: ObsEvent[] = [...launches.values()].filter(l => !tiangong(`${l.mission} ${l.description}`)).map(l => ({
    id: `ll:${l.id}`, passion: 'space', title: l.mission || l.name, sub: `${l.rocket} · ${l.provider}${l.status ? ' · ' + l.status : ''}`,
    start: Date.parse(l.net), state: l.past ? 'post' : 'pre', weight: l.crewed || l.artemis ? 3 : 2, tbc: l.tbc,
    place: l.location || l.pad, loc: l.loc ?? undefined,
  }));
  for (const e of d.events ?? []) {
    if (tiangong(`${e.name} ${e.location} ${e.description}`)) continue;
    out.push({ id: `llev:${e.id}`, passion: 'space', title: e.name, sub: e.type, start: Date.parse(e.date), state: 'pre', tbc: e.allDay, weight: /spacewalk|eva|dock|splashdown/i.test(e.type + e.name) ? 2 : 1, place: e.location });
  }
  // The astronaut class: graduation day and the deadline of a new call for applications
  const c = d.corps;
  if (c?.dates.graduated) out.push({ id: `corps:grad:${c.group.number}`, passion: 'space', title: `${c.group.nickname ?? c.group.title} graduate as NASA astronauts`, sub: c.group.title, start: Date.parse(c.dates.graduated), state: 'post', weight: 2, place: 'Johnson Space Center' });
  if (c?.next?.closes) out.push({ id: `corps:call:${c.next.closes}`, passion: 'space', title: 'NASA astronaut applications close', sub: c.next.title, start: Date.parse(c.next.closes), state: 'pre', weight: 1 });
  return out;
}

export function orbitOf(d: SpaceData): InOrbit | undefined {
  if (!d.people) return undefined;
  const counts = new Map<string, number>();
  d.people.forEach(p => counts.set(p.agency || 'Other', (counts.get(p.agency || 'Other') ?? 0) + 1));
  return { total: d.people.length, byAgency: [...counts.entries()].sort((a, b) => b[1] - a[1]), names: d.people.map(p => p.name) };
}

export const nasaNews = (d: SpaceData): NewsItem[] => (d.news ?? []).map(n => ({ id: `nasa:${n.url}`, passion: 'space', title: n.title, source: n.source, time: Date.parse(n.time), url: n.url }));
