// NBA from ESPN: conference standings with playoff and play-in zones, the Lakers'
// season, and the playoff bracket rebuilt from the seeded teams' schedules (this
// season once it starts, last season's for context). ESPN JSON is untyped, read as `any`.
import { getJSON } from '../core/fetcher';
import { DAY, HOUR, MIN } from '../core/time';
import type { ObsEvent } from '../core/types';
import { toEvent } from './espn';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
export const LAKERS = '13';

export interface ConfRow { id: string; abbr: string; name: string; w: number; l: number; gb: string; seed: number | null; clinch: string; streak: string; last10: string; diff: number; mine: boolean }
export interface Conference { name: 'East' | 'West'; rows: ConfRow[] }
export interface Game { date: number; opp: string; home: boolean; pf: number; pa: number; win: boolean }
export interface Series { key: string; conf: 'East' | 'West' | 'NBA'; round: string; order: number; bestOf: number; teams: { id: string; abbr: string; wins: number; seed: number | null }[]; done: boolean; winner: string | null; next: number | null }
export interface NbaData { season: number; started: boolean; conferences: Conference[]; lakers: Game[]; series: Series[]; last: { season: number; conferences: Conference[]; series: Series[] } | null; events: ObsEvent[] }

const stat = (e: any, n: string) => e.stats?.find((s: any) => s.name === n)?.displayValue ?? '';

async function standings(season: number, ttl: number): Promise<Conference[]> {
  const j = await getJSON<any>(`https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=${season}&seasontype=2`, ttl);
  return (j.children ?? []).map((c: any) => ({
    name: /East/.test(c.name) ? 'East' : 'West',
    rows: (c.standings?.entries ?? []).map((e: any) => ({
      id: String(e.team.id), abbr: e.team.abbreviation, name: e.team.shortDisplayName ?? e.team.displayName,
      w: Number(stat(e, 'wins')) || 0, l: Number(stat(e, 'losses')) || 0, gb: stat(e, 'gamesBehind'),
      seed: Number(stat(e, 'playoffSeed')) || null, clinch: stat(e, 'clincher'), streak: stat(e, 'streak'),
      last10: stat(e, 'Last Ten Games'), diff: Number(stat(e, 'differential')) || 0, mine: String(e.team.id) === LAKERS,
    })).sort((a: ConfRow, b: ConfRow) => (a.seed ?? 99) - (b.seed ?? 99)),
  }));
}

const ROUNDS: [RegExp, string, number, number][] = [
  [/NBA Finals/i, 'NBA Finals', 4, 7],
  [/play-?in/i, 'Play-In', 0, 1],
  [/1st Round|First Round/i, 'First Round', 1, 7],
  [/Semifinal/i, 'Conference Semifinals', 2, 7],
  [/Finals/i, 'Conference Finals', 3, 7],
];

