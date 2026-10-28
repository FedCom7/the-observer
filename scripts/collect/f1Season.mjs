// Formula 1 beyond this weekend, from OpenF1: every session of the season (results,
// laps with sectors and speed traps, tyre stints, pit stops, safety cars, championship
// after each race) kept one file per session in f1-sessions/<year>/<key>.json, and the
// team and driver strength computed from them (qualifying and race pace, sectors, top
// speed, tyre wear, pit stops, starts, circuit types, team-mate battles).
// History from Jolpica (the Ergast archive): champions and every race winner since 1950.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

const OF1 = 'https://api.openf1.org/v1';
const JOLPICA = 'https://api.jolpi.ca/ergast/f1';
const DATA = new URL('../../public/data/', import.meta.url);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const round = (v, d = 3) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const median = xs => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// OpenF1 allows three requests a second: one at a time, through a queue
let queue = Promise.resolve();
function of1(path) {
  const run = async () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      await sleep(400);
      const res = await fetch(`${OF1}/${path}`);
      if (res.status === 404) return [];
      if (res.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
      if (!res.ok) throw new Error(`OpenF1 ${res.status} ${path}`);
      const j = await res.json();
      return Array.isArray(j) ? j : [];
    }
    throw new Error(`OpenF1 rate limit ${path}`);
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}
let lastJ = 0;
async function jolpica(path) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = Math.max(0, lastJ + 300 - Date.now());
    if (wait) await sleep(wait);
    lastJ = Date.now();
    const res = await fetch(`${JOLPICA}/${path}${path.includes('?') ? '&' : '?'}format=json`);
    if (res.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`Jolpica ${res.status} ${path}`);
    return (await res.json()).MRData;
  }
  throw new Error(`Jolpica rate limit ${path}`);
}

/**
 * The circuits of the calendar: type (what the lap rewards), length, corners, and the
 * Ergast id to find past winners. Types: street, high-speed (fast corners), power (long
 * straights, low downforce), technical (slow corners), mixed.
 */
export const CIRCUITS = {
  Melbourne: { id: 'albert_park', name: 'Albert Park', type: 'street', km: 5.278, corners: 14 },
  Shanghai: { id: 'shanghai', name: 'Shanghai International Circuit', type: 'mixed', km: 5.451, corners: 16 },
  Suzuka: { id: 'suzuka', name: 'Suzuka', type: 'high-speed', km: 5.807, corners: 18 },
  Sakhir: { id: 'bahrain', name: 'Bahrain International Circuit', type: 'mixed', km: 5.412, corners: 15 },
  Jeddah: { id: 'jeddah', name: 'Jeddah Corniche Circuit', type: 'street', km: 6.174, corners: 27 },
  Miami: { id: 'miami', name: 'Miami International Autodrome', type: 'street', km: 5.412, corners: 19 },
  Montreal: { id: 'villeneuve', name: 'Circuit Gilles Villeneuve', type: 'power', km: 4.361, corners: 14 },
  'Monte Carlo': { id: 'monaco', name: 'Circuit de Monaco', type: 'street', km: 3.337, corners: 19 },
  Catalunya: { id: 'catalunya', name: 'Circuit de Barcelona-Catalunya', type: 'mixed', km: 4.657, corners: 14 },
  Spielberg: { id: 'red_bull_ring', name: 'Red Bull Ring', type: 'power', km: 4.318, corners: 10 },
  Silverstone: { id: 'silverstone', name: 'Silverstone', type: 'high-speed', km: 5.891, corners: 18 },
  'Spa-Francorchamps': { id: 'spa', name: 'Spa-Francorchamps', type: 'power', km: 7.004, corners: 19 },
  Hungaroring: { id: 'hungaroring', name: 'Hungaroring', type: 'technical', km: 4.381, corners: 14 },
  Zandvoort: { id: 'zandvoort', name: 'Zandvoort', type: 'technical', km: 4.259, corners: 14 },
  Monza: { id: 'monza', name: 'Monza', type: 'power', km: 5.793, corners: 11 },
  Madring: { id: 'madring', name: 'Madring', type: 'street', km: 5.474, corners: 22 },
  Baku: { id: 'baku', name: 'Baku City Circuit', type: 'street', km: 6.003, corners: 20 },
  'Kuala Lumpur': { id: 'sepang', name: 'Sepang', type: 'mixed', km: 5.543, corners: 15 },
  Singapore: { id: 'marina_bay', name: 'Marina Bay', type: 'street', km: 4.94, corners: 19 },
  Austin: { id: 'americas', name: 'Circuit of the Americas', type: 'mixed', km: 5.513, corners: 20 },
  'Mexico City': { id: 'rodriguez', name: 'Autódromo Hermanos Rodríguez', type: 'power', km: 4.304, corners: 17 },
  Interlagos: { id: 'interlagos', name: 'Interlagos', type: 'mixed', km: 4.309, corners: 15 },
  'Las Vegas': { id: 'vegas', name: 'Las Vegas Strip Circuit', type: 'street', km: 6.201, corners: 17 },
  Lusail: { id: 'losail', name: 'Lusail', type: 'high-speed', km: 5.419, corners: 16 },
  'Yas Marina Circuit': { id: 'yas_marina', name: 'Yas Marina', type: 'mixed', km: 5.281, corners: 16 },
};

