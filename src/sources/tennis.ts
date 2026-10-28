// Shape of public/data/tennis.json (scripts/collect/tennis.mjs), and the live draw read from
// ESPN by the browser while a Slam is being played.
import { getJSON } from '../core/fetcher';
import { MIN } from '../core/time';

export interface Slam { key: string; name: string; short: string; tz: string; place: string; surface: string; color: string; year: number; start: string; end: string; startDate: string; endDate: string }
export interface DrawPlayer { id: string; name: string; short: string | null; country: string | null; seed: number | null; winner: boolean; sets: { g: number; tb: number | null; won: boolean }[] }
export interface DrawMatch { id: string; round: string; r: number; date: string | null; state: 'pre' | 'in' | 'post'; detail: string; court: string | null; players: DrawPlayer[] }
export interface Draw { id: string; name: string; start: string; end: string | null; matches: DrawMatch[]; slam?: Slam }
export interface Ranked { rank: number; prev: number; points: number; trend: string; name: string; short: string | null; country: string | null; id: string }
export interface TennisData {
  updated: string; slams: Slam[]; draw: Draw | null;
  rankings: { name: string; updated: string | null; ranks: Ranked[] } | null;
  champions: { year: number; slam: string; name: string; country: string | null }[];
}

export const loadTennis = () => getJSON<TennisData>(`${import.meta.env.BASE_URL}data/tennis.json`, 5 * MIN);
export const ROUNDS = ['Round 1', 'Round 2', 'Round 3', 'Round 4', 'Quarterfinal', 'Semifinal', 'Final'];

interface EspnCompetitor { id: string; winner?: boolean; seed?: string; athlete?: { id?: string; displayName?: string; shortName?: string; flag?: { alt?: string } }; linescores?: { value: number; tiebreak?: number; winner?: boolean }[] }
interface EspnCompetition { id: string; date?: string; round?: { displayName?: string }; status?: { type?: { state?: 'pre' | 'in' | 'post'; detail?: string } }; venue?: { court?: string }; competitors?: EspnCompetitor[] }

/** The men's singles matches of today's Slam from ESPN (CORS-friendly), to refresh the draw live. */
export async function liveDraw(day: string): Promise<DrawMatch[]> {
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard?dates=${day.replace(/-/g, '')}`);
  if (!res.ok) return [];
  const j = await res.json();
  const ev = (j.events ?? []).find((e: { major?: boolean }) => e.major);
  const g = ev?.groupings?.find((x: { grouping?: { displayName?: string } }) => /^Men's Singles$/i.test(x.grouping?.displayName ?? ''));
  return ((g?.competitions ?? []) as EspnCompetition[]).map(c => ({
    id: c.id, round: c.round?.displayName ?? '', r: ROUNDS.indexOf(c.round?.displayName ?? ''), date: c.date ?? null,
    state: c.status?.type?.state ?? 'pre', detail: c.status?.type?.detail ?? '', court: c.venue?.court ?? null,
    players: (c.competitors ?? []).map(p => ({ id: p.athlete?.id ?? p.id, name: p.athlete?.displayName ?? 'TBD', short: p.athlete?.shortName ?? null, country: p.athlete?.flag?.alt ?? null, seed: p.seed ? Number(p.seed) || null : null, winner: !!p.winner, sets: (p.linescores ?? []).map(l => ({ g: l.value, tb: l.tiebreak ?? null, won: !!l.winner })) })),
  })).filter(m => m.r >= 0);
}
