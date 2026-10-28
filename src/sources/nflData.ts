// The NFL season file written by scripts/collect/nfl.mjs (games, strength, FPI,
// history), plus the box score of one game read live from ESPN.
import { useEffect, useState } from 'react';
import { getJSON } from '../core/fetcher';

export interface NflTeamInfo { id: string; abbr: string; name: string; short: string; color: string | null; alt: string | null; conf: 'AFC' | 'NFC' | null; div: string | null }
export interface NflSeasonGame {
  id: string; type: 2 | 3; wk: number; start: string; st: 'pre' | 'in' | 'post'; detail: string;
  h: string; a: string; hs: number | null; as: number | null; hl: number[]; al: number[]; tv: string | null; venue: string | null; note: string | null;
}
export interface NflPower {
  games: number; plays: number;
  offEpa: number; defEpa: number; offPassEpa: number; offRushEpa: number; defPassEpa: number; defRushEpa: number;
  offSr: number; defSr: number; offExp: number; defExp: number; off3rd: number; def3rd: number; offRz: number; defRz: number;
  offPtsDrive: number; defPtsDrive: number; sackRateAllowed: number; sackRate: number; give: number; take: number; toMargin: number; earlyPass: number;
  byQ: { off: (number | null)[]; def: (number | null)[] }; close4: { off: number | null; def: number | null; plays: number };
  weeks: { wk: number; opp: string; off: number | null; def: number | null }[];
  /** Situation → [EPA per play, success rate, plays], for the offence and the defence */
  splits: { off: Record<string, [number, number, number]>; def: Record<string, [number, number, number]> };
  rates: Record<string, number | null>;
  drives: { off: NflDrives; def: NflDrives };
}
export interface NflDrives { n: number; start: number | null; plays: number | null; end: Record<string, number> }
export interface NflQb { name: string; team: string; dropbacks: number; epa: number; cpoe: number | null; sr: number }
export interface NflFpi {
  fpi: number; rank: number; projW: number; projL: number; playoff: number; div: number; divRound: number; conf: number; sb: number; title: number;
  sosRemRank: number | null; sosRank: number | null; ingameWp: number | null; epaOff: number; epaDef: number; epaSt: number; effOff: number; effDef: number; effSt: number;
}
export interface NflSuperBowl { n: number; roman: string; date: string; season: number; winner: string; loser: string; wConf: string; ws: number; ls: number; venue: string | null }
export interface NflSeasonFile {
  updated: string; season: number; teams: NflTeamInfo[]; games: NflSeasonGame[];
  pbp: { at: string; ftnPlays?: number; maxWeek: number; teams: Record<string, NflPower>; qbs: NflQb[] } | null;
  fpi: Record<string, NflFpi>;
  fpiHistory: { wk: number; at: string; t: Record<string, [number, number, number]> }[];
  history: { superBowls: NflSuperBowl[]; seasons: Record<string, Record<string, { w: number; l: number; t: number; pct: number; diff: number; seed: number | null }>> };
}

export function useNflSeason(enabled = true) {
  const [d, setD] = useState<NflSeasonFile | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let on = true;
    const load = () => getJSON<NflSeasonFile>(`${import.meta.env.BASE_URL}data/nfl.json`, 10 * 60e3).then(x => { if (on) setD(x); }).catch(() => {});
    load();
    const t = setInterval(load, 10 * 60e3);
    return () => { on = false; clearInterval(t); };
  }, [enabled]);
  return d;
}

export interface NflBox {
  teams: { abbr: string; home: boolean; stats: Record<string, string> }[];
  players: { abbr: string; cat: string; labels: string[]; rows: { name: string; stats: string[] }[] }[];
  scoring: { q: number; clock: string; team: string; text: string; type: string; away: number; home: number }[];
  drives: { team: string; result: string; plays: number; yards: number; q: number; time: string }[];
  wp: { t: number; p: number }[];
}

const SUMMARY = (league: string) => `https://site.api.espn.com/apis/site/v2/sports/football/${league}/summary?event=`;

