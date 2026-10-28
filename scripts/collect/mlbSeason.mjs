// Baseball beyond tonight (MLB Stats API): every game of the season, the standings with
// their splits, team strength (hitting by wRC+, pitching by FIP, starters and bullpen,
// defence and base running, situations), every player's WAR, recent transactions, the
// award markets, and the World Series since 1903 (Wikipedia).
import { readFile } from 'node:fs/promises';
import { get, wikitext } from './lib.mjs';

const API = 'https://statsapi.mlb.com/api/v1';
const KALSHI = 'https://api.elections.kalshi.com/trade-api/v2';
const round = (v, d = 3) => (v == null || !Number.isFinite(+v) ? null : Math.round(+v * 10 ** d) / 10 ** d);
const n = v => (v == null || v === '' || v === '-.--' || v === '.---' ? null : Number(v));
const ip = v => { if (v == null) return null; const [w, f = '0'] = String(v).split('.'); return +w + +f / 3; };
const seasonOf = now => new Date(now).getUTCFullYear() - (new Date(now).getUTCMonth() < 2 ? 1 : 0);

async function teamStats(season, group, extra = '') {
  const j = await get(`${API}/teams/stats?season=${season}&group=${group}&sportId=1${extra}`, { json: true });
  const out = {};
  for (const s of j.stats ?? []) for (const sp of s.splits ?? []) {
    const id = sp.team?.id; if (!id) continue;
    const code = sp.split?.code ?? 'all';
    ((out[id] ??= {})[code] = sp.stat);
  }
  return out;
}

/** Every player's sabermetrics (WAR, wRC+, FIP…) joined to the counting stats. */
async function players(season, group) {
  const [sab, sea] = await Promise.all([
    get(`${API}/stats?stats=sabermetrics&group=${group}&season=${season}&sportId=1&limit=3000&playerPool=All`, { json: true }),
    get(`${API}/stats?stats=season&group=${group}&season=${season}&sportId=1&limit=3000&playerPool=All`, { json: true }),
  ]);
  const base = new Map((sea.stats?.[0]?.splits ?? []).map(s => [`${s.player.id}:${s.team?.id}`, s]));
  return (sab.stats?.[0]?.splits ?? []).map(s => {
    const b = base.get(`${s.player.id}:${s.team?.id}`)?.stat ?? {};
    const x = s.stat;
    return group === 'hitting'
      ? { id: s.player.id, name: s.player.fullName, team: s.team?.id ?? null, pos: s.position?.abbreviation ?? null, pa: b.plateAppearances ?? 0, hr: b.homeRuns ?? 0, sb: b.stolenBases ?? 0, avg: n(b.avg), obp: n(b.obp), slg: n(b.slg), ops: n(b.ops), war: round(x.war, 1), wrc: round(x.wRcPlus, 0), woba: round(x.woba), bat: round(x.batting, 1), fld: round(x.fielding, 1), run: round(x.baseRunning, 1) }
      : { id: s.player.id, name: s.player.fullName, team: s.team?.id ?? null, ip: round(ip(b.inningsPitched), 1), gs: b.gamesStarted ?? 0, g: b.gamesPlayed ?? 0, era: n(b.era), whip: n(b.whip), so: b.strikeOuts ?? 0, bb: b.baseOnBalls ?? 0, w: b.wins ?? 0, sv: b.saves ?? 0, k9: n(b.strikeoutsPer9Inn), war: round(x.war, 1), fip: round(x.fip, 2), xfip: round(x.xfip, 2) };
  });
}

async function schedule(season) {
  const j = await get(`${API}/schedule?sportId=1&season=${season}&gameType=R,F,D,L,W&fields=dates,date,games,gamePk,gameType,status,abstractGameState,teams,away,home,team,id,score,isWinner,seriesDescription`, { json: true });
  const out = [];
  for (const d of j.dates ?? []) for (const g of d.games ?? []) {
    if (g.status?.abstractGameState !== 'Final') continue;
    const h = g.teams.home, a = g.teams.away;
    if (h.score == null || a.score == null) continue;
    out.push({ id: g.gamePk, date: d.date, type: g.gameType, h: h.team.id, a: a.team.id, hs: h.score, as: a.score, series: g.gameType === 'R' ? null : g.seriesDescription ?? null });
  }
  return out;
}