/** One session, compact. */
async function readSession(s) {
  const k = s.session_key, racing = s.session_type === 'Race';
  const [results, drivers, laps] = await Promise.all([of1(`session_result?session_key=${k}`), of1(`drivers?session_key=${k}`), of1(`laps?session_key=${k}`)]);
  const [stints, pits, champD, champT, rc] = racing
    ? await Promise.all([of1(`stints?session_key=${k}`), of1(`pit?session_key=${k}`), of1(`championship_drivers?session_key=${k}`), of1(`championship_teams?session_key=${k}`), of1(`race_control?session_key=${k}&category=SafetyCar`)])
    : [await of1(`stints?session_key=${k}`), [], [], [], []];
  const t0 = Date.parse(s.date_start);
  const L = {};
  for (const l of laps) (L[l.driver_number] ??= []).push([l.lap_number, l.date_start ? Date.parse(l.date_start) - t0 : null, round(l.lap_duration), round(l.duration_sector_1), round(l.duration_sector_2), round(l.duration_sector_3), l.st_speed ?? null, l.is_pit_out_lap ? 1 : 0]);
  for (const v of Object.values(L)) v.sort((a, b) => a[0] - b[0]);
  // Laps run behind the safety car or the virtual safety car
  const neutral = [];
  let from = null;
  for (const m of [...rc].sort((a, b) => Date.parse(a.date) - Date.parse(b.date))) {
    if (/DEPLOYED/i.test(m.message) && from == null) from = m.lap_number;
    else if (/ENDING|IN THIS LAP|WITHDRAWN/i.test(m.message) && from != null) { for (let x = from; x <= (m.lap_number ?? from); x++) neutral.push(x); from = null; }
  }
  if (from != null) neutral.push(from);
  return {
    key: k, name: s.session_name, type: s.session_type, meeting: s.meeting_key, circuit: s.circuit_short_name, start: s.date_start, end: s.date_end,
    drivers: drivers.map(d => ({ n: d.driver_number, code: d.name_acronym, name: d.full_name, first: d.first_name, last: d.last_name, team: d.team_name, colour: d.team_colour ? `#${d.team_colour}` : null, photo: d.headshot_url ?? null })),
    results: results.map(r => ({ n: r.driver_number, pos: r.position ?? null, laps: r.number_of_laps ?? null, dnf: !!r.dnf, dns: !!r.dns, dsq: !!r.dsq, time: Array.isArray(r.duration) ? r.duration.map(x => round(x)) : round(r.duration), gap: Array.isArray(r.gap_to_leader) ? r.gap_to_leader.map(x => (typeof x === 'number' ? round(x) : x)) : typeof r.gap_to_leader === 'number' ? round(r.gap_to_leader) : r.gap_to_leader ?? null, points: r.points ?? null })),
    laps: L,
    stints: stints.map(x => [x.driver_number, x.stint_number, x.compound, x.lap_start, x.lap_end, x.tyre_age_at_start]),
    pits: pits.map(p => [p.driver_number, p.lap_number, round(p.lane_duration ?? p.pit_duration, 2), round(p.stop_duration, 2)]),
    champD: champD.map(c => [c.driver_number, c.position_current, c.points_current]),
    champT: champT.map(c => [c.team_name, c.position_current, c.points_current]),
    neutral: [...new Set(neutral)].sort((a, b) => a - b),
  };
}

