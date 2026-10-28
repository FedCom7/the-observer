// Shape of public/data/dakar.json (scripts/collect/dakar.mjs) and its calendar events.
import { getJSON } from '../core/fetcher';
import { MIN } from '../core/time';
import type { ObsEvent } from '../core/types';

export interface DakarStage { num: number | null; label: string; date: string; from: string; to: string; totalKm: number | null; specialKm: number | null; rest: boolean }
export interface DakarRow { pos: number; bib: number; crew: string[]; nation: string; team: string; time: string; gap: string; penalty: string }
export interface DakarData { updated: string; edition: number | null; stages: DakarStage[]; rankings: { edition: number | null; stage: number; general: Record<string, DakarRow[]>; stageRanking: Record<string, DakarRow[]> } | null }

export const loadDakar = () => getJSON<DakarData>(`${import.meta.env.BASE_URL}data/dakar.json`, 10 * MIN);

const KAEC: [number, number] = [39.1, 22.45];

export const dakarEvents = (d: DakarData): ObsEvent[] => d.stages.filter(s => !s.rest).map(s => ({
  id: `dakar:${d.edition}:${s.num}`,
  passion: 'dakar',
  title: `Dakar ${d.edition} · ${s.label}`,
  sub: `${s.from}${s.to !== s.from ? ` → ${s.to}` : ''} · ${s.specialKm ?? '?'} km special / ${s.totalKm ?? '?'} km total`,
  start: Date.parse(s.date),
  state: 'pre',
  weight: s.num === 0 || s.num === 13 ? 3 : 2,
  approx: true,
  place: s.from,
  loc: s.num === 0 ? KAEC : undefined,
  link: 'https://www.dakar.com/en/overall-route',
}));

/** Bivouacs and stage towns [longitude, latitude]; the marathon refuge is only roughly placed. */
const PLACES: Record<string, [number, number]> = {
  'King Abdullah Economic City': KAEC, 'Yanbu': [38.06, 24.09], 'Alula': [37.92, 26.61], 'Hail': [41.69, 27.52],
  'Al Duwadimi': [44.39, 24.5], 'Marathon Refuge': [43.6, 22.3], 'Bisha': [42.61, 19.99],
  'Wadi Ad-Dawasir': [45.2, 20.49], 'Al Bahah Marathon': [41.47, 20.01],
};

/** The rally's route as a list of stops, one per stage start plus the finish. */
export const dakarRoute = (d: DakarData): { label: string; loc: [number, number]; n?: string }[] => {
  const racing = d.stages.filter(s => !s.rest);
  const out = racing.flatMap(s => (PLACES[s.from] ? [{ label: s.from, loc: PLACES[s.from], n: s.num === 0 ? 'P' : String(s.num) }] : []));
  const last = racing[racing.length - 1];
  return last && PLACES[last.to] ? [...out, { label: last.to, loc: PLACES[last.to], n: 'Finish' }] : out;
};
