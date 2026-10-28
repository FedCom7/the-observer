// One game in depth, from ESPN's public game summary: what is known before kick-off (form, injuries,
// probable pitchers, odds, predictor, weather, preview) and what happens during it (scoring, lineups,
// team stats, box score, situation, win probability). ESPN's JSON is untyped, so it is read as `any`.
import { MIN } from '../core/time';
import type { EventState, ObsEvent } from '../core/types';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports';

export interface CastTeam { id: string; abbr: string; name: string; logo?: string; logoDark?: string; score?: string; record?: string; color?: string; winner?: boolean; rank?: number }
export interface CastLead { cat: string; name: string; value: string; photo?: string }
export interface CastInjury { name: string; pos: string; status: string; detail: string }
export interface CastPitcher { name: string; line: string; photo?: string; hand?: string }
export interface CastPlay { clock: string; team?: string; text: string; score?: string; kind: 'goal' | 'own' | 'pen' | 'yellow' | 'red' | 'sub' | 'td' | 'fg' | 'safety' | 'run' | 'other'; who?: string; assist?: string }
export interface CastPlayer { n?: string; name: string; pos: string; sub?: 'in' | 'out'; order?: number }
export interface CastLineup { formation?: string; starters: CastPlayer[]; bench: CastPlayer[] }
export interface CastBox { title: string; cols: string[]; rows: { name: string; vals: string[] }[] }
type Pair<T> = { away: T; home: T };

export interface Cast {
  updated: number;
  sport: string;
  state: EventState;
  clock?: string;
  note?: string;
  venue?: string;
  weather?: string;
  attendance?: number;
  tv?: string;
  odds?: string;
  predictor?: Pair<number>;
  winProb?: number;
  teams: Pair<CastTeam>;
  probables?: Pair<CastPitcher | null>;
  injuries?: Pair<CastInjury[]>;
  leaders?: Pair<CastLead[]>;
  form?: Pair<string[]>;
  series?: string;
  preview?: { headline: string; text?: string; url?: string };
  scoring: CastPlay[];
  events: CastPlay[];
  lineups?: Pair<CastLineup>;
  stats: [string, string, string][];
  situation?: string;
  lastPlay?: string;
  linescore?: { labels: string[]; away: string[]; home: string[] };
  box?: Pair<CastBox[]>;
  decisions?: string;
  news: { headline: string; url?: string }[];
}

const pct = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number(v));
const athleteName = (a: any) => a?.shortName ?? a?.displayName ?? '';

function team(c: any): CastTeam {
  const t = c.team ?? {};
  const logos: any[] = t.logos ?? [];
  const pick = (rel: string) => logos.find(l => l.rel?.includes(rel) && l.rel?.includes('full') && l.rel.length === 2)?.href;
  const rec = (c.record ?? []).find((r: any) => r.type === 'total') ?? c.record?.[0];
  const rank = c.rank ?? c.curatedRank?.current;
  return {
    id: String(t.id ?? c.id ?? ''),
    abbr: t.abbreviation ?? '',
    name: t.shortDisplayName ?? t.nickname ?? t.name ?? t.displayName ?? '',
    logo: pick('default') ?? t.logo, logoDark: pick('dark'),
    score: c.score, record: rec?.summary ?? rec?.displayValue, color: t.color ? `#${t.color}` : undefined,
    winner: c.winner, rank: rank && rank <= 25 ? rank : undefined,
  };
}

const KIND: [RegExp, CastPlay['kind']][] = [[/own goal/i, 'own'], [/penalty - scored/i, 'pen'], [/goal/i, 'goal'], [/red card/i, 'red'], [/yellow card/i, 'yellow'], [/substitution/i, 'sub'], [/touchdown/i, 'td'], [/field goal/i, 'fg'], [/safety/i, 'safety']];
const kindOf = (t: string): CastPlay['kind'] => KIND.find(([re]) => re.test(t))?.[1] ?? 'other';

/** Team stats worth comparing side by side, by sport (ESPN labels). */
const STATS: Record<string, string[]> = {
  football: ['Total Yards', 'Passing', 'Rushing', '1st Downs', '3rd down efficiency', '4th down efficiency', 'Red Zone (Made-Att)', 'Turnovers', 'Sacks-Yards Lost', 'Penalties', 'Possession'],
  soccer: ['Possession', 'SHOTS', 'ON GOAL', 'Corner Kicks', 'Saves', 'Fouls', 'Offsides', 'Yellow Cards', 'Red Cards', 'Passes', 'Pass Completion %'],
  basketball: ['FG', 'Field Goal %', '3PT', 'FT', 'Rebounds', 'Assists', 'Turnovers', 'Steals', 'Blocks', 'Points in Paint', 'Fast Break Points', 'Largest Lead'],
};