/** Every session that is over, from its file if already read. */
async function sessions(year, now) {
  const dir = new URL(`f1-sessions/${year}/`, DATA);
  await mkdir(dir, { recursive: true });
  const have = new Set(await readdir(dir).catch(() => []));
  const list = (await of1(`sessions?year=${year}`)).filter(s => s.session_type !== 'Practice' || !/Day \d/.test(s.session_name));
  const out = [];
  for (const s of list.sort((a, b) => Date.parse(a.date_start) - Date.parse(b.date_start))) {
    if (s.is_cancelled || Date.parse(s.date_end) > now - 30 * 60e3) continue;
    const file = `${s.session_key}.json`;
    let x = null;
    if (have.has(file)) try { x = JSON.parse(await readFile(new URL(file, dir), 'utf8')); } catch { /* reread */ }
    // Results are provisional for a few hours (penalties): reread until 6 hours after the end
    if (!x || (!x.final && now - Date.parse(s.date_end) > 30 * 60e3)) {
      try {
        x = await readSession(s);
        x.final = now - Date.parse(s.date_end) > 6 * 3600e3 && x.results.length > 0;
        await writeFile(new URL(file, dir), JSON.stringify(x));
      } catch (err) { if (!x) { console.error(`f1 session ${s.session_key}: ${err.message}`); continue; } }
    }
    out.push(x);
  }
  return { list, done: out };
}

const QUALI = s => s.name === 'Qualifying' || s.name === 'Sprint Qualifying' || s.name === 'Sprint Shootout';
const best = laps => Math.min(...(laps ?? []).map(l => l[2]).filter(v => v > 0));

