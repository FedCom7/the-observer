// Shape of public/data/ski.json (scripts/collect/ski.mjs) and its calendar events.
import { getJSON } from '../core/fetcher';
import { MIN } from '../core/time';
import type { ObsEvent } from '../core/types';

export interface SkiResult { rank: number; name: string; nation: string; time: string; gap: string }
export interface SkiRace { raceid: string; eventid: string; category: 'WC' | 'WSC'; place: string; country: string; discipline: string; gender: 'men' | 'women' | 'mixed'; start: string; approxTime: boolean; runs: { run: string; start: string }[]; cancelled: boolean; results?: SkiResult[] }
export interface SkiStanding { name: string; nation: string; rank: number; points: number; DH: number | null; SG: number | null; GS: number | null; SL: number | null }
export interface SkiData { updated: string; season: number; races: SkiRace[]; standings: { season: number; final: boolean; men: SkiStanding[]; women: SkiStanding[] }; worlds: { place: string; from: string; to: string } | null }

export const loadSki = () => getJSON<SkiData>('/data/ski.json', 10 * MIN);

const LOC: Record<string, [number, number]> = {
  Soelden: [11.0, 46.97], Levi: [24.8, 67.8], Gurgl: [11.03, 46.87], 'Copper Mountain': [-106.15, 39.5], 'Beaver Creek': [-106.52, 39.6], Killington: [-72.8, 43.62],
  "Val d'Isere": [6.98, 45.45], 'Val Gardena/Groeden': [11.76, 46.57], 'Alta Badia': [11.88, 46.56], 'Madonna di Campiglio': [10.83, 46.23], Bormio: [10.37, 46.47],
  Adelboden: [7.56, 46.49], Wengen: [7.92, 46.6], Kitzbuehel: [12.39, 47.45], Schladming: [13.69, 47.39], 'Crans Montana': [7.48, 46.31], 'Cortina d\'Ampezzo': [12.14, 46.54],
  Kranjska: [13.79, 46.48], Zagreb: [15.95, 45.9], Semmering: [15.83, 47.63], 'St. Moritz': [9.84, 46.5], Are: [13.08, 63.4], Kvitfjell: [10.17, 61.5], Saalbach: [12.64, 47.39], Flachau: [13.39, 47.34], 'Garmisch Partenkirchen': [11.1, 47.49], Tremblant: [-74.6, 46.21], Lienz: [12.77, 46.83],
};

export const discShort = (d: string) => (/downhill/i.test(d) ? 'DH' : /super g/i.test(d) ? 'SG' : /giant/i.test(d) ? 'GS' : /slalom/i.test(d) ? 'SL' : /combined/i.test(d) ? 'AC' : /parallel/i.test(d) ? 'PAR' : d);

export const skiEvents = (d: SkiData): ObsEvent[] => d.races.filter(r => !r.cancelled).map(r => ({
  id: `ski:${r.raceid}`,
  passion: 'sci',
  title: `${r.place} · ${r.gender === 'men' ? "men's" : r.gender === 'women' ? "women's" : 'mixed'} ${r.discipline.toLowerCase()}`,
  sub: `${r.category === 'WSC' ? 'World Championships' : 'World Cup'}${r.runs.length > 1 ? ` · 2nd run ${new Date(r.runs[1].start).toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' })}` : ''}${r.results?.[0] ? ` · 1. ${r.results[0].name} (${r.results[0].nation})` : ''}`,
  start: Date.parse(r.start),
  state: 'pre',
  weight: r.category === 'WSC' ? 3 : 2,
  approx: r.approxTime,
  place: `${r.place} (${r.country})`,
  loc: LOC[r.place],
  link: `https://www.fis-ski.com/DB/general/results.html?sectorcode=AL&raceid=${r.raceid}`,
}));
