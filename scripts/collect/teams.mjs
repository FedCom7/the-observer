// My teams (AC Milan, New England Patriots, Texas Longhorns), all automatic:
// - the whole history, season by season, from Wikipedia's "List of … seasons" pages, and
//   the trophy count (Milan's honours table, the Patriots' and Texas's seasons);
// - every game since 2001 from ESPN, for head-to-head records against the rivals;
// - all-time series against the historic rivals from Wikipedia's rivalry pages;
// - this season: standing, record and stats of the team, its historic rivals and the
//   strongest teams of the moment, from ESPN.
import { readFile } from 'node:fs/promises';
import { get, wikitext } from './lib.mjs';
import { cfbSeasons, grid, milanSeasons, nflSeasons, plain, rivalrySeries } from './teamsParse.mjs';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
const V2 = 'https://site.api.espn.com/apis/v2/sports';
const FIRST_ESPN_SEASON = 2001;

const TEAMS = {
  milan: {
    sport: 'soccer', league: 'ita.1', id: '103', name: 'AC Milan', us: 'Milan', seasonsPage: 'List of AC Milan seasons', parse: milanSeasons, honoursPage: 'AC Milan',
    rivals: [{ id: '110', name: 'Inter', page: 'Derby della Madonnina', label: 'Derby della Madonnina' }, { id: '111', name: 'Juventus', page: 'Juventus–Milan rivalry', label: "Derby d'Italia" }, { id: '114', name: 'Napoli' }, { id: '104', name: 'Roma' }],
  },
  pats: {
    sport: 'football', league: 'nfl', id: '17', name: 'New England Patriots', us: 'Patriots', seasonsPage: 'List of New England Patriots seasons', parse: nflSeasons,
    rivals: [{ id: '2', name: 'Bills', page: 'Bills–Patriots rivalry' }, { id: '15', name: 'Dolphins', page: 'Dolphins–Patriots rivalry' }, { id: '20', name: 'Jets', page: 'Jets–Patriots rivalry' }, { id: '11', name: 'Colts', page: 'Colts–Patriots rivalry' }],
  },
  texas: {
    sport: 'football', league: 'college-football', id: '251', name: 'Texas Longhorns', us: 'Texas', seasonsPage: 'List of Texas Longhorns football seasons', parse: cfbSeasons,
    rivals: [{ id: '201', name: 'Oklahoma', page: 'Red River Rivalry', label: 'Red River Rivalry' }, { id: '245', name: 'Texas A&M', page: 'Texas–Texas A&M football rivalry', label: 'Lone Star Showdown' }, { id: '8', name: 'Arkansas', page: 'Arkansas–Texas football rivalry' }, { id: '2641', name: 'Texas Tech', page: 'Texas–Texas Tech football rivalry' }],
  },
};

const statOf = (stats, n) => stats?.find(s => s.name === n)?.value ?? null;

/** One season of a team's games from ESPN: [{ date, opp, oppName, home, us, them, result, comp }] */
async function espnSeason(t, season) {
  const j = await get(`${SITE}/${t.sport}/${t.league}/teams/${t.id}/schedule?season=${season}`, { json: true });
  return (j.events ?? []).map(e => {
    const c = e.competitions?.[0];
    const me = c?.competitors?.find(x => x.id === t.id), op = c?.competitors?.find(x => x.id !== t.id);
    const us = Number(me?.score?.value ?? me?.score), them = Number(op?.score?.value ?? op?.score);
    if (!me || !op || !c?.status?.type?.completed || Number.isNaN(us) || Number.isNaN(them)) return null;
    return { date: e.date.slice(0, 10), opp: op.id, oppName: op.team?.displayName ?? '', home: me.homeAway === 'home', us, them, result: us > them ? 'W' : us < them ? 'L' : 'D', type: e.seasonType?.name ?? '' };
  }).filter(Boolean);
}

/** Honours table of a club page: [{ type, competition, titles, seasons }] */
async function honours(page) {
  const w = await wikitext(page);
  const sec = w?.split(/==\s*Honours\s*==/)[1];
  if (!sec) return [];
  const table = sec.split(/\n\{\|/)[1]?.split(/\n\|\}/)[0];
  if (!table) return [];
  let type = '';
  return grid(table).filter(r => !r.every(c => c.head)).map(r => {
    const cells = r.filter(Boolean);
    if (cells.length === 4) type = cells[0].text;
    const [comp, titles, seasons] = cells.slice(-3);
    return { type, competition: comp?.text, titles: Number(titles?.text) || 0, seasons: (seasons?.text ?? '').split(/,\s*/).filter(Boolean) };
  }).filter(h => h.competition && h.titles);
}

