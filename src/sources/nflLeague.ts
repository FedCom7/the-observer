// The NFL as a whole, straight from ESPN (CORS-friendly): this week's games with live
// situation, last week's results, standings by division with playoff seeds, stat leaders.
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

export interface NflTeam { id: string; abbr: string; name: string; short: string; logo: string | null; record: string | null; score: number | null; winner: boolean; lines: number[] }
export interface NflGame {
  id: string; start: number; state: 'pre' | 'in' | 'post'; detail: string; shortDetail: string; tv: string | null; venue: string | null;
  home: NflTeam; away: NflTeam; possession: string | null; downDistance: string | null; redZone: boolean; lastPlay: string | null;
  leaders: { cat: string; who: string; line: string }[]; note: string | null;
}
export interface NflWeek { week: number; label: string; byes: string[]; games: NflGame[] }
export interface NflStandingRow { id: string; abbr: string; name: string; w: number; l: number; t: number; pct: number; pf: number; pa: number; diff: number; seed: number | null; streak: string; div: string; conf: 'AFC' | 'NFC'; divRecord: string }
export interface NflLeader { cat: string; label: string; rows: { name: string; team: string; value: string }[] }

interface EspnCompetitor { id: string; homeAway: string; score?: string; winner?: boolean; team: { id: string; abbreviation: string; displayName: string; shortDisplayName: string; logo?: string }; records?: { summary: string }[]; linescores?: { value: number }[] }

function team(c: EspnCompetitor | undefined): NflTeam {
  return {
    id: c?.team.id ?? '', abbr: c?.team.abbreviation ?? '', name: c?.team.displayName ?? '', short: c?.team.shortDisplayName ?? '', logo: c?.team.logo ?? null,
    record: c?.records?.[0]?.summary ?? null, score: c?.score != null && c.score !== '' ? Number(c.score) : null, winner: !!c?.winner, lines: (c?.linescores ?? []).map(l => l.value),
  };
}

/** One week of games (the current one when no week is given). */
export async function nflWeek(week?: number): Promise<NflWeek> {
  const res = await fetch(`${SITE}/scoreboard${week ? `?week=${week}&seasontype=2` : ''}`);
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  const j = await res.json();
  const games: NflGame[] = (j.events ?? []).map((e: { id: string; date: string; competitions: Record<string, unknown>[] }) => {
    const c = e.competitions[0] as {
      competitors: EspnCompetitor[]; status: { type: { state: 'pre' | 'in' | 'post'; detail: string; shortDetail: string } }; broadcasts?: { names: string[] }[]; venue?: { fullName: string };
      situation?: { possession?: string; downDistanceText?: string; isRedZone?: boolean; lastPlay?: { text?: string } }; leaders?: { name: string; leaders: { displayValue: string; athlete: { shortName: string } }[] }[]; notes?: { headline: string }[];
    };
    const home = team(c.competitors.find(x => x.homeAway === 'home')), away = team(c.competitors.find(x => x.homeAway === 'away'));
    return {
      id: e.id, start: Date.parse(e.date), state: c.status.type.state, detail: c.status.type.detail, shortDetail: c.status.type.shortDetail,
      tv: c.broadcasts?.flatMap(b => b.names).join(' / ') || null, venue: c.venue?.fullName ?? null, home, away,
      possession: c.situation?.possession ? (c.situation.possession === home.id ? home.abbr : away.abbr) : null, downDistance: c.situation?.downDistanceText ?? null,
      redZone: !!c.situation?.isRedZone, lastPlay: c.situation?.lastPlay?.text ?? null, note: c.notes?.[0]?.headline ?? null,
      leaders: (c.leaders ?? []).slice(0, 3).map(l => ({ cat: l.name, who: l.leaders[0]?.athlete.shortName ?? '', line: l.leaders[0]?.displayValue ?? '' })),
    };
  }).sort((a: NflGame, b: NflGame) => a.start - b.start);
  return { week: j.week?.number ?? week ?? 0, label: j.season?.type === 3 ? 'Playoffs' : `Week ${j.week?.number ?? week}`, byes: (j.week?.teamsOnBye ?? []).map((t: { abbreviation: string }) => t.abbreviation), games };
}

/** Standings of all eight divisions, with the playoff seeds. */
export async function nflStandings(): Promise<NflStandingRow[]> {
  const res = await fetch('https://site.api.espn.com/apis/v2/sports/football/nfl/standings?level=3');
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  const j = await res.json();
  const out: NflStandingRow[] = [];
  for (const conf of j.children ?? []) for (const div of conf.children ?? []) for (const e of div.standings?.entries ?? []) {
    const st = (n: string) => e.stats.find((s: { name: string }) => s.name === n);
    out.push({
      id: e.team.id, abbr: e.team.abbreviation, name: e.team.displayName, w: st('wins')?.value ?? 0, l: st('losses')?.value ?? 0, t: st('ties')?.value ?? 0, pct: st('winPercent')?.value ?? 0,
      pf: st('pointsFor')?.value ?? 0, pa: st('pointsAgainst')?.value ?? 0, diff: st('pointDifferential')?.value ?? 0, seed: st('playoffSeed')?.value || null, streak: st('streak')?.displayValue ?? '',
      div: div.name, conf: /American/.test(conf.name) ? 'AFC' : 'NFC', divRecord: e.stats.find((s: { type?: string; name: string }) => s.name === 'vs. Div.' || s.type === 'vsdiv')?.displayValue ?? '',
    });
  }
  return out;
}

const LEADER_CATS: [string, string][] = [['passingYards', 'Passing yards'], ['rushingYards', 'Rushing yards'], ['receivingYards', 'Receiving yards'], ['passingTouchdowns', 'Passing TDs'], ['sacks', 'Sacks'], ['interceptions', 'Interceptions']];

export async function nflLeaders(): Promise<NflLeader[]> {
  const res = await fetch('https://site.api.espn.com/apis/site/v3/sports/football/nfl/leaders');
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  const j = await res.json();
  const cats: { name: string; leaders: { displayValue: string; athlete: { displayName: string }; team?: { abbreviation?: string } }[] }[] = j.leaders?.categories ?? [];
  return LEADER_CATS.map(([cat, label]) => ({ cat, label, rows: (cats.find(c => c.name === cat)?.leaders ?? []).slice(0, 5).map(l => ({ name: l.athlete.displayName, team: l.team?.abbreviation ?? '', value: l.displayValue })) })).filter(c => c.rows.length);
}
