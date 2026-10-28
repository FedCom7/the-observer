// public/data/rosters.json (scripts/collect/rosters.mjs): the four teams I follow, player by player.
import { useEffect, useState } from 'react';
import { getJSON } from '../core/fetcher';

interface EspnPlayer {
  espn: string; name: string; short: string; jersey: string | null; group: string; pos: string | null; posName: string | null; unit: string | null;
  age: number | null; ht: string | null; wt: string | null; exp: string | number | null; college: string | null; from: string | null; state: string | null; nation: string | null;
  photo: string | null; status: string | null; injury: { status: string; detail: string | null } | null; stats: Record<string, number> | null;
}
export interface NflRosterPlayer extends EspnPlayer {
  draft: { pick: number | null; club: string | null; year: number | null } | null; depthPos: string | null;
  season: Record<string, number> | null; snaps: { wk: number; off: number | null; def: number | null; st: number | null }[];
}
export interface CfbRosterPlayer extends EspnPlayer {
  season: Record<string, number> | null;
  ppa: { avg: number | null; total: number | null; pass: number | null; rush: number | null; third: number | null } | null;
}
export interface MlbRosterPlayer {
  id: number; name: string; jersey: string | null; pos: string; posType: string; status: string | null; age: number | null; bats: string | null; throws: string | null;
  from: string | null; debut: string | null; ht: string | null; wt: number | null; photo: string;
  hitting: { g: number; pa: number; ab: number; h: number; hr: number; rbi: number; r: number; sb: number; bb: number; so: number; avg: number; obp: number; slg: number; ops: number; d2: number; d3: number } | null;
  pitching: { g: number; gs: number; ip: number; era: number; whip: number; so: number; bb: number; hr: number; w: number; l: number; sv: number; hld: number; k9: number; bb9: number; avg: number } | null;
}
export interface SoccerRosterPlayer extends EspnPlayer {
  xg: { games: number; min: number; goals: number; xg: number; assists: number; xa: number; shots: number; keyPasses: number; npg: number; npxg: number; chain: number; buildup: number; yellow: number; red: number } | null;
}
export interface Depth { name: string; positions: { key: string; pos: string; name: string; players: string[] }[] }
interface Base { at: string; season: number; error?: string }
export interface RostersFile {
  updated: string;
  pats: Base & { players: NflRosterPlayer[]; depth: Depth[] };
  texas: Base & { players: CfbRosterPlayer[]; depth: Depth[]; cfbd: boolean };
  dodgers: Base & { players: MlbRosterPlayer[] };
  milan: Base & { players: SoccerRosterPlayer[]; understat: boolean };
}

export function useRosters(enabled = true) {
  const [d, setD] = useState<RostersFile | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let on = true;
    getJSON<RostersFile>(`${import.meta.env.BASE_URL}data/rosters.json`, 30 * 60e3).then(x => { if (on) setD(x); }).catch(() => {});
    return () => { on = false; };
  }, [enabled]);
  return d;
}
