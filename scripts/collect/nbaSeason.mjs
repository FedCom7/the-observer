// The NBA season beyond tonight: every finished game's box score (read once, kept in
// nba-games/<season>/<day>.json), team strength per 100 possessions (ratings, four factors, shot zones,
// quarters, clutch, rest), player totals, ESPN's Basketball Power Index with its weekly
// history, Kalshi markets for the title and the awards, and the history of the Finals.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { get, wikitext } from './lib.mjs';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba';
const KALSHI = 'https://api.elections.kalshi.com/trade-api/v2';
const DATA = new URL('../../public/data/', import.meta.url);
const round = (v, d = 3) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const split = s => (s ?? '0-0').split('-').map(Number);
/** ESPN's NBA season is named after the year it ends (2026-27 = 2027). */
const seasonOf = now => { const d = new Date(now); return d.getUTCMonth() >= 8 ? d.getUTCFullYear() + 1 : d.getUTCFullYear(); };

async function teams(season) {
  const t = await get(`${SITE}/teams`, { json: true });
  const s = await get(`https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?level=3&season=${season}`, { json: true });
  const where = {};
  for (const c of s.children ?? []) for (const d of c.children ?? []) for (const e of d.standings?.entries ?? []) where[e.team.id] = { conf: /East/.test(c.name) ? 'East' : 'West', div: d.name };
  return t.sports[0].leagues[0].teams.map(({ team: x }) => ({ id: x.id, abbr: x.abbreviation, name: x.displayName, short: x.shortDisplayName, color: x.color ? `#${x.color}` : null, alt: x.alternateColor ? `#${x.alternateColor}` : null, ...where[x.id] }));
}

/** Where a shot was taken: ESPN gives feet, x across the court (basket at 25), y from the baseline. */
function zone(c, pts) {
  if (!c || c.x < -100 || c.y < -100) return null;
  const dx = c.x - 25, dy = c.y - 4, d = Math.hypot(dx, dy);
  if (pts === 3) return c.y <= 9 ? 'corner3' : 'above3';
  if (d <= 4.5) return 'rim';
  if (Math.abs(dx) <= 8 && c.y <= 19) return 'paint';
  return 'mid';
}

