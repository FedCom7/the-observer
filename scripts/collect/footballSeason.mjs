// Football strength: the World Football Elo ratings of every national team (eloratings.net),
// the rating history of Italy and its rivals with Italy's recent matches; and Serie A team by
// team, match by match, with expected goals (Understat) for the Milan screens.
import { readFile } from 'node:fs/promises';
import { get } from './lib.mjs';

const ELO = 'https://www.eloratings.net';
const RIVALS = { IT: 'Italy', FR: 'France', ES: 'Spain', EN: 'England', DE: 'Germany', PT: 'Portugal', NL: 'Netherlands', AR: 'Argentina', BR: 'Brazil' };
const round = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const num = s => Number(String(s).replace('−', '-').replace('+', ''));

async function elo() {
  const [world, names] = await Promise.all([get(`${ELO}/World.tsv`), get(`${ELO}/en.teams.tsv`)]);
  const N = Object.fromEntries(names.split('\n').map(l => l.split('\t')).filter(x => x.length >= 2).map(([c, n]) => [c, n]));
  const table = world.split('\n').map(l => l.split('\t')).filter(c => c.length > 10).slice(0, 80).map(c => ({ rank: +c[0], code: c[2], name: N[c[2]] ?? c[2], rating: +c[3], peak: +c[5] }));
  const history = {};
  const italy = [];
  for (const [code, file] of Object.entries(RIVALS)) {
    const t = await get(`${ELO}/${file}.tsv`).catch(() => null);
    if (!t) continue;
    const rows = t.split('\n').map(l => l.split('\t')).filter(c => c.length >= 12);
    // Rating after each match: the team's own column (10 when listed first, 11 when second)
    const series = rows.map(c => ({ date: `${c[0]}-${c[1]}-${c[2]}`, r: +(c[3] === code ? c[10] : c[11]) })).filter(x => x.date >= '1990');
    // One point per year end, plus the latest
    const byYear = {};
    for (const x of series) byYear[x.date.slice(0, 4)] = x.r;
    history[code] = { name: file, years: Object.entries(byYear).map(([y, r]) => [+y, r]) };
    if (code === 'IT') for (const c of rows.slice(-40)) italy.push({ date: `${c[0]}-${c[1]}-${c[2]}`, home: c[3], away: c[4], hs: +c[5], as: +c[6], type: c[7], venue: c[8] || null, change: num(c[9]), after: +(c[3] === 'IT' ? c[10] : c[11]), opp: N[c[3] === 'IT' ? c[4] : c[3]] ?? (c[3] === 'IT' ? c[4] : c[3]) });
  }
  return { table, history, italy: italy.reverse() };
}

async function serieA() {
  const now = new Date();
  const season = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const res = await fetch(`https://understat.com/getLeagueData/Serie_A/${season}`, { headers: { 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Understat ${res.status}`);
  const j = await res.json();
  const teams = Object.values(j.teams).map(t => ({
    id: t.id, name: t.title,
    games: t.history.map(h => ({ date: h.date, home: h.h_a === 'h', xg: round(+h.xG), xga: round(+h.xGA), npxg: round(+h.npxG), npxga: round(+h.npxGA), ppda: h.ppda?.def ? round(h.ppda.att / h.ppda.def, 1) : null, ppdaAllowed: h.ppda_allowed?.def ? round(h.ppda_allowed.att / h.ppda_allowed.def, 1) : null, deep: +h.deep, deepAllowed: +h.deep_allowed, gf: +h.scored, ga: +h.missed, xpts: round(+h.xpts), pts: +h.pts, result: h.result })),
  }));
  // Opponents: the other team that played on the same date with the mirror numbers
  for (const t of teams) for (const g of t.games) {
    const o = teams.find(x => x.id !== t.id && x.games.some(y => y.date === g.date && y.gf === g.ga && y.ga === g.gf && y.home !== g.home));
    g.opp = o?.name ?? null;
  }
  return { season, teams };
}

export async function collectFootballSeason() {
  let prev = null;
  try { prev = JSON.parse(await readFile(new URL('../../public/data/football-season.json', import.meta.url), 'utf8')); } catch { /* first run */ }
  const [e, s] = await Promise.all([elo().catch(() => prev?.elo ?? null), serieA().catch(() => prev?.serieA ?? null)]);
  return { updated: new Date().toISOString(), elo: e, serieA: s };
}
