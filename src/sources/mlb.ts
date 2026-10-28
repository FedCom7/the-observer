// MLB from ESPN: division standings, the Dodgers' season, and the postseason
// bracket rebuilt from the playoff teams' schedules (ESPN has no bracket endpoint
// and rejects date ranges for baseball). ESPN JSON is untyped, read as `any`.
import { getJSON } from '../core/fetcher';
import { DAY, HOUR, MIN } from '../core/time';
import type { ObsEvent, Standing } from '../core/types';
import { toEvent } from './espn';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb';
export const DODGERS = '19';

/** diff: run differential over the season */
export interface DivisionRow { id: string; abbr: string; name: string; w: number; l: number; gb: string; seed: number | null; clinch: string; diff: number; streak: string; mine: boolean }
export interface Division { league: 'AL' | 'NL'; name: string; rows: DivisionRow[] }
export interface SeasonGame { date: number; opp: string; home: boolean; rs: number; ra: number; win: boolean }
export interface Series { key: string; league: 'AL' | 'NL' | 'MLB'; round: string; order: number; bestOf: number; teams: { id: string; abbr: string; wins: number; seed: number | null }[]; done: boolean; winner: string | null; next: number | null }
/** pre: before opening day · regular · post: October · off: after the World Series */
export type Phase = 'pre' | 'regular' | 'post' | 'off';
export interface MlbData { season: number; phase: Phase; week: number | null; regStart: number | null; regEnd: number | null; divisions: Division[]; dodgers: SeasonGame[]; series: Series[]; postseasonEvents: ObsEvent[] }

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
          // ESPN's "differential" is per game: the total comes from runs scored and allowed
          seed: Number(stat(e, 'playoffSeed')) || null, clinch: stat(e, 'clincher'), diff: (Number(stat(e, 'pointsFor')) || 0) - (Number(stat(e, 'pointsAgainst')) || 0),
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
      // The Dodgers' games belong to their page; every other playoff game to the MLB one
      const mine = teams.some((t: any) => t.id === DODGERS);
      const ev = toEvent(e, mine ? 'dodgers' : 'mlb', 'baseball', 'mlb', DODGERS);
      ev.sub = note;
      ev.weight = r[1] === 'World Series' || mine ? 3 : 2;
      events.push(ev);
    }
  }
  return { series: [...series.values()].sort((a, b) => a.order - b.order || a.league.localeCompare(b.league)), events };
}

/** Opening day and the last day of the regular season. */
async function regularSeason(season: number): Promise<{ start: number; end: number } | null> {
  try {
    const j = await getJSON<any>(`https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/seasons/${season}/types/2`, 24 * HOUR);
    return { start: Date.parse(j.startDate), end: Date.parse(j.endDate) };
  } catch { return null; }
}

export async function mlbData(): Promise<MlbData> {
  const { season, divisions } = await standings();
  const seeds = new Map<string, number>();
  const leagueOf = new Map<string, 'AL' | 'NL'>();
  divisions.forEach(d => d.rows.forEach(r => { leagueOf.set(r.id, d.league); if (r.seed && r.seed <= 6) seeds.set(r.id, r.seed); }));
  const [dodgers, post, reg] = await Promise.all([dodgersSeason(season), seeds.size ? postseason(season, seeds, leagueOf) : Promise.resolve({ series: [], events: [] }), regularSeason(season)]);
  const now = Date.now();
  const ws = post.series.find(s => s.round === 'World Series');
  const phase: Phase = ws?.done ? 'off' : post.series.length || (reg && now > reg.end) ? 'post' : reg && now < reg.start ? 'pre' : 'regular';
  const week = phase === 'regular' && reg ? Math.floor((now - reg.start) / (7 * DAY)) + 1 : null;
  return { season, phase, week, regStart: reg?.start ?? null, regEnd: reg?.end ?? null, divisions, dodgers, series: post.series, postseasonEvents: post.events };
}

const seriesLine = (s: Series) => {
  const [a, b] = s.teams;
  if (!a || !b) return '';
  const lead = a.wins >= b.wins ? a : b, other = lead === a ? b : a;
  return s.done ? `${lead.abbr} ${lead.wins}–${other.wins}` : a.wins === b.wins ? `${a.wins}–${b.wins}` : `${lead.abbr} ${lead.wins}–${other.wins}`;
};

/** The league at a glance for the control room: the best records in season, the series in October. */
export function mlbStanding(m: MlbData): Standing {
  if (m.series.length) {
    // Latest round first, then the ones before it
    const rounds = [...m.series].sort((a, b) => b.order - a.order);
    const top = rounds[0];
    const ws = rounds.find(s => s.round === 'World Series');
    return {
      passion: 'mlb', title: 'MLB', cols: ['Round', 'Series', 'Score'],
      meta: m.phase === 'off' && ws ? `${ws.teams.find(t => t.id === ws.winner)?.abbr} won the World Series` : `Postseason · ${top.round}`,
      rows: rounds.slice(0, 6).map(s => ({ rank: s.round === 'World Series' ? 'WS' : `${s.league === 'MLB' ? '' : s.league}${['WC', 'DS', 'CS'][s.order] ?? ''}`, name: s.teams.map(t => t.abbr).join(' – '), values: [seriesLine(s)], mine: s.teams.some(t => t.id === DODGERS) && !s.done })),
    };
  }
  const all = m.divisions.flatMap(d => d.rows.map(r => ({ ...r, league: d.league })));
  const best = all.sort((a, b) => b.w / Math.max(1, b.w + b.l) - a.w / Math.max(1, a.w + a.l)).slice(0, 6);
  return {
    passion: 'mlb', title: 'MLB', cols: ['#', 'Team', 'W-L'],
    meta: m.phase === 'regular' && m.week ? `Week ${m.week} · regular season` : m.phase === 'pre' && m.regStart ? `Opening day ${new Date(m.regStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'Best records',
    rows: best.map((r, i) => ({ rank: i + 1, name: `${r.name} · ${r.league}`, values: [`${r.w}-${r.l}`], mine: r.mine })),
  };
}
