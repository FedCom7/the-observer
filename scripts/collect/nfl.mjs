// The NFL beyond this week: every game of the season (ESPN), team strength from
// play-by-play (nflverse: EPA, success rate, situations, phases), ESPN's Football
// Power Index with its weekly history, quarterbacks, and the Super Bowl record
// plus every season's standings since the 2002 realignment.
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { get, wikitext } from './lib.mjs';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl';
const PBP = y => `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${y}.csv.gz`;
// FTN charting: play action, motion, blitzes, drops… one row per play, joined to the play-by-play
const FTN = y => `https://github.com/nflverse/nflverse-data/releases/download/ftn_charting/ftn_charting_${y}.csv`;
// nflverse abbreviations that differ from ESPN's
const FIX = { LA: 'LAR', WAS: 'WSH' };
const ab = a => FIX[a] ?? a;
const HOUR = 3600e3;

const round = (v, d = 3) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** RFC 4180 CSV (quoted fields with commas, doubled quotes, newlines). */
function* csvRows(text) {
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); yield row; row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); yield row; }
}

const seasonOf = now => { const d = new Date(now); return d.getUTCMonth() >= 2 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; };

async function teamsAndDivisions(season) {
  const t = await get(`${SITE}/teams`, { json: true });
  const s = await get(`https://site.api.espn.com/apis/v2/sports/football/nfl/standings?level=3&season=${season}`, { json: true });
  const div = {};
  for (const conf of s.children ?? []) for (const d of conf.children ?? []) for (const e of d.standings?.entries ?? []) div[e.team.abbreviation] = { conf: /American/.test(conf.name) ? 'AFC' : 'NFC', div: d.name };
  return t.sports[0].leagues[0].teams.map(({ team: x }) => ({
    id: x.id, abbr: x.abbreviation, name: x.displayName, short: x.shortDisplayName, color: x.color ? `#${x.color}` : null, alt: x.alternateColor ? `#${x.alternateColor}` : null,
    conf: div[x.abbreviation]?.conf ?? null, div: div[x.abbreviation]?.div ?? null,
  }));
}

/** Every game of the season, regular season then playoffs, compact. */
async function allGames(season) {
  const weeks = [...Array.from({ length: 18 }, (_, i) => [2, i + 1]), ...[1, 2, 3, 5].map(w => [3, w])];
  const out = [];
  await Promise.all(weeks.map(async ([type, wk]) => {
    const j = await get(`${SITE}/scoreboard?dates=${season}&seasontype=${type}&week=${wk}`, { json: true }).catch(() => null);
    for (const e of j?.events ?? []) {
      const c = e.competitions[0];
      const side = h => c.competitors.find(x => x.homeAway === h);
      const H = side('home'), A = side('away');
      out.push({
        id: e.id, type, wk, start: e.date, st: c.status.type.state, detail: c.status.type.shortDetail,
        h: H.team.abbreviation, a: A.team.abbreviation,
        hs: H.score != null && H.score !== '' ? +H.score : null, as: A.score != null && A.score !== '' ? +A.score : null,
        hl: (H.linescores ?? []).map(l => l.value), al: (A.linescores ?? []).map(l => l.value),
        tv: c.broadcasts?.flatMap(b => b.names).join(' / ') || null, venue: c.venue?.fullName ?? null, note: c.notes?.[0]?.headline ?? null,
      });
    }
  }));
  return out.sort((a, b) => a.type - b.type || a.wk - b.wk || Date.parse(a.start) - Date.parse(b.start));
}

/** CSV text → array of objects. */
export function csvObjects(text) {
  const rows = csvRows(text);
  const head = rows.next().value;
  const out = [];
  for (const r of rows) if (r.length >= head.length) out.push(Object.fromEntries(head.map((h, i) => [h, r[i]])));
  return out;
}

const DRIVE_END = { Touchdown: 'td', 'Field goal': 'fg', Punt: 'punt', Turnover: 'to', 'Turnover on downs': 'downs', 'Missed field goal': 'missed', 'End of half': 'half' };

