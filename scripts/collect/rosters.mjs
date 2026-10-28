// Rosters of the four teams I follow, with each player's season.
// Patriots: ESPN roster and depth chart + nflverse (stats, snap counts, draft).
// Texas: ESPN roster and depth chart + CollegeFootballData (stats, EPA per play).
// Dodgers: MLB Stats API 40-man roster with hitting and pitching.
// Milan: ESPN squad (Serie A numbers) + Understat (expected goals).
import { readFile } from 'node:fs/promises';
import { get } from './lib.mjs';
import { csvObjects } from './nfl.mjs';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
const NFLV = 'https://github.com/nflverse/nflverse-data/releases/download';
const HOUR = 3600e3;
const num = v => (v === '' || v == null || Number.isNaN(+v) ? null : +v);
const round = (v, d = 3) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

const seasonOf = (now, fromMonth = 2) => { const d = new Date(now); return d.getUTCMonth() >= fromMonth ? d.getUTCFullYear() : d.getUTCFullYear() - 1; };

/** ESPN roster: football groups (offense, defense…) or a flat list (soccer). */
function espnPlayers(j) {
  const groups = (j.athletes ?? [])[0]?.items ? j.athletes : [{ position: 'squad', items: j.athletes ?? [] }];
  return groups.flatMap(g => g.items.map(a => ({
    espn: a.id, name: a.displayName, short: a.shortName, jersey: a.jersey ?? null, group: g.position,
    pos: a.position?.abbreviation ?? null, posName: a.position?.displayName ?? null, unit: a.position?.parent?.abbreviation ?? null,
    age: a.age ?? null, ht: a.displayHeight ?? null, wt: a.displayWeight ?? null, exp: a.experience?.displayValue ?? a.experience?.years ?? null,
    college: a.college?.name ?? null, from: a.birthPlace ? [a.birthPlace.city, a.birthPlace.state ?? a.birthPlace.country].filter(Boolean).join(', ') : null,
    state: a.birthPlace?.state ?? null, nation: a.citizenship ?? a.citizenshipCountry?.name ?? null, photo: a.headshot?.href ?? null,
    status: a.status?.name ?? null, injury: a.injuries?.[0] ? { status: a.injuries[0].status, detail: a.injuries[0].details?.type ?? a.injuries[0].type?.description ?? null } : null,
    stats: a.statistics?.splits?.categories ? Object.fromEntries(a.statistics.splits.categories.flatMap(c => c.stats.map(s => [s.name, s.value]))) : null,
  })));
}

/** ESPN depth chart: formations → positions → player ids in order. */
async function espnDepth(sport, team) {
  const j = await get(`${ESPN}/${sport}/teams/${team}/depthcharts`, { json: true });
  return (j.depthchart ?? []).map(f => ({
    name: f.name,
    positions: Object.entries(f.positions ?? {}).map(([k, p]) => ({ key: k, pos: p.position?.abbreviation ?? k.toUpperCase(), name: p.position?.displayName ?? k, players: (p.athletes ?? []).map(a => a.id) })),
  }));
}

