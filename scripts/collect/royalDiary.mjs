// The official record, read from royal.uk:
// - the Royal Diary: engagements announced up to eight weeks ahead, for every working royal
// - the Court Circular: what each of them actually did, day by day
// royal.uk sits behind a Cloudflare check that blocks scripts, so the pages are read through the
// free reader r.jina.ai (a browser that returns the page as Markdown). One pass per refresh.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UA, iso, zoned } from './lib.mjs';
import { PEOPLE, peopleIn } from './royalPeople.mjs';

const LONDON = 'Europe/London';
const HERE = dirname(fileURLToPath(import.meta.url));
const GEO_FILE = join(HERE, '../../public/data/royal-geo.json');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- Reading royal.uk ----------
async function read(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`https://r.jina.ai/${url}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(90e3) });
      if (res.ok) return await res.text();
      if (res.status !== 429 && res.status < 500) throw new Error(`${res.status} ${url}`);
    } catch (err) { if (i === tries - 1) throw err; }
    await sleep(4000 * (i + 1));
  }
  throw new Error(`gave up on ${url}`);
}

const DATE_LINE = /^(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (20\d\d)$/;
const body = md => {
  const from = md.indexOf('Search our online database') >= 0 ? md.indexOf('Search our online database') : md.indexOf('Search Court Circulars');
  const to = md.indexOf('#### Pagination');
  return md.slice(from < 0 ? 0 : from, to < 0 ? undefined : to).split('\n').map(l => l.trim());
};
const day = m => ({ y: +m[3], m: MONTHS.indexOf(m[2]) + 1, d: +m[1] });
const key = d => `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;

/** Diary page: "date / ## who / engagement" blocks (a joint entry has two headings). */
export function parseDiary(md) {
  const out = [];
  let date = null, who = [];
  for (const l of body(md)) {
    const dm = l.match(DATE_LINE);
    if (dm) { date = day(dm); who = []; continue; }
    if (!date || !l) continue;
    if (l.startsWith('## ')) { who.push(...l.slice(3).split(/(?=The (?:Duke|Duchess|Prince|Princess|King|Queen)\b)/).map(s => s.trim()).filter(Boolean)); continue; }
    if (l.startsWith('#') || l.startsWith('*') || l.startsWith('!') || l.startsWith('[')) continue;
    if (who.length) out.push({ date, who, text: l });
    who = [];
  }
  return out;
}

/** Court Circular page: "date / ## residence / paragraphs"; the person is named in each paragraph. */
export function parseCourt(md) {
  const out = [];
  let date = null, residence = '';
  for (const l of body(md)) {
    const dm = l.match(DATE_LINE);
    if (dm) { date = day(dm); continue; }
    if (!date || !l) continue;
    if (l.startsWith('## ')) { residence = l.slice(3); continue; }
    if (l.startsWith('#') || l.startsWith('*') || l.startsWith('!') || l.startsWith('[') || /^The Court Circular is/.test(l)) continue;
    out.push({ date, residence, text: l });
  }
  return out;
}

// ---------- Turning sentences into events ----------
const titleCase = s => s.charAt(0).toUpperCase() + s.slice(1);
const tidy = s => s.replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim();

const PAST = /\b(?:visited|attended|opened|received|held|met|presented|unveiled|launched|toured|addressed|hosted|joined|participated|arrived|viewed|watched|laid|planted|named|dedicated|inspected|reviewed|rode|travelled|flew|sailed|signed|gave|took part|spoke|planted|officially|conferred|undertook)\b/;

/** "Patron, X, will visit Y, Street, Town." (or "..., this morning visited Y, Town, and was received by ...") -> { role, action, rest } */
function split(text, past) {
  const t = tidy(text).replace(/,? and (?:was|were) received by.*$/i, '').replace(/,? and (?:subsequently|later|then) .*$/i, '').replace(/,? (?:accompanied|escorted) by.*$/i, '');
  const m = past
    ? t.match(/^(.*?),?\s*\b(?:this (?:morning|afternoon|evening)|later|subsequently|earlier)\b,?\s*(.+)$/i) ?? (() => { const i = t.search(PAST); return i > 0 ? [t, t.slice(0, i).replace(/[,\s]+$/, ''), t.slice(i)] : null; })()
    : t.match(/^(.*?),?\s*\bwill\s+(.+)$/i);
  const role = m ? m[1].replace(/^(?:The |Her |His )?(?:King|Queen|Prince|Princess|Duke|Duchess|Majesty|Royal Highness)[^,]*?(?:,\s*)/i, '') : '';
  const rest = (m ? m[2] : t).split(',').map(x => x.trim()).filter(Boolean);
  return { role: tidy(role), action: rest[0] ?? '', rest: rest.slice(1).filter(x => !/^(?:to|in celebration|in honour|and|with|accompanied|which|where|for|as)\b/i.test(x)) };
}

/** Candidate search strings for a venue, most specific first. */
function venueQueries(action, rest) {
  const cleaned = rest.map(x => x.replace(/^and\s+(?:was|were)\s+received by.*$/i, '').replace(/\band (?:subsequently|later)\b.*$/i, '').replace(/\(.*?\)/g, '').trim()).filter(Boolean)
    .filter(x => !/^(?:and|was|were|received|accompanied|with)\b/i.test(x) && !/Lord[- ]Lieutenant|Lieutenancy|High Sheriff/i.test(x));
  const a = action.replace(/\(.*?\)/g, '');
  const at = a.match(/\bat (?:the )?([^,]+)$/i) ?? a.match(/\bin (?:the )?([A-Z][^,]+)$/);
  const visit = /^(?:visit(?:ed)?|tour(?:ed)?|open(?:ed)?|unveil|launch|officially open)/i.test(a) ? a.replace(/^\w+(?:ly)?\s+(?:open\s+)?(?:to\s+)?(?:the\s+)?/i, '').replace(/\s+(?:to|in celebration|in honour|and)\b.*$/i, '') : '';
  const name = (at ? at[1] : visit).replace(/^the /i, '').trim();
  const q = [];
  if (name && cleaned.length) q.push([`${name}, ${cleaned.join(', ')}`, true]);
  if (name && cleaned.length) q.push([`${name}, ${cleaned[cleaned.length - 1]}`, true]);
  if (name && !cleaned.length) q.push([name, true]);
  if (cleaned.length > 1) q.push([cleaned.join(', '), true]);
  if (cleaned.length) q.push([cleaned.slice(-2).join(', '), false], [cleaned[cleaned.length - 1], false]);
  return [...new Map(q).entries()].map(([query, precise]) => ({ query, precise }));
}

// ---------- Geocoding (OpenStreetMap Nominatim, 1 request a second, answers cached in the repo) ----------
const KNOWN = [
  [/Buckingham Palace/i, [-0.1419, 51.5014]], [/Windsor Castle|Frogmore/i, [-0.6044, 51.4839]], [/Kensington Palace/i, [-0.1877, 51.5058]],
  [/St\.? James's Palace|Clarence House/i, [-0.1386, 51.5046]], [/Palace of Holyroodhouse|Holyroodhouse/i, [-3.1717, 55.9527]],
];
let geo = {};
let budget = Number(process.env.GEO_BUDGET ?? 60);
let geoDirty = false;
let geoLoaded = false;
let lastCall = 0;

async function geocode(query) {
  if (query in geo) return geo[query] || null;
  if (budget <= 0) return null;
  budget--;
  const wait = 1100 - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  try {
    const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=gb,ie,im,je,gg&q=${encodeURIComponent(query)}`;
    const res = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20e3) });
    if (!res.ok) return null;
    const j = await res.json();
    geo[query] = j[0] ? [+(+j[0].lon).toFixed(4), +(+j[0].lat).toFixed(4)] : 0;
    geoDirty = true;
    return geo[query] || null;
  } catch { return null; }
}

const TRIP = /\b(?:visit|in|to)\s+((?:the\s+)?[A-Z][A-Za-z.&'’ -]{2,40}?)\s*$/;

/** A trip abroad names a country and nothing else: "Visit Finland", "... Summit in Antigua & Barbuda". */
async function country(action, rest) {
  if (rest.length) return null;
  const m = action.match(TRIP);
  return m ? countryLoc(m[1]) : null;
}

/** Centre of a country by name (cached): the pin for trips abroad. */
export async function countryLoc(raw) {
  await loadGeo();
  const name = raw.replace(/&/g, 'and').replace(/^the /i, '');
  const q = `country:${name}`;
  if (q in geo) return geo[q] ? { loc: geo[q], precise: false } : null;
  if (budget <= 0) return null;
  budget--;
  const wait = 1100 - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&featureType=country&q=${encodeURIComponent(name)}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20e3) });
    const j = res.ok ? await res.json() : [];
    geo[q] = j[0] && j[0].category === 'boundary' ? [+(+j[0].lon).toFixed(3), +(+j[0].lat).toFixed(3)] : 0;
    geoDirty = true;
    return geo[q] ? { loc: geo[q], precise: false } : null;
  } catch { return null; }
}

async function locate(text, action, rest) {
  for (const [re, loc] of KNOWN) if (re.test(`${action} ${rest.join(' ')}`)) return { loc, precise: true };
  const abroad = await country(action, rest);
  if (abroad) return abroad;
  for (const { query, precise } of venueQueries(action, rest)) {
    const loc = await geocode(query);
    if (loc) return { loc, precise };
  }
  return null;
}

export async function loadGeo() {
  if (geoLoaded) return;
  geoLoaded = true;
  try { geo = JSON.parse(await readFile(GEO_FILE, 'utf8')); } catch { geo = {}; }
}
export async function saveGeo() {
  if (geoDirty) await writeFile(GEO_FILE, JSON.stringify(Object.fromEntries(Object.entries(geo).sort(([a], [b]) => a.localeCompare(b)))));
  geoDirty = false;
}

const jitter = (loc, seed) => {
  // Several engagements in one place sit side by side instead of on top of each other
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  return [+(loc[0] + ((h % 7) - 3) * 0.0009).toFixed(4), +(loc[1] + (((h >> 3) % 7) - 3) * 0.0006).toFixed(4)];
};
const hash = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };
const PRIMARY = ['king', 'william', 'catherine'];

export async function collectDiary() {
  await loadGeo();
  budget = Number(process.env.GEO_BUDGET ?? 60);
  const events = [];
  for (let page = 0; page < 14; page++) {
    const md = await read(`https://www.royal.uk/media-centre/future-engagements?page=${page}`);
    const rows = parseDiary(md);
    if (!rows.length) break;
    for (const r of rows) {
      const people = [...new Set(r.who.flatMap(w => peopleIn(w)))];
      if (!people.length) continue;
      const { role, action, rest } = split(r.text, false);
      const start = zoned(r.date.y, r.date.m, r.date.d, 10, 0, LONDON);
      const where = await locate(r.text, action, rest);
      const names = people.map(id => PEOPLE.find(p => p.id === id).title);
      const id = `royal:diary:${key(r.date)}:${people.join('+')}:${hash(r.text)}`;
      events.push({
        id, passion: 'royal', kind: 'engagement', who: names.join(' & '), people,
        title: titleCase(action), role, detail: tidy(r.text), place: rest.slice(-2).join(', ') || undefined,
        start: iso(start), approxTime: true, dayOnly: true, weight: people.some(p => PRIMARY.includes(p)) ? 2 : 1,
        ...(where ? { loc: jitter(where.loc, id), locPrecise: where.precise } : {}),
        link: 'https://www.royal.uk/media-centre/future-engagements', source: 'The Royal Diary (royal.uk)',
      });
    }
    await sleep(2500);
  }
  await saveGeo();
  return events;
}

const WHEN = { morning: 10, afternoon: 14, evening: 19 };

export async function collectCircular({ pages = 6 } = {}) {
  await loadGeo();
  budget = Number(process.env.GEO_BUDGET ?? 60);
  const done = [];
  const stays = [];
  for (let page = 0; page < pages; page++) {
    const rows = parseCourt(await read(`https://www.royal.uk/media-centre/court-circulars?page=${page}`));
    let subject = [];
    for (const r of rows) {
      const ids = peopleIn(r.text);
      const text = tidy(r.text);
      // "Her Royal Highness, Patron, ..." continues the previous paragraph's subject
      const who = ids.length ? ids : /^(?:Her|His) (?:Royal Highness|Majesty)/.test(text) ? subject : [];
      if (ids.length) subject = ids;
      // The sovereign's audiences and receptions happen where they live: the Circular's heading names that residence
      if (r.residence && ids.some(i => i === 'king' || i === 'queen') && !/\b(?:arrived|drove|travelled|flew|departed|visited|attended|opened|toured|represented)\b/i.test(text)) {
        stays.push({ people: ids.filter(i => i === 'king' || i === 'queen'), start: iso(zoned(r.date.y, r.date.m, r.date.d, 12, 0, LONDON)), residence: r.residence });
      }
      // Only what a royal did: not audiences, representation by a courtier, councils or boilerplate
      if (!who.length || /\b(?:was|were) represented\b|\bwas present\b|\bwere present\b|\bheld a Council\b|\bhad an audience\b|\bwas received by\b.*upon/i.test(text)) continue;
      if (/^The (?:King|Queen)[^,]*? (?:this )?(?:morning|afternoon|evening) (?:received|was present)/.test(text)) continue;
      const { role, action, rest } = split(text, true);
      const hour = WHEN[(text.match(/\b(morning|afternoon|evening)\b/) ?? [])[1]] ?? 12;
      const start = zoned(r.date.y, r.date.m, r.date.d, hour, 0, LONDON);
      done.push({ r, who, text, role, action, rest, start });
    }
    await sleep(2500);
  }
  const recent = [];
  for (const x of done) {
    const where = Date.now() - x.start < 21 * 86400e3 ? await locate(x.text, x.action, x.rest) : null;
    const id = `royal:cc:${key(x.r.date)}:${x.who.join('+')}:${hash(x.text)}`;
    recent.push({
      id, people: x.who, who: x.who.map(i => PEOPLE.find(p => p.id === i).title).join(' & '), start: iso(x.start),
      title: titleCase(x.action), role: x.role, detail: x.text, place: x.rest.slice(-2).join(', ') || undefined, residence: x.r.residence,
      ...(where ? { loc: jitter(where.loc, id), locPrecise: where.precise } : {}),
    });
  }
  await saveGeo();
  return { recent: recent.sort((a, b) => Date.parse(b.start) - Date.parse(a.start)), stays };
}

// ---------- Palace news with photographs ----------
const NEWS_HEAD = /^(News|Speech|Statement|Article|Press release|Feature|Video)?#+\s*\[([^\]]+)\]\((https:\/\/www\.royal\.uk\/[^)]+)\)\s*(\d{1,2} [A-Z][a-z]+ 20\d\d)?/;
const IMAGE = /^!\[(?:Image \d+:\s*)?([^\]]*)\]\((https:\/\/www\.royal\.uk\/sites\/default\/files\/[^)]+)\)/;

/** royal.uk/news: the latest stories, each with its photograph (the grid lists them first, then repeats). */
export function parseNews(md) {
  const out = [];
  let cur = null;
  for (const l of md.split('\n').map(x => x.trim())) {
    const h = l.match(NEWS_HEAD);
    if (h) {
      const dm = h[4]?.match(/(\d{1,2}) ([A-Z][a-z]+) (20\d\d)/);
      cur = { title: h[2], url: h[3], kind: h[1] ?? 'News', date: dm ? key({ y: +dm[3], m: MONTHS.indexOf(dm[2]) + 1, d: +dm[1] }) : null, image: null, alt: null };
      if (!out.some(o => o.url === cur.url)) out.push(cur); else cur = out.find(o => o.url === cur.url);
      continue;
    }
    const im = l.match(IMAGE);
    if (im && cur && !cur.image) { cur.image = im[2]; cur.alt = im[1] || null; }
  }
  return out.filter(n => n.date);
}

export async function collectNews() {
  return parseNews(await read('https://www.royal.uk/news')).slice(0, 12);
}