function teamStats(j: any, sport: string, homeId: string): [string, string, string][] {
  const ts: any[] = j.boxscore?.teams ?? [];
  if (ts.length < 2 || !STATS[sport]) return [];
  const home = ts.find(t => String(t.team?.id) === homeId) ?? ts[1];
  const away = ts.find(t => t !== home) ?? ts[0];
  const val = (t: any, label: string) => t.statistics?.find((s: any) => s.label === label)?.displayValue;
  return STATS[sport].map(l => {
    const a = val(away, l), h = val(home, l);
    if (a === undefined || h === undefined) return null;
    // ESPN gives soccer ratios as 0.9: show them as percentages
    const fix = (v: string) => (sport === 'soccer' && /%/.test(l) && Number(v) <= 1 ? `${Math.round(Number(v) * 100)}%` : sport === 'soccer' && l === 'Possession' ? `${v}%` : v);
    return [l === 'SHOTS' ? 'Shots' : l === 'ON GOAL' ? 'On target' : l, fix(a), fix(h)] as [string, string, string];
  }).filter(Boolean) as [string, string, string][];
}

/** Player box score: the tables that matter per sport, trimmed to the players who did something. */
function boxOf(j: any, sport: string): Pair<CastBox[]> | undefined {
  const ps: any[] = j.boxscore?.players ?? [];
  if (!ps.length) return undefined;
  const homeId = String(j.header?.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'home')?.team?.id ?? '');
  const per = (p: any): CastBox[] => {
    const s: any[] = p.statistics ?? [];
    const table = (st: any, title: string, take: number, keep?: number[], sortBy?: number): CastBox | null => {
      if (!st?.athletes?.length) return null;
      const cols: string[] = st.labels ?? st.names ?? [];
      const idx = keep ?? cols.map((_, i) => i);
      let rows = st.athletes.filter((a: any) => a.stats?.length && !a.didNotPlay).map((a: any) => ({ name: athleteName(a.athlete), vals: a.stats as string[], pos: a.position?.abbreviation }));
      if (sortBy !== undefined) rows = rows.sort((a: any, b: any) => Number(b.vals[sortBy]) - Number(a.vals[sortBy]));
      return { title, cols: idx.map(i => cols[i]), rows: rows.slice(0, take).map((r: any) => ({ name: r.name, vals: idx.map(i => r.vals[i] ?? '') })) };
    };
    if (sport === 'football') {
      const by = (n: string) => s.find(x => x.name === n);
      return [table(by('passing'), 'Passing', 2, [0, 1, 3, 4]), table(by('rushing'), 'Rushing', 3, [0, 1, 3]), table(by('receiving'), 'Receiving', 4, [0, 1, 3])].filter(Boolean) as CastBox[];
    }
    if (sport === 'baseball') {
      const bat = s.find(x => x.type === 'batting'), pit = s.find(x => x.type === 'pitching');
      return [table(bat, 'Batting', 12, [0, 2, 4, 5, 6, 7]), table(pit, 'Pitching', 8, [0, 1, 3, 4, 5, 7])].filter(Boolean) as CastBox[];
    }
    if (sport === 'basketball') return [table(s[0], 'Players', 7, [1, 5, 6, 2, 3, 0], 1)].filter(Boolean) as CastBox[];
    return [];
  };
  const home = ps.find(p => String(p.team?.id) === homeId) ?? ps[1];
  const away = ps.find(p => p !== home) ?? ps[0];
  if (!home || !away) return undefined;
  return { away: per(away), home: per(home) };
}

function lineup(r: any, sport: string): CastLineup {
  const all: any[] = r?.roster ?? [];
  const player = (p: any): CastPlayer => ({
    n: p.jersey, name: p.athlete?.displayName ?? '', pos: p.position?.abbreviation ?? '',
    sub: p.subbedIn ? 'in' : p.subbedOut ? 'out' : undefined, order: p.batOrder ?? (p.formationPlace ? Number(p.formationPlace) : undefined),
  });
  if (sport === 'baseball') {
    // The batting order: one entry per slot (the starter), in order
    const seen = new Set<number>();
    const starters = all.filter(p => p.batOrder && p.starter !== false).sort((a, b) => a.batOrder - b.batOrder)
      .filter(p => (seen.has(p.batOrder) ? false : (seen.add(p.batOrder), true))).map(player);
    return { starters, bench: [] };
  }
  return {
    formation: r?.formation,
    starters: all.filter(p => p.starter).map(player).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    bench: all.filter(p => !p.starter && p.subbedIn).map(player),
  };
}

