export type CatId = 'mil' | 'usa' | 'mot' | 'pol' | 'spa' | 'out' | 'cul' | 'tech';

export type PassionId =
  | 'milan' | 'nfl' | 'pats' | 'cfb' | 'texas' | 'mlb' | 'nba'
  | 'f1' | 'wec' | 'dakar' | 'elez' | 'space'
  | 'cicl' | 'sci' | 'tennis' | 'ac' | 'royal' | 'awards' | 'apple';

export type EventState = 'pre' | 'in' | 'post';

export interface Side {
  abbr: string;
  name: string;
  score?: string;
  winner?: boolean;
  /** true when this side is the team I follow */
  mine?: boolean;
}

export interface ObsEvent {
  id: string;
  passion: PassionId;
  title: string;
  sub?: string;
  /** epoch ms */
  start: number;
  state: EventState;
  /** short live status, e.g. "Q2 5:59" or "67'" */
  clock?: string;
  home?: Side;
  away?: Side;
  place?: string;
  loc?: [number, number];
  tv?: string;
  link?: string;
  /** 1 normal, 2 notable, 3 headline */
  weight?: 1 | 2 | 3;
  /** date still to be confirmed by the source */
  tbc?: boolean;
  /** the source gives the day but not the start time; the time shown is the usual one */
  approx?: boolean;
  /** ESPN coordinates for live refresh */
  espn?: { sport: string; league: string; id: string };
}

export interface StandingRow {
  rank: number | string;
  name: string;
  values: (string | number)[];
  mine?: boolean;
  move?: number;
}

export interface Standing {
  passion: PassionId;
  title: string;
  meta?: string;
  cols: string[];
  rows: StandingRow[];
  updated?: number;
}

export interface NewsItem {
  id: string;
  passion: PassionId;
  title: string;
  source: string;
  time: number;
  url?: string;
}

export interface SourceStatus {
  ok: boolean;
  updated?: number;
  error?: string;
}