async function kalshiAwards() {
  const s = await get(`${KALSHI}/series?category=Sports&limit=3000`, { json: true });
  const want = (s.series ?? []).filter(x => /^KXMLB/.test(x.ticker) && /(AL|NL|American|National).*(MVP|Cy Young|Rookie)|(MVP|Cy Young|Rookie).*(AL|NL|American|National)/i.test(x.title));
  const out = {};
  for (const x of want.slice(0, 8)) {
    const ev = await get(`${KALSHI}/events?series_ticker=${x.ticker}&status=open&limit=3`, { json: true }).catch(() => null);
    const e = ev?.events?.[0]; if (!e) continue;
    const m = await get(`${KALSHI}/markets?event_ticker=${e.event_ticker}&limit=100`, { json: true }).catch(() => null);
    const rows = (m?.markets ?? []).map(k => { const bid = 100 * Number(k.yes_bid_dollars ?? 0), ask = 100 * Number(k.yes_ask_dollars ?? 0), last = 100 * Number(k.last_price_dollars ?? 0); return { name: k.yes_sub_title, p: round(bid > 0 && ask > 0 ? (bid + ask) / 2 : last, 1) }; }).filter(r => r.name && r.p > 0).sort((a, b) => b.p - a.p).slice(0, 10);
    if (rows.length) out[x.ticker] = { label: x.title, rows };
  }
  return out;
}

/** World Series results from Wikipedia: the first team of each row won. */
async function worldSeries() {
  const w = await wikitext('List of World Series champions');
  if (!w) return [];
  const out = [];
  for (const raw of w.split(/\n\|-[^\n]*/)) {
    const y = raw.match(/\{\{wsy\|(\d{4})\}\}/);
    if (!y) continue;
    const row = raw.replace(/<small>[\s\S]*?<\/small>|\{\{ref label[^}]*\}\}/g, '');
    const teams = [...row.matchAll(/\[\[\d{4} ([^\]|]+?) season\|([^\]]+)\]\]/g)].map(m => m[2]);
    const res = row.match(/\|\|\s*\|?\s*(\d)–(\d)(?:–\d)?\s*\|\|/);
    const al = /background:#fcc/i.test(row.split('||')[0] ?? '');
    // 1904 and 1994: no Series was played, the row has no result
    if (teams.length >= 2 && res) out.push({ year: +y[1], winner: teams[0], loser: teams[1], league: al ? 'AL' : 'NL', games: res ? `${res[1]}–${res[2]}` : null });
  }
  return out.sort((a, b) => a.year - b.year);
}

async function pastStandings(from, to, prev) {
  const out = { ...(prev ?? {}) };
  for (let y = from; y <= to; y++) {
    if (out[y]) continue;
    const j = await get(`${API}/standings?leagueId=103,104&season=${y}`, { json: true }).catch(() => null);
    const rows = {};
    for (const r of j?.records ?? []) for (const t of r.teamRecords ?? []) rows[t.team.id] = { w: t.wins, l: t.losses, pct: n(t.winningPercentage), diff: (t.runsScored ?? 0) - (t.runsAllowed ?? 0), div: t.divisionRank === '1' };
    if (Object.keys(rows).length >= 30) out[y] = rows;
  }
  return out;
}