/** Team strength from play-by-play (and FTN charting when it is there). */
function power(text, ftn = new Map()) {
  const rows = csvRows(text);
  const head = rows.next().value;
  const col = Object.fromEntries(head.map((h, i) => [h, i]));
  const T = {}; // per team
  const qb = {};
  const drives = new Map();
  const t = a => (T[a] ??= {
    off: [], def: [], offPass: [], offRush: [], defPass: [], defRush: [], offSr: [], defSr: [], offExp: [], defExp: [],
    off3: [0, 0], def3: [0, 0], offDb: 0, offSack: 0, defDb: 0, defSack: 0, give: 0, take: 0,
    offEarlyPass: [0, 0], phase: { off: [[], [], [], []], def: [[], [], [], []] }, close4: { off: [], def: [] },
    weeks: {}, games: new Set(),
    // situation splits: key → [sum EPA, successes, plays], for the offence and for the defence
    sp: { off: {}, def: {} },
    // counters for tendencies and rates
    c: { off: {}, def: {} },
  });
  const split = (side, key, epa, ok) => { const x = (side[key] ??= [0, 0, 0]); x[0] += epa; x[1] += ok; x[2]++; };
  const inc = (side, key, n = 1) => { side[key] = (side[key] ?? 0) + n; };
  let maxWeek = 0;
  for (const r of rows) {
    if (r.length < head.length) continue;
    const v = k => r[col[k]];
    if (v('season_type') !== 'REG' && v('season_type') !== 'POST') continue;
    const pos = v('posteam'), dfn = v('defteam');
    if (!pos || !dfn) continue;
    const P = ab(pos), D = ab(dfn), wk = +v('week');
    maxWeek = Math.max(maxWeek, wk);
    // Drives, for red-zone and points per drive (one entry per game+drive)
    const dk = `${v('game_id')}|${v('fixed_drive')}`;
    if (v('fixed_drive') && !drives.has(dk)) drives.set(dk, { P, D, res: v('fixed_drive_result'), rz: false, start: null, plays: +v('drive_play_count') || 0 });
    // "NE 25" = own 25, "BUF 40" = opponent's 40 (own 60), "MID 50"
    const sl = v('drive_start_yard_line').match(/^(\w+)\s+(\d+)$/);
    if (sl && drives.has(dk) && drives.get(dk).start == null) drives.get(dk).start = ab(sl[1]) === P ? +sl[2] : sl[1] === 'MID' ? 50 : 100 - +sl[2];
    if (v('drive_inside20') === '1' && drives.has(dk)) drives.get(dk).rz = true;
    const isPass = v('pass') === '1', isRush = v('rush') === '1';
    if (v('interception') === '1' || v('fumble_lost') === '1') { t(P).give++; t(D).take++; }
    // Penalties, and fourth-and-short decisions (go for it, or kick)
    if (v('penalty') === '1' && v('penalty_team')) { const pt = t(ab(v('penalty_team'))); inc(pt.c.off, 'pen'); inc(pt.c.off, 'penYds', +v('penalty_yards') || 0); }
    if (v('down') === '4' && +v('ydstogo') <= 2 && ['pass', 'run', 'punt', 'field_goal'].includes(v('play_type')) && +v('wp') > 0.05 && +v('wp') < 0.95) {
      const a4 = t(P); inc(a4.c.off, 'fourth'); if (isPass || isRush) inc(a4.c.off, 'go');
    }
    if (!(isPass || isRush) || v('epa') === '') continue;
    const epa = +v('epa'), ok = v('success') === '1' ? 1 : 0, yds = +v('yards_gained') || 0;
    const exp = (isPass && yds >= 20) || (isRush && yds >= 10) ? 1 : 0;
    const a = t(P), d = t(D);
    a.games.add(v('game_id')); d.games.add(v('game_id'));
    a.off.push(epa); d.def.push(epa); a.offSr.push(ok); d.defSr.push(ok); a.offExp.push(exp); d.defExp.push(exp);
    (isPass ? a.offPass : a.offRush).push(epa); (isPass ? d.defPass : d.defRush).push(epa);
    if (v('qb_dropback') === '1') { a.offDb++; d.defDb++; if (v('sack') === '1') { a.offSack++; d.defSack++; } }
    if (v('down') === '3') { const conv = v('third_down_converted') === '1' ? 1 : 0; a.off3[0] += conv; a.off3[1]++; d.def3[0] += conv; d.def3[1]++; }
    const wp = +v('wp');
    if ((v('down') === '1' || v('down') === '2') && wp >= 0.2 && wp <= 0.8) { a.offEarlyPass[0] += isPass ? 1 : 0; a.offEarlyPass[1]++; }
    // Situations, recorded for both sides of the ball
    const both = key => { split(a.sp.off, key, epa, ok); split(d.sp.def, key, epa, ok); };
    const both2 = (key, n = 1) => { inc(a.c.off, key, n); inc(d.c.def, key, n); };
    const dropback = v('qb_dropback') === '1';
    both2('plays'); if (dropback) both2('db');
    if (v('down')) both(`d${v('down')}`);
    const yl = +v('yardline_100');
    both(yl >= 80 ? 'backed' : yl > 50 ? 'own' : yl > 20 ? 'opp' : 'rz');
    if (isPass && v('sack') !== '1' && v('air_yards') !== '') {
      const air = +v('air_yards');
      both(air < 0 ? 'behind' : air < 10 ? 'short' : air < 20 ? 'mid' : 'deep');
      if (v('pass_location')) both(`pass_${v('pass_location')}`);
      if (v('pass_location')) both(`pz_${v('pass_location')}_${air < 10 ? 'short' : air < 20 ? 'mid' : 'deep'}`);
      both2('att');
    }
    if (isRush && v('run_location')) both(v('run_gap') ? `run_${v('run_location')}_${v('run_gap')}` : 'run_middle');
    both(v('shotgun') === '1' ? 'gun' : 'center'); if (v('shotgun') === '1') both2('gunN');
    if (v('no_huddle') === '1') { both('nohuddle'); both2('nhN'); }
    if (dropback && (v('qb_hit') === '1' || v('sack') === '1')) both2('hit');
    if (v('tackled_for_loss') === '1' || v('interception') === '1' || v('fumble_forced') === '1' || v('pass_defense_1_player_id')) inc(d.c.def, 'havoc');
    if (v('pass_oe') !== '') { both2('passOe', +v('pass_oe')); both2('passOeN'); }
    const f = ftn.get(`${v('game_id')}|${v('play_id')}`);
    if (f) {
      const yes = k => f[k] === 'TRUE' || f[k] === 'true' || f[k] === '1';
      both2('ftn');
      both(yes('is_motion') ? 'motion' : 'nomotion'); if (yes('is_motion')) both2('motionN');
      if (dropback) {
        both2('ftnDb');
        both(yes('is_play_action') ? 'pa' : 'nopa'); if (yes('is_play_action')) both2('paN');
        const blitz = +f.n_blitzers > 0;
        both(blitz ? 'blitz' : 'noblitz'); if (blitz) both2('blitzN');
        if (yes('is_qb_out_of_pocket')) { both('oop'); both2('oopN'); }
        if (yes('is_screen_pass')) both('screen');
        if (isPass && v('sack') !== '1') { both2('ftnAtt'); if (yes('is_drop')) both2('drop'); if (yes('is_interception_worthy')) both2('intWorthy'); }
      }
      if (yes('is_rpo')) both('rpo');
      if (isRush && f.n_defense_box) both(+f.n_defense_box >= 8 ? 'heavybox' : +f.n_defense_box <= 6 ? 'lightbox' : 'normalbox');
    }
    const q = Math.min(4, +v('qtr') || 1) - 1;
    a.phase.off[q].push(epa); d.phase.def[q].push(epa);
    if (q === 3 && Math.abs(+v('score_differential')) <= 8) { a.close4.off.push(epa); d.close4.def.push(epa); }
    ((a.weeks[wk] ??= { off: [], def: [], opp: D }).off).push(epa);
    ((d.weeks[wk] ??= { off: [], def: [], opp: P }).def).push(epa);
    // Quarterbacks: every dropback (passes, sacks, scrambles)
    if (v('qb_dropback') === '1' && v('id')) {
      const k = v('id'), x = (qb[k] ??= { name: v('name'), team: P, n: 0, epa: 0, cpoe: [], sr: 0 });
      x.n++; x.epa += epa; x.sr += ok; x.team = P;
      if (v('cpoe') !== '') x.cpoe.push(+v('cpoe'));
    }
  }
  const PTS = { Touchdown: 7, 'Field goal': 3, Safety: 0 };
  const dr = {};
  for (const x of drives.values()) {
    const blank = () => ({ n: 0, pts: 0, rz: 0, rzTd: 0, start: 0, startN: 0, plays: 0, end: {} });
    const o = (dr[x.P] ??= blank()), d = (dr[`def:${x.D}`] ??= blank());
    const pts = PTS[x.res] ?? 0;
    for (const s of [o, d]) {
      s.n++; s.pts += pts; s.plays += x.plays;
      if (x.start != null) { s.start += x.start; s.startN++; }
      const e = DRIVE_END[x.res] ?? 'other'; s.end[e] = (s.end[e] ?? 0) + 1;
      if (x.rz) { s.rz++; if (x.res === 'Touchdown') s.rzTd++; }
    }
  }
  const teams = {};
  for (const [k, a] of Object.entries(T)) {
    const none = { n: 0, pts: 0, rz: 0, rzTd: 0, start: 0, startN: 0, plays: 0, end: {} };
    const o = dr[k] ?? none, d = dr[`def:${k}`] ?? none;
    const sp = side => Object.fromEntries(Object.entries(side).map(([key, [e, ok, n]]) => [key, [round(e / n), round(ok / n), n]]));
    const rate = (c, key, base) => (c[base] ? round((c[key] ?? 0) / c[base]) : null);
    const drv = x => ({ n: x.n, start: x.startN ? round(x.start / x.startN, 1) : null, plays: x.n ? round(x.plays / x.n, 1) : null, end: Object.fromEntries(Object.entries(x.end).map(([e, c]) => [e, round(c / (x.n || 1))])) });
    teams[k] = {
      games: a.games.size, plays: a.off.length,
      offEpa: round(mean(a.off)), defEpa: round(mean(a.def)),
      offPassEpa: round(mean(a.offPass)), offRushEpa: round(mean(a.offRush)), defPassEpa: round(mean(a.defPass)), defRushEpa: round(mean(a.defRush)),
      offSr: round(mean(a.offSr)), defSr: round(mean(a.defSr)), offExp: round(mean(a.offExp)), defExp: round(mean(a.defExp)),
      off3rd: round(a.off3[0] / (a.off3[1] || 1)), def3rd: round(a.def3[0] / (a.def3[1] || 1)),
      offRz: round(o.rzTd / (o.rz || 1)), defRz: round(d.rzTd / (d.rz || 1)),
      offPtsDrive: round(o.pts / (o.n || 1), 2), defPtsDrive: round(d.pts / (d.n || 1), 2),
      sackRateAllowed: round(a.offSack / (a.offDb || 1)), sackRate: round(a.defSack / (a.defDb || 1)),
      give: a.give, take: a.take, toMargin: a.take - a.give,
      earlyPass: round(a.offEarlyPass[0] / (a.offEarlyPass[1] || 1)),
      byQ: { off: a.phase.off.map(x => round(mean(x))), def: a.phase.def.map(x => round(mean(x))) },
      close4: { off: round(mean(a.close4.off)), def: round(mean(a.close4.def)), plays: a.close4.off.length + a.close4.def.length },
      weeks: Object.entries(a.weeks).map(([w, x]) => ({ wk: +w, opp: x.opp, off: round(mean(x.off)), def: round(mean(x.def)) })).sort((p, q2) => p.wk - q2.wk),
      splits: { off: sp(a.sp.off), def: sp(a.sp.def) },
      rates: {
        gun: rate(a.c.off, 'gunN', 'plays'), noHuddle: rate(a.c.off, 'nhN', 'plays'), motion: rate(a.c.off, 'motionN', 'ftn'), playAction: rate(a.c.off, 'paN', 'ftnDb'),
        blitzFaced: rate(a.c.off, 'blitzN', 'ftnDb'), outOfPocket: rate(a.c.off, 'oopN', 'ftnDb'), drops: rate(a.c.off, 'drop', 'ftnAtt'), intWorthy: rate(a.c.off, 'intWorthy', 'ftnAtt'),
        hitAllowed: rate(a.c.off, 'hit', 'db'), passOe: a.c.off.passOeN ? round(a.c.off.passOe / a.c.off.passOeN, 1) : null, goFourth: rate(a.c.off, 'go', 'fourth'), fourthN: a.c.off.fourth ?? 0,
        penPerGame: a.games.size ? round((a.c.off.pen ?? 0) / a.games.size, 1) : null, penYdsPerGame: a.games.size ? round((a.c.off.penYds ?? 0) / a.games.size, 1) : null,
        blitz: rate(a.c.def, 'blitzN', 'ftnDb'), hit: rate(a.c.def, 'hit', 'db'), havoc: rate(a.c.def, 'havoc', 'plays'), motionFaced: rate(a.c.def, 'motionN', 'ftn'), paFaced: rate(a.c.def, 'paN', 'ftnDb'),
        intWorthyForced: rate(a.c.def, 'intWorthy', 'ftnAtt'),
      },
      drives: { off: drv(o), def: drv(d) },
    };
  }
  const qbs = Object.values(qb).filter(x => x.n >= 60).map(x => ({ name: x.name, team: x.team, dropbacks: x.n, epa: round(x.epa / x.n), cpoe: round(mean(x.cpoe), 1), sr: round(x.sr / x.n) }))
    .sort((p, q2) => q2.epa - p.epa);
  return { maxWeek, teams, qbs };
}