/** Team and driver strength over the season. */
function power(done, teamOf, meetings) {
  const T = {}; // team → samples
  const D = {}; // driver → samples
  const t = k => (T[k] ??= { quali: [], race: [], s1: [], s2: [], s3: [], speed: [], deg: {}, pit: [], start: [], gained: [], dnf: 0, starts: 0, byType: {}, rounds: {} });
  const dr = n => (D[n] ??= { quali: [], race: [], start: [], gained: [], h2hQ: [0, 0], h2hR: [0, 0], finishes: [], qualiPos: [], dnf: 0 });
  const roundOf = Object.fromEntries(meetings.map(m => [m.key, m.round]));
  for (const s of done) {
    const team = n => teamOf(s, n);
    const type = CIRCUITS[s.circuit]?.type ?? 'mixed';
    const rnd = roundOf[s.meeting];
    if (QUALI(s)) {
      const bestBy = Object.fromEntries(Object.entries(s.laps).map(([n, l]) => [n, best(l)]).filter(([, v]) => Number.isFinite(v)));
      const pole = Math.min(...Object.values(bestBy));
      const teamBest = {};
      for (const [n, v] of Object.entries(bestBy)) { const tm = team(+n); if (!tm) continue; teamBest[tm] = Math.min(teamBest[tm] ?? Infinity, v); dr(n).quali.push(round((v / pole - 1) * 100)); }
      for (const [tm, v] of Object.entries(teamBest)) {
        const g = round((v / pole - 1) * 100); t(tm).quali.push(g); (t(tm).byType[type] ??= []).push(g);
        if (s.name === 'Qualifying' && rnd) (t(tm).rounds[rnd] ??= {}).quali = g;
      }
      // Sectors and speed traps, best per team
      for (const [i, key] of [[3, 's1'], [4, 's2'], [5, 's3']]) {
        const by = {};
        for (const [n, l] of Object.entries(s.laps)) { const tm = team(+n); if (!tm) continue; for (const x of l) if (x[i] > 0) by[tm] = Math.min(by[tm] ?? Infinity, x[i]); }
        const top = Math.min(...Object.values(by));
        for (const [tm, v] of Object.entries(by)) t(tm)[key].push(round((v / top - 1) * 100));
      }
      // Team-mates in qualifying: the better classified
      const pos = Object.fromEntries(s.results.filter(r => r.pos).map(r => [r.n, r.pos]));
      if (s.name === 'Qualifying') for (const [n, p] of Object.entries(pos)) dr(n).qualiPos.push(p);
      const pairs = {};
      for (const n of Object.keys(pos)) (pairs[team(+n)] ??= []).push(+n);
      if (s.name === 'Qualifying') for (const [, ns] of Object.entries(pairs)) if (ns.length === 2) { const [a, b] = ns; const w = pos[a] < pos[b] ? a : b, l = w === a ? b : a; dr(w).h2hQ[0]++; dr(l).h2hQ[1]++; }
    }
    if (s.type === 'Race' || QUALI(s)) {
      const by = {};
      for (const [n, l] of Object.entries(s.laps)) { const tm = team(+n); if (!tm) continue; for (const x of l) if (x[6]) by[tm] = Math.max(by[tm] ?? 0, x[6]); }
      const top = Math.max(...Object.values(by));
      if (Number.isFinite(top)) for (const [tm, v] of Object.entries(by)) t(tm).speed.push(v - top);
    }
    if (s.type === 'Race') {
      const fastest = Math.min(...Object.values(s.laps).map(best));
      const pitLaps = new Set(s.pits.map(p => `${p[0]}:${p[1]}`));
      const neutral = new Set(s.neutral);
      const clean = (n, l) => l.filter(x => x[0] >= 2 && x[2] > 0 && !x[7] && !pitLaps.has(`${n}:${x[0]}`) && !neutral.has(x[0]) && x[2] <= fastest * 1.07);
      const pace = {};
      for (const [n, l] of Object.entries(s.laps)) { const c = clean(n, l); if (c.length >= 5) pace[n] = median(c.map(x => x[2])); }
      const teamPace = {};
      for (const [n, v] of Object.entries(pace)) { const tm = team(+n); if (tm) teamPace[tm] = Math.min(teamPace[tm] ?? Infinity, v); }
      const top = Math.min(...Object.values(teamPace));
      for (const [tm, v] of Object.entries(teamPace)) { const g = round((v / top - 1) * 100); t(tm).race.push(g); if (s.name === 'Race' && rnd) (t(tm).rounds[rnd] ??= {}).race = g; }
      const topD = Math.min(...Object.values(pace));
      for (const [n, v] of Object.entries(pace)) dr(n).race.push(round((v / topD - 1) * 100));
      // Tyre wear: slope of clean lap times within a stint, corrected for fuel burn (~0.055 s a lap)
      for (const [n, stint, compound, a, b] of s.stints) {
        const tm = team(n); if (!tm || !compound || b - a < 7) continue;
        const xs = clean(String(n), s.laps[n] ?? []).filter(x => x[0] >= a + 1 && x[0] <= b);
        if (xs.length < 6) continue;
        const mx = mean(xs.map(x => x[0])), my = mean(xs.map(x => x[2]));
        const slope = xs.reduce((acc, x) => acc + (x[0] - mx) * (x[2] - my), 0) / (xs.reduce((acc, x) => acc + (x[0] - mx) ** 2, 0) || 1) + 0.055;
        if (Math.abs(slope) < 0.6) (t(tm).deg[compound] ??= []).push(slope);
        void stint;
      }
      for (const p of s.pits) { const tm = team(p[0]); const v = p[3] ?? null; if (tm && v && v > 1.5 && v < 8) t(tm).pit.push(v); }
      // Starts and race craft: grid from qualifying (sprint qualifying for a sprint), positions after lap 1, at the flag
      const q = done.find(x => x.meeting === s.meeting && (s.name === 'Sprint' ? /Sprint (Qualifying|Shootout)/.test(x.name) : x.name === 'Qualifying'));
      const grid = Object.fromEntries((q?.results ?? []).filter(r => r.pos).map(r => [r.n, r.pos]));
      const lap1 = Object.entries(s.laps).map(([n, l]) => { const x = l.find(y => y[0] === 1); return x && x[1] != null && x[2] ? [+n, x[1] + x[2] * 1000] : null; }).filter(Boolean).sort((a, b) => a[1] - b[1]);
      lap1.forEach(([n], i) => { const tm = team(n); if (grid[n] && tm) { const g = grid[n] - (i + 1); t(tm).start.push(g); dr(n).start.push(g); } });
      for (const r of s.results) {
        const tm = team(r.n); if (!tm) continue;
        t(tm).starts++; if (r.dnf || r.dns) { t(tm).dnf++; dr(r.n).dnf++; }
        if (r.pos && grid[r.n]) { t(tm).gained.push(grid[r.n] - r.pos); dr(r.n).gained.push(grid[r.n] - r.pos); }
        if (s.name === 'Race') dr(r.n).finishes.push(r.pos ?? null);
      }
      if (s.name === 'Race') {
        const pairs = {};
        for (const r of s.results.filter(x => x.pos)) (pairs[team(r.n)] ??= []).push(r);
        for (const rs of Object.values(pairs)) if (rs.length === 2) { const [a, b] = rs.sort((x, y) => x.pos - y.pos); dr(a.n).h2hR[0]++; dr(b.n).h2hR[1]++; }
      }
    }
  }
  const teams = Object.fromEntries(Object.entries(T).map(([k, x]) => [k, {
    quali: round(mean(x.quali)), race: round(mean(x.race)), s1: round(mean(x.s1)), s2: round(mean(x.s2)), s3: round(mean(x.s3)), speed: round(mean(x.speed), 1),
    deg: Object.fromEntries(Object.entries(x.deg).map(([c, v]) => [c, { slope: round(mean(v)), n: v.length }])), pit: round(median(x.pit), 2), pitN: x.pit.length,
    start: round(mean(x.start), 2), gained: round(mean(x.gained), 2), dnf: x.dnf, starts: x.starts,
    byType: Object.fromEntries(Object.entries(x.byType).map(([c, v]) => [c, round(mean(v))])), rounds: x.rounds,
  }]));
  const drivers = Object.fromEntries(Object.entries(D).map(([n, x]) => [n, {
    quali: round(mean(x.quali)), race: round(mean(x.race)), start: round(mean(x.start), 2), gained: round(mean(x.gained), 2), h2hQ: x.h2hQ, h2hR: x.h2hR,
    avgFinish: round(mean(x.finishes.filter(v => v != null)), 1), avgQuali: round(mean(x.qualiPos), 1), dnf: x.dnf,
  }]));
  return { teams, drivers };
}

