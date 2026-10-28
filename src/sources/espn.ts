// ESPN's public JSON is untyped, so this adapter reads it as `any`.
import { getJSON } from '../core/fetcher';
import { cityLoc } from '../core/places';
import type { NewsItem, ObsEvent, PassionId, Side, Standing } from '../core/types';
import { HOUR, MIN } from '../core/time';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
const V2 = 'https://site.api.espn.com/apis/v2/sports';

const SOCCER = new Set(['soccer']);

const logoOf = (t: any, rel: string): string | undefined => (t.logos ?? []).find((l: any) => l.rel?.includes(rel) && l.rel?.includes('full') && l.rel.length === 2)?.href ?? (rel === 'default' ? t.logo : undefined);

function side(c: any, mineId?: string): Side {
  const t = c.team ?? {};
  const rank = c.curatedRank?.current;
  const score = typeof c.score === 'object' ? c.score?.displayValue : c.score;
  return {
    abbr: t.abbreviation ?? '',
    name: t.shortDisplayName ?? t.nickname ?? t.displayName ?? t.name ?? '',
    score: score ?? undefined,
    winner: c.winner,
    mine: mineId !== undefined && String(t.id) === mineId,
    id: t.id !== undefined ? String(t.id) : undefined,
    logo: logoOf(t, 'default'),
    logoDark: logoOf(t, 'dark'),
    rank: rank && rank <= 25 ? rank : undefined,
  };
}

function broadcasts(comp: any): string | undefined {
  const names: string[] = (comp.broadcasts ?? []).flatMap((b: any) => b.names ?? (b.media?.shortName ? [b.media.shortName] : []));
  return names.length ? [...new Set(names)].join(' / ') : undefined;
}

/** Turns an ESPN event (scoreboard or team schedule shape) into an ObsEvent. */
export function toEvent(e: any, passion: PassionId, sport: string, league: string, mineId?: string): ObsEvent {
  const comp = e.competitions?.[0] ?? {};
  const cs: any[] = comp.competitors ?? [];
  const homeC = cs.find(c => c.homeAway === 'home') ?? cs[0];
  const awayC = cs.find(c => c.homeAway === 'away') ?? cs[1];
  const home = homeC ? side(homeC, mineId) : undefined;
  const away = awayC ? side(awayC, mineId) : undefined;
  const st = comp.status?.type ?? e.status?.type ?? {};
  const state = (st.state ?? 'pre') as ObsEvent['state'];
  const soccer = SOCCER.has(sport);
  const title = home && away ? (soccer ? `${home.name}–${away.name}` : `${away.name} @ ${home.name}`) : e.name;
  const notes = (comp.notes ?? []).map((n: any) => n.headline).filter(Boolean).join(' · ');
  const leagueName = e.league?.shortName ?? e.week?.text ?? (e.week?.number ? `Week ${e.week.number}` : undefined);
  const city = comp.venue?.address?.city;
  const eventLeague = e.league?.slug ?? league;
  return {
    id: `espn:${eventLeague}:${e.id}`,
    passion,
    title,
    sub: notes || leagueName || undefined,
    start: Date.parse(e.date),
    state,
    clock: state === 'pre' ? undefined : st.shortDetail ?? st.detail,
    home,
    away,
    place: comp.venue?.fullName ? `${comp.venue.fullName}${city ? ', ' + city : ''}` : city,
    loc: cityLoc(city),
    tv: broadcasts(comp),
    link: e.links?.[0]?.href,
    espn: { sport, league: eventLeague, id: String(e.id) },
  };
}

/** A team's full schedule. Soccer splits results and fixtures into two calls. */
export async function teamSchedule(passion: PassionId, sport: string, league: string, teamId: string, query = ''): Promise<ObsEvent[]> {
  const base = `${SITE}/${sport}/${league}/teams/${teamId}/schedule${query}`;
  const urls = SOCCER.has(sport) ? [base, base + '?fixture=true'] : [base];
  const pages = await Promise.all(urls.map(u => getJSON<any>(u, 30 * MIN)));
  const seen = new Set<string>();
  return pages.flatMap(p => p.events ?? [])
    .filter((e: any) => !/friendly/i.test(e.league?.slug ?? ''))
    .map(e => toEvent(e, passion, sport, league, teamId))
    .filter(ev => (seen.has(ev.id) ? false : (seen.add(ev.id), true)));
}

