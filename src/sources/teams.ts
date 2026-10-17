// Shape of public/data/teams.json (scripts/collect/teams.mjs).
import { getJSON } from '../core/fetcher';
import { MIN } from '../core/time';

export interface TeamCard { id: string; name: string; short: string; abbr: string; color: string | null; logo: string | null; standing: string | null; record: string | null; rank: number | null; gp: number | null; w: number | null; d: number | null; l: number | null; pf: number | null; pa: number | null; pts: number | null; pos: number | null; seed: number | null }
export interface FootballStats { ppg: number | null; ypg: number | null; passYpg: number | null; rushYpg: number | null; third: number | null; toDiff: number | null; sacks: number | null }
export interface Game { date: string; opp: string; oppName: string; home: boolean; us: number; them: number; result: 'W' | 'D' | 'L'; season: number; type?: string }
export interface Rival {
  id: string; name: string; label: string | null; kind: 'historic' | 'current'; card: TeamCard | null; stats: FootballStats | null; page: string | null;
  allTime: { wins: number | null; losses: number | null; draws: number | null; total: number | null; text: string } | null;
  since2001: { w: number; d: number; l: number; gf: number; ga: number };
  recent: Game[];
}
export interface SoccerSeason { season: string; start: number; division: string; pld: number | null; w: number | null; d: number | null; l: number | null; gf: number | null; ga: number | null; pts: number | null; pos: number | null; champion: boolean; cup: string | null; cupWon: boolean; europe: { comp: string; result: string }[]; scorer: string | null; goals: number | null }
export interface NflSeason { season: string; start: number; league: string; conference: string; division: string; finish: number | null; w: number | null; l: number | null; t: number | null; postseason: string | null; coach: string | null; champion: boolean; conferenceChampion: boolean; playoffs: boolean }
export interface CfbSeason { season: string; start: number; coach: string | null; conference: string | null; w: number | null; l: number | null; t: number | null; confW: number | null; confL: number | null; confStanding: string | null; bowl: string | null; bowlResult: string | null; apRank: number | null; champion: boolean; conferenceChampion: boolean }
export type Season = SoccerSeason & NflSeason & CfbSeason;
export interface Competition { name: string; phase: string | null; w: number; d: number; l: number; gf: number; ga: number; games: { date: string; opp: string; home: boolean; us: number | null; them: number | null }[] }
export interface TeamData {
  key: 'milan' | 'pats' | 'texas'; name: string; sport: 'soccer' | 'football'; league: string; id: string;
  card: TeamCard | null; stats: FootballStats | null; competitions: Competition[] | null;
  history: Season[]; trophies: { type: string; competition: string; titles: number; seasons: string[] }[];
  espnSeasons: { season: number; w: number; d: number; l: number; pf: number; pa: number }[];
  rivals: Rival[];
}
export interface TeamsData { updated: string; milan: TeamData; pats: TeamData; texas: TeamData }

export const loadTeams = () => getJSON<TeamsData>('/data/teams.json', 15 * MIN);