/** Champions and every race winner since 1950 (fixed: read once, then kept). */
async function history(prev, upTo) {
  const out = { champions: prev?.champions ?? [], winners: prev?.winners ?? [] };
  const haveC = new Set(out.champions.map(c => c.year)), haveW = new Set(out.winners.map(w => w.year));
  for (let y = 1950; y <= upTo; y++) {
    if (!haveC.has(y)) {
      try {
        const d = await jolpica(`${y}/driverstandings/1/`);
        const s = d.StandingsTable.StandingsLists[0]?.DriverStandings?.[0];
        const c = y >= 1958 ? (await jolpica(`${y}/constructorstandings/1/`)).StandingsTable.StandingsLists[0]?.ConstructorStandings?.[0] : null;
        if (s) out.champions.push({ year: y, driver: `${s.Driver.givenName} ${s.Driver.familyName}`, nation: s.Driver.nationality, team: s.Constructors?.[0]?.name ?? null, points: +s.points, wins: +s.wins, constructor: c?.Constructor?.name ?? null, cPoints: c ? +c.points : null });
      } catch { /* try again next run */ }
    }
    if (!haveW.has(y)) {
      try {
        const d = await jolpica(`${y}/results/1/?limit=40`);
        for (const r of d.RaceTable.Races) out.winners.push({ year: y, round: +r.round, race: r.raceName, circuit: r.Circuit.circuitId, driver: `${r.Results[0].Driver.givenName} ${r.Results[0].Driver.familyName}`, team: r.Results[0].Constructor.name, grid: +r.Results[0].grid });
      } catch { /* try again next run */ }
    }
  }
  out.champions.sort((a, b) => a.year - b.year);
  out.winners.sort((a, b) => a.year - b.year || a.round - b.round);
  return out;
}

