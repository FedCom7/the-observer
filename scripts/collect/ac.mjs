// America's Cup from the official site's own JSON feeds (the results page loads them):
// every regatta (preliminary regattas, Louis Vuitton Cup, the Match) with standings,
// points per race and each race's start time.
import { get, iso, zoned } from './lib.mjs';

const BASE = 'https://www.americascup.com';

const regattaName = hash => hash.replace(/^ac\d+-/, '').replace(/-rounds?$/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

/** "2026-09-25 12:38:00", local race-village time (Italy) -> ISO */
const local = s => { const [d, t] = s.split(' '); const [y, m, dd] = d.split('-').map(Number); const [hh, mm] = t.split(':').map(Number); return iso(zoned(y, m, dd, hh, mm, 'Europe/Rome')); };

export async function collectAc() {
  const seasons = await get(`${BASE}/results/feed/seasons.json`, { browser: true, json: true });
  const cup = seasons[0];
  const teams = {};
  const regattas = (cup?.competition_seasons ?? []).map(c => {
    const standings = (c.results ?? []).map(r => {
      teams[r.id_teams] = { name: r.name.replace(/\s*\d?:\s*Principal Team/i, '').trim(), flag: r.media };
      return { teamId: r.id_teams, team: teams[r.id_teams].name, flag: r.media, total: r.total, position: r.position, winner: /winner/i.test(r.elapsed_time ?? ''), races: (r.races ?? []).map(x => ({ race: x.race, start: local(x.date), points: x.points })) };
    }).sort((a, b) => a.position - b.position);
    return { id: c.id, name: regattaName(c.hash ?? c.name), hash: c.hash, standings };
  });
  // Every race with status and time; future ones (Louis Vuitton Cup, the Match) appear when scheduled
  let races = [];
  if (cup?.url) {
    const feed = await get(`${BASE}${cup.url}`, { browser: true, json: true });
    races = feed.map(m => ({
      id: m.id, regatta: regattas.find(r => r.id === m.class)?.name ?? m.class, name: m.match_name, status: m.match_status_text,
      start: local(m.datetime), teams: (m.teams ?? []).map(t => ({ team: teams[t.id_teams]?.name ?? String(t.id_teams), position: t.position, points: t.points })).sort((a, b) => (a.position ?? 99) - (b.position ?? 99)),
    }));
  }
  return { updated: new Date().toISOString(), edition: cup?.name ?? "America's Cup", regattas, races };
}
