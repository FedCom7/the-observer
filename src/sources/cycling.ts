// Shape of public/data/cycling.json (scripts/collect/cycling.mjs) and its calendar events.
import { getJSON } from '../core/fetcher';
import { MIN } from '../core/time';
import type { ObsEvent } from '../core/types';

export interface CyRank { pos: number; rider: string | null; team: string; time: string | null; gap: string | null; gapS: number | null; points: number | null }
export interface CyStage { fromLoc?: [number, number]; toLoc?: [number, number]; num: number | null; type: string; rest: boolean; date: string; from: string; to: string; km: number | null; start: string; approx: boolean; firstStart?: string | null; lastArrival?: string | null }
export interface CyRankings {
  final: boolean;
  /** "Wikipedia" when the organiser publishes no rankings we can read */
  source?: string;
  /** one-day races */
  result?: CyRank[];
  /** stage races */
  stage?: number; stageResult?: CyRank[]; gc?: CyRank[]; points?: CyRank[]; mountains?: CyRank[]; youth?: CyRank[]; teams?: CyRank[];
  history?: { stage: number; winner: CyRank | null; gc: CyRank[] }[];
}
export interface CyStarter { bib: number; rider: string; nat: string }
export interface CyTeamList { team: string; riders: CyStarter[] }
export interface CyChampEvent { title: string; date: string; start: string; approx: boolean; winner: string | null; nat?: string | null; tier: number }
/** From the race's Wikipedia page, team codes already resolved to names. */
export interface CyWikiRow { pos: number; rider: string; nat: string | null; team: string | null; time: string | null; points: number | null }
export interface CyJersey { key: string; label: string; rider: string | null; nat: string | null; team: string | null; color: string | null }
export interface CyWiki {
  title: string; url: string;
  podium: { pos: number; rider: string; nat: string | null; team: string | null }[];
  jerseys: CyJersey[]; gcColor: string | null; colors: Record<string, string | null | undefined>;
  result: CyWikiRow[]; classes: { points: CyWikiRow[]; mountains: CyWikiRow[]; youth: CyWikiRow[] };
  stages: (CyStage & { winner?: string | null; winnerNat?: string | null; winnerTeam?: string | null })[];
  leaders: { stage: number; gc?: string | null; points?: string | null; mountains?: string | null; youth?: string | null }[];
}
export interface CyNationals { year: number; rows: { nat: string; rr: string | null; rrTeam: string | null; itt: string | null; ittTeam: string | null }[] }
export interface CyRace {
  id: string; uciName: string; name: string; cls: string; kind: 'one-day' | 'stage' | 'champs'; tier: 1 | 2 | 3; tag: 'monument' | 'grand' | 'worlds' | 'euros' | null;
  year: number; country: string; venue: string; startDate: string; endDate: string; start: string; end: string; approx: boolean;
  tz: string; loc: [number, number] | null; site: string | null; source?: string; uci: string;
  winner?: string | null; podium?: CyRank[]; stages?: CyStage[]; rankings?: CyRankings; startlist?: CyTeamList[]; events?: CyChampEvent[]; wiki?: CyWiki;
}
export interface CyclingData { updated: string; status: Record<string, string>; races: CyRace[]; nationals?: CyNationals | null }

export const loadCycling = () => getJSON<CyclingData>(`${import.meta.env.BASE_URL}data/cycling.json`, 10 * MIN);

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

/** The screens of the cycling page: the season, then the races grouped as in the season chart. */
export type CySection = 'monument' | 'grand' | 'classic' | 'week' | 'other';
export type CyTab = 'season' | CySection;
export const SECTIONS: { key: CySection; label: string }[] = [
  { key: 'grand', label: 'Grand Tours' }, { key: 'monument', label: 'Monuments' }, { key: 'classic', label: 'Major classics' }, { key: 'week', label: 'Week-long tours' }, { key: 'other', label: 'Other races' },
];
export const sectionOf = (r: CyRace): CySection => r.tag === 'monument' ? 'monument' : r.tag === 'grand' ? 'grand' : r.kind === 'champs' ? 'other' : !r.tag && r.tier === 2 && r.kind === 'one-day' ? 'classic' : !r.tag && r.tier === 2 ? 'week' : 'other';

/** Screen and races of the page: the tab opened (by default the one of the race under way), the races of a year, the Grand Tour on show. */
export function cyclingFocus(d: CyclingData | null | undefined, now: number, view: { tab: CyTab | null; pick: string | null }) {
  const year = new Date(now).getUTCFullYear();
  const all = (d?.races ?? []).filter(r => r.year >= year && r.year <= year + 1).sort((a, b) => a.start.localeCompare(b.start));
  const live = all.find(r => Date.parse(r.start) <= now && Date.parse(r.end) > now - 24 * 3600e3);
  const tab: CyTab = view.tab ?? (live ? sectionOf(live) : 'season');
  const grands = all.filter(r => r.tag === 'grand');
  const grand = grands.find(r => r.id === view.pick) ?? (live?.tag === 'grand' ? live : undefined) ?? [...grands].reverse().find(r => Date.parse(r.start) <= now) ?? grands[0];
  return { all, live, tab, grands, grand };
}

/** Stops of a race for the map: every stage start and the finish, else the race's own spot. */
export function cyclingRoute(r: CyRace | undefined): { label: string; loc: [number, number]; n?: string }[] {
  if (!r) return [];
  const racing = (r.stages ?? []).filter(s => !s.rest);
  const out = racing.flatMap(s => (s.fromLoc ? [{ label: s.from, loc: s.fromLoc, n: String(s.num) }] : []));
  const last = racing[racing.length - 1];
  if (last?.toLoc) out.push({ label: last.to, loc: last.toLoc, n: 'Finish' });
  return out.length ? out : r.loc ? [{ label: r.venue || r.name, loc: r.loc }] : [];
}