export async function collectMlbSeason() {
  const now = Date.now();
  const season = seasonOf(now);
  let prev = null;
  try { prev = JSON.parse(await readFile(new URL('../../public/data/mlb-season.json', import.meta.url), 'utf8')); } catch { /* first run */ }
  const [tj, espnT, st] = await Promise.all([
    get(`${API}/teams?sportId=1&season=${season}`, { json: true }),
    get('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams', { json: true }).catch(() => null),
    get(`${API}/standings?leagueId=103,104&season=${season}&hydrate=team`, { json: true }),
  ]);
  const espn = (espnT?.sports?.[0]?.leagues?.[0]?.teams ?? []).map(x => x.team);
  const teams = tj.teams.map(t => {
    const e = espn.find(x => x.displayName === t.name) ?? espn.find(x => x.name === t.teamName);
    return { id: t.id, abbr: t.abbreviation, name: t.name, short: t.teamName, league: t.league?.id === 103 ? 'AL' : 'NL', division: t.division?.name?.replace(/^(American|National) League /, '') ?? '', espn: e?.abbreviation?.toLowerCase() ?? null, color: e?.color ? `#${e.color}` : null, alt: e?.alternateColor ? `#${e.alternateColor}` : null };
  });
  const standings = {};
  for (const r of st.records ?? []) for (const t of r.teamRecords ?? []) {
    const sp = Object.fromEntries((t.records?.splitRecords ?? []).map(x => [x.type, [x.wins, x.losses]]));
    standings[t.team.id] = { w: t.wins, l: t.losses, pct: n(t.winningPercentage), rs: t.runsScored, ra: t.runsAllowed, gb: t.gamesBack, divRank: +t.divisionRank, wc: t.wildCardRank ? +t.wildCardRank : null, streak: t.streak?.streakCode ?? '', splits: sp };
  }
  const [hit, hitAdv, pit, pitSplit, fld, hitSplit] = await Promise.all([
    teamStats(season, 'hitting', '&stats=season'), teamStats(season, 'hitting', '&stats=seasonAdvanced'), teamStats(season, 'pitching', '&stats=season'),
    teamStats(season, 'pitching', '&stats=statSplits&sitCodes=sp,rp'), teamStats(season, 'fielding', '&stats=season'), teamStats(season, 'hitting', '&stats=statSplits&sitCodes=vl,vr,risp'),
  ]);
  const [batters, pitchers] = await Promise.all([players(season, 'hitting'), players(season, 'pitching')]);
  // League constants for FIP: ERA minus the raw FIP of the whole league
  const L = Object.values(pit).map(x => x.all).reduce((a, x) => ({ er: a.er + (x.earnedRuns ?? 0), ip: a.ip + ip(x.inningsPitched), hr: a.hr + (x.homeRuns ?? 0), bb: a.bb + (x.baseOnBalls ?? 0) + (x.hitByPitch ?? 0), k: a.k + (x.strikeOuts ?? 0) }), { er: 0, ip: 0, hr: 0, bb: 0, k: 0 });
  const cFip = (9 * L.er) / L.ip - (13 * L.hr + 3 * L.bb - 2 * L.k) / L.ip;
  const fipOf = x => { const i = ip(x?.inningsPitched); return i ? (13 * (x.homeRuns ?? 0) + 3 * ((x.baseOnBalls ?? 0) + (x.hitByPitch ?? 0)) - 2 * (x.strikeOuts ?? 0)) / i + cFip : null; };
  const power = {};
  for (const t of teams) {
    const h = hit[t.id]?.all ?? {}, ha = hitAdv[t.id]?.all ?? {}, p = pit[t.id]?.all ?? {}, f = fld[t.id]?.all ?? {}, s = standings[t.id] ?? {};
    const sp = pitSplit[t.id]?.sp ?? {}, rp = pitSplit[t.id]?.rp ?? {};
    const mine = batters.filter(b => b.team === t.id), arms = pitchers.filter(b => b.team === t.id);
    const pa = mine.reduce((a, b) => a + b.pa, 0);
    const g = (s.w ?? 0) + (s.l ?? 0);
    const pyth = s.rs && s.ra ? s.rs ** 1.83 / (s.rs ** 1.83 + s.ra ** 1.83) : null;
    power[t.id] = {
      g, rsg: g ? round(s.rs / g, 2) : null, rag: g ? round(s.ra / g, 2) : null, pct: s.pct, pyth: round(pyth), luck: pyth != null && s.pct != null ? round(s.pct - pyth) : null,
      wrc: pa ? round(mine.reduce((a, b) => a + (b.wrc ?? 100) * b.pa, 0) / pa, 0) : null, ops: n(h.ops), obp: n(h.obp), slg: n(h.slg), iso: h.slg && h.avg ? round(n(h.slg) - n(h.avg)) : null,
      hr: h.homeRuns ?? null, bbPct: n(ha.walksPerPlateAppearance), kPct: n(ha.strikeoutsPerPlateAppearance), babip: n(ha.babip), sb: h.stolenBases ?? null, sbPct: h.stolenBases ? round(h.stolenBases / (h.stolenBases + (h.caughtStealing ?? 0))) : null,
      era: n(p.era), fip: round(fipOf(p), 2), whip: n(p.whip), k9: n(p.strikeoutsPer9Inn), bb9: n(p.walksPer9Inn), hr9: n(p.homeRunsPer9),
      spEra: n(sp.era), rpEra: n(rp.era), spFip: round(fipOf(sp), 2), rpFip: round(fipOf(rp), 2), spIp: round(ip(sp.inningsPitched), 0),
      fielding: n(f.fielding), errors: f.errors ?? null, defRuns: round(mine.reduce((a, b) => a + (b.fld ?? 0), 0), 1), runRuns: round(mine.reduce((a, b) => a + (b.run ?? 0), 0), 1),
      warBat: round(mine.reduce((a, b) => a + (b.war ?? 0), 0), 1), warPit: round(arms.reduce((a, b) => a + (b.war ?? 0), 0), 1),
      opsVL: n(hitSplit[t.id]?.vl?.ops), opsVR: n(hitSplit[t.id]?.vr?.ops), opsRisp: n(hitSplit[t.id]?.risp?.ops),
    };
  }
  const games = await schedule(season).catch(() => prev?.games ?? []);
  // Transactions of the last 30 days that involve a major league club
  const ids = new Set(teams.map(t => t.id));
  const start = new Date(now - 30 * 86400e3).toISOString().slice(0, 10), end = new Date(now).toISOString().slice(0, 10);
  const tx = await get(`${API}/transactions?startDate=${start}&endDate=${end}&sportId=1`, { json: true }).catch(() => null);
  const transactions = (tx?.transactions ?? []).filter(x => (ids.has(x.toTeam?.id) || ids.has(x.fromTeam?.id)) && /Trade|Signed|Free Agen|Released|Claimed|Retired|Contract|Option|Waiv/i.test(x.typeDesc ?? '') && !/Minor League|Assigned/i.test(x.typeDesc ?? ''))
    .map(x => ({ date: x.date, type: x.typeDesc, team: x.toTeam?.id ?? x.fromTeam?.id ?? null, from: x.fromTeam?.id ?? null, to: x.toTeam?.id ?? null, player: x.person?.fullName ?? null, text: x.description }))
    .filter((x, i, all) => all.findIndex(y => y.text === x.text && y.date === x.date) === i).reverse().slice(0, 150);
  const markets = await kalshiAwards().catch(() => prev?.markets ?? {});
  const history = {
    worldSeries: (await worldSeries().catch(() => null)) ?? prev?.history?.worldSeries ?? [],
    seasons: await pastStandings(2000, season - 1, prev?.history?.seasons),
  };
  return {
    updated: new Date(now).toISOString(), season, teams, standings, power, games,
    batters: batters.filter(b => b.pa >= 50).sort((a, b) => (b.war ?? 0) - (a.war ?? 0)).slice(0, 400),
    pitchers: pitchers.filter(p => (p.ip ?? 0) >= 20).sort((a, b) => (b.war ?? 0) - (a.war ?? 0)).slice(0, 300),
    transactions, markets: Object.keys(markets).length ? markets : prev?.markets ?? {}, history,
  };
}
