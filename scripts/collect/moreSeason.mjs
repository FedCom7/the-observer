// MotoGP beyond the podium (official results API): the complete qualifying, sprint and
// race classification of every finished round, kept one file per event in
// motogp-events/<year>/<id>.json, and the riders' and manufacturers' strength over the season.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { get } from './lib.mjs';

const RES = 'https://api.motogp.pulselive.com/motogp/v1/results';
const DATA = new URL('../../public/data/', import.meta.url);
const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

async function classification(sessionId) {
  const j = await get(`${RES}/session/${sessionId}/classification?test=false`, { json: true });
  return (j.classification ?? []).map(c => ({
    pos: c.position ?? null, rider: c.rider?.full_name ?? '', number: c.rider?.number ?? null, nation: c.rider?.country?.iso ?? '', team: c.team?.name ?? '', make: c.constructor?.name ?? '',
    laps: c.total_laps ?? null, time: c.time ?? c.best_lap?.time ?? null, gap: c.gap?.first ?? null, speed: c.average_speed ?? c.top_speed ?? null, top: c.top_speed ?? null, points: c.points ?? 0, status: c.status ?? null,
  }));
}

export async function collectMoreSeason() {
  const year = new Date().getUTCFullYear();
  const seasons = await get(`${RES}/seasons`, { json: true });
  const season = seasons.find(s => s.year === year);
  if (!season) throw new Error('no MotoGP season');
  const cats = await get(`${RES}/categories?seasonUuid=${season.id}`, { json: true });
  const cat = cats.find(c => c.name.startsWith('MotoGP'))?.id;
  const events = (await get(`${RES}/events?seasonUuid=${season.id}&isFinished=true`, { json: true })).filter(e => !e.test).sort((a, b) => a.date_start.localeCompare(b.date_start));
  const dir = new URL(`motogp-events/${year}/`, DATA);
  await mkdir(dir, { recursive: true });
  const have = new Set(await readdir(dir).catch(() => []));
  const rounds = [];
  for (const [i, e] of events.entries()) {
    const file = `${e.id}.json`;
    let x = null;
    if (have.has(file)) try { x = JSON.parse(await readFile(new URL(file, dir), 'utf8')); } catch { /* reread */ }
    if (!x?.race?.length) {
      const sessions = await get(`${RES}/sessions?eventUuid=${e.id}&categoryUuid=${cat}`, { json: true }).catch(() => []);
      const pick = (type, number) => sessions.find(s => s.type === type && (number == null || s.number === number));
      const read = async s => (s ? classification(s.id).catch(() => []) : []);
      const [q1, q2, sprint, race] = await Promise.all([read(pick('Q', 1)), read(pick('Q', 2)), read(pick('SPR')), read(pick('RAC'))]);
      // The grid: Q2 gives places 1–12, Q1 the rest (its top two went through to Q2)
      const grid = [...q2.filter(r => r.pos).map(r => ({ ...r, grid: r.pos })), ...q1.filter(r => r.pos && r.pos > 2).map(r => ({ ...r, grid: 10 + r.pos }))];
      x = { id: e.id, round: i + 1, name: e.name, circuit: e.circuit?.name ?? '', country: e.country?.name ?? e.circuit?.country ?? '', date: e.date_start, grid, sprint, race };
      if (race.length) await writeFile(new URL(file, dir), JSON.stringify(x));
    }
    rounds.push(x);
  }
  // Riders: grid, sprint and race finishes, points split
  const R = {}, M = {};
  for (const x of rounds) {
    const gridOf = Object.fromEntries(x.grid.map(g => [g.rider, g.grid]));
    for (const [kind, list] of [['sprint', x.sprint], ['race', x.race]]) for (const r of list) {
      const p = (R[r.rider] ??= { rider: r.rider, number: r.number, nation: r.nation, team: r.team, make: r.make, grid: [], race: [], sprint: [], racePts: 0, sprintPts: 0, gained: [], dnf: 0, starts: 0 });
      p.team = r.team; p.make = r.make;
      if (kind === 'race') { p.starts++; if (r.pos) { p.race.push(r.pos); if (gridOf[r.rider]) p.gained.push(gridOf[r.rider] - r.pos); } else p.dnf++; p.racePts += r.points; }
      else { if (r.pos) p.sprint.push(r.pos); p.sprintPts += r.points; }
      const m = (M[r.make] ??= { make: r.make, pts: {}, best: {}, bestSprint: {} });
      m.pts[x.round] = (m.pts[x.round] ?? 0) + r.points;
      if (r.pos) { const key = kind === 'race' ? 'best' : 'bestSprint'; m[key][x.round] = Math.min(m[key][x.round] ?? 99, r.pos); }
    }
    for (const g of x.grid) if (R[g.rider]) R[g.rider].grid.push(g.grid);
  }
  const riders = Object.values(R).map(p => ({ rider: p.rider, number: p.number, nation: p.nation, team: p.team, make: p.make, grid: round(mean(p.grid), 1), race: round(mean(p.race), 1), sprint: round(mean(p.sprint), 1), gained: round(mean(p.gained), 1), racePts: p.racePts, sprintPts: p.sprintPts, dnf: p.dnf, starts: p.starts, wins: p.race.filter(v => v === 1).length, podiums: p.race.filter(v => v <= 3).length }))
    .sort((a, b) => b.racePts + b.sprintPts - (a.racePts + a.sprintPts));
  const makes = Object.values(M).map(m => ({ make: m.make, pts: m.pts, best: m.best, bestSprint: m.bestSprint, total: Object.values(m.pts).reduce((a, b) => a + b, 0), wins: Object.values(m.best).filter(v => v === 1).length, avgBest: round(mean(Object.values(m.best)), 1) })).sort((a, b) => b.total - a.total);
  return { updated: new Date().toISOString(), year, rounds: rounds.map(x => ({ id: x.id, round: x.round, name: x.name, circuit: x.circuit, country: x.country, date: x.date })), riders, makes };
}