/** Box score, scoring plays, drives and win probability of one game. */
export async function nflBox(id: string, league: 'nfl' | 'college-football' = 'nfl'): Promise<NflBox> {
  const res = await fetch(SUMMARY(league) + id);
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  const j = await res.json();
  const homeId = j.header?.competitions?.[0]?.competitors?.find((c: { homeAway: string }) => c.homeAway === 'home')?.team?.id;
  // Win probability is per play; place each play on the game clock (0 → 1 over four quarters)
  type Play = { id: string; period?: { number: number }; clock?: { value?: number; displayValue?: string } };
  const secs = (c?: Play['clock']) => c?.value ?? (c?.displayValue ? c.displayValue.split(':').reduce((a, v) => a * 60 + Number(v), 0) : 0);
  const plays = new Map<string, Play>();
  for (const dr of j.drives?.previous ?? []) for (const p of dr.plays ?? []) plays.set(p.id, p);
  const wp = (j.winprobability ?? []).map((w: { playId: string; homeWinPercentage: number }) => {
    const p = plays.get(w.playId);
    if (!p?.period) return null;
    const q = Math.min(p.period.number, 5);
    const t = q > 4 ? 1 : ((q - 1) * 900 + (900 - secs(p.clock))) / 3600;
    return { t, p: w.homeWinPercentage };
  }).filter(Boolean) as { t: number; p: number }[];
  return {
    teams: (j.boxscore?.teams ?? []).map((t: { team: { abbreviation: string; id: string }; statistics: { name: string; displayValue: string }[] }) => ({ abbr: t.team.abbreviation, home: t.team.id === homeId, stats: Object.fromEntries(t.statistics.map(s => [s.name, s.displayValue])) })),
    players: (j.boxscore?.players ?? []).flatMap((t: { team: { abbreviation: string }; statistics: { name: string; labels: string[]; athletes: { athlete: { shortName: string }; stats: string[] }[] }[] }) =>
      t.statistics.filter(s => ['passing', 'rushing', 'receiving', 'defensive'].includes(s.name)).map(s => ({ abbr: t.team.abbreviation, cat: s.name, labels: s.labels, rows: s.athletes.slice(0, s.name === 'defensive' ? 4 : 5).map(a => ({ name: a.athlete.shortName, stats: a.stats })) }))),
    scoring: (j.scoringPlays ?? []).map((s: { period: { number: number }; clock: { displayValue: string }; team: { abbreviation: string }; text: string; type: { abbreviation: string }; awayScore: number; homeScore: number }) => ({ q: s.period.number, clock: s.clock.displayValue, team: s.team.abbreviation, text: s.text, type: s.type.abbreviation, away: s.awayScore, home: s.homeScore })),
    drives: (j.drives?.previous ?? []).map((d: { team: { abbreviation: string }; displayResult?: string; result?: string; offensivePlays?: number; yards?: number; start?: { period?: { number: number } }; timeElapsed?: { displayValue: string } }) => ({ team: d.team.abbreviation, result: d.displayResult ?? d.result ?? '', plays: d.offensivePlays ?? 0, yards: d.yards ?? 0, q: d.start?.period?.number ?? 0, time: d.timeElapsed?.displayValue ?? '' })),
    wp: wp.sort((a, b) => a.t - b.t),
  };
}

/** Standings after each week, from the results: wins (ties count half) then point differential. */
export function standingsByWeek(games: NflSeasonGame[], teams: NflTeamInfo[], upTo: number) {
  const rec = Object.fromEntries(teams.map(t => [t.abbr, { w: 0, l: 0, t: 0, pf: 0, pa: 0 }]));
  const out: { wk: number; table: Record<string, { w: number; l: number; t: number; pf: number; pa: number }> }[] = [];
  for (let wk = 1; wk <= upTo; wk++) {
    for (const g of games) {
      if (g.type !== 2 || g.wk !== wk || g.st !== 'post' || g.hs == null || g.as == null) continue;
      const H = rec[g.h], A = rec[g.a];
      if (!H || !A) continue;
      H.pf += g.hs; H.pa += g.as; A.pf += g.as; A.pa += g.hs;
      if (g.hs > g.as) { H.w++; A.l++; } else if (g.hs < g.as) { A.w++; H.l++; } else { H.t++; A.t++; }
    }
    out.push({ wk, table: JSON.parse(JSON.stringify(rec)) });
  }
  return out;
}
export const winPct = (r: { w: number; l: number; t: number }) => (r.w + r.l + r.t ? (r.w + r.t / 2) / (r.w + r.l + r.t) : 0);