/** Playoff and play-in series from the schedules of the top ten seeds of each conference. */
async function bracket(season: number, conferences: Conference[], ttl: number): Promise<{ series: Series[]; events: ObsEvent[] }> {
  const seeds = new Map<string, number>();
  conferences.forEach(c => c.rows.forEach(r => { if (r.seed && r.seed <= 10) seeds.set(r.id, r.seed); }));
  const pages = await Promise.all([...seeds.keys()].flatMap(id => [3, 5].map(st =>
    getJSON<any>(`${SITE}/teams/${id}/schedule?season=${season}&seasontype=${st}`, ttl).catch(() => ({ events: [] })))));
  const games = new Map<string, any>();
  pages.forEach(p => (p.events ?? []).forEach((e: any) => games.set(String(e.id), e)));
  const series = new Map<string, Series>();
  const events: ObsEvent[] = [];
  for (const e of [...games.values()].sort((a, b) => Date.parse(a.date) - Date.parse(b.date))) {
    const c = e.competitions?.[0];
    const note: string = c?.notes?.[0]?.headline ?? '';
    const r = ROUNDS.find(([re]) => re.test(note));
    if (!c || !r) continue;
    const teams = c.competitors.map((x: any) => ({ id: String(x.team.id), abbr: x.team.abbreviation }));
    // Play-in games are single games: key them by the matchup label as well
    const key = `${r[1]}:${r[1] === 'Play-In' ? note : ''}:${teams.map((t: any) => t.id).sort().join('-')}`;
    const conf = r[1] === 'NBA Finals' ? 'NBA' : /East/i.test(note) ? 'East' : 'West';
    const s: Series = series.get(key) ?? { key, conf, round: r[1] === 'Play-In' ? `Play-In · ${note.replace(/^NBA Play-In\s*-\s*(East|West)\s*-\s*/i, '')}` : r[1], order: r[2], bestOf: r[3], teams: teams.map((t: any) => ({ ...t, wins: 0, seed: seeds.get(t.id) ?? null })), done: false, winner: null, next: null };
    const state = c.status?.type?.state;
    if (state === 'post') {
      const w = c.competitors.find((x: any) => x.winner);
      const t = w && s.teams.find(t => t.id === String(w.team.id));
      if (t) t.wins++;
    } else if (s.next === null && !s.done) s.next = Date.parse(e.date);
    const champ = s.teams.find(t => t.wins >= Math.ceil(s.bestOf / 2));
    if (champ) { s.done = true; s.winner = champ.id; s.next = null; }
    series.set(key, s);
    if (!(s.done && state === 'pre')) {
      const ev = toEvent(e, 'nba', 'basketball', 'nba', LAKERS);
      ev.sub = note;
      ev.weight = r[1] === 'NBA Finals' || teams.some((t: any) => t.id === LAKERS) ? 3 : 2;
      events.push(ev);
    }
  }
  return { series: [...series.values()].sort((a, b) => a.order - b.order || a.conf.localeCompare(b.conf)), events };
}

async function lakersSeason(season: number): Promise<{ games: Game[]; events: ObsEvent[] }> {
  const j = await getJSON<any>(`${SITE}/teams/${LAKERS}/schedule?season=${season}&seasontype=2`, 10 * MIN);
  const games: Game[] = [];
  const events: ObsEvent[] = [];
  for (const e of j.events ?? []) {
    const c = e.competitions?.[0];
    const ev = toEvent(e, 'nba', 'basketball', 'nba', LAKERS);
    ev.weight = 3;
    events.push(ev);
    if (c?.status?.type?.state !== 'post') continue;
    const me = c.competitors.find((x: any) => String(x.team.id) === LAKERS), opp = c.competitors.find((x: any) => String(x.team.id) !== LAKERS);
    games.push({ date: Date.parse(e.date), opp: opp?.team.abbreviation ?? '', home: me?.homeAway === 'home', pf: Number(me?.score?.value ?? me?.score?.displayValue), pa: Number(opp?.score?.value ?? opp?.score?.displayValue), win: Boolean(me?.winner) });
  }
  return { games, events };
}

export async function nbaData(): Promise<NbaData> {
  const board = await getJSON<any>(`${SITE}/scoreboard`, 10 * MIN);
  // ESPN names the 2026-27 season "2027"
  const season = Number(board.season?.year ?? board.leagues?.[0]?.season?.year ?? new Date().getFullYear() + 1);
  const [conferences, lakers] = await Promise.all([standings(season, 10 * MIN), lakersSeason(season)]);
  const started = conferences.some(c => c.rows.some(r => r.w + r.l > 0));
  // This season's playoffs only matter from April; otherwise show last season for context
  const month = new Date().getMonth();
  const current = started && month >= 3 && month <= 6 ? await bracket(season, conferences, 10 * MIN) : { series: [], events: [] };
  let last: NbaData['last'] = null;
  try {
    const lastConf = await standings(season - 1, 24 * HOUR);
    const b = await bracket(season - 1, lastConf, 24 * HOUR);
    last = { season: season - 1, conferences: lastConf, series: b.series };
  } catch { /* context only */ }
  const recentWindow = Date.now() - 2 * DAY;
  return {
    season, started, conferences, lakers: lakers.games, series: current.series, last,
    events: [...lakers.events.filter(e => e.start > recentWindow - 60 * DAY), ...current.events],
  };
}