/** One finished game, compact: team boxes, quarters, clutch, shot zones, players. */
function compact(j, ev) {
  const comp = j.header.competitions[0];
  const side = h => comp.competitors.find(c => c.homeAway === h);
  const H = side('home'), A = side('away');
  const id = { [H.team.id]: 'h', [A.team.id]: 'a' };
  const box = {};
  for (const t of j.boxscore?.teams ?? []) {
    const s = Object.fromEntries(t.statistics.map(x => [x.name, x.displayValue]));
    const [fgm, fga] = split(s['fieldGoalsMade-fieldGoalsAttempted']), [tpm, tpa] = split(s['threePointFieldGoalsMade-threePointFieldGoalsAttempted']), [ftm, fta] = split(s['freeThrowsMade-freeThrowsAttempted']);
    box[id[t.team.id]] = { fgm, fga, tpm, tpa, ftm, fta, oreb: +s.offensiveRebounds || 0, dreb: +s.defensiveRebounds || 0, ast: +s.assists || 0, stl: +s.steals || 0, blk: +s.blocks || 0, tov: +(s.totalTurnovers ?? s.turnovers) || 0, pf: +s.fouls || 0, paint: +s.pointsInPaint || 0, fb: +s.fastBreakPoints || 0, toPts: +s.turnoverPoints || 0 };
  }
  // Clutch: last five minutes of the fourth quarter or overtime with the score within five
  const clutch = { h: 0, a: 0, on: false };
  const shots = { h: {}, a: {} };
  let prevH = 0, prevA = 0;
  for (const p of j.plays ?? []) {
    const q = p.period?.number ?? 0;
    const [m, sec] = (p.clock?.displayValue ?? '0:0').split(':').map(Number);
    const left = sec == null ? m : m * 60 + sec;
    const inClutch = q >= 4 && left <= 300 && Math.abs(prevH - prevA) <= 5;
    if (inClutch) clutch.on = true;
    if (p.scoringPlay && inClutch) { clutch.h += Math.max(0, p.homeScore - prevH); clutch.a += Math.max(0, p.awayScore - prevA); }
    if (p.shootingPlay && p.pointsAttempted >= 2 && p.team?.id && id[p.team.id]) {
      const z = zone(p.coordinate, p.pointsAttempted);
      if (z) { const x = (shots[id[p.team.id]][z] ??= [0, 0]); x[1]++; if (p.scoringPlay) x[0]++; }
    }
    if (p.homeScore != null) { prevH = p.homeScore; prevA = p.awayScore; }
  }
  const players = [];
  for (const t of j.boxscore?.players ?? []) {
    const st = t.statistics?.[0];
    if (!st) continue;
    const k = Object.fromEntries((st.keys ?? st.names ?? []).map((n, i) => [n, i]));
    const at = (row, ...names) => { for (const n of names) if (k[n] != null) return row[k[n]]; return null; };
    for (const a of st.athletes ?? []) {
      if (a.didNotPlay || !a.stats?.length) continue;
      const r = a.stats;
      const [fgm, fga] = split(at(r, 'fieldGoalsMade-fieldGoalsAttempted', 'FG')), [tpm, tpa] = split(at(r, 'threePointFieldGoalsMade-threePointFieldGoalsAttempted', '3PT')), [ftm, fta] = split(at(r, 'freeThrowsMade-freeThrowsAttempted', 'FT'));
      players.push({ id: a.athlete.id, name: a.athlete.displayName, pos: a.athlete.position?.abbreviation ?? null, t: id[t.team.id], start: !!a.starter, min: +at(r, 'minutes', 'MIN') || 0, pts: +at(r, 'points', 'PTS') || 0, reb: +at(r, 'rebounds', 'REB') || 0, oreb: +at(r, 'offensiveRebounds', 'OREB') || 0, ast: +at(r, 'assists', 'AST') || 0, stl: +at(r, 'steals', 'STL') || 0, blk: +at(r, 'blocks', 'BLK') || 0, tov: +at(r, 'turnovers', 'TO') || 0, pf: +at(r, 'fouls', 'PF') || 0, pm: +String(at(r, 'plusMinus', '+/-') ?? '0').replace('+', '') || 0, fgm, fga, tpm, tpa, ftm, fta });
    }
  }
  return {
    id: ev.id, date: ev.date, type: ev.season?.type ?? 2, h: H.team.id, a: A.team.id, hs: +H.score, as: +A.score,
    hl: (H.linescores ?? []).map(l => +(l.displayValue ?? l.value)), al: (A.linescores ?? []).map(l => +(l.displayValue ?? l.value)),
    box, clutch: clutch.on ? { h: clutch.h, a: clutch.a } : null, shots, players,
  };
}

/**
 * Every finished game of the season. Box scores are kept in one file per day
 * (public/data/nba-games/2027/2026-10-21.json): a finished day is never rewritten.
 */
async function games(season) {
  const dir = new URL(`nba-games/${season}/`, DATA);
  await mkdir(dir, { recursive: true });
  const sb = await get(`${SITE}/scoreboard`, { json: true });
  const dates = (sb.leagues?.[0]?.calendar ?? []).map(d => d.slice(0, 10));
  const today = new Date().toISOString().slice(0, 10);
  const have = new Set(await readdir(dir).catch(() => []));
  const out = [];
  for (const d of dates.filter(x => x <= today)) {
    let shard = null;
    if (have.has(`${d}.json`)) try { shard = JSON.parse(await readFile(new URL(`${d}.json`, dir), 'utf8')); } catch { /* rebuild */ }
    if (!shard?.complete) {
      const j = await get(`${SITE}/scoreboard?dates=${d.replace(/-/g, '')}`, { json: true }).catch(() => null);
      if (!j) { if (shard) out.push(...shard.games); continue; }
      const known = new Map((shard?.games ?? []).map(g => [g.id, g]));
      let all = true;
      const gs = [];
      for (const e of j.events ?? []) {
        const type = e.season?.type ?? 2;
        if (type !== 2 && type !== 3 && type !== 5) continue; // preseason games do not count
        if (e.status.type.state !== 'post') { all = false; continue; }
        if (known.has(e.id)) { gs.push(known.get(e.id)); continue; }
        const s = await get(`${SITE}/summary?event=${e.id}`, { json: true }).catch(() => null);
        if (s) gs.push(compact(s, e)); else all = false;
      }
      shard = { date: d, complete: all && d < today, games: gs };
      // Days without games that count (preseason) are remembered too, so they are not asked again
      await writeFile(new URL(`${d}.json`, dir), JSON.stringify(shard));
    }
    out.push(...shard.games);
  }
  return { games: out.sort((a, b) => a.date.localeCompare(b.date)), lastDate: dates.at(-1) ?? null };
}