export async function collectF1Season() {
  const now = Date.now();
  const year = new Date(now).getUTCFullYear();
  let prev = null;
  try { prev = JSON.parse(await readFile(new URL('f1-season.json', DATA), 'utf8')); } catch { /* first run */ }
  const { list, done } = await sessions(year, now);
  // Rounds: the meetings with a race, in order (testing excluded)
  const byMeeting = {};
  for (const s of list) (byMeeting[s.meeting_key] ??= []).push(s);
  const meetings = Object.entries(byMeeting).filter(([, ss]) => ss.some(s => s.session_name === 'Race')).map(([k, ss]) => {
    const race = ss.find(s => s.session_name === 'Race');
    return { key: +k, circuit: race.circuit_short_name, country: race.country_name, location: race.location, start: ss.map(s => s.date_start).sort()[0], race: race.date_start, cancelled: !!race.is_cancelled, sprint: ss.some(s => s.session_name === 'Sprint'),
      sessions: ss.sort((a, b) => Date.parse(a.date_start) - Date.parse(b.date_start)).map(s => ({ key: s.session_key, name: s.session_name, start: s.date_start, done: done.some(x => x.key === s.session_key) })) };
  }).sort((a, b) => a.race.localeCompare(b.race));
  let r = 0;
  for (const m of meetings) m.round = m.cancelled ? null : ++r;
  // Drivers and their team (the latest session that lists them)
  const drivers = {};
  for (const s of done) for (const d of s.drivers) drivers[d.n] = { ...d, ...(drivers[d.n]?.photo && !d.photo ? { photo: drivers[d.n].photo } : {}) };
  const teamOf = (s, n) => s.drivers.find(d => d.n === n)?.team ?? drivers[n]?.team ?? null;
  // Race drivers: the line-up of the latest Grand Prix (practice-only reserves are left out)
  const lastRace = [...done].reverse().find(x => x.name === 'Race');
  const teams = {};
  for (const d of lastRace?.drivers ?? Object.values(drivers)) { drivers[d.n] = { ...drivers[d.n], ...d, photo: d.photo ?? drivers[d.n]?.photo ?? null }; teams[d.team] = { name: d.team, colour: d.colour, drivers: [...new Set([...(teams[d.team]?.drivers ?? []), d.n])] }; }
  const raced = new Set(done.filter(x => x.type === 'Race').flatMap(x => x.results.map(r => r.n)));
  for (const n of Object.keys(drivers)) if (!raced.has(+n)) delete drivers[n];
  // Results of every session, and the championships after each race or sprint
  const results = done.map(s => ({ key: s.key, name: s.name, meeting: s.meeting, results: s.results }));
  const champ = done.filter(s => s.type === 'Race' && s.champD.length).map(s => ({ key: s.key, name: s.name, meeting: s.meeting, drivers: s.champD, teams: s.champT }));
  return {
    updated: new Date(now).toISOString(), year, meetings, drivers, teams, circuits: CIRCUITS, results, champ,
    power: power(done, teamOf, meetings),
    history: await history(prev?.history, year - 1),
  };
}