async function fpi(season, byId) {
  const j = await get(`${CORE}/seasons/${season}/powerindex?limit=40`, { json: true });
  const out = {};
  for (const it of j.items ?? []) {
    const id = it.team.$ref.match(/teams\/(\d+)/)?.[1];
    const abbr = byId[id];
    if (!abbr) continue;
    const p = Object.fromEntries((it.predictives ?? []).map(s => [s.name, s.value]));
    const e = Object.fromEntries((it.efficiencies ?? []).map(s => [s.name, s.value]));
    out[abbr] = {
      fpi: round(p.fpi, 2), rank: p.fpirank ?? null, projW: round(p.projectedw, 1), projL: round(p.projectedl, 1),
      playoff: round(p.probmakeplayoffs, 1), div: round(p.probwindiv, 1), divRound: round(p.probmakedivplayoffs, 1), conf: round(p.probmakeconfchamp, 1), sb: round(p.probmaketitlegame, 1), title: round(p.probwintitle, 1),
      sosRemRank: p.sosremainingrank ?? null, sosRank: p.avgsosrank ?? null, ingameWp: round(p.avgingamewp, 1),
      epaOff: round(p.epaoffense, 2), epaDef: round(p.epadefense, 2), epaSt: round(p.epaspecialteams, 2),
      effOff: round(e.offefficiency, 1), effDef: round(e.defefficiency, 1), effSt: round(e.stefficiency, 1), eff: round(e.overallefficiency ?? e.teamefficiency, 1),
    };
  }
  return out;
}

