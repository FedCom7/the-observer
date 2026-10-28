// Shape of public/data/fashion.json (scripts/collect/fashion.mjs) and its calendar events.
import { getJSON } from '../core/fetcher';
import { DAY, MIN } from '../core/time';
import type { ObsEvent } from '../core/types';

export type FashionCity = 'New York' | 'London' | 'Milan' | 'Paris';
export type FashionKind = 'women' | 'men' | 'couture';

export interface FashionWeek {
  id: string; city: FashionCity; kind: FashionKind; season: string;
  /** first and last day, YYYY-MM-DD */
  start: string; end: string;
  /** dates not announced yet: the usual window */
  tbc?: boolean;
  link?: string; official?: string;
}
export interface FashionShow { id: string; week: string; city: FashionCity; brand: string; start: string; type: 'show' | 'presentation'; place?: string; note?: string; link?: string; live?: boolean }
export interface FashionCollection { season: string; city: FashionCity; brand: string; url: string; vogue?: string }
export interface FashionData { updated: string; status: Record<string, string>; weeks: FashionWeek[]; shows: FashionShow[]; collections: FashionCollection[] }

export const loadFashion = () => getJSON<FashionData>(`${import.meta.env.BASE_URL}data/fashion.json`, 10 * MIN);

export const CITIES: FashionCity[] = ['New York', 'London', 'Milan', 'Paris'];
export const KIND_NAME: Record<FashionKind, string> = { women: 'Womenswear', men: 'Menswear', couture: 'Haute couture' };

/** "Paris Fashion Week", "Milan Men's Fashion Week", "Paris Haute Couture Week". */
export const weekName = (w: Pick<FashionWeek, 'city' | 'kind'>) =>
  w.kind === 'couture' ? `${w.city} Haute Couture Week` : `${w.city} ${w.kind === 'men' ? "Men's " : ''}Fashion Week`;

export const weekStart = (w: FashionWeek) => Date.parse(`${w.start}T00:00:00Z`);
/** End of the last day (the week is "on" until then). */
export const weekEnd = (w: FashionWeek) => Date.parse(`${w.end}T00:00:00Z`) + DAY;

export const weekState = (w: FashionWeek, now: number) => (now >= weekEnd(w) ? 'post' : now >= weekStart(w) ? 'in' : 'pre');

export const fashionEvents = (d: FashionData, now = Date.now()): ObsEvent[] => d.weeks
  .filter(w => weekEnd(w) > now - 14 * DAY)
  .map(w => ({
    id: w.id, passion: 'fashion', title: weekName(w), sub: `${w.season}${w.tbc ? ' · dates expected' : ''}`,
    start: weekStart(w) + 8 * 3600e3, state: weekState(w, now), clock: weekState(w, now) === 'in' ? 'On now' : undefined,
    weight: (w.kind === 'couture' ? 3 : 2) as 2 | 3, tbc: w.tbc, approx: true, place: w.city, link: w.link,
  }));
