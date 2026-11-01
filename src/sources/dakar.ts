// Shape of public/data/dakar.json (scripts/collect/dakar.mjs) and its calendar events.
import { getJSON } from '../core/fetcher';
import { MIN } from '../core/time';
import type { ObsEvent } from '../core/types';
import { TRACKS } from './dakarTrack';

export interface DakarStage { num: number | null; label: string; date: string; from: string; to: string; fromLoc?: [number, number] | null; toLoc?: [number, number] | null; totalKm: number | null; specialKm: number | null; rest: boolean; transfer?: boolean }
export interface DakarRow { pos: number; bib: number; crew: string[]; nation: string; team: string; time: string; gap: string; penalty: string }
/** One category after one stage: how many are classified, the general's first 15 and the stage's first 3 ([bib, ms]). */
export interface DakarAfter { n: number; top: [number, number | null][]; podium: [number, number | null][] }
/** The rally stage after stage; `bibs` maps "Category:bib" to [crew, nation, team]. */
export interface DakarEvolution { bibs: Record<string, [string, string, string]>; stages: { stage: number; cats: Record<string, DakarAfter> }[] }
export interface DakarRankings { edition: number | null; stage: number; general: Record<string, DakarRow[]>; stageRanking: Record<string, DakarRow[]>; evolution?: DakarEvolution }
export interface DakarData { updated: string; edition: number | null; countries?: string[]; stages: DakarStage[]; rankings: DakarRankings | null }

export const loadDakar = () => getJSON<DakarData>(`${import.meta.env.BASE_URL}data/dakar.json`, 10 * MIN);

/** A racing day: not the rest day nor the transfer between countries. */
export const racing = (s: DakarStage) => !s.rest && !s.transfer;

export const dakarEvents = (d: DakarData): ObsEvent[] => {
  const days = d.stages.filter(racing);
  return days.map((s, i) => ({
    id: `dakar:${d.edition}:${s.num}`,
    passion: 'dakar',
    title: `Dakar ${d.edition} · ${s.label}`,
    sub: `${s.from}${s.to !== s.from ? ` → ${s.to}` : ''} · ${s.specialKm ?? '?'} km special / ${s.totalKm ?? '?'} km total`,
    start: Date.parse(s.date),
    state: 'pre',
    weight: i === 0 || i === days.length - 1 ? 3 : 2,
    approx: true,
    place: s.from,
    loc: s.fromLoc ?? undefined,
    link: 'https://www.dakar.com/en/overall-route',
  }));
};

/** A stage's line for the map: its number, the track and whether it is done, next or to come. */
export interface DakarLine { n: string; coords: [number, number][]; dashed?: boolean; state: 'done' | 'next' | 'todo' }

const code = (s: DakarStage) => (s.transfer ? 'T' : s.num === 0 ? 'P' : String(s.num));

/**
 * The rally on the map: the bivouac towns (start, rest day, finish named) and, where the official
 * map has been traced, each stage's line; otherwise straight legs between the towns.
 */
export const dakarRoute = (d: DakarData, now: number) => {
  const next = d.stages.find(s => racing(s) && Date.parse(s.date) > now - 8 * 3600e3);
  const track = d.edition ? TRACKS[d.edition] : undefined;
  const role = (place: string) => {
    const r: string[] = [];
    if (place === d.stages[0]?.from) r.push('Start');
    if (d.stages.some(s => s.rest && s.from === place)) r.push('Rest day');
    if (/refuge/i.test(place)) r.push('Marathon refuge');
    if (place === d.stages[d.stages.length - 1]?.to) r.push('Finish');
    return r.join(', ') || undefined;
  };
  const stops: { label: string; loc: [number, number]; n?: string; hot?: boolean }[] = [];
  for (const s of d.stages) for (const [place, loc] of [[s.from, s.fromLoc], [s.to, s.toLoc]] as const) {
    if (loc && !stops.some(x => x.label === place)) stops.push({ label: place, loc, n: role(place) });
  }
  if (next) for (const x of stops) x.hot = x.label === next.from;
  const lines: DakarLine[] = d.stages.filter(s => !s.rest).flatMap(s => {
    const coords = track?.[code(s)] ?? (s.fromLoc && s.toLoc && (s.from !== s.to) ? [s.fromLoc, s.toLoc] : null);
    if (!coords) return [];
    const state = s === next ? 'next' : Date.parse(s.date) < now - 12 * 3600e3 ? 'done' : 'todo';
    return [{ n: code(s), coords, dashed: s.transfer, state } as DakarLine];
  });
  return { stops, lines };
};