/** Trophy count from the seasons themselves (NFL and college football). */
function trophiesFromSeasons(key, seasons) {
  const pick = f => seasons.filter(f).map(s => s.season);
  if (key === 'pats') return [
    { type: 'Championships', competition: 'Super Bowl', seasons: pick(s => s.champion) },
    { type: 'Championships', competition: 'AFC Championships', seasons: pick(s => s.conferenceChampion) },
    { type: 'Championships', competition: 'Division titles', seasons: pick(s => s.finish === 1 && s.playoffs) },
    { type: 'Seasons', competition: 'Playoff appearances', seasons: pick(s => s.playoffs) },
  ].map(h => ({ ...h, titles: h.seasons.length }));
  return [
    { type: 'Championships', competition: 'National championships', seasons: pick(s => s.champion) },
    { type: 'Championships', competition: 'Conference championships', seasons: pick(s => s.conferenceChampion) },
    { type: 'Seasons', competition: 'Bowl wins', seasons: pick(s => s.bowlResult === 'W') },
    { type: 'Seasons', competition: 'Bowl appearances', seasons: pick(s => s.bowl) },
  ].map(h => ({ ...h, titles: h.seasons.length }));
}

async function teamCard(t, id) {
  const j = await get(`${SITE}/${t.sport}/${t.league}/teams/${id}`, { json: true });
  const tm = j.team;
  const st = tm.record?.items?.[0]?.stats ?? [];
  return {
    id, name: tm.displayName, short: tm.shortDisplayName ?? tm.name, abbr: tm.abbreviation, color: tm.color ? `#${tm.color}` : null, logo: tm.logos?.[0]?.href ?? null,
    standing: tm.standingSummary ?? null, record: tm.record?.items?.[0]?.summary ?? null, rank: tm.rank ?? null,
    gp: statOf(st, 'gamesPlayed'), w: statOf(st, 'wins'), d: statOf(st, 'ties'), l: statOf(st, 'losses'), pf: statOf(st, 'pointsFor'), pa: statOf(st, 'pointsAgainst'),
    pts: t.sport === 'soccer' ? statOf(st, 'points') : null, pos: t.sport === 'soccer' ? statOf(st, 'rank') : null, seed: statOf(st, 'playoffSeed'),
  };
}

/** Football: a few per-game numbers from ESPN's team statistics. */
async function footballStats(t, id) {
  try {
    const j = await get(`${SITE}/${t.sport}/${t.league}/teams/${id}/statistics`, { json: true });
    const all = Object.fromEntries((j.results?.stats?.categories ?? []).flatMap(c => c.stats.map(s => [`${c.name}.${s.name}`, s.value])));
    return {
      ppg: all['scoring.totalPointsPerGame'] ?? null, ypg: all['passing.yardsPerGame'] ?? null, passYpg: all['passing.netPassingYardsPerGame'] ?? null,
      rushYpg: all['rushing.rushingYardsPerGame'] ?? null, third: all['miscellaneous.thirdDownConvPct'] ?? null, toDiff: all['miscellaneous.turnOverDifferential'] ?? null, sacks: all['defensive.sacks'] ?? null,
    };
  } catch { return null; }
}

/** The strongest teams of the moment: Serie A leaders, the NFL's best records, the AP top teams. */
async function strongest(t, exclude) {
  if (t.sport === 'soccer') {
    const j = await get(`${V2}/soccer/${t.league}/standings`, { json: true });
    return (j.children?.[0]?.standings?.entries ?? j.standings?.entries ?? []).map(e => e.team.id).filter(id => !exclude.includes(id)).slice(0, 3);
  }
  if (t.league === 'nfl') {
    const j = await get(`${V2}/football/nfl/standings`, { json: true });
    const all = (j.children ?? []).flatMap(c => c.standings.entries).map(e => ({ id: e.team.id, wp: statOf(e.stats, 'winPercent') ?? 0, diff: statOf(e.stats, 'pointDifferential') ?? 0 }));
    return all.filter(x => !exclude.includes(x.id)).sort((a, b) => b.wp - a.wp || b.diff - a.diff).slice(0, 3).map(x => x.id);
  }
  const j = await get(`${SITE}/football/college-football/rankings`, { json: true });
  const ap = j.rankings?.find(r => /AP/.test(r.name)) ?? j.rankings?.[0];
  return (ap?.ranks ?? []).map(r => r.team.id).filter(id => !exclude.includes(id)).slice(0, 3);
}

/** This season's competitions (soccer: league, Europe, cup), from the team's schedule across all of them. */
async function competitions(t) {
  if (t.sport !== 'soccer') return null;
  const [played, fixtures] = await Promise.all([
    get(`${SITE}/soccer/all/teams/${t.id}/schedule`, { json: true }).catch(() => ({ events: [] })),
    get(`${SITE}/soccer/all/teams/${t.id}/schedule?fixture=true`, { json: true }).catch(() => ({ events: [] })),
  ]);
  const by = {};
  for (const e of [...(played.events ?? []), ...(fixtures.events ?? [])]) {
    const comp = e.league?.name ?? e.season?.displayName ?? 'Other';
    if (/friendly/i.test(comp)) continue;
    const c = e.competitions?.[0];
    const me = c?.competitors?.find(x => x.id === t.id), op = c?.competitors?.find(x => x.id !== t.id);
    const done = c?.status?.type?.completed;
    const us = Number(me?.score?.value ?? me?.score), them = Number(op?.score?.value ?? op?.score);
    const row = (by[comp] ??= { name: comp, phase: e.seasonType?.name ?? null, w: 0, d: 0, l: 0, gf: 0, ga: 0, games: [] });
    if (done && !Number.isNaN(us)) { row[us > them ? 'w' : us < them ? 'l' : 'd']++; row.gf += us; row.ga += them; }
    row.games.push({ date: e.date, opp: op?.team?.displayName ?? '', home: me?.homeAway === 'home', us: done ? us : null, them: done ? them : null });
  }
  return Object.values(by).map(c => ({ ...c, games: c.games.sort((a, b) => a.date.localeCompare(b.date)) }));
}