async function patriots(season) {
  const roster = espnPlayers(await get(`${ESPN}/football/nfl/teams/17/roster`, { json: true }));
  const depth = await espnDepth('football/nfl', 17).catch(() => []);
  const csv = async f => csvObjects(await get(`${NFLV}/${f}`));
  const [nv, stats, snaps] = await Promise.all([csv(`rosters/roster_${season}.csv`), csv(`stats_player/stats_player_reg_${season}.csv`), csv(`snap_counts/snap_counts_${season}.csv`)]);
  const lastWeek = Math.max(...nv.filter(r => r.team === 'NE').map(r => +r.week));
  const byEspn = Object.fromEntries(nv.filter(r => r.team === 'NE' && +r.week === lastWeek && r.espn_id).map(r => [r.espn_id, r]));
  const st = Object.fromEntries(stats.filter(r => r.recent_team === 'NE').map(r => [r.player_id, r]));
  const sn = {};
  for (const r of snaps.filter(x => x.team === 'NE')) (sn[r.pfr_player_id] ??= []).push({ wk: +r.week, off: num(r.offense_pct), def: num(r.defense_pct), st: num(r.st_pct) });
  const KEEP = ['games', 'completions', 'attempts', 'passing_yards', 'passing_tds', 'passing_interceptions', 'sacks_suffered', 'passing_epa', 'passing_cpoe', 'carries', 'rushing_yards', 'rushing_tds', 'rushing_epa', 'receptions', 'targets', 'receiving_yards', 'receiving_tds', 'receiving_epa', 'receiving_yards_after_catch', 'target_share', 'air_yards_share', 'wopr', 'def_tackles_solo', 'def_tackle_assists', 'def_tackles_for_loss', 'def_sacks', 'def_qb_hits', 'def_interceptions', 'def_pass_defended', 'def_fumbles_forced', 'fg_made', 'fg_att', 'fg_long', 'pat_made', 'pat_att', 'pt_att', 'pt_net_yards', 'pt_inside_20', 'fantasy_points_ppr'];
  const players = roster.map(p => {
    const n = byEspn[p.espn];
    const s = n ? st[n.gsis_id] : null;
    return {
      ...p,
      draft: n?.draft_number ? { pick: +n.draft_number, club: n.draft_club || null, year: num(n.entry_year) } : n?.entry_year ? { pick: null, club: null, year: num(n.entry_year) } : null,
      depthPos: n?.depth_chart_position || null,
      season: s ? Object.fromEntries(KEEP.map(k => [k, round(num(s[k]), 3)]).filter(([, v]) => v != null && v !== 0)) : null,
      snaps: n?.pfr_id && sn[n.pfr_id] ? sn[n.pfr_id].sort((a, b) => a.wk - b.wk) : [],
    };
  });
  return { team: 'NE', sport: 'nfl', season, players, depth };
}

async function texas(season) {
  const roster = espnPlayers(await get(`${ESPN}/football/college-football/teams/251/roster`, { json: true }));
  const depth = await espnDepth('football/college-football', 251).catch(() => []);
  const key = process.env.CFBD_KEY;
  const cfbd = async path => {
    if (!key) return [];
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`https://api.collegefootballdata.com${path}`, { headers: { Authorization: `Bearer ${key}` } });
      if (res.ok) return res.json();
      if (res.status !== 502 && res.status !== 503) throw new Error(`CFBD ${res.status}`);
      await new Promise(r => setTimeout(r, 1500));
    }
    return [];
  };
  const [stats, ppa] = await Promise.all([cfbd(`/stats/player/season?year=${season}&team=Texas`), cfbd(`/ppa/players/season?year=${season}&team=Texas`)]);
  const S = {};
  for (const r of stats) ((S[r.playerId] ??= {})[`${r.category}.${r.statType}`] = num(r.stat));
  const P = Object.fromEntries(ppa.map(r => [r.id, { plays: null, avg: r.averagePPA?.all ?? null, total: r.totalPPA?.all ?? null, pass: r.totalPPA?.pass ?? null, rush: r.totalPPA?.rush ?? null, third: r.averagePPA?.thirdDown ?? null }]));
  const players = roster.map(p => ({ ...p, season: S[p.espn] ?? null, ppa: P[p.espn] ?? null }));
  return { team: 'TEX', sport: 'cfb', season, players, depth, cfbd: !!key };
}

