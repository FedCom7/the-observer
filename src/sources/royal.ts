// Shape of public/data/royal.json (scripts/collect/royal.mjs) and its calendar events.
import { getJSON } from '../core/fetcher';
import { MIN } from '../core/time';
import type { ObsEvent } from '../core/types';

export interface RoyalEvent { id: string; who: string; kind: 'state-visit' | 'state-visit-in' | 'trip' | 'ceremony'; title: string; country?: string; start: string; approxTime?: boolean; tbc?: boolean; weight?: number; place?: string; loc?: [number, number]; link?: string; source?: string }
export interface RoyalAlert { title: string; source: string; time: string; url: string }
export interface RoyalData { updated: string; events: RoyalEvent[]; alerts: RoyalAlert[]; press?: RoyalAlert[] }

export const loadRoyal = () => getJSON<RoyalData>('/data/royal.json', 10 * MIN);

export const royalEvents = (d: RoyalData): ObsEvent[] => d.events.map(e => ({
  id: e.id, passion: 'royal', title: e.title, sub: e.who === 'The Royal Family' ? e.source?.replace(/^Rule: /, '') : e.who,
  start: Date.parse(e.start), state: 'pre', weight: (e.weight ?? 1) as 1 | 2 | 3, approx: e.approxTime, tbc: e.tbc,
  place: e.place ?? e.country, loc: e.loc, link: e.link,
}));