function situationOf(j: any, sport: string, comp: any): { situation?: string; lastPlay?: string } {
  const s = j.situation ?? comp.situation;
  if (sport === 'baseball' && s) {
    const bases = [s.onFirst && '1st', s.onSecond && '2nd', s.onThird && '3rd'].filter(Boolean);
    const outs = s.outs ?? 0;
    const who = [s.batter?.athlete && `AB ${athleteName(s.batter.athlete)}`, s.pitcher?.athlete && `P ${athleteName(s.pitcher.athlete)}`].filter(Boolean).join(' · ');
    return {
      situation: `${s.balls ?? 0}-${s.strikes ?? 0}, ${outs} out${outs === 1 ? '' : 's'} · ${bases.length ? `on ${bases.join(', ')}` : 'bases empty'}${who ? ' · ' + who : ''}`,
      lastPlay: s.lastPlay?.text ?? j.plays?.filter((p: any) => p.type?.type !== 'start-batterpitcher').slice(-1)[0]?.text,
    };
  }
  if (sport === 'football' && s) {
    return { situation: [s.downDistanceText ?? s.shortDownDistanceText, s.isRedZone ? 'red zone' : ''].filter(Boolean).join(' · ') || undefined, lastPlay: s.lastPlay?.text ?? j.drives?.current?.plays?.slice(-1)[0]?.text };
  }
  if (sport === 'basketball') return { lastPlay: j.plays?.slice(-1)[0]?.text };
  if (sport === 'soccer') return { lastPlay: j.commentary?.slice(-1)[0]?.text };
  return {};
}

