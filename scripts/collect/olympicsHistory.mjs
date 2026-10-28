// Olympic history (Wikipedia, read once a week): Italy's medals at every Games and by sport,
// summer and winter, and the all-time medal table of every nation.
import { readFile } from 'node:fs/promises';
import { wikitext } from './lib.mjs';

const n = s => Number(String(s ?? '').replace(/'''|<[^>]+>|\{\{[^}]*\}\}|[^\d]/g, '')) || 0;

function gamesRows(w, season) {
  const i = w.indexOf(`=== Medals by ${season === 'summer' ? 'Summer' : 'Winter'} Games ===`);
  const block = w.slice(i, w.indexOf('\n}}', i));
  const rows = {};
  // "| row14_games = {{GamesName|SOG|1960}} | row14_athletes = 280 | …": the games value holds pipes itself
  for (const m of block.matchAll(/row(\d+)_games\s*=\s*\{\{GamesName\|\w+\|(\d{4})/g)) (rows[m[1]] ??= {}).year = +m[2];
  for (const m of block.matchAll(/row(\d+)_(athletes|gold|silver|bronze|rank|host)\s*=\s*([^|\n]*)/g)) {
    const r = (rows[m[1]] ??= {});
    if (m[2] === 'host') r.host = /yes/i.test(m[3]); else r[m[2]] = n(m[3]);
  }
  return Object.values(rows).filter(r => r.year && r.athletes != null).map(r => ({ year: r.year, athletes: r.athletes, gold: r.gold ?? 0, silver: r.silver ?? 0, bronze: r.bronze ?? 0, rank: r.rank || null, host: !!r.host })).sort((a, b) => a.year - b.year);
}

function sportRows(w, season) {
  const i = w.indexOf(`=== Medals by ${season} sport ===`);
  const table = w.slice(w.indexOf('{|', i), w.indexOf('\n|}', i));
  return table.split(/\n\|-[^\n]*/).slice(1).map(r => {
    const sport = r.match(/\{\{GamesSport\|([^|}]+)/)?.[1];
    const c = r.split('||').map(x => x.trim());
    return sport && c.length >= 5 ? { sport, gold: n(c[1]), silver: n(c[2]), bronze: n(c[3]), total: n(c[4]) } : null;
  }).filter(Boolean);
}

function allTime(w) {
  const i = w.indexOf('==List of NOCs with medals');
  const table = w.slice(w.indexOf('{|', i), w.indexOf('\n|}', i));
  const out = [];
  for (const r of table.split(/\n\|-[^\n]*/).slice(1)) {
    const code = r.match(/\{\{flag ?IOC\|([A-Z]{3})/)?.[1];
    if (!code) continue;
    const lines = r.split('\n').filter(l => /^\|(?!align)/.test(l)).map(l => l.slice(1).split('||').map(x => n(x.replace(/^[^|]*\|/, ''))));
    if (lines.length < 3) continue;
    const [s, wi, t] = lines;
    out.push({ code, summer: { games: s[0], gold: s[1], silver: s[2], bronze: s[3], total: s[4] }, winter: { games: wi[0], gold: wi[1], silver: wi[2], bronze: wi[3], total: wi[4] }, total: { gold: t[1], silver: t[2], bronze: t[3], total: t[4] } });
  }
  return out;
}

export async function collectOlympicsHistory() {
  let prev = null;
  try { prev = JSON.parse(await readFile(new URL('../../public/data/olympics-history.json', import.meta.url), 'utf8')); } catch { /* first run */ }
  if (prev?.italy?.summer?.length && Date.now() - Date.parse(prev.updated) < 7 * 86400e3) return prev;
  const [it, at] = await Promise.all([wikitext('Italy at the Olympics'), wikitext('All-time Olympic Games medal table')]);
  return {
    updated: new Date().toISOString(),
    italy: it ? { summer: gamesRows(it, 'summer'), winter: gamesRows(it, 'winter'), summerSports: sportRows(it, 'summer'), winterSports: sportRows(it, 'winter') } : prev?.italy ?? null,
    allTime: at ? allTime(at) : prev?.allTime ?? [],
  };
}
