// Every game of a league over a window of days (today and tomorrow, Rome time), for the live wall.
// Each game carries one compact line of live detail read straight from the scoreboard, so the wall
// can show a whole league in one block without fetching every game summary.
import type { ObsEvent, PassionId } from '../core/types';
import { MIN } from '../core/time';
import { toEvent } from './espn';
import { memJSON } from './gamecast';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports';

export interface League { key: string; passion: PassionId; sport: string; league: string; name: string; query?: string; mine?: string; keep?: (e: ObsEvent) => boolean }

export const LEAGUES: League[] = [
  { key: 'nfl', passion: 'nfl', sport: 'football', league: 'nfl', name: 'NFL', mine: '17' },
  // College football: only games with a ranked team (and Texas)
  { key: 'cfb', passion: 'cfb', sport: 'football', league: 'college-football', name: 'College football · Top 25', query: '&groups=80&limit=300', mine: '251', keep: e => Boolean(e.home?.rank || e.away?.rank || e.home?.mine || e.away?.mine) },
  { key: 'mlb', passion: 'mlb', sport: 'baseball', league: 'mlb', name: 'MLB', mine: '19' },
  { key: 'nba', passion: 'nba', sport: 'basketball', league: 'nba', name: 'NBA' },
  { key: 'seriea', passion: 'milan', sport: 'soccer', league: 'ita.1', name: 'Serie A', mine: '103' },
];

export interface GameLine {
  /** goals and red cards, per side */
  scorers?: { away: string[]; home: string[] };
  /** down and distance, count and bases */
  situation?: string;
  lastPlay?: string;
  /** probable pitchers before an MLB game */
  probables?: string;
  /** top scorer of each side (NBA), passing leader (NFL) */
  leaders?: string;
  odds?: string;
  headline?: string;
  series?: string;
  possession?: 'home' | 'away';
}

export type LeagueGame = ObsEvent & { line: GameLine };

/** ESPN dates are US Eastern days: the window in Rome spans these. */
const etDay = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(t).replace(/-/g, '');

function lineOf(e: any, sport: string): GameLine {
  const c = e.competitions?.[0] ?? {};
  const cs: any[] = c.competitors ?? [];
  const homeC = cs.find(x => x.homeAway === 'home'), awayC = cs.find(x => x.homeAway === 'away');
  const sideOf = (teamId: any) => (String(teamId) === String(homeC?.team?.id ?? homeC?.id) ? 'home' : 'away');
  const st = c.status?.type?.state ?? 'pre';
  const out: GameLine = {};
  if (sport === 'soccer') {
    const sc = { away: [] as string[], home: [] as string[] };
    for (const d of c.details ?? []) {
      if (!d.scoringPlay && !d.redCard) continue;
      const who = d.athletesInvolved?.[0]?.shortName ?? d.athletesInvolved?.[0]?.displayName ?? '?';
      const tag = d.redCard ? ' 🟥' : d.ownGoal ? ' (og)' : d.penaltyKick ? ' (pen)' : '';
      sc[sideOf(d.team?.id)].push(`${who} ${d.clock?.displayValue ?? ''}${tag}`);
    }
    if (sc.away.length || sc.home.length) out.scorers = sc;
  }
  const s = c.situation;
  if (st === 'in' && s) {
    if (sport === 'football') {
      out.situation = s.downDistanceText ?? s.shortDownDistanceText;
      out.lastPlay = s.lastPlay?.text;
      if (s.possession) out.possession = sideOf(s.possession);
    } else if (sport === 'baseball') {
      const bases = [s.onFirst && '1st', s.onSecond && '2nd', s.onThird && '3rd'].filter(Boolean);
      out.situation = `${s.balls ?? 0}-${s.strikes ?? 0} · ${s.outs ?? 0} out · ${bases.length ? bases.join(', ') : 'bases empty'}`;
      out.lastPlay = s.lastPlay?.text;
    }
  }
  if (sport === 'baseball' && st === 'pre') {
    const p = (x: any) => x?.probables?.[0]?.athlete?.shortName ?? 'TBD';
    if (awayC?.probables || homeC?.probables) out.probables = `${p(awayC)} vs ${p(homeC)}`;
  }
  if (st !== 'pre') {
    const top = (x: any, name: string) => { const l = x?.leaders?.find((y: any) => y.name === name)?.leaders?.[0]; return l ? `${l.athlete?.shortName ?? ''} ${l.displayValue}` : null; };
    if (sport === 'basketball') out.leaders = [top(awayC, 'points'), top(homeC, 'points')].filter(Boolean).join(' · ') || undefined;
    if (sport === 'football') {
      const l = (c.leaders ?? []).find((y: any) => y.name === 'passingYards')?.leaders?.[0];
      if (l) out.leaders = `${l.athlete?.shortName ?? ''} ${l.displayValue}`;
    }
  }
  if (st === 'pre' && c.odds?.[0]?.details) out.odds = `${c.odds[0].details}${c.odds[0].overUnder ? ` · O/U ${c.odds[0].overUnder}` : ''}`;
  if (st === 'post') out.headline = c.headlines?.[0]?.shortLinkText ?? c.headlines?.[0]?.description;
  out.series = c.series?.summary;
  return out;
}

/** The games of a league that start between `from` and `to`, plus any still live. */
export async function leagueDay(l: League, from: number, to: number, live = false): Promise<LeagueGame[]> {
  // ESPN takes one day per request (no ranges): ask for each Eastern day the window touches
  const days = [...new Set([from - 6 * 3600e3, from + 12 * 3600e3, to - 12 * 3600e3, to - 1].map(etDay))];
  const pages = await Promise.all(days.map(d => memJSON<any>(`${SITE}/${l.sport}/${l.league}/scoreboard?dates=${d}${l.query ?? ''}`, live ? 30e3 : 5 * MIN)));
  const seen = new Set<string>();
  const games = pages.flatMap(j => j.events ?? [])
    .filter((e: any) => (e.season?.type ?? 2) !== 1 && (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .map((e: any) => ({ ...toEvent(e, l.passion, l.sport, l.league, l.mine), line: lineOf(e, l.sport) }) as LeagueGame)
    .filter((g: LeagueGame) => g.state === 'in' || (g.start >= from && g.start < to))
    .filter((g: LeagueGame) => !l.keep || l.keep(g));
  return games.sort((x: LeagueGame, y: LeagueGame) => x.start - y.start);
}
