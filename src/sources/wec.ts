// Shape of public/data/wec.json (scripts/collect/wec.mjs) and its calendar events.
import { getJSON } from '../core/fetcher';
import { MIN } from '../core/time';
import type { ObsEvent } from '../core/types';

export interface WecSession { name: string; start: string; kind: 'practice' | 'qualifying' | 'hyperpole' | 'race' | 'other'; tbc?: boolean }
export interface WecRace { slug: string; name: string; year: number; url: string; start: string | null; end: string | null; provisional: boolean; sessions: WecSession[] }
export interface WecRow { pos: number; number: string; team: string; vehicle: string; cls: string; drivers: string[]; laps: number | null; gap: string; time?: string; status: string; bestLap: string }
export interface WecResult { session: string; kind: WecSession['kind']; hour: number | null; final: boolean; rows: WecRow[] }
export interface WecCrew { pos: number; names: string[]; team: string; points: number | null; results: string[] }
export interface WecTeam { pos: number; name: string; points: number | null; results: string[]; results2?: string[] }
export interface WecData {
  updated: string;
  season: number;
  races: WecRace[];
  results: Record<string, { event: string; sessions: WecResult[] }>;
  standings: { rounds: string[]; hypercarDrivers: WecCrew[]; hypercarManufacturers: WecTeam[]; lmgt3Drivers: WecCrew[]; lmgt3Teams: WecTeam[]; url: string } | null;
}

const CIRCUITS: [RegExp, [number, number], string][] = [
  [/Barcelona/, [2.26, 41.57], 'Circuit de Barcelona-Catalunya'], [/Monza/, [9.28, 45.62], 'Monza'],
  [/Imola/, [11.71, 44.34], 'Imola'], [/Spa/, [5.97, 50.44], 'Spa-Francorchamps'], [/Le Mans/, [0.21, 47.95], 'Circuit de la Sarthe'],
  [/S[ãa]o Paulo/, [-46.7, -23.7], 'Interlagos'], [/Lone Star|Americas/, [-97.64, 30.13], 'Circuit of the Americas'],
  [/Fuji/, [138.93, 35.37], 'Fuji Speedway'], [/Bahrain/, [50.51, 26.03], 'Sakhir'], [/Qatar/, [51.45, 25.49], 'Lusail'],
  [/Silverstone/, [-1.02, 52.07], 'Silverstone'],
];

/** Round number of a race within its season (1-based, by date). */
export const roundOf = (d: WecData, r: WecRace) => d.races.filter(x => x.year === r.year).indexOf(r) + 1;

export function wecEvents(d: WecData): ObsEvent[] {
  const out: ObsEvent[] = [];
  for (const race of d.races) {
    const c = CIRCUITS.find(([re]) => re.test(race.name));
    const res = race.year === d.season ? d.results[String(roundOf(d, race))] : undefined;
    race.sessions.forEach((s, i) => {
      const hyper = /hypercar/i.test(s.name) || !/LMGT3|LMP2/i.test(s.name);
      const done = res?.sessions.find(x => x.session.toLowerCase() === s.name.split(' · ')[0].toLowerCase() && x.final);
      const p1 = done?.rows[0];
      out.push({
        id: `wec:${race.slug}:${i}`,
        passion: 'wec',
        title: `${race.name} · ${s.name}`,
        sub: p1 ? `P1 #${p1.number} ${p1.team}` : `WEC ${race.year} · Round ${roundOf(d, race)}`,
        start: Date.parse(s.start),
        state: done ? 'post' : 'pre',
        weight: s.kind === 'race' ? 3 : (s.kind === 'qualifying' || s.kind === 'hyperpole') && hyper ? 2 : 1,
        tbc: s.tbc,
        place: c?.[2],
        loc: c?.[1],
        link: race.url,
      });
    });
  }
  return out;
}

export const loadWec = () => getJSON<WecData>(`${import.meta.env.BASE_URL}data/wec.json`, 2 * MIN);
