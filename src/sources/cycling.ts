// Shape of public/data/cycling.json (scripts/collect/cycling.mjs) and its calendar events.
import { getJSON } from '../core/fetcher';
import { MIN } from '../core/time';
import type { ObsEvent } from '../core/types';

export interface CyRank { pos: number; rider: string | null; team: string; time: string | null; gap: string | null; gapS: number | null; points: number | null }
export interface CyStage { num: number | null; type: string; rest: boolean; date: string; from: string; to: string; km: number | null; start: string; approx: boolean; firstStart?: string | null; lastArrival?: string | null }
export interface CyRankings {
  final: boolean;
  /** one-day races */
  result?: CyRank[];
  /** stage races */
  stage?: number; stageResult?: CyRank[]; gc?: CyRank[]; points?: CyRank[]; mountains?: CyRank[]; youth?: CyRank[]; teams?: CyRank[];
  history?: { stage: number; winner: CyRank | null; gc: CyRank[] }[];
}
export interface CyChampEvent { title: string; date: string; start: string; approx: boolean; winner: string | null; tier: number }
export interface CyRace {
  id: string; uciName: string; name: string; cls: string; kind: 'one-day' | 'stage' | 'champs'; tier: 1 | 2 | 3; tag: 'monument' | 'grand' | 'worlds' | 'euros' | null;
  year: number; country: string; venue: string; startDate: string; endDate: string; start: string; end: string; approx: boolean;
  tz: string; loc: [number, number] | null; site: string | null; source?: string; uci: string;
  winner?: string | null; podium?: CyRank[]; stages?: CyStage[]; rankings?: CyRankings; events?: CyChampEvent[];
}
export interface CyclingData { updated: string; status: Record<string, string>; races: CyRace[] }

export const loadCycling = () => getJSON<CyclingData>('/data/cycling.json', 10 * MIN);

export const TAG_LABEL: Record<string, string> = { monument: 'Monument', grand: 'Grand Tour', worlds: 'World Championships', euros: 'European Championships' };

/** Every race as calendar events: one-day races, each Grand Tour stage, the championship races. */
export function cyclingEvents(d: CyclingData): ObsEvent[] {
  const out: ObsEvent[] = [];
  for (const r of d.races) {
    const base = { passion: 'cicl' as const, state: 'pre' as const, place: r.venue || r.country, loc: r.loc ?? undefined, link: r.site ?? r.uci };
    if (r.kind === 'champs') {
      for (const e of r.events ?? []) out.push({ ...base, id: `cy:${r.id}:${e.title}`, title: `${r.name} · ${e.title}`, sub: e.winner ? `Winner: ${e.winner}` : r.venue, start: Date.parse(e.start), weight: Math.min(3, e.tier) as 1 | 2 | 3, approx: e.approx });
    } else if (r.kind === 'one-day') {
      out.push({ ...base, id: `cy:${r.id}`, title: r.name, sub: r.winner ? `Winner: ${r.winner}` : r.tag ? TAG_LABEL[r.tag] : `UCI WorldTour · ${r.cls}`, start: Date.parse(r.start), weight: r.tier, approx: r.approx });
    } else if (r.stages?.length) {
      const racing = r.stages.filter(s => !s.rest);
      racing.forEach((s, i) => out.push({
        ...base, id: `cy:${r.id}:${s.num}`, title: `${r.name} · Stage ${s.num}`, sub: `${s.from}${s.to !== s.from ? ` → ${s.to}` : ''} · ${s.km ?? '?'} km · ${s.type}`,
        start: Date.parse(s.start), approx: s.approx, place: s.from,
        weight: (r.tag === 'grand' ? (i === 0 || i === racing.length - 1 ? 3 : 2) : 1) as 1 | 2 | 3,
      }));
    } else {
      out.push({ ...base, id: `cy:${r.id}`, title: `${r.name} · Stage 1`, sub: r.winner ? `Winner: ${r.winner}` : `UCI WorldTour · ${r.startDate.slice(8)}–${r.endDate.slice(8)} ${new Date(r.end).toLocaleString('en-GB', { month: 'short' })}`, start: Date.parse(r.start), weight: r.tier, approx: r.approx });
      if (r.tag === 'grand' || r.tier >= 2) out.push({ ...base, id: `cy:${r.id}:last`, title: `${r.name} · final stage`, start: Date.parse(r.end) - 4 * 3600e3, weight: Math.max(1, r.tier - 1) as 1 | 2 | 3, approx: true });
    }
  }
  return out;
}