/** Scoreboard of the current day or week. Preseason games are left out. */
export async function scoreboard(passion: PassionId, sport: string, league: string, ttl = 5 * MIN): Promise<ObsEvent[]> {
  const j = await getJSON<any>(`${SITE}/${sport}/${league}/scoreboard`, ttl);
  return (j.events ?? []).filter((e: any) => (e.season?.type ?? 2) !== 1).map((e: any) => toEvent(e, passion, sport, league));
}

/** Fresh state for one game, used while it is live. */
export async function liveSummary(ev: ObsEvent): Promise<Partial<ObsEvent> | null> {
  if (!ev.espn) return null;
  const { sport, league, id } = ev.espn;
  const j = await getJSON<any>(`${SITE}/${sport}/${league}/summary?event=${id}`, 15e3);
  const comp = j.header?.competitions?.[0];
  if (!comp) return null;
  const st = comp.status?.type ?? {};
  const byId = (homeAway: string) => comp.competitors?.find((c: any) => c.homeAway === homeAway);
  const h = byId('home'), a = byId('away');
  return {
    state: st.state,
    clock: st.state === 'pre' ? undefined : st.shortDetail ?? st.detail,
    home: ev.home && h ? { ...ev.home, score: h.score, winner: h.winner } : ev.home,
    away: ev.away && a ? { ...ev.away, score: a.score, winner: a.winner } : ev.away,
  };
}

const stat = (entry: any, name: string) => entry.stats?.find((s: any) => s.name === name)?.displayValue ?? '';

export async function soccerTable(passion: PassionId, league: string, mineId: string, title: string): Promise<Standing> {
  const j = await getJSON<any>(`${V2}/soccer/${league}/standings`, 30 * MIN);
  const entries: any[] = j.children?.[0]?.standings?.entries ?? [];
  const rows = entries
    .map(e => ({ rank: Number(stat(e, 'rank')) || 0, name: e.team.shortDisplayName ?? e.team.displayName, values: [stat(e, 'gamesPlayed'), stat(e, 'pointDifferential'), stat(e, 'points')], mine: String(e.team.id) === mineId, move: Number(stat(e, 'rankChange')) || 0 }))
    .sort((a, b) => a.rank - b.rank);
  return { passion, title, cols: ['#', 'Club', 'P', 'GD', 'Pts'], rows, updated: Date.now() };
}

/** NFL division table, built from the conference standings. */
export async function nflDivision(passion: PassionId, teams: string[], mine: string, title: string): Promise<Standing> {
  const j = await getJSON<any>(`${V2}/football/nfl/standings`, 30 * MIN);
  const entries: any[] = (j.children ?? []).flatMap((c: any) => c.standings?.entries ?? []);
  const rows = entries
    .filter(e => teams.includes(e.team.abbreviation))
    .map(e => ({ w: Number(stat(e, 'wins')), l: Number(stat(e, 'losses')), e }))
    .sort((a, b) => b.w - a.w || a.l - b.l)
    .map((x, i) => ({ rank: i + 1, name: x.e.team.shortDisplayName ?? x.e.team.displayName, values: [stat(x.e, 'overall'), stat(x.e, 'divisionRecord'), stat(x.e, 'pointDifferential')], mine: x.e.team.abbreviation === mine }));
  return { passion, title, cols: ['#', 'Team', 'W–L', 'Div', 'Diff'], rows, updated: Date.now() };
}

export async function cfbRankings(passion: PassionId, mineId: string): Promise<Standing> {
  const j = await getJSON<any>(`${SITE}/football/college-football/rankings`, HOUR);
  const ap = (j.rankings ?? []).find((r: any) => r.name === 'AP Top 25') ?? j.rankings?.[0];
  const rows = (ap?.ranks ?? []).map((r: any) => ({
    rank: r.current, name: r.team.nickname ?? r.team.location, values: [r.recordSummary],
    mine: String(r.team.id) === mineId, move: r.previous ? r.previous - r.current : 0,
  }));
  return { passion, title: 'AP Top 25', cols: ['#', 'Team', 'W–L'], rows, updated: Date.now() };
}

export async function espnNews(passion: PassionId, path: string, filter?: (headline: string) => boolean): Promise<NewsItem[]> {
  const j = await getJSON<any>(`${SITE}/${path}`, 15 * MIN);
  return (j.articles ?? [])
    .filter((a: any) => !filter || filter(a.headline ?? ''))
    .map((a: any) => ({ id: `espn:${a.id ?? a.headline}`, passion, title: a.headline, source: 'ESPN', time: Date.parse(a.published), url: a.links?.web?.href }));
}
