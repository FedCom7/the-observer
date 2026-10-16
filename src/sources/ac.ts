// Shape of public/data/ac.json (scripts/collect/ac.mjs) and its calendar events.
import { getJSON } from '../core/fetcher';
import { MIN } from '../core/time';
import type { ObsEvent } from '../core/types';

export interface AcStanding { teamId: number; team: string; flag: string; total: number; position: number; winner: boolean; races: { race: string; start: string; points: number }[] }
export interface AcRace { id: string; regatta: string; name: string; status: string; start: string; teams: { team: string; position: number | null; points: number }[] }
export interface AcData { updated: string; edition: string; regattas: { id: string; name: string; standings: AcStanding[] }[]; races: AcRace[] }

export const loadAc = () => getJSON<AcData>('/data/ac.json', 10 * MIN);

export const acEvents = (d: AcData): ObsEvent[] => d.races.map(r => {
  const t = Date.parse(r.start), done = r.status === 'Finished' || t < Date.now() - 3 * 3600e3;
  return {
    id: `ac:${r.id}`, passion: 'ac', title: `${r.regatta} · ${r.name}`,
    sub: done && r.teams[0] ? `1. ${r.teams[0].team}` : "America's Cup",
    start: t, state: done ? 'post' : 'pre', weight: /final|match/i.test(r.name) ? 3 : 1,
    place: r.regatta === 'Naples' ? 'Gulf of Naples' : r.regatta, loc: r.regatta === 'Naples' ? [14.25, 40.83] : r.regatta === 'Sardinia' ? [9.11, 39.21] : undefined,
    link: 'https://www.americascup.com/results',
  };
});