/** Parse a summary into a Cast. Exported for tests on saved payloads. */
export function parseCast(j: any, sport: string): Cast | null {
  const comp = j.header?.competitions?.[0];
  if (!comp) return null;
  const cs: any[] = comp.competitors ?? [];
  const hc = cs.find(c => c.homeAway === 'home') ?? cs[0], ac = cs.find(c => c.homeAway === 'away') ?? cs[1];
  if (!hc || !ac) return null;
  const home = team(hc), away = team(ac);
  const side = (id: any): 'home' | 'away' | null => (String(id) === home.id ? 'home' : String(id) === away.id ? 'away' : null);
  const st = comp.status?.type ?? {};
  const state = (st.state ?? 'pre') as EventState;
  const gi = j.gameInfo ?? {};
  const w = gi.weather;
  const pc = j.pickcenter?.[0] ?? j.odds?.[0];
  const pr = j.predictor;

  // Leaders: season leaders before the game, game leaders once it starts (ESPN switches by itself)
  let leaders: Pair<CastLead[]> | undefined;
  if (j.leaders?.length) {
    leaders = { away: [], home: [] };
    for (const t of j.leaders) {
      const k = side(t.team?.id);
      if (!k) continue;
      leaders[k] = (t.leaders ?? []).filter((l: any) => l.leaders?.[0] && l.name !== 'rating').slice(0, 5).map((l: any) => ({
        cat: l.shortDisplayName ?? l.displayName, name: athleteName(l.leaders[0].athlete), value: l.leaders[0].displayValue, photo: l.leaders[0].athlete?.headshot?.href,
      }));
    }
  }

  let injuries: Pair<CastInjury[]> | undefined;
  if (j.injuries?.length) {
    injuries = { away: [], home: [] };
    for (const t of j.injuries) {
      const k = side(t.team?.id);
      if (!k) continue;
      injuries[k] = (t.injuries ?? []).filter((i: any) => /out|doubt|question|injured|day-to-day|suspen/i.test(i.status ?? '')).map((i: any) => ({
        name: i.athlete?.displayName ?? '', pos: i.athlete?.position?.abbreviation ?? '', status: i.status ?? '', detail: i.details?.type ?? i.details?.detail ?? '',
      }));
    }
  }

  let form: Pair<string[]> | undefined;
  if (j.lastFiveGames?.length) {
    form = { away: [], home: [] };
    for (const t of j.lastFiveGames) {
      const k = side(t.team?.id);
      if (k) form[k] = (t.events ?? []).map((e: any) => `${e.gameResult ?? ''} ${e.score ?? ''} ${e.atVs === '@' ? '@' : 'v'} ${e.opponent?.abbreviation ?? ''}`.trim());
    }
  }

  const probable = (c: any): CastPitcher | null => {
    const p = c.probables?.[0];
    if (!p?.athlete) return null;
    const cats: any[] = p.statistics?.splits?.categories ?? [];
    const v = (a: string) => cats.find(x => x.abbreviation === a)?.displayValue;
    const line = cats.length ? [v('W') !== undefined ? `${v('W')}-${v('L')}` : '', v('ERA') ? `${v('ERA')} ERA` : '', v('K') ? `${v('K')} K` : ''].filter(Boolean).join(', ') : '';
    return { name: p.athlete.displayName, line, photo: p.athlete.headshot?.href, hand: p.athlete.throws?.abbreviation };
  };

  // Scoring: soccer key events, NFL scoring plays, MLB scoring plays
  let scoring: CastPlay[] = [];
  const events: CastPlay[] = [];
  if (sport === 'soccer') {
    for (const k of j.keyEvents ?? []) {
      const t = k.type?.text ?? '';
      const kind = kindOf(t);
      const ab = k.team?.id ? (side(k.team.id) === 'home' ? home.abbr : side(k.team.id) === 'away' ? away.abbr : undefined) : undefined;
      const p = k.participants ?? [];
      const play: CastPlay = { clock: k.clock?.displayValue ?? '', team: ab, text: k.text ?? t, kind, who: p[0]?.athlete?.displayName, assist: kind === 'sub' ? undefined : p[1]?.athlete?.displayName };
      if (kind === 'goal' || kind === 'pen' || kind === 'own') scoring.push(play);
      else if (kind === 'yellow' || kind === 'red' || kind === 'sub') events.push(kind === 'sub' ? { ...play, who: p[0]?.athlete?.displayName, assist: p[1]?.athlete?.displayName } : play);
    }
  } else if (sport === 'football') {
    scoring = (j.scoringPlays ?? []).map((p: any) => ({
      clock: `Q${p.period?.number ?? ''} ${p.clock?.displayValue ?? ''}`, team: p.team?.abbreviation, text: p.text ?? '',
      score: `${p.awayScore}-${p.homeScore}`, kind: kindOf(p.type?.text ?? ''),
    }));
  } else if (sport === 'baseball') {
    scoring = (j.plays ?? []).filter((p: any) => p.scoringPlay).map((p: any) => ({
      clock: `${p.period?.type === 'Bottom' ? 'Bot' : 'Top'} ${p.period?.number ?? ''}`, team: p.period?.type === 'Bottom' ? home.abbr : away.abbr,
      text: p.text ?? '', score: `${p.awayScore}-${p.homeScore}`, kind: 'run' as const,
    }));
  }

  // Line score by period, with R-H-E for baseball and the total otherwise
  const ls = (c: any) => (c.linescores ?? []).map((l: any) => l.displayValue ?? String(l.value ?? ''));
  const la = ls(ac), lh = ls(hc);
  const n = Math.max(la.length, lh.length, sport === 'baseball' ? 9 : 0);
  const labels = Array.from({ length: n }, (_, i) => (sport === 'soccer' ? (i === 0 ? '1H' : i === 1 ? '2H' : i === 2 || i === 3 ? 'ET' : 'P') : sport === 'football' || sport === 'basketball' ? (i < 4 ? `Q${i + 1}` : `OT${i > 4 ? i - 3 : ''}`) : String(i + 1)));
  const pad = (a: string[]) => Array.from({ length: n }, (_, i) => a[i] ?? '');
  const linescore = n && state !== 'pre' ? (sport === 'baseball'
    ? { labels: [...labels, 'R', 'H', 'E'], away: [...pad(la), ac.score ?? '', String(ac.hits ?? ''), String(ac.errors ?? '')], home: [...pad(lh), hc.score ?? '', String(hc.hits ?? ''), String(hc.errors ?? '')] }
    : { labels: [...labels, 'T'], away: [...pad(la), ac.score ?? ''], home: [...pad(lh), hc.score ?? ''] }) : undefined;

  const wp = j.winprobability?.length ? j.winprobability[j.winprobability.length - 1]?.homeWinPercentage : undefined;
  const feat: any[] = comp.status?.featuredAthletes ?? [];
  const DEC: Record<string, string> = { winningPitcher: 'W', losingPitcher: 'L', savingPitcher: 'SV' };
  const dec = feat.filter(f => DEC[f.name]).map(f => `${DEC[f.name]} ${athleteName(f.athlete)}${f.athlete?.record ?? f.record ? ` (${f.athlete?.record ?? f.record})` : ''}`).join(' · ');

  const ss = j.seasonseries?.[0];
  const playoff = comp.series?.summary ?? (Array.isArray(comp.series) ? comp.series[0]?.summary : undefined);
  const art = j.article;
  const sit = state === 'in' ? situationOf(j, sport, comp) : {};
  const broadcasts: string[] = (j.broadcasts ?? []).map((b: any) => b.media?.shortName ?? b.station).filter(Boolean);

  return {
    updated: Date.now(),
    sport,
    state,
    clock: state === 'pre' ? undefined : st.shortDetail ?? st.detail,
    note: j.header?.gameNote ?? comp.notes?.[0]?.headline ?? undefined,
    venue: gi.venue?.fullName ? `${gi.venue.fullName}${gi.venue.address?.city ? ', ' + gi.venue.address.city : ''}` : undefined,
    weather: w?.temperature !== undefined ? `${w.temperature}°F · ${Math.round((w.temperature - 32) * 5 / 9)}°C${w.gust ? ` · gusts ${w.gust} mph` : ''}${w.precipitation ? ` · ${w.precipitation}% rain` : ''}` : undefined,
    attendance: gi.attendance || undefined,
    tv: broadcasts.length ? [...new Set(broadcasts)].join(' / ') : undefined,
    odds: pc?.details ? `${pc.details}${pc.overUnder ? ` · O/U ${pc.overUnder}` : ''}` : undefined,
    predictor: pr?.homeTeam?.gameProjection ? { home: Number(pr.homeTeam.gameProjection), away: Number(pr.awayTeam?.gameProjection ?? 100 - Number(pr.homeTeam.gameProjection)) } : undefined,
    winProb: pct(wp) !== undefined && state === 'in' ? Number(wp) * 100 : undefined,
    teams: { away, home },
    probables: sport === 'baseball' ? { away: probable(ac), home: probable(hc) } : undefined,
    injuries,
    leaders,
    form,
    series: playoff ?? ss?.summary,
    preview: art?.headline ? { headline: art.headline, text: art.description, url: art.links?.web?.href } : undefined,
    scoring,
    events,
    lineups: j.rosters?.length === 2 && j.rosters.some((r: any) => r.roster?.length) ? (() => {
      const h = j.rosters.find((r: any) => r.homeAway === 'home' || String(r.team?.id) === home.id), a = j.rosters.find((r: any) => r !== h);
      const L = { away: lineup(a, sport), home: lineup(h, sport) };
      return L.away.starters.length || L.home.starters.length ? L : undefined;
    })() : undefined,
    stats: state === 'pre' ? [] : teamStats(j, sport, home.id),
    ...sit,
    linescore,
    box: state === 'pre' ? undefined : boxOf(j, sport),
    decisions: dec || undefined,
    news: (j.news?.articles ?? []).slice(0, 4).map((a: any) => ({ headline: a.headline, url: a.links?.web?.href })),
  };
}

// Summaries weigh 100-500 KB each: they are cached in memory, not in localStorage with the light feeds
const mem = new Map<string, { t: number; data: any }>();

export async function memJSON<T>(url: string, ttl: number): Promise<T> {
  const hit = mem.get(url);
  if (hit && Date.now() - hit.t < ttl) return hit.data as T;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = await res.json();
    mem.set(url, { t: Date.now(), data });
    return data as T;
  } catch (err) {
    if (hit) return hit.data as T;
    throw err;
  }
}

/** The cast of one ESPN event; the cache follows the game's pace. */
export async function loadCast(e: Pick<ObsEvent, 'espn' | 'state'>): Promise<Cast | null> {
  if (!e.espn) return null;
  const { sport, league, id } = e.espn;
  const ttl = e.state === 'in' ? 15e3 : e.state === 'post' ? 30 * MIN : 5 * MIN;
  return parseCast(await memJSON<any>(`${SITE}/${sport}/${league}/summary?event=${id}`, ttl), sport);
}
