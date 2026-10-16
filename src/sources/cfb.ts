// College football from ESPN: postseason (all bowls and the College Football
// Playoff, with real kickoff times), AP and CFP rankings, ranking history for the
// bump chart, and this week's Top 25 matchups. ESPN JSON is untyped, read as `any`.
import { getJSON } from '../core/fetcher';
import { HOUR, MIN } from '../core/time';
import type { ObsEvent } from '../core/types';
import { toEvent } from './espn';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football';
const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/college-football';
export const TEXAS = '251';

export type CfpRound = 'First Round' | 'Quarterfinal' | 'Semifinal' | 'National Championship';
export interface PostGame { id: string; bowl: string; cfp: CfpRound | null; start: number; timeValid: boolean; city: string; tv: string; teams: { id: string | null; abbr: string; name: string; seed: number | null; score?: string; winner?: boolean }[]; state: string }
export interface RankRow { rank: number; id: string; name: string; record: string; prev: number | null; points: number }
export interface CfbData { season: number; week: number | null; firstGame: number | null; post: PostGame[]; ap: RankRow[]; cfp: RankRow[] | null; history: { week: number; ranks: Record<string, number> }[]; names: Record<string, string> }

const CFP_ROUNDS: [RegExp, CfpRound][] = [[/first round/i, 'First Round'], [/quarterfinal/i, 'Quarterfinal'], [/semifinal/i, 'Semifinal'], [/national championship/i, 'National Championship']];

/** Short bowl name: "College Football Playoff Quarterfinal at the Rose Bowl Presented by Prudential" -> "Rose Bowl". */
function bowlName(note: string) {
  const at = (note.match(/at the (.+)$/i)?.[1] ?? note).replace(/ presented by .*$/i, '').trim();
  // The six playoff bowls are known by their short names; others keep their full (sponsored) name.
  return at.match(/\b(Rose|Sugar|Orange|Cotton|Peach|Fiesta) Bowl\b/)?.[0] ?? at;
}

export function postGames(j: any): PostGame[] {
  return (j.events ?? []).map((e: any) => {
    const c = e.competitions?.[0] ?? {};
    const note: string = c.notes?.[0]?.headline ?? e.name;
    return {
      id: String(e.id),
      bowl: /national championship/i.test(note) ? 'National Championship' : /first round/i.test(note) ? 'CFP First Round' : bowlName(note),
      cfp: CFP_ROUNDS.find(([re]) => re.test(note))?.[1] ?? null,
      start: Date.parse(e.date),
      timeValid: c.timeValid !== false,
      city: c.venue?.address?.city ?? '',
      tv: (c.broadcasts ?? []).flatMap((b: any) => b.names ?? []).join(' / '),
      teams: (c.competitors ?? []).map((x: any) => ({
        id: x.team?.id ? String(x.team.id) : null,
        abbr: x.team?.abbreviation ?? 'TBD',
        name: x.team?.shortDisplayName ?? x.team?.displayName ?? 'TBD',
        seed: Number(x.curatedRank?.current) && x.curatedRank.current < 99 ? x.curatedRank.current : x.seed ? Number(x.seed) : null,
        score: x.score, winner: x.winner,
      })),
      state: c.status?.type?.state ?? 'pre',
    } as PostGame;
  });
}

const rankRows = (poll: any): RankRow[] => (poll?.ranks ?? []).map((r: any) => ({
  rank: r.current, id: String(r.team.id), name: r.team.nickname ?? r.team.location, record: r.recordSummary ?? '', prev: r.previous || null, points: r.points ?? 0,
}));

