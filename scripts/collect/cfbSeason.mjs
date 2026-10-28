// College football beyond this week: every FBS game, team strength (SP+, EPA per play,
// success rate, explosiveness, havoc, line play, finishing drives, field position), the
// polls week by week, the best quarterbacks, ESPN's FPI with its playoff odds, the Heisman
// and title markets, and the champions since 1998.
// CollegeFootballData allows 1,000 calls a month on the free key: its data is refreshed at
// most every 12 hours (about 7 calls), and not at all when fewer than 100 calls are left.
import { readFile } from 'node:fs/promises';
import { get } from './lib.mjs';

const CFBD = 'https://api.collegefootballdata.com';
const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/college-football';
const KALSHI = 'https://api.elections.kalshi.com/trade-api/v2';
const HOUR = 3600e3;
const round = (v, d = 3) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const seasonOf = now => { const d = new Date(now); return d.getUTCMonth() >= 1 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; };

let remaining = Infinity;
async function cfbd(path) {
  const key = process.env.CFBD_KEY;
  if (!key) throw new Error('no CFBD_KEY');
  if (remaining < 100) throw new Error(`CFBD: only ${remaining} calls left this month`);
  for (let i = 0; i < 3; i++) {
    const res = await fetch(`${CFBD}${path}`, { headers: { Authorization: `Bearer ${key}` } });
    const left = Number(res.headers.get('x-calllimit-remaining'));
    if (Number.isFinite(left)) remaining = left;
    if (res.ok) return res.json();
    if (![502, 503, 504].includes(res.status)) throw new Error(`CFBD ${res.status} ${path}`);
    await new Promise(r => setTimeout(r, 4000 * (i + 1)));
  }
  throw new Error(`CFBD unavailable ${path}`);
}

async function espnFpi(season) {
  const out = {};
  for (let page = 1; page <= 3; page++) {
    const j = await get(`${CORE}/seasons/${season}/powerindex?limit=60&page=${page}`, { json: true }).catch(() => null);
    for (const it of j?.items ?? []) {
      const id = it.team.$ref.match(/teams\/(\d+)/)?.[1];
      const p = Object.fromEntries([...(it.predictives ?? []), ...(it.stats ?? [])].map(s => [s.name, s.value]));
      const e = Object.fromEntries((it.efficiencies ?? []).map(s => [s.name, s.value]));
      out[id] = { fpi: round(p.fpi, 1), rank: p.fpirank ?? null, projW: round(p.projectedw, 1), projL: round(p.projectedl, 1), conf: round(p.probwinconf ?? p.probwinconference, 1), playoff: round(p.probmakeplayoff ?? p.probmakeplayoffs ?? p.probmakecfp, 1), title: round(p.probwintitle ?? p.probwinnationalchampionship, 1), sos: p.sosremainingrank ?? null, effOff: round(e.offefficiency, 1), effDef: round(e.defefficiency, 1), effSt: round(e.stefficiency, 1) };
    }
    if (!j?.pageCount || page >= j.pageCount) break;
  }
  return out;
}

/** A Kalshi event's prices, found by series (the open event of the season). */
async function market(series) {
  const ev = await get(`${KALSHI}/events?series_ticker=${series}&status=open&limit=5`, { json: true }).catch(() => null);
  const e = ev?.events?.[0];
  if (!e) return null;
  const j = await get(`${KALSHI}/markets?event_ticker=${e.event_ticker}&limit=200`, { json: true });
  const rows = (j.markets ?? []).map(m => { const bid = 100 * Number(m.yes_bid_dollars ?? 0), ask = 100 * Number(m.yes_ask_dollars ?? 0), last = 100 * Number(m.last_price_dollars ?? 0); return { name: m.yes_sub_title, p: round(bid > 0 && ask > 0 ? (bid + ask) / 2 : last, 1) }; }).filter(r => r.name && r.p > 0).sort((a, b) => b.p - a.p).slice(0, 15);
  return rows.length ? { title: e.title, rows } : null;
}

function teamPower(ppa, adv, sp) {
  const out = {};
  for (const t of ppa) {
    const o = t.offense ?? {}, d = t.defense ?? {};
    out[t.team] = { epaOff: round(o.overall), epaDef: round(d.overall), passOff: round(o.passing), rushOff: round(o.rushing), passDef: round(d.passing), rushDef: round(d.rushing), off1: round(o.firstDown), off2: round(o.secondDown), off3: round(o.thirdDown), def3: round(d.thirdDown) };
  }
  for (const t of adv) {
    const o = t.offense ?? {}, d = t.defense ?? {};
    Object.assign((out[t.team] ??= {}), {
      srOff: round(o.successRate), srDef: round(d.successRate), expOff: round(o.explosiveness), expDef: round(d.explosiveness),
      ppoOff: round(o.pointsPerOpportunity, 2), ppoDef: round(d.pointsPerOpportunity, 2), startOff: round(o.fieldPosition?.averageStart, 1), startDef: round(d.fieldPosition?.averageStart, 1),
      lineOff: round(o.lineYards, 2), lineDef: round(d.lineYards, 2), stuffOff: round(o.stuffRate), stuffDef: round(d.stuffRate), havocOff: round(o.havoc?.total), havocDef: round(d.havoc?.total),
      sdSr: round(o.standardDowns?.successRate), pdSr: round(o.passingDowns?.successRate), passRate: round(o.passingPlays?.rate), plays: o.plays ?? null,
    });
  }
  for (const t of sp) Object.assign((out[t.team] ??= {}), { sp: round(t.rating, 1), spRank: t.ranking ?? null, spOff: round(t.offense?.rating, 1), spDef: round(t.defense?.rating, 1), spSt: round(t.specialTeams?.rating, 1), sos: round(t.sos, 2) });
  return out;
}

