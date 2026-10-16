// Shape of public/data/dakar.json (scripts/collect/dakar.mjs) and its calendar events.
import { getJSON } from '../core/fetcher';
import { MIN } from '../core/time';
import type { ObsEvent } from '../core/types';

export interface DakarStage { num: number | null; label: string; date: string; from: string; to: string; totalKm: number | null; specialKm: number | null; rest: boolean }
export interface DakarRow { pos: number; bib: number; crew: string[]; nation: string; team: string; time: string; gap: string; penalty: string }
export interface DakarData { updated: string; edition: number | null; stages: DakarStage[]; rankings: { edition: number | null; stage: number; general: Record<string, DakarRow[]>; stageRanking: Record<string, DakarRow[]> } | null }

export const loadDakar = () => getJSON<DakarData>('/data/dakar.json', 10 * MIN);

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
