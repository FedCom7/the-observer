// public/data/nba-season.json (scripts/collect/nbaSeason.mjs): the NBA season in numbers.
import { useEffect, useState } from 'react';
import { getJSON } from '../core/fetcher';

export interface NbaTeamInfo { id: string; abbr: string; name: string; short: string; color: string | null; alt: string | null; conf: 'East' | 'West'; div: string }
export interface NbaResult { id: string; date: string; type: number; h: string; a: string; hs: number; as: number; hl: number[]; al: number[] }
export interface Zone { freq: number; pct: number; att: number }
export interface NbaPower {
  g: number; w: number; l: number; ortg: number; drtg: number; net: number; pace: number;
  off: { efg: number; tov: number; orb: number; ftr: number; tpRate: number; tpPct: number; astRate: number; paint: number; fb: number; ts: number };
  def: { efg: number; tov: number; orb: number; ftr: number; tpRate: number; tpPct: number; stl: number; blk: number; paint: number; fb: number };
  reb: number; quarters: (number | null)[]; otGames: [number, number];
  clutch: { g: number; w: number; net: number | null }; close: { w: number; l: number };
  home: { net: number | null }; away: { net: number | null }; b2b: { g: number; net: number | null }; rested: { g: number; net: number | null };
  shots: Record<string, Zone>; oppShots: Record<string, Zone>;
  log: { id: string; date: string; opp: string; home: boolean; pts: number; opp_pts: number; ortg: number; drtg: number }[];
}
export interface NbaPlayer { id: string; name: string; pos: string | null; team: string; g: number; gs: number; min: number; pts: number; reb: number; oreb: number; ast: number; stl: number; blk: number; tov: number; pf: number; pm: number; fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number; ts: number | null; usg: number | null }
export interface NbaBpi { bpi: number; rank: number; off: number; def: number; projW: number; projL: number; playoffs: number; top6: number; playIn: number; seed1: number; semis: number; confFinal: number; finals: number; title: number; sosRem: number | null; sos: number | null; lottery: number }
export interface NbaMarket { label: string; rows: { name: string; p: number; bid: number; ask: number }[] }
export interface NbaSeasonFile {
  updated: string; season: number; week: number; teams: NbaTeamInfo[]; schedule: { start: string | null; end: string | null };
  results: NbaResult[]; power: Record<string, NbaPower>; players: NbaPlayer[];
  bpi: Record<string, NbaBpi>; bpiHistory: { wk: number; at: string; t: Record<string, [number, number, number]> }[];
  markets: Record<string, NbaMarket>; marketHistory: { wk: number; t: Record<string, Record<string, number>> }[];
  history: { finals: { year: number; winner: string; loser: string; conf: string; games: string | null }[]; seasons: Record<string, Record<string, { w: number; l: number; pct: number; seed: number | null; diff: number | null }>> };
}

export function useNbaSeason(enabled = true) {
  const [d, setD] = useState<NbaSeasonFile | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let on = true;
    const load = () => getJSON<NbaSeasonFile>(`${import.meta.env.BASE_URL}data/nba-season.json`, 10 * 60e3).then(x => { if (on) setD(x); }).catch(() => {});
    load();
    const t = setInterval(load, 10 * 60e3);
    return () => { on = false; clearInterval(t); };
  }, [enabled]);
  return d;
}

export const seasonLabel = (y: number) => `${y - 1}–${String(y).slice(2)}`;
