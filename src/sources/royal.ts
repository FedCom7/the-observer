// Shape of public/data/royal.json (scripts/collect/royal.mjs) and its calendar events.
import { getJSON } from '../core/fetcher';
import { MIN } from '../core/time';
import type { ObsEvent } from '../core/types';

export type RoyalKind = 'state-visit' | 'state-visit-in' | 'trip' | 'ceremony' | 'engagement' | 'birthday' | 'anniversary';

export interface RoyalEvent {
  id: string; who: string; kind: RoyalKind; title: string; start: string;
  /** ids of the royals involved (see `roster`) */
  people?: string[];
  country?: string; approxTime?: boolean; tbc?: boolean; weight?: number; place?: string; loc?: [number, number];
  /** the pin is a town or a country, not the venue */
  locPrecise?: boolean;
  /** the Royal Diary gives the day but no time */
  dayOnly?: boolean;
  role?: string; detail?: string; sub?: string; link?: string; source?: string;
}
/** A line of the Court Circular: what a royal did (past). */
export interface RoyalDone { id: string; people: string[]; who: string; start: string; title: string; role?: string; detail: string; place?: string; residence?: string; loc?: [number, number]; locPrecise?: boolean }
export interface RoyalPerson { id: string; name: string; title: string; born: [number, number, number]; working: boolean; role: string; lead: string; homes?: string; photo?: string | null }
/** A story from royal.uk/news, with its photograph. */
export interface RoyalNews { title: string; url: string; kind: string; date: string; image: string | null; alt: string | null }
/** Last engagement with a place in the Court Circular, and where the sovereign last held audiences. */
export interface RoyalWhere { seen?: { t: string; title: string; place?: string; loc?: [number, number] }; residence?: { t: string; name: string } }
export interface RoyalAlert { title: string; source: string; time: string; url: string }
export interface RoyalData {
  updated: string; diaryFetched?: string; events: RoyalEvent[]; alerts: RoyalAlert[]; press?: RoyalAlert[];
  recent?: RoyalDone[]; roster?: RoyalPerson[]; news?: RoyalNews[]; succession?: string[]; activity?: Record<string, number>; whereabouts?: Record<string, RoyalWhere>;
}

export const loadRoyal = () => getJSON<RoyalData>(`${import.meta.env.BASE_URL}data/royal.json`, 10 * MIN);

/**
 * Events for the shared calendar. The Royal page and its map read every engagement; the home and the
 * calendar only get the notable ones, so a hundred minor visits do not bury the rest.
 */
export const royalEvents = (d: RoyalData): ObsEvent[] => d.events
  .filter(e => (e.kind !== 'engagement' && e.kind !== 'birthday' && e.kind !== 'anniversary') || (e.weight ?? 1) >= 2)
  .map(e => ({
    id: e.id, passion: 'royal', title: e.title, sub: e.who === 'The Royal Family' ? e.source?.replace(/^Rule: /, '') : e.who,
    start: Date.parse(e.start), state: 'pre', weight: (e.weight ?? 1) as 1 | 2 | 3, approx: e.approxTime, tbc: e.tbc,
    place: e.place ?? e.country, loc: e.loc, link: e.link,
  }));