const poss = b => b.fga - b.oreb + b.tov + 0.44 * b.fta;

/** Team strength from the box scores. */
function power(gs, T) {
  const acc = {};
  const z = () => ({ g: 0, w: 0, pts: 0, opp: 0, poss: 0, oppPoss: 0, min: 0, f: { fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, paint: 0, fb: 0 }, o: { fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, paint: 0, fb: 0 },
    q: [[0, 0], [0, 0], [0, 0], [0, 0]], ot: [0, 0], clutch: { pts: 0, opp: 0, g: 0, w: 0 }, close: { w: 0, l: 0 }, home: { pts: 0, opp: 0, poss: 0 }, away: { pts: 0, opp: 0, poss: 0 },
    rest: { b2b: { pts: 0, opp: 0, poss: 0, g: 0 }, rested: { pts: 0, opp: 0, poss: 0, g: 0 } }, shots: {}, oppShots: {}, log: [] });
  const last = {};
  for (const g of gs.filter(x => x.type === 2 && x.box.h && x.box.a)) {
    const ot = Math.max(0, g.hl.length - 4);
    for (const [me, op] of [['h', 'a'], ['a', 'h']]) {
      const tid = g[me], t = (acc[tid] ??= z()), b = g.box[me], ob = g.box[op];
      const P = (poss(b) + poss(ob)) / 2, pts = me === 'h' ? g.hs : g.as, opp = me === 'h' ? g.as : g.hs;
      t.g++; if (pts > opp) t.w++; t.pts += pts; t.opp += opp; t.poss += P; t.min += 48 + 5 * ot;
      for (const k of Object.keys(t.f)) { t.f[k] += b[k] ?? 0; t.o[k] += ob[k] ?? 0; }
      const ml = me === 'h' ? g.hl : g.al, ol = me === 'h' ? g.al : g.hl;
      for (let i = 0; i < 4; i++) { t.q[i][0] += ml[i] ?? 0; t.q[i][1] += ol[i] ?? 0; }
      for (let i = 4; i < ml.length; i++) { t.ot[0] += ml[i]; t.ot[1] += ol[i] ?? 0; }
      if (g.clutch) { t.clutch.g++; t.clutch.pts += g.clutch[me]; t.clutch.opp += g.clutch[op]; if (pts > opp) t.clutch.w++; }
      if (Math.abs(pts - opp) <= 5) { if (pts > opp) t.close.w++; else t.close.l++; }
      const loc = me === 'h' ? t.home : t.away; loc.pts += pts; loc.opp += opp; loc.poss += P;
      const day = Date.parse(g.date.slice(0, 10));
      const r = last[tid] != null && day - last[tid] <= 86400e3 * 1.5 ? t.rest.b2b : t.rest.rested;
      r.pts += pts; r.opp += opp; r.poss += P; r.g++;
      last[tid] = day;
      for (const [k, [m, a]] of Object.entries(g.shots[me] ?? {})) { const x = (t.shots[k] ??= [0, 0]); x[0] += m; x[1] += a; }
      for (const [k, [m, a]] of Object.entries(g.shots[op] ?? {})) { const x = (t.oppShots[k] ??= [0, 0]); x[0] += m; x[1] += a; }
      t.log.push({ id: g.id, date: g.date, opp: g[op], home: me === 'h', pts, opp_pts: opp, ortg: round((100 * pts) / P, 1), drtg: round((100 * opp) / P, 1) });
    }
  }
  const out = {};
  for (const [tid, t] of Object.entries(acc)) {
    const f = t.f, o = t.o;
    const four = (x, y) => ({ efg: round((x.fgm + 0.5 * x.tpm) / x.fga), tov: round(x.tov / (x.fga - x.oreb + x.tov + 0.44 * x.fta)), orb: round(x.oreb / (x.oreb + y.dreb)), ftr: round(x.ftm / x.fga) });
    const rating = x => (x.poss ? round((100 * x.pts) / x.poss, 1) : null);
    const zones = s => { const att = Object.values(s).reduce((a, [, n]) => a + n, 0) || 1; return Object.fromEntries(Object.entries(s).map(([k, [m, n]]) => [k, { freq: round(n / att), pct: round(m / (n || 1)), att: n }])); };
    out[T[tid] ?? tid] = {
      g: t.g, w: t.w, l: t.g - t.w,
      ortg: round((100 * t.pts) / t.poss, 1), drtg: round((100 * t.opp) / t.poss, 1), net: round((100 * (t.pts - t.opp)) / t.poss, 1), pace: round((48 * t.poss) / t.min * 1, 1),
      off: { ...four(f, o), tpRate: round(f.tpa / f.fga), tpPct: round(f.tpm / (f.tpa || 1)), astRate: round(f.ast / (f.fgm || 1)), paint: round((100 * f.paint) / t.poss, 1), fb: round((100 * f.fb) / t.poss, 1), ts: round(t.pts / (2 * (f.fga + 0.44 * f.fta))) },
      def: { ...four(o, f), tpRate: round(o.tpa / o.fga), tpPct: round(o.tpm / (o.tpa || 1)), stl: round((100 * f.stl) / t.poss, 1), blk: round((100 * f.blk) / t.poss, 1), paint: round((100 * o.paint) / t.poss, 1), fb: round((100 * o.fb) / t.poss, 1) },
      reb: round((f.oreb + f.dreb) / (f.oreb + f.dreb + o.oreb + o.dreb)),
      quarters: t.q.map(([a, b]) => round((a - b) / t.g, 1)), otGames: t.ot,
      clutch: { g: t.clutch.g, w: t.clutch.w, net: t.clutch.g ? round((t.clutch.pts - t.clutch.opp) / t.clutch.g, 1) : null }, close: t.close,
      home: { net: rating({ pts: t.home.pts - t.home.opp, poss: t.home.poss }) }, away: { net: rating({ pts: t.away.pts - t.away.opp, poss: t.away.poss }) },
      b2b: { g: t.rest.b2b.g, net: rating({ pts: t.rest.b2b.pts - t.rest.b2b.opp, poss: t.rest.b2b.poss }) }, rested: { g: t.rest.rested.g, net: rating({ pts: t.rest.rested.pts - t.rest.rested.opp, poss: t.rest.rested.poss }) },
      shots: zones(t.shots), oppShots: zones(t.oppShots),
      log: t.log,
    };
  }
  return out;
}

