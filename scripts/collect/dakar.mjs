// Dakar Rally from dakar.com (ASO): the stage-by-stage route of the next edition and
// the official rankings (stage and general, by category) from the JSON the rankings
// page loads. During the rally the collector refreshes them with every run.
import { readFile } from 'node:fs/promises';
import { decode, get, iso, zoned } from './lib.mjs';

const BASE = 'https://www.dakar.com';
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const CATEGORY = { M: 'Bikes', A: 'Cars', K: 'Classic', T: 'Trucks', Q: 'Quads', S: 'SSV', C: 'Challenger', O: 'Stock', F: 'Future Mission' };

/**
 * Bivouacs and stage towns: [longitude, latitude], country (as named by world-atlas) and time zone.
 * The route changes every edition: add the new towns here (unknown ones get no map dot and the
 * time zone of the previous stop).
 */
const PLACES = {
  'Loulé': [-8.02, 37.14, 'Portugal', 'Europe/Lisbon'], 'Bouârfa': [-1.96, 32.53, 'Morocco', 'Africa/Casablanca'],
  'Zagora': [-5.84, 30.33, 'Morocco', 'Africa/Casablanca'], 'Agadir': [-9.6, 30.42, 'Morocco', 'Africa/Casablanca'],
  'Smara': [-11.67, 26.74, 'W. Sahara', 'Africa/Casablanca'],
  // The 2027 marathon refuge, where the official route map draws it
  'Refuge': [-14.47, 25.75, 'W. Sahara', 'Africa/Casablanca'], 'Marrakech': [-7.99, 31.63, 'Morocco', 'Africa/Casablanca'],
  // Saudi editions (2020–2026)
  'King Abdullah Economic City': [39.1, 22.45, 'Saudi Arabia', 'Asia/Riyadh'], 'Yanbu': [38.06, 24.09, 'Saudi Arabia', 'Asia/Riyadh'],
  'Alula': [37.92, 26.61, 'Saudi Arabia', 'Asia/Riyadh'], 'Hail': [41.69, 27.52, 'Saudi Arabia', 'Asia/Riyadh'],
  'Al Duwadimi': [44.39, 24.5, 'Saudi Arabia', 'Asia/Riyadh'], 'Bisha': [42.61, 19.99, 'Saudi Arabia', 'Asia/Riyadh'],
  'Wadi Ad-Dawasir': [45.2, 20.49, 'Saudi Arabia', 'Asia/Riyadh'], 'Riyadh': [46.72, 24.71, 'Saudi Arabia', 'Asia/Riyadh'],
  'Shubaytah': [53.9, 22.7, 'Saudi Arabia', 'Asia/Riyadh'], 'Yanbu Marathon': [38.06, 24.09, 'Saudi Arabia', 'Asia/Riyadh'],
};

/** The organiser's capitals drop some accents */
const SPELLING = { Loule: 'Loulé' };
const titleCase = s => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
const text = html => decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' | ')).replace(/\s+/g, ' ').replace(/(\s*\|\s*)+/g, ' | ');

async function route() {
  const html = await get(`${BASE}/en/overall-route`, { browser: true });
  const t = text(html);
  const table = t.slice(t.indexOf('| Stage | Date |'));
  // Lookahead on the closing bar so consecutive rows can share it. P: prologue, T: transfer, R: rest day
  const rows = [...table.matchAll(/\|\s*(P|T|R|\d+|-)\s*\|\s*\w+day, (\w+) (\d{1,2}), (20\d\d)\s*\|\s*([^|]+?)\s*\|\s*(?:(\d+) km\s*\|\s*(\d+) km\s*\|\s*)?([^|]+?)\s*(?=\|)/g)];
  let tz = 'UTC';
  return rows.map(m => {
    const [, num, month, day, year, places, total, special, label] = m;
    const [from, to = from] = places.split('>').map(s => { const t = titleCase(s.trim()); return SPELLING[t] ?? t; });
    const rest = /rest/i.test(label) || num === 'R' || num === '-';
    const transfer = !rest && (/transfer/i.test(label) || num === 'T');
    const a = PLACES[from], b = PLACES[to];
    tz = a?.[3] ?? tz;
    // Stages start early in the morning; ASO does not publish a single start time, so this is approximate
    const start = zoned(Number(year), MONTHS.indexOf(month.toLowerCase()) + 1, Number(day), rest || transfer ? 12 : 7, 30, tz);
    return {
      num: num === 'P' ? 0 : rest || transfer ? null : Number(num), label: rest ? 'Rest day' : transfer ? 'Transfer' : label.trim(), date: iso(start), from, to,
      fromLoc: a ? [a[0], a[1]] : null, toLoc: b ? [b[0], b[1]] : null, totalKm: total ? Number(total) : null, specialKm: special ? Number(special) : null, rest, ...(transfer && { transfer }),
    };
  });
}

