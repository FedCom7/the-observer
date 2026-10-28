// The royal year over time: every Court Circular entry the royal collector has read, kept
// month by month in royal-cc/<YYYY-MM>.json (the Circular itself only covers recent weeks),
// classified by kind of engagement; the patronages named in it; and every overseas trip
// and state visit in Wikipedia's lists.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { parseDate, wikitext } from './lib.mjs';
import { PEOPLE } from './royalPeople.mjs';

const DATA = new URL('../../public/data/', import.meta.url);

/** What kind of engagement a Court Circular line is, from the verb it opens with ("Visited…", "Received…"). */
export function kindOf(t) {
  if (/Regiment|Colonel|Royal Navy|Royal Marines|Royal Air Force|\bRAF\b|Army|Squadron|Guards|Brigade|Commando|Battalion|military|veterans/i.test(t)) return 'Armed forces';
  if (/Investiture/i.test(t)) return 'Investiture';
  if (/^Received\b/i.test(t)) return /Ambassador|High Commissioner|credentials/i.test(t) ? 'Diplomatic audience' : 'Audience';
  if (/Privy Council|Prime Minister|Secretary of State|Minister\b|Parliament/i.test(t)) return 'State business';
  if (/^(Visited|Opened|Toured|Named|Launched|Unveiled|Officially opened)\b/i.test(t)) return 'Visit';
  if (/^Attended .*(Reception|Dinner|Luncheon|Lunch|Banquet|Gala|Tea)/i.test(t) || /^(Gave|Hosted) .*(Reception|Dinner|Luncheon|Lunch|Banquet)/i.test(t)) return 'Reception';
  if (/^Attended .*(Service|Memorial|Commemorat|Remembrance|Funeral|Wreath|Thanksgiving)/i.test(t) || /laid a wreath/i.test(t)) return 'Service or commemoration';
  if (/^(Departed|Arrived|Travelled|Flew)\b/i.test(t)) return 'Travel';
  if (/^(Held|Chaired) .*(Meeting|discussion)|^Chaired|^Met\b/i.test(t)) return 'Meeting';
  if (/^(Attended|Presented|Watched|Viewed)\b/i.test(t)) return 'Event';
  return 'Other';
}

/** "Patron, East Anglia Children's Hospices" → { title, org } */
function patronage(role) {
  const m = role?.match(/^(Royal Patron|Patron|President|Colonel-in-Chief|Colonel|Commodore-in-Chief|Air Commodore-in-Chief|Commandant-in-Chief|Captain General|Royal Colonel|Chancellor|Grand Prior|Grand Master|Chairman|Chair|Honorary Air Commodore|Royal Honorary Colonel|Commodore|Admiral|Ambassador|Founder|Vice-Patron|Royal Fellow|Master|Commander-in-Chief|Deputy Colonel-in-Chief)\b,?\s*(.*)$/i);
  if (!m) return null;
  const org = m[2].replace(/,?\s*(afterwards|this (morning|afternoon|evening)|today).*$/i, '').replace(/^the /, 'The ').trim();
  return org ? { title: m[1], org } : null;
}

const LISTS = [
  { page: 'List of state visits made by Charles III', who: 'king', kind: 'State visit' },
  { page: 'List of state visits received by Charles III', who: 'king', kind: 'State visit received' },
  { page: 'List of official overseas trips made by Charles III', who: 'king', kind: 'Overseas trip' },
  { page: 'List of official overseas trips made by William, Prince of Wales', who: 'william', kind: 'Overseas trip' },
  { page: 'List of official overseas trips made by Catherine, Princess of Wales', who: 'catherine', kind: 'Overseas trip' },
];
const clean = s => s.replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, '').replace(/\{\{nowrap\|([^}]+)\}\}/g, '$1').replace(/\{\{[^}]*\}\}/g, '').replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1').replace(/'''?/g, '').trim();
const DATE_RE = /\d{1,2}(?:\s*[–-]\s*\d{1,2})?\s+[A-Z][a-z]+(?:\s*[–-]\s*\d{1,2}\s+[A-Z][a-z]+)?\s+(19|20)\d\d/;

