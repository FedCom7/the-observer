// MLB from ESPN: division standings, the Dodgers' season, and the postseason
// bracket rebuilt from the playoff teams' schedules (ESPN has no bracket endpoint
// and rejects date ranges for baseball). ESPN JSON is untyped, read as `any`.
import { getJSON } from '../core/fetcher';
import { MIN } from '../core/time';
import type { ObsEvent } from '../core/types';
import { toEvent } from './espn';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb';
export const DODGERS = '19';

export interface DivisionRow { id: string; abbr: string; name: string; w: number; l: number; gb: string; seed: number | null; clinch: string; diff: number; streak: string; mine: boolean }
export interface Division { league: 'AL' | 'NL'; name: string; rows: DivisionRow[] }
export interface SeasonGame { date: number; opp: string; home: boolean; rs: number; ra: number; win: boolean }
export interface Series { key: string; league: 'AL' | 'NL' | 'MLB'; round: string; order: number; bestOf: number; teams: { id: string; abbr: string; wins: number; seed: number | null }[]; done: boolean; winner: string | null; next: number | null }
export interface MlbData { season: number; divisions: Division[]; dodgers: SeasonGame[]; series: Series[]; postseasonEvents: ObsEvent[] }

const stat = (e: any, n: string) => e.stats?.find((s: any) => s.name === n)?.displayValue ?? '';

async function standings(): Promise<{ season: number; divisions: Division[] }> {
  const j = await getJSON<any>('https://site.api.espn.com/apis/v2/sports/baseball/mlb/standings?level=3', 10 * MIN);
  const divisions: Division[] = [];
  for (const lg of j.children ?? []) {
    for (const d of lg.children ?? []) {
      divisions.push({
        league: /American/.test(lg.name) ? 'AL' : 'NL',
        name: d.name.replace(/^(American|National) League /, ''),
        rows: (d.standings?.entries ?? []).map((e: any) => ({
          id: String(e.team.id), abbr: e.team.abbreviation, name: e.team.shortDisplayName ?? e.team.displayName,
          w: Number(stat(e, 'wins')), l: Number(stat(e, 'losses')), gb: stat(e, 'gamesBehind'),
          seed: Number(stat(e, 'playoffSeed')) || null, clinch: stat(e, 'clincher'), diff: Number(stat(e, 'differential')) || 0,
          streak: stat(e, 'streak'), mine: String(e.team.id) === DODGERS,
        })).sort((a: DivisionRow, b: DivisionRow) => b.w - a.w || a.l - b.l),
      });
    }
  }
  return { season: Number(j.seasons?.[0]?.year ?? j.season?.year ?? new Date().getFullYear()), divisions };
}

async function dodgersSeason(season: number): Promise<SeasonGame[]> {
  const j = await getJSON<any>(`${SITE}/teams/${DODGERS}/schedule?season=${season}&seasontype=2`, 30 * MIN);
  return (j.events ?? []).flatMap((e: any) => {
    const c = e.competitions?.[0];
    if (c?.status?.type?.state !== 'post') return [];
    const me = c.competitors.find((x: any) => String(x.team.id) === DODGERS), opp = c.competitors.find((x: any) => String(x.team.id) !== DODGERS);
    const rs = Number(me?.score?.value ?? me?.score?.displayValue), ra = Number(opp?.score?.value ?? opp?.score?.displayValue);
    return [{ date: Date.parse(e.date), opp: opp?.team.abbreviation ?? '', home: me?.homeAway === 'home', rs, ra, win: Boolean(me?.winner) }];
  });
}

const ROUND_ORDER: [RegExp, string, number, number][] = [
  [/wild ?card|ALWC|NLWC/i, 'Wild Card', 0, 3],
  [/ALDS|NLDS|division series/i, 'Division Series', 1, 5],
  [/ALCS|NLCS|championship series/i, 'Championship Series', 2, 7],
  [/world series/i, 'World Series', 3, 7],
];

/** Postseason series from the schedules of every seeded team. */
async function postseason(season: number, seeds: Map<string, number>, leagueOf: Map<string, 'AL' | 'NL'>): Promise<{ series: Series[]; events: ObsEvent[] }> {
  const ids = [...seeds.keys()];
  const pages = await Promise.all(ids.map(id => getJSON<any>(`${SITE}/teams/${id}/schedule?season=${season}&seasontype=3`, 10 * MIN).catch(() => ({ events: [] }))));
  const games = new Map<string, any>();
  pages.forEach(p => (p.events ?? []).forEach((e: any) => games.set(String(e.id), e)));
  const series = new Map<string, Series>();
  const events: ObsEvent[] = [];
  for (const e of [...games.values()].sort((a, b) => Date.parse(a.date) - Date.parse(b.date))) {
    const c = e.competitions?.[0];
    const note: string = c?.notes?.[0]?.headline ?? '';
    const r = ROUND_ORDER.find(([re]) => re.test(note));
    if (!c || !r) continue;
    const teams = c.competitors.map((x: any) => ({ id: String(x.team.id), abbr: x.team.abbreviation }));
    const key = `${r[1]}:${teams.map((t: any) => t.id).sort().join('-')}`;
    const lg = r[1] === 'World Series' ? 'MLB' : (leagueOf.get(teams[0].id) ?? 'NL');
    const s: Series = series.get(key) ?? { key, league: lg, round: r[1], order: r[2], bestOf: r[3], teams: teams.map((t: any) => ({ ...t, wins: 0, seed: seeds.get(t.id) ?? null })), done: false, winner: null, next: null };
    const state = c.status?.type?.state;
    if (state === 'post') {
      const w = c.competitors.find((x: any) => x.winner);
      const t = w && s.teams.find(t => t.id === String(w.team.id));
      if (t) t.wins++;
    } else if (s.next === null && !s.done) {
      s.next = Date.parse(e.date);
    }
    const need = Math.ceil(s.bestOf / 2);
    const champ = s.teams.find(t => t.wins >= need);
    if (champ) { s.done = true; s.winner = champ.id; s.next = null; }
    series.set(key, s);
    // Skip "if necessary" games once the series is over.
    if (!(s.done && state === 'pre')) {
      const ev = toEvent(e, 'mlb', 'baseball', 'mlb', DODGERS);
      ev.sub = note;
      ev.weight = r[1] === 'World Series' || teams.some((t: any) => t.id === DODGERS) ? 3 : 2;
      events.push(ev);
    }
  }
  return { series: [...series.values()].sort((a, b) => a.order - b.order || a.league.localeCompare(b.league)), events };
}

export async function mlbData(): Promise<MlbData> {
  const { season, divisions } = await standings();
  const seeds = new Map<string, number>();
  const leagueOf = new Map<string, 'AL' | 'NL'>();
  divisions.forEach(d => d.rows.forEach(r => { leagueOf.set(r.id, d.league); if (r.seed && r.seed <= 6) seeds.set(r.id, r.seed); }));
  const [dodgers, post] = await Promise.all([dodgersSeason(season), seeds.size ? postseason(season, seeds, leagueOf) : Promise.resolve({ series: [], events: [] })]);
  return { season, divisions, dodgers, series: post.series, postseasonEvents: post.events };
}