async function dodgers(season) {
  const url = g => `https://statsapi.mlb.com/api/v1/teams/119/roster/40Man?season=${season}&hydrate=person(stats(type=season,season=${season},group=${g}))`;
  const [hit, pit] = await Promise.all([get(url('hitting'), { json: true }), get(url('pitching'), { json: true })]);
  const statOf = (j, id) => j.roster.find(x => x.person.id === id)?.person.stats?.[0]?.splits?.[0]?.stat ?? null;
  const players = hit.roster.map(x => {
    const p = x.person, h = statOf(hit, p.id), q = statOf(pit, p.id);
    return {
      id: p.id, name: p.fullName, jersey: x.jerseyNumber ?? null, pos: x.position.abbreviation, posType: x.position.type, status: x.status?.description ?? null,
      age: p.currentAge ?? null, bats: p.batSide?.code ?? null, throws: p.pitchHand?.code ?? null, from: p.birthCountry ?? null, debut: p.mlbDebutDate ?? null,
      ht: p.height ?? null, wt: p.weight ?? null, photo: `https://img.mlbstatic.com/mlb-photos/image/upload/w_120,q_auto:best/v1/people/${p.id}/headshot/67/current`,
      hitting: h && h.plateAppearances ? { g: h.gamesPlayed, pa: h.plateAppearances, ab: h.atBats, h: h.hits, hr: h.homeRuns, rbi: h.rbi, r: h.runs, sb: h.stolenBases, bb: h.baseOnBalls, so: h.strikeOuts, avg: num(h.avg), obp: num(h.obp), slg: num(h.slg), ops: num(h.ops), d2: h.doubles, d3: h.triples } : null,
      pitching: q && q.inningsPitched && +q.inningsPitched > 0 ? { g: q.gamesPlayed, gs: q.gamesStarted, ip: num(q.inningsPitched), era: num(q.era), whip: num(q.whip), so: q.strikeOuts, bb: q.baseOnBalls, hr: q.homeRuns, w: q.wins, l: q.losses, sv: q.saves, hld: q.holds, k9: num(q.strikeoutsPer9Inn), bb9: num(q.walksPer9Inn), avg: num(q.avg) } : null,
    };
  });
  return { team: 'LAD', sport: 'mlb', season, players };
}

const plain = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, '').trim();

async function milan(season) {
  const roster = espnPlayers(await get(`${ESPN}/soccer/ita.1/teams/103/roster`, { json: true }));
  let us = [];
  try {
    const res = await fetch(`https://understat.com/getLeagueData/Serie_A/${season}`, { headers: { 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': 'Mozilla/5.0' } });
    if (res.ok) us = (await res.json()).players.filter(p => p.team_title.split(',').includes('AC Milan'));
  } catch { /* xG is a bonus */ }
  const match = name => {
    const n = plain(name), last = n.split(' ').at(-1);
    return us.find(u => plain(u.player_name) === n) ?? us.find(u => plain(u.player_name).split(' ').at(-1) === last && plain(u.player_name)[0] === n[0]) ?? us.find(u => plain(u.player_name).endsWith(last));
  };
  const players = roster.map(p => {
    const u = match(p.name);
    return {
      ...p,
      xg: u ? { games: +u.games, min: +u.time, goals: +u.goals, xg: round(+u.xG, 2), assists: +u.assists, xa: round(+u.xA, 2), shots: +u.shots, keyPasses: +u.key_passes, npg: +u.npg, npxg: round(+u.npxG, 2), chain: round(+u.xGChain, 2), buildup: round(+u.xGBuildup, 2), yellow: +u.yellow_cards, red: +u.red_cards } : null,
    };
  });
  return { team: 'MIL', sport: 'soccer', season, players, understat: us.length > 0 };
}

export async function collectRosters() {
  const now = Date.now();
  let prev = {};
  try { prev = JSON.parse(await readFile(new URL('../../public/data/rosters.json', import.meta.url), 'utf8')); } catch { /* first run */ }
  // Rosters move slowly: rebuild each team at most every 3 hours, keep the last good copy on failure
  // Texas uses CollegeFootballData (1,000 calls a month): once a day is enough
  const fresh = k => prev[k] && now - Date.parse(prev[k].at) < (k === 'texas' ? 24 : 3) * HOUR;
  const job = async (k, fn) => { if (fresh(k)) return prev[k]; try { return { at: new Date(now).toISOString(), ...(await fn()) }; } catch (err) { if (prev[k]) return prev[k]; throw err; } };
  const [pats, tex, lad, mil] = await Promise.all([
    job('pats', () => patriots(seasonOf(now))),
    job('texas', () => texas(seasonOf(now))),
    job('dodgers', () => dodgers(seasonOf(now, 1))),
    job('milan', () => milan(seasonOf(now, 6))),
  ].map(p => p.catch(err => ({ error: err.message }))));
  return { updated: new Date(now).toISOString(), pats, texas: tex, dodgers: lad, milan: mil };
}
