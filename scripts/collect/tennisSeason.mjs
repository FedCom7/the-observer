// Men's tennis beyond the next Slam: the complete men's singles draw of every Slam of the
// season (ESPN, read once each Slam is over), and the Elo ratings overall and by surface
// (Tennis Abstract, Jeff Sackmann's site, updated weekly).
import { readFile } from 'node:fs/promises';
import { decode, get } from './lib.mjs';
import { slamDraw } from './tennis.mjs';

const DATA = new URL('../../public/data/', import.meta.url);
const num = s => (s === '' || s == null ? null : Number(s));

async function elo() {
  const html = await get('https://tennisabstract.com/reports/atp_elo_ratings.html', { browser: true });
  const i = html.indexOf('<table id="reportable"');
  const table = html.slice(i, html.indexOf('</table>', i));
  const cell = s => decode(s.replace(/<[^>]+>/g, '')).replace(/ /g, ' ').trim();
  const rows = [];
  for (const tr of table.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const c = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => cell(m[1]));
    if (c.length < 16 || !Number(c[0])) continue;
    rows.push({ rank: +c[0], name: c[1], age: num(c[2]), elo: num(c[3]), hardRank: num(c[5]), hard: num(c[6]), clayRank: num(c[7]), clay: num(c[8]), grassRank: num(c[9]), grass: num(c[10]), peak: num(c[12]), peakMonth: c[13] || null, atp: num(c[15]) });
    if (rows.length >= 150) break;
  }
  return { updated: html.match(/Last update: ([\d-]+)/)?.[1] ?? null, rows };
}

export async function collectTennisSeason() {
  const now = Date.now();
  const cal = JSON.parse(await readFile(new URL('tennis.json', DATA), 'utf8'));
  let prev = null;
  try { prev = JSON.parse(await readFile(new URL('tennis-season.json', DATA), 'utf8')); } catch { /* first run */ }
  // Slams over (last day + 1): their draw never changes again, keep it
  const draws = { ...(prev?.draws ?? {}) };
  for (const s of cal.slams.filter(x => Date.parse(x.end) < now - 86400e3)) {
    const key = `${s.year}-${s.short}`;
    if (draws[key]?.matches?.length) continue;
    const d = await slamDraw(s.endDate).catch(() => null);
    if (d?.matches?.length) draws[key] = { ...d, slam: s.name, short: s.short, year: s.year, surface: s.surface, color: s.color };
  }
  const e = await elo().catch(() => prev?.elo ?? null);
  return { updated: new Date(now).toISOString(), draws, elo: e };
}