/** Every row of the travel lists, whatever the year. */
async function trips() {
  const out = [];
  for (const l of LISTS) {
    const w = await wikitext(l.page).catch(() => null);
    if (!w) continue;
    for (const row of w.split(/\n\|-/)) {
      const cells = row.split('\n').filter(x => x.startsWith('|')).flatMap(x => x.slice(1).split('||')).map(x => clean(x.replace(/^\s*(?:rowspan="?\d+"?\s*\|)/, '')));
      const dateCell = cells.find(c => DATE_RE.test(c));
      const flag = row.match(/\{\{flag(?:country|icon)?\|([^|}]+)/i);
      if (!dateCell || !flag) continue;
      const d = parseDate(dateCell.match(DATE_RE)[0]);
      if (!d?.y) continue;
      const country = flag[1].trim();
      const place = cells.find((c, i) => i > cells.indexOf(dateCell) && c && !c.includes(country) && c.length < 50 && !/^\d+$/.test(c) && !DATE_RE.test(c)) ?? '';
      out.push({ who: l.who, kind: l.kind, date: `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`, country, place: l.kind === 'Overseas trip' ? place.replace(/,.*$/, '') : '' });
    }
  }
  // A state visit is also in the overseas-trips list: keep it once
  const seen = new Map();
  for (const t of out.sort((a, b) => (a.kind === 'Overseas trip' ? 1 : -1) - (b.kind === 'Overseas trip' ? 1 : -1))) {
    const k = `${t.who}:${t.date}:${t.country}`;
    if (!seen.has(k)) seen.set(k, t);
  }
  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function collectRoyalArchive() {
  const royal = JSON.parse(await readFile(new URL('royal.json', DATA), 'utf8'));
  const dir = new URL('royal-cc/', DATA);
  await mkdir(dir, { recursive: true });
  // Add the latest Court Circular entries to their month
  const byMonth = {};
  for (const r of royal.recent ?? []) (byMonth[r.start.slice(0, 7)] ??= []).push(r);
  for (const [m, rs] of Object.entries(byMonth)) {
    const file = new URL(`${m}.json`, dir);
    let have = [];
    try { have = JSON.parse(await readFile(file, 'utf8')); } catch { /* new month */ }
    const ids = new Set(have.map(x => x.id));
    const add = rs.filter(r => !ids.has(r.id)).map(r => ({ id: r.id, people: r.people, start: r.start, title: r.title, role: r.role ?? null, place: r.place ?? null, loc: r.loc ?? null, kind: kindOf(r.title) }));
    if (add.length) await writeFile(file, JSON.stringify([...have, ...add].sort((a, b) => a.start.localeCompare(b.start))));
  }
  // Read the whole archive back
  const all = [];
  for (const f of (await readdir(dir)).filter(x => x.endsWith('.json')).sort()) all.push(...JSON.parse(await readFile(new URL(f, dir), 'utf8')));
  const since = all[0]?.start ?? null;
  // Per person and week, per kind, per place
  const people = PEOPLE.filter(p => p.diary).map(p => p.id);
  const weekOf = t => { const d = new Date(t); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
  const weeks = {}, kinds = {}, places = {}, patron = {}, days = {};
  for (const e of all) for (const p of e.people.filter(x => people.includes(x))) {
    const w = weekOf(e.start);
    ((weeks[p] ??= {})[w] = (weeks[p][w] ?? 0) + 1);
    ((kinds[p] ??= {})[e.kind] = (kinds[p][e.kind] ?? 0) + 1);
    const dow = (new Date(e.start).getUTCDay() + 6) % 7;
    ((days[p] ??= Array(7).fill(0))[dow]++);
    if (e.loc) (places[p] ??= []).push([round2(e.loc[0]), round2(e.loc[1])]);
    const pat = patronage(e.role);
    if (pat) { const k = `${pat.title}|${pat.org}`; ((patron[p] ??= {})[k] = (patron[p][k] ?? 0) + 1); }
  }
  return {
    updated: new Date().toISOString(), since, total: all.length,
    recent: all.slice(-400).map(e => ({ id: e.id, people: e.people, start: e.start, title: e.title, kind: e.kind, place: e.place })),
    weeks, kinds, days, places,
    patronages: Object.fromEntries(Object.entries(patron).map(([p, o]) => [p, Object.entries(o).map(([k, n]) => { const [title, org] = k.split('|'); return { title, org, n }; }).sort((a, b) => b.n - a.n)])),
    trips: await trips(),
  };
}

const round2 = v => Math.round(v * 100) / 100;