/** Season totals of every player (regular season). */
function playerTotals(gs, T) {
  const P = {};
  const team = {};
  for (const g of gs.filter(x => x.type === 2)) {
    for (const s of ['h', 'a']) { const tid = g[s], b = g.box[s]; if (!b) continue; const x = (team[tid] ??= { fga: 0, fta: 0, tov: 0, min: 0 }); x.fga += b.fga; x.fta += b.fta; x.tov += b.tov; x.min += 240 + 25 * Math.max(0, g.hl.length - 4); }
    for (const p of g.players) {
      const tid = g[p.t];
      const x = (P[p.id] ??= { id: p.id, name: p.name, pos: p.pos, team: T[tid] ?? tid, g: 0, gs: 0, min: 0, pts: 0, reb: 0, oreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pm: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, tid });
      x.team = T[tid] ?? tid; x.tid = tid; x.g++; if (p.start) x.gs++;
      for (const k of ['min', 'pts', 'reb', 'oreb', 'ast', 'stl', 'blk', 'tov', 'pf', 'pm', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta']) x[k] += p[k];
    }
  }
  return Object.values(P).filter(x => x.min > 0).map(x => {
    const tm = team[x.tid];
    const usg = tm && x.min ? (100 * (x.fga + 0.44 * x.fta + x.tov) * (tm.min / 5)) / (x.min * (tm.fga + 0.44 * tm.fta + tm.tov)) : null;
    const { tid, ...rest } = x;
    return { ...rest, ts: x.fga + x.fta ? round(x.pts / (2 * (x.fga + 0.44 * x.fta))) : null, usg: round(usg, 1) };
  }).sort((a, b) => b.pts - a.pts);
}

async function bpi(season, T) {
  const j = await get(`${CORE}/seasons/${season}/powerindex?limit=40`, { json: true });
  const out = {};
  for (const it of j.items ?? []) {
    const id = it.team.$ref.match(/teams\/(\d+)/)?.[1];
    const s = Object.fromEntries((it.stats ?? []).map(x => [x.name, x.value]));
    if (!T[id]) continue;
    out[T[id]] = {
      bpi: round(s.bpi, 1), rank: s.bpirank ?? null, off: round(s.bpioffense, 1), def: round(s.bpidefense, 1), projW: round(s.projectedw, 1), projL: round(s.projectedl, 1),
      playoffs: round(s.probmakeplayoffs, 1), top6: round(s.top6seed, 1), playIn: round(s.playinchance, 1), seed1: round(s.prob1seed, 1), semis: round(s.probmakeconfsemi, 1), confFinal: round(s.probmakeconfchamp, 1), finals: round(s.probmaketitlegame, 1), title: round(s.probwintitle, 1),
      sosRem: s.sosremainingrank ?? null, sos: s.avgsosrank ?? null, lottery: round(s.probno1draftpick, 1),
    };
  }
  return out;
}

const AWARDS = [['KXNBA', 'Champion'], ['KXNBAMVP', 'Most Valuable Player'], ['KXNBAROY', 'Rookie of the Year'], ['KXNBADPOY', 'Defensive Player of the Year'], ['KXNBASIXTH', 'Sixth Man of the Year'], ['KXNBAMIMP', 'Most Improved Player'], ['KXNBACLUTCH', 'Clutch Player of the Year'], ['KXNBACOY', 'Coach of the Year']];

/** Kalshi: price of "yes" for each candidate = the market's chance, in percent. */
async function markets(season) {
  const yy = String(season).slice(2);
  const out = {};
  await Promise.all(AWARDS.map(async ([series, label]) => {
    const j = await get(`${KALSHI}/markets?event_ticker=${series}-${yy}&limit=200`, { json: true }).catch(() => null);
    // The middle of bid and ask when both are quoted (a stale last trade can be far off), else the last trade
    const ms = (j?.markets ?? []).map(m => { const bid = 100 * Number(m.yes_bid_dollars ?? 0), ask = 100 * Number(m.yes_ask_dollars ?? 0), last = 100 * Number(m.last_price_dollars ?? (m.last_price ?? 0) / 100); return { name: m.yes_sub_title, p: round(bid > 0 && ask > 0 ? (bid + ask) / 2 : last, 1), bid: round(bid, 1), ask: round(ask, 1) }; })
      .filter(m => m.name && m.p > 0).sort((a, b) => b.p - a.p);
    if (ms.length) out[series] = { label, rows: ms.slice(0, 15) };
  }));
  return out;
}

/** Finals results from Wikipedia's list of champions. */
async function finals() {
  const w = await wikitext('List of NBA champions');
  if (!w) return [];
  const out = [];
  // Footnotes ({{#tag:ref|…}} and <ref>…</ref>) can hold "||": take them out first, braces balanced
  const noRefs = t => {
    let o = '', i = 0;
    while (i < t.length) {
      if (t.startsWith('{{#tag:ref', i) || t.startsWith('{{efn', i)) { let depth = 0; for (; i < t.length; i++) { if (t.startsWith('{{', i)) { depth++; i++; } else if (t.startsWith('}}', i)) { depth--; i++; if (!depth) { i++; break; } } } continue; }
      o += t[i++];
    }
    return o.replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  };
  const start = w.indexOf('{| class="wikitable sortable sticky-header"');
  const body = w.slice(start, w.indexOf('\n|}', start));
  for (const raw of body.split(/\n\|-[^\n]*/).slice(1)) {
    const row = noRefs(raw).replace(/<small>[\s\S]*?<\/small>/g, '').replace(/\n/g, '');
    const y = row.match(/\{\{nbafy\|(\d{4})\}\}|\[\[(\d{4}) BAA Finals\|/);
    if (!y) continue;
    // Teams are linked to their season pages, West first; the champion's cell is shaded
    const cells = row.split('||');
    const teamIn = c => c.match(/\[\[\d{4}[–-]\d{2,4} ([^\]|]+?) season\|([^\]]+)\]\]/)?.[2]?.replace(/'''?/g, '') ?? null;
    const tc = cells.filter(c => teamIn(c));
    if (tc.length < 2) continue;
    const res = cells.map(c => c.match(/^\s*(?:align="?center"?\s*\|)?\s*(\d)\s*[–-]\s*(\d)\s*$/)).find(Boolean);
    const westWon = /FFFF99/i.test(tc[0]);
    out.push({ year: +(y[1] ?? y[2]), winner: teamIn(westWon ? tc[0] : tc[1]), loser: teamIn(westWon ? tc[1] : tc[0]), conf: westWon ? 'West' : 'East', games: res ? `${Math.max(+res[1], +res[2])}–${Math.min(+res[1], +res[2])}` : null });
  }
  return out.filter(x => x.winner).sort((a, b) => a.year - b.year);
}

async function pastSeasons(from, to, prev, T) {
  const out = { ...(prev ?? {}) };
  for (let y = from; y <= to; y++) {
    if (out[y]) continue;
    const s = await get(`https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=${y}&seasontype=2`, { json: true }).catch(() => null);
    const rows = {};
    for (const c of s?.children ?? []) for (const e of c.standings?.entries ?? []) {
      const st = n => e.stats.find(x => x.name === n)?.value ?? null;
      const ab = T[e.team.id] ?? e.team.abbreviation;
      rows[ab] = { w: st('wins'), l: st('losses'), pct: round(st('winPercent')), seed: st('playoffSeed') || null, diff: round(st('differential') ?? st('pointDifferential'), 1) };
    }
    if (Object.keys(rows).length >= 30) out[y] = rows;
  }
  return out;
}

export async function collectNbaSeason() {
  const now = Date.now();
  const season = seasonOf(now);
  let prev = null;
  try { prev = JSON.parse(await readFile(new URL('nba-season.json', DATA), 'utf8')); } catch { /* first run */ }
  if (prev?.season !== season) prev = prev ? { history: prev.history } : null;

  const tm = await teams(season);
  const T = Object.fromEntries(tm.map(t => [t.id, t.abbr]));
  const { games: gs, lastDate } = await games(season);

  const b = await bpi(season, T).catch(() => prev?.bpi ?? {});
  const week = Math.max(1, Math.ceil((now - Date.parse(gs.find(g => g.type === 2)?.date ?? new Date(now).toISOString())) / (7 * 86400e3)));
  const bpiHistory = (prev?.bpiHistory ?? []).filter(h => h.wk !== week);
  if (Object.keys(b).length) bpiHistory.push({ wk: week, at: new Date(now).toISOString(), t: Object.fromEntries(Object.entries(b).map(([k, x]) => [k, [x.bpi, x.playoffs, x.title]])) });
  const mk = await markets(season).catch(() => prev?.markets ?? {});
  const marketHistory = (prev?.marketHistory ?? []).filter(h => h.wk !== week);
  if (Object.keys(mk).length) marketHistory.push({ wk: week, t: Object.fromEntries(Object.entries(mk).map(([k, v]) => [k, Object.fromEntries(v.rows.slice(0, 10).map(r => [r.name, r.p]))])) });

  const history = {
    finals: (await finals().catch(() => null)) ?? prev?.history?.finals ?? [],
    seasons: await pastSeasons(2005, season - 1, prev?.history?.seasons, T),
  };
  return {
    updated: new Date(now).toISOString(), season, week, teams: tm, schedule: { start: gs.find(g => g.type === 2)?.date ?? null, end: lastDate },
    results: gs.map(g => ({ id: g.id, date: g.date, type: g.type, h: T[g.h] ?? g.h, a: T[g.a] ?? g.a, hs: g.hs, as: g.as, hl: g.hl, al: g.al })),
    power: power(gs, T), players: playerTotals(gs, T),
    bpi: b, bpiHistory: bpiHistory.sort((x, y) => x.wk - y.wk), markets: mk, marketHistory: marketHistory.sort((x, y) => x.wk - y.wk), history,
  };
}