const strip = s => s.replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/g, '').replace(/\{\{refn[\s\S]*?\}\}\}\}/g, '}}');

/** Super Bowl results from Wikipedia's list of champions. */
async function superBowls() {
  const w = await wikitext('List of Super Bowl champions');
  if (!w) return [];
  const body = w.slice(w.indexOf('|+ Super Bowl championships'), w.indexOf('=== Upcoming games ==='));
  const out = [];
  for (const raw of body.split(/\n\|-\s*\n/).slice(1)) {
    const r = strip(raw);
    const num = r.match(/\{\{Sort\|(\d{2})\|\[\[Super Bowl ([IVXLC]+|50)\|/);
    const date = r.match(/\{\{Dts\|(\d{4})\|(\w{3})\w*\|(\d{1,2})/);
    const teams = [...r.matchAll(/\{\{Sort\|([^|]+?) \d+\|\[\[[^|\]]+\|([^\]]+)\]\]<sup>([ANan])/g)].map(m => ({ name: m[2], conf: m[3] }));
    const scores = [...r.matchAll(/^\|\s*(?:'''(\d+)'''|(\d+))\s*$/gm)].map(m => +(m[1] ?? m[2]));
    const venue = r.match(/^\|\{\{Sort\|[^|]+\|\[\[([^\]|]+)/m)?.[1] ?? null;
    if (!num || !date || teams.length < 2 || scores.length < 2) continue;
    out.push({ n: +num[1], roman: num[2], date: `${date[1]}-${String(new Date(`${date[2]} 1 2000`).getMonth() + 1).padStart(2, '0')}-${date[3].padStart(2, '0')}`, season: +date[1] - 1, winner: teams[0].name, loser: teams[1].name, wConf: teams[0].conf.toUpperCase(), ws: scores[0], ls: scores[1], venue });
  }
  return out.sort((a, b) => a.n - b.n);
}

/** Final standings of past seasons (fixed: read once, then kept). */
async function pastSeasons(from, to, prev) {
  const out = { ...(prev ?? {}) };
  for (let y = from; y <= to; y++) {
    if (out[y]) continue;
    const s = await get(`https://site.api.espn.com/apis/v2/sports/football/nfl/standings?level=3&season=${y}`, { json: true }).catch(() => null);
    if (!s) continue;
    const rows = {};
    for (const conf of s.children ?? []) for (const d of conf.children ?? []) for (const e of d.standings?.entries ?? []) {
      const st = n => e.stats.find(x => x.name === n)?.value ?? null;
      rows[e.team.abbreviation] = { w: st('wins'), l: st('losses'), t: st('ties'), pct: round(st('winPercent')), diff: st('pointDifferential'), seed: st('playoffSeed') || null };
    }
    if (Object.keys(rows).length >= 32) out[y] = rows;
  }
  return out;
}

export async function collectNfl() {
  const now = Date.now();
  const season = seasonOf(now);
  let prev = null;
  try { prev = JSON.parse(await readFile(new URL('../../public/data/nfl.json', import.meta.url), 'utf8')); } catch { /* first run */ }
  if (prev?.season !== season) prev = prev ? { history: prev.history } : null;

  const teams = await teamsAndDivisions(season);
  const byId = Object.fromEntries(teams.map(t => [t.id, t.abbr]));
  const games = await allGames(season);

  // Play-by-play is rebuilt nightly by nflverse: download it at most every 3 hours
  let pbp = prev?.pbp ?? null;
  if (!pbp || now - Date.parse(pbp.at) > 3 * HOUR) {
    try {
      const buf = Buffer.from(await (await fetch(PBP(season))).arrayBuffer());
      const ftn = new Map();
      try {
        const res = await fetch(FTN(season));
        if (res.ok) for (const f of csvObjects(await res.text())) ftn.set(`${f.nflverse_game_id}|${f.nflverse_play_id}`, f);
      } catch { /* charting is optional */ }
      pbp = { at: new Date(now).toISOString(), ftnPlays: ftn.size, ...power(gunzipSync(buf).toString('utf8'), ftn) };
    } catch (err) { if (!pbp) throw err; }
  }

  const f = await fpi(season, byId).catch(() => prev?.fpi ?? {});
  // One FPI snapshot per completed week, to draw the race over time
  const played = Math.max(0, ...games.filter(g => g.type === 2 && g.st === 'post').map(g => g.wk));
  const fpiHistory = (prev?.fpiHistory ?? []).filter(h => h.wk !== played);
  if (Object.keys(f).length) fpiHistory.push({ wk: played, at: new Date(now).toISOString(), t: Object.fromEntries(Object.entries(f).map(([k, x]) => [k, [x.fpi, x.playoff, x.title]])) });
  fpiHistory.sort((a, b) => a.wk - b.wk);

  const history = {
    superBowls: (await superBowls().catch(() => null)) ?? prev?.history?.superBowls ?? [],
    seasons: await pastSeasons(2002, season - 1, prev?.history?.seasons),
  };

  return { updated: new Date(now).toISOString(), season, teams, games, pbp, fpi: f, fpiHistory, history };
}