const hms = ms => {
  if (ms == null || ms === '') return '';
  const s = Math.round(Number(ms) / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return `${h ? h + 'h ' : ''}${String(m).padStart(2, '0')}' ${String(s % 60).padStart(2, '0')}"`;
};

/** The organiser lumps cars, Stock, Challenger, SSV and trucks into one list (A); its groups split them. */
const GROUP = { T1: 'Cars', T2: 'Stock', T3: 'Challenger', T4: 'SSV', T5: 'Trucks' };
const catOf = r => {
  const c = r.rankingType?.stage?.category?.label ?? r.vehicle?.categoryClazz?.categoryGroup?.category?.label ?? '?';
  const g = r.vehicle?.categoryClazz?.categoryGroup?.label;
  return c === 'A' && GROUP[g] ? GROUP[g] : CATEGORY[c] ?? c;
};
const crewOf = r => (r.vehicle?.competitors ?? []).map(c => c.rider ?? c.driver ?? c.person).filter(Boolean)
  .map(p => `${p.firstname?.[0] ?? ''}${p.firstname ? '. ' : ''}${titleCase(p.lastname ?? '')}`);
const nationOf = r => (r.vehicle?.competitors?.[0]?.rider ?? r.vehicle?.competitors?.[0]?.driver)?.nationality?.code?.toUpperCase() ?? '';
const ms = r => (r.absolute == null || r.absolute === '' ? null : Number(r.absolute));

/** Every classified vehicle of a ranking, by category, in order. */
function byCategory(j) {
  const out = {};
  for (const r of j.rankings ?? []) (out[catOf(r)] ??= []).push(r);
  for (const v of Object.values(out)) v.sort((a, b) => a.position - b.position);
  return out;
}

/** The first ten of each category, positions and gaps counted within the category. */
function rankingRows(cats) {
  return Object.fromEntries(Object.entries(cats).map(([k, list]) => {
    const lead = ms(list[0]);
    return [k, list.slice(0, 10).map((r, i) => {
      const gap = lead != null && ms(r) != null ? ms(r) - lead : 0;
      return { pos: i + 1, bib: r.vehicle?.bib, crew: crewOf(r), nation: nationOf(r), team: r.vehicle?.team?.name ?? '', time: hms(r.absolute), gap: gap > 0 ? `+${hms(gap)}` : '', penalty: r.penality ? hms(r.penality) : '' };
    })];
  }));
}

const fetchRanking = async page => {
  const html = await get(`${BASE}${page}`, { browser: true });
  const cg = html.match(/data-ranking-cg-url="([^"]+)"/)?.[1], ce = html.match(/data-ranking-ce-url="([^"]+)"/)?.[1];
  if (!cg || !ce) return null;
  const [g, e] = await Promise.all([get(`${BASE}${cg}`, { json: true, browser: true }), get(`${BASE}${ce}`, { json: true, browser: true })]);
  return { html, stage: Number(cg.match(/rankingsearch\/cg\/(\d+)/)?.[1]), general: byCategory(g), stage_: byCategory(e) };
};

/**
 * The rally stage after stage, per category: the general's first 15 (bib, total time in ms), the
 * stage's first three, and how many are still classified. Earlier stages are kept from the last
 * run (only the last two are read again, for late penalties).
 */
async function evolution(upTo, prev) {
  const done = new Map((prev?.stages ?? []).filter(x => x.stage < upTo - 1).map(x => [x.stage, x]));
  const bibs = { ...(prev?.bibs ?? {}) };
  const stages = [];
  for (let s = 0; s <= upTo; s++) {
    if (done.has(s)) { stages.push(done.get(s)); continue; }
    const r = await fetchRanking(`/en/rankings/stage-${s}/bike`).catch(() => null);
    if (!r) continue;
    const cats = {};
    for (const [k, list] of Object.entries(r.general)) {
      const pod = r.stage_[k] ?? [];
      for (const x of [...list.slice(0, 15), ...pod.slice(0, 3)]) bibs[`${k}:${x.vehicle?.bib}`] ??= [crewOf(x).join(' / '), nationOf(x), x.vehicle?.team?.name ?? ''];
      cats[k] = { n: list.length, top: list.slice(0, 15).map(x => [x.vehicle?.bib, ms(x)]), podium: pod.slice(0, 3).map(x => [x.vehicle?.bib, ms(x)]) };
    }
    stages.push({ stage: s, cats });
  }
  return { bibs, stages };
}

async function rankings(prev) {
  const now = await fetchRanking('/en/rankings');
  if (!now) return null;
  const edition = Number(now.html.match(/(20\d\d) Rankings/i)?.[1] ?? now.html.match(/Dakar (20\d\d)/)?.[1]) || null;
  const evo = await evolution(now.stage, prev?.edition === edition ? prev.evolution : null);
  return { edition, stage: now.stage, general: rankingRows(now.general), stageRanking: rankingRows(now.stage_), evolution: evo };
}

export async function collectDakar() {
  let prev = null;
  try { prev = JSON.parse(await readFile(new URL('../../public/data/dakar.json', import.meta.url), 'utf8')); } catch { /* first run */ }
  const [stages, ranks] = await Promise.all([route().catch(() => []), rankings(prev?.rankings).catch(() => prev?.rankings ?? null)]);
  const edition = stages[0] ? new Date(stages[0].date).getUTCFullYear() : null;
  // The host countries in route order (for the map and the page's summary)
  const countries = [...new Set(stages.flatMap(s => [PLACES[s.from]?.[2], PLACES[s.to]?.[2]]).filter(Boolean))];
  return { updated: new Date().toISOString(), edition, countries, stages, rankings: ranks };
}