export async function collectCfbSeason() {
  const now = Date.now();
  const season = seasonOf(now);
  let prev = null;
  try { prev = JSON.parse(await readFile(new URL('../../public/data/cfb-season.json', import.meta.url), 'utf8')); } catch { /* first run */ }
  if (prev?.season !== season) prev = prev ? { history: prev.history } : null;
  const fresh = prev?.cfbdAt && now - Date.parse(prev.cfbdAt) < 12 * HOUR;
  let base = prev ?? {};
  if (!fresh) {
    try {
      const teams = prev?.teams?.length ? prev.teams : (await cfbd(`/teams/fbs?year=${season}`)).map(t => ({ id: String(t.id), school: t.school, mascot: t.mascot, abbr: t.abbreviation, conference: t.conference, color: t.color, alt: t.alternateColor ?? t.alt_color ?? null, logo: t.logos?.[0] ?? null }));
      // One at a time (the server struggles under load); a call that fails keeps last time's data
      const one = async (path, fallback) => { try { return await cfbd(path); } catch (err) { console.error(`cfb-season ${path}: ${err.message}`); return fallback; } };
      const reg = await one(`/games?year=${season}&seasonType=regular&classification=fbs`, null);
      const post = await one(`/games?year=${season}&seasonType=postseason&classification=fbs`, []);
      const sp = await one(`/ratings/sp?year=${season}`, null);
      const ppa = await one(`/ppa/teams?year=${season}&excludeGarbageTime=true`, null);
      const adv = await one(`/stats/season/advanced?year=${season}&excludeGarbageTime=true`, null);
      const rk = await one(`/rankings?year=${season}`, null);
      const qbs = await one(`/ppa/players/season?year=${season}&position=QB&threshold=80&excludeGarbageTime=true`, null);
      if (!reg && !prev?.games) throw new Error('no games');
      const fbs = new Set(teams.map(t => t.school));
      const games = !reg ? prev.games : [...reg, ...post].filter(g => fbs.has(g.homeTeam ?? g.home_team) || fbs.has(g.awayTeam ?? g.away_team)).map(g => ({
        id: String(g.id), week: g.week, type: g.seasonType ?? g.season_type, start: g.startDate ?? g.start_date, done: !!(g.completed),
        h: g.homeTeam ?? g.home_team, a: g.awayTeam ?? g.away_team, hc: g.homeConference ?? g.home_conference, ac: g.awayConference ?? g.away_conference,
        hs: g.homePoints ?? g.home_points ?? null, as: g.awayPoints ?? g.away_points ?? null, conf: !!(g.conferenceGame ?? g.conference_game), neutral: !!(g.neutralSite ?? g.neutral_site), venue: g.venue ?? null, notes: g.notes ?? null,
        hwp: round(g.homePostgameWinProbability ?? g.home_post_win_prob), helo: g.homePregameElo ?? null, aelo: g.awayPregameElo ?? null,
      }));
      const polls = rk ? [] : prev?.polls ?? [];
      for (const w of rk ?? []) for (const p of w.polls ?? []) if (/AP Top 25|Coaches Poll|Playoff Committee/i.test(p.poll)) polls.push({ week: w.week, type: w.seasonType, poll: /AP/.test(p.poll) ? 'AP' : /Coaches/.test(p.poll) ? 'Coaches' : 'CFP', ranks: p.ranks.map(r => [r.rank, r.school, r.firstPlaceVotes ?? 0, r.points ?? 0]) });
      const power = ppa && adv && sp ? teamPower(ppa, adv, sp) : prev?.power ?? teamPower(ppa ?? [], adv ?? [], sp ?? []);
      base = { ...base, teams, games, power, polls, qbs: !qbs ? prev?.qbs ?? [] : qbs.map(q => ({ name: q.name, team: q.team, conf: q.conference, avg: round(q.averagePPA?.all), pass: round(q.averagePPA?.pass), rush: round(q.averagePPA?.rush), total: round(q.totalPPA?.all, 1) })).sort((x, y) => (y.total ?? 0) - (x.total ?? 0)).slice(0, 60), cfbdAt: new Date(now).toISOString() };
    } catch (err) {
      if (!prev?.teams) throw err;
      console.error(`cfb-season: ${err.message}; keeping the last data`);
    }
  }
  const fpi = await espnFpi(season).catch(() => prev?.fpi ?? {});
  const markets = { heisman: await market('KXHEISMAN').catch(() => null) ?? prev?.markets?.heisman ?? null, title: await market('KXNCAAF').catch(() => null) ?? prev?.markets?.title ?? null };
  // Champions of the BCS and Playoff eras: final AP number one (read once per season)
  let history = prev?.history ?? { champions: [] };
  const haveYears = new Set(history.champions.map(c => c.year));
  const missing = [];
  for (let y = 1998; y < season; y++) if (!haveYears.has(y)) missing.push(y);
  if (missing.length && remaining > 300) {
    for (const y of missing.slice(0, 30)) {
      try {
        const rk = await cfbd(`/rankings?year=${y}&seasonType=postseason`);
        const ap = rk.at(-1)?.polls?.find(p => /AP Top 25/i.test(p.poll));
        const top = ap?.ranks?.sort((a, b) => a.rank - b.rank).slice(0, 3);
        if (top?.length) history.champions.push({ year: y, champion: top[0].school, conference: top[0].conference ?? null, second: top[1]?.school ?? null, third: top[2]?.school ?? null });
      } catch { break; }
    }
    history.champions.sort((a, b) => a.year - b.year);
  }
  return { ...base, updated: new Date(now).toISOString(), season, cfbdRemaining: Number.isFinite(remaining) ? remaining : prev?.cfbdRemaining ?? null, fpi, markets, history };
}