export async function cfbData(): Promise<{ data: CfbData; events: ObsEvent[] }> {
  const [bowls, cfp, rankings, board] = await Promise.all([
    getJSON<any>(`${SITE}/scoreboard?seasontype=3&week=1&groups=80`, 30 * MIN),
    getJSON<any>(`${SITE}/scoreboard?seasontype=3&week=999&groups=80`, 30 * MIN),
    getJSON<any>(`${SITE}/rankings`, HOUR),
    getJSON<any>(`${SITE}/scoreboard?groups=80`, 10 * MIN),
  ]);
  const season = Number(board.season?.year ?? new Date().getFullYear());
  const week = Number(board.week?.number) || null;

  // Postseason: bowls plus CFP games (the bowl list already contains the CFP ones; merge by id)
  const byId = new Map<string, PostGame>();
  [...postGames(bowls), ...postGames(cfp)].forEach(g => byId.set(g.id, g));
  const post = [...byId.values()].sort((a, b) => a.start - b.start);

  const ap = rankRows((rankings.rankings ?? []).find((r: any) => r.name === 'AP Top 25'));
  const cfpPoll = (rankings.rankings ?? []).find((r: any) => /playoff/i.test(r.name));
  const names: Record<string, string> = {};
  for (const p of rankings.rankings ?? []) for (const r of p.ranks ?? []) names[String(r.team.id)] = r.team.nickname ?? r.team.location;

  // AP history: one core-API call per completed week (cached for a day; past polls never change)
  const history: CfbData['history'] = [];
  const lastWeek = (week ?? 1) - 1;
  const polls = await Promise.all(Array.from({ length: Math.max(0, lastWeek - 1) }, (_, i) => i + 2).map(w =>
    getJSON<any>(`${CORE}/seasons/${season}/types/2/weeks/${w}/rankings/1`, w < lastWeek ? 24 * HOUR : HOUR).then(j => ({ w, j })).catch(() => null)));
  for (const p of polls) {
    if (!p?.j?.ranks) continue;
    const ranks: Record<string, number> = {};
    for (const r of p.j.ranks) { const id = r.team?.$ref?.match(/teams\/(\d+)/)?.[1]; if (id) ranks[id] = r.current; }
    history.push({ week: p.w, ranks });
  }
  if (ap.length && week) history.push({ week, ranks: Object.fromEntries(ap.map(r => [r.id, r.rank])) });

  // Calendar: every postseason game, plus this week's games between ranked teams
  const events: ObsEvent[] = [];
  for (const e of [...(bowls.events ?? []), ...(cfp.events ?? [])]) {
    const g = byId.get(String(e.id))!;
    const ev = toEvent(e, 'cfb', 'football', 'college-football', TEXAS);
    const known = g.teams.every(t => t.id);
    ev.title = known ? `${g.bowl} · ${g.teams.map(t => t.name).join(' vs ')}` : g.bowl;
    ev.sub = g.cfp ? `College Football Playoff · ${g.cfp}` : 'Bowl game';
    ev.weight = g.cfp ? 3 : /Rose|Sugar|Orange|Cotton|Peach|Fiesta|Citrus|Alamo|Gator/.test(g.bowl) ? 2 : 1;
    ev.tbc = !g.timeValid;
    events.push(ev);
  }
  const ranked = new Set(ap.map(r => r.id));
  for (const e of board.events ?? []) {
    const ids = (e.competitions?.[0]?.competitors ?? []).map((x: any) => String(x.team?.id));
    if (ids.length === 2 && ids.every((id: string) => ranked.has(id))) {
      const ev = toEvent(e, 'cfb', 'football', 'college-football', TEXAS);
      const rk = (id: string) => ap.find(r => r.id === id)?.rank;
      const comp = e.competitions[0].competitors;
      const away = comp.find((x: any) => x.homeAway === 'away'), home = comp.find((x: any) => x.homeAway === 'home');
      ev.title = `#${rk(String(away.team.id))} ${away.team.shortDisplayName} @ #${rk(String(home.team.id))} ${home.team.shortDisplayName}`;
      ev.sub = 'Top 25 matchup';
      ev.weight = 2;
      events.push(ev);
    }
  }
  const firstGame = post.find(g => g.cfp === 'First Round')?.start ?? null;
  return { data: { season, week, firstGame, post, ap, cfp: cfpPoll ? rankRows(cfpPoll) : null, history, names }, events };
}