async function collectTeam(key, t, prev) {
  const status = {};
  // History: Wikipedia, re-read once a day
  let history = prev?.history ?? [], trophies = prev?.trophies ?? [];
  if (!prev?.historyAt || Date.now() - Date.parse(prev.historyAt) > 20 * 3600e3) {
    try {
      const w = await wikitext(t.seasonsPage);
      const h = w ? t.parse(w) : [];
      if (h.length) history = h;
      trophies = t.honoursPage ? await honours(t.honoursPage) : trophiesFromSeasons(key, history);
      status.history = `${history.length} seasons`;
    } catch (err) { status.history = `failed: ${err.message.slice(0, 60)}`; }
  }

  // Every game since 2001 (past seasons are kept, the current one refreshed)
  const games = { ...(prev?.games ?? {}) };
  const now = new Date();
  const current = t.sport === 'soccer' ? (now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1) : (now.getUTCMonth() >= 2 ? now.getUTCFullYear() : now.getUTCFullYear() - 1);
  for (let y = FIRST_ESPN_SEASON; y <= current; y++) {
    if (games[y] && y < current) continue;
    try { games[y] = await espnSeason(t, y); } catch (err) { status[`espn${y}`] = err.message.slice(0, 40); }
  }

  // Rivals: historic ones and the strongest of the moment
  const historicIds = t.rivals.map(r => r.id);
  let strong = [];
  try { strong = await strongest(t, [t.id, ...historicIds]); } catch (err) { status.strongest = err.message.slice(0, 60); }
  const all = [...t.rivals.map(r => ({ ...r, kind: 'historic' })), ...strong.map(id => ({ id, kind: 'current' }))];
  const allGames = Object.entries(games).flatMap(([y, g]) => g.map(x => ({ ...x, season: Number(y) })));
  const rivals = [];
  for (const r of all) {
    const card = await teamCard(t, r.id).catch(() => null);
    const meetings = allGames.filter(g => g.opp === r.id).sort((a, b) => b.date.localeCompare(a.date));
    let series = prev?.rivals?.find(x => x.id === r.id)?.allTime ?? null;
    if (r.page && (!series || series.wins == null || status.history)) {
      try { const w = await wikitext(r.page); series = w ? rivalrySeries(w, t.us) : series; } catch { /* keep */ }
    }
    rivals.push({
      id: r.id, name: r.name ?? card?.short ?? card?.name ?? r.id, label: r.label ?? null, kind: r.kind, card,
      stats: t.sport === 'football' ? await footballStats(t, r.id) : null,
      allTime: series, page: r.page ?? null,
      since2001: { w: meetings.filter(g => g.result === 'W').length, d: meetings.filter(g => g.result === 'D').length, l: meetings.filter(g => g.result === 'L').length, gf: meetings.reduce((a, g) => a + g.us, 0), ga: meetings.reduce((a, g) => a + g.them, 0) },
      recent: meetings.slice(0, 10),
    });
  }

  // ESPN era, season by season (record and points), for the charts
  const espnSeasons = Object.entries(games).map(([y, g]) => ({ season: Number(y), w: g.filter(x => x.result === 'W').length, d: g.filter(x => x.result === 'D').length, l: g.filter(x => x.result === 'L').length, pf: g.reduce((a, x) => a + x.us, 0), pa: g.reduce((a, x) => a + x.them, 0) }));

  const card = await teamCard(t, t.id).catch(() => prev?.card ?? null);
  return {
    key, name: t.name, sport: t.sport, league: t.league, id: t.id, status,
    card, stats: t.sport === 'football' ? await footballStats(t, t.id) : null,
    competitions: await competitions(t).catch(() => prev?.competitions ?? null),
    historyAt: status.history ? new Date().toISOString() : prev?.historyAt ?? null,
    history, trophies, games, espnSeasons, rivals,
  };
}

export async function collectTeams() {
  let prev = {};
  try { prev = JSON.parse(await readFile(new URL('../../public/data/teams.json', import.meta.url), 'utf8')); } catch { /* first run */ }
  const out = { updated: new Date().toISOString() };
  for (const [key, t] of Object.entries(TEAMS)) {
    try { out[key] = await collectTeam(key, t, prev[key]); } catch (err) { out[key] = prev[key] ?? { error: err.message }; }
  }
  return out;
}

export { plain };
