// Dakar Rally from dakar.com (ASO): the stage-by-stage route of the next edition and
// the official rankings (stage and general, by category) from the JSON the rankings
// page loads. During the rally the collector refreshes them with every run.
import { decode, get, iso, zoned } from './lib.mjs';

const BASE = 'https://www.dakar.com';
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const CATEGORY = { M: 'Bikes', A: 'Cars', K: 'Classic', T: 'Trucks', Q: 'Quads', S: 'SSV', C: 'Challenger', O: 'Stock', F: 'Future Mission' };

const titleCase = s => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
const text = html => decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' | ')).replace(/\s+/g, ' ').replace(/(\s*\|\s*)+/g, ' | ');

async function route() {
  const html = await get(`${BASE}/en/overall-route`, { browser: true });
  const t = text(html);
  const table = t.slice(t.indexOf('| Stage | Date |'));
  // Lookahead on the closing bar so consecutive rows can share it
  const rows = [...table.matchAll(/\|\s*(P|\d+|-)\s*\|\s*\w+day, (\w+) (\d{1,2}), (20\d\d)\s*\|\s*([^|]+?)\s*\|\s*(?:(\d+) km\s*\|\s*(\d+) km\s*\|\s*)?([^|]+?)\s*(?=\|)/g)];
  return rows.map(m => {
    const [, num, month, day, year, places, total, special, label] = m;
    const [from, to] = places.split('>').map(s => titleCase(s.trim()));
    const rest = /rest/i.test(label) || num === '-';
    // Stages start early in the morning; ASO does not publish a single start time, so this is approximate
    const start = zoned(Number(year), MONTHS.indexOf(month.toLowerCase()) + 1, Number(day), rest ? 12 : 7, 30, 'Asia/Riyadh');
    return { num: num === 'P' ? 0 : rest ? null : Number(num), label: rest ? 'Rest day' : label.trim(), date: iso(start), from, to: to ?? from, totalKm: total ? Number(total) : null, specialKm: special ? Number(special) : null, rest };
  });
}

const hms = ms => {
  if (ms == null || ms === '') return '';
  const s = Math.round(Number(ms) / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return `${h ? h + 'h ' : ''}${String(m).padStart(2, '0')}' ${String(s % 60).padStart(2, '0')}"`;
};

function rankingRows(j) {
  const byCat = {};
  for (const r of j.rankings ?? []) {
    const cat = r.rankingType?.stage?.category?.label ?? r.vehicle?.categoryClazz?.categoryGroup?.category?.label ?? '?';
    const crew = (r.vehicle?.competitors ?? []).map(c => c.rider ?? c.driver ?? c.person).filter(Boolean)
      .map(p => `${p.firstname?.[0] ?? ''}${p.firstname ? '. ' : ''}${titleCase(p.lastname ?? '')}`);
    const nat = (r.vehicle?.competitors?.[0]?.rider ?? r.vehicle?.competitors?.[0]?.driver)?.nationality?.code?.toUpperCase() ?? '';
    (byCat[cat] ??= []).push({ pos: r.position, bib: r.vehicle?.bib, crew, nation: nat, team: r.vehicle?.team?.name ?? '', time: hms(r.absolute), gap: r.relative ? `+${hms(r.relative)}` : '', penalty: r.penality ? hms(r.penality) : '' });
  }
  return Object.fromEntries(Object.entries(byCat).map(([k, v]) => [CATEGORY[k] ?? k, v.sort((a, b) => a.pos - b.pos).slice(0, 10)]));
}

async function rankings() {
  const html = await get(`${BASE}/en/rankings`, { browser: true });
  const cg = html.match(/data-ranking-cg-url="([^"]+)"/)?.[1], ce = html.match(/data-ranking-ce-url="([^"]+)"/)?.[1];
  if (!cg || !ce) return null;
  const stage = Number(cg.match(/rankingsearch\/cg\/(\d+)/)?.[1]);
  const edition = Number(html.match(/(20\d\d) Rankings/i)?.[1] ?? html.match(/Dakar (20\d\d)/)?.[1]) || null;
  const [general, stageRank] = await Promise.all([get(`${BASE}${cg}`, { json: true, browser: true }), get(`${BASE}${ce}`, { json: true, browser: true })]);
  return { edition, stage, general: rankingRows(general), stageRanking: rankingRows(stageRank) };
}

export async function collectDakar() {
  const [stages, ranks] = await Promise.all([route().catch(() => []), rankings().catch(() => null)]);
  const edition = stages[0] ? new Date(stages[0].date).getUTCFullYear() : null;
  return { updated: new Date().toISOString(), edition, stages, rankings: ranks };
}
