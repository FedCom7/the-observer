// The Royal Family, automatic and without touching royal.uk (it blocks automated access):
// - State visits and official overseas trips: Wikipedia lists, which carry announced trips ahead
// - The ceremonial year: rules derived from how the fixtures are set (Easter, Ascot week, ...)
// - Extraordinary events (weddings, funerals, births): news alerts
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { get, iso, parseDate, parseFeed, wikitext, zoned } from './lib.mjs';
import { PEOPLE, SUCCESSION, familyDates } from './royalPeople.mjs';
import { collectCircular, collectDiary, collectNews, countryLoc, saveGeo } from './royalDiary.mjs';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '../../public/data/royal.json');

const Y = new Date().getUTCFullYear();
const DAY = 86400e3;
const LONDON = 'Europe/London';

// ---------- Travel (Wikipedia) ----------
const LISTS = [
  { page: 'List of state visits made by Charles III', who: 'The King', kind: 'state-visit', title: c => `The King's state visit to ${c}` },
  { page: 'List of state visits received by Charles III', who: 'The King', kind: 'state-visit-in', title: c => `State visit to the UK: ${c}` },
  { page: 'List of official overseas trips made by Charles III', who: 'The King', kind: 'trip', title: (c, p) => `The King in ${p ? p + ', ' : ''}${c}` },
  { page: 'List of official overseas trips made by William, Prince of Wales', who: 'Prince of Wales', kind: 'trip', title: (c, p) => `Prince William in ${p ? p + ', ' : ''}${c}` },
  { page: 'List of official overseas trips made by Catherine, Princess of Wales', who: 'Princess of Wales', kind: 'trip', title: (c, p) => `Princess of Wales in ${p ? p + ', ' : ''}${c}` },
];

const clean = s => s.replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, '').replace(/\{\{nowrap\|([^}]+)\}\}/g, '$1').replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1').replace(/'''?/g, '').trim();
const DATE_RE = /\d{1,2}(?:\s*[–-]\s*\d{1,2})?\s+[A-Z][a-z]+(?:\s*[–-]\s*\d{1,2}\s+[A-Z][a-z]+)?\s+20\d\d/;

async function travel() {
  const out = [];
  for (const l of LISTS) {
    const w = await wikitext(l.page).catch(() => null);
    if (!w) continue;
    for (const row of w.split(/\n\|-/)) {
      // Rows use either one cell per line or "||" separators
      const cells = row.split('\n').filter(x => x.startsWith('|')).flatMap(x => x.slice(1).split('||')).map(x => clean(x.replace(/^\s*(?:rowspan="?\d+"?\s*\|)/, '')));
      const dateCell = cells.find(c => DATE_RE.test(c));
      const flag = row.match(/\{\{flag(?:country)?\|([^|}]+)/i);
      if (!dateCell || !flag) continue;
      const d = parseDate(dateCell.match(DATE_RE)[0]);
      if (!d?.y) continue;
      const start = zoned(d.y, d.m, d.d, 10, 0, LONDON);
      if (start < Date.now() - 60 * DAY || start > Date.now() + 400 * DAY) continue;
      const country = flag[1].trim();
      const flagIdx = cells.findIndex(c => c.includes(country) || /^\s*$/.test(c));
      const place = l.kind === 'trip' ? (cells.find((c, i) => i > cells.indexOf(dateCell) && c && !c.includes(country) && c.length < 40 && !/^\d+$/.test(c)) ?? '') : '';
      out.push({
        id: `royal:${l.kind}:${d.y}-${d.m}-${d.d}:${country}`,
        passion: 'royal', who: l.who, people: [l.who === 'The King' ? 'king' : l.who === 'Prince of Wales' ? 'william' : 'catherine'], kind: l.kind,
        title: l.title(country, place.replace(/,.*$/, '')), country,
        start: iso(start), approxTime: true, weight: l.kind.startsWith('state') ? 2 : 1,
        link: `https://en.wikipedia.org/wiki/${encodeURIComponent(l.page.replace(/ /g, '_'))}`, source: 'Wikipedia',
        _flagIdx: flagIdx,
      });
    }
  }
  // A state visit also appears in the overseas-trips list: keep the state visit.
  const seen = new Map();
  for (const e of out.sort((a, b) => (a.kind.startsWith('state') ? -1 : 1))) {
    const key = `${e.start.slice(0, 10)}:${e.country}`;
    if (!seen.has(key)) { delete e._flagIdx; seen.set(key, e); }
  }
  const trips = [...seen.values()];
  // Pin each trip on its country
  for (const e of trips) {
    if (e.country === 'United Kingdom') continue;
    // Hosting a visitor: the welcome is at Windsor Castle (or in London), not in the guest's country
    if (e.kind === 'state-visit-in') { e.loc = [-0.6044, 51.4839]; e.place = 'Windsor Castle'; continue; }
    const where = await countryLoc(e.country).catch(() => null);
    if (where) { e.loc = where.loc; e.place = e.country; }
  }
  return trips;
}

// ---------- The Royal Watcher calendar (fan blog listing galas, state visits, weddings) ----------
const BRITISH = /British|United Kingdom|King Charles|Queen Camilla|Prince of Wales|Princess of Wales|Princess Royal|Duke of Edinburgh|Duchess of Edinburgh/i;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export async function royalWatcher() {
  const html = await get('https://royalwatcherblog.com/calendar/', { browser: true });
  const body = html.slice(html.indexOf('entry-content'), html.indexOf('Not every event'));
  const out = [];
  let year = Y;
  // Walk headings (month or "Later in 2026") and entries (bold title + list: who, dates, details link)
  for (const m of body.matchAll(/<h3[\s\S]*?<\/h3>|<p[^>]*>\s*<(?:strong|b)>([^<]+)<\/(?:strong|b)>\s*<\/p>\s*<ul[^>]*>([\s\S]*?)<\/ul>/g)) {
    if (m[0].startsWith('<h3')) { const y = m[0].match(/20\d\d/); if (y) year = Number(y[0]); continue; }
    const title = m[1].replace(/\*$/, '').replace(/&#8217;/g, "'").trim();
    const items = [...m[2].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(x => x[1]);
    const who = (items[0] ?? '').replace(/<[^>]+>/g, '').trim();
    const dates = (items[1] ?? '').replace(/<[^>]+>/g, '').trim();
    const link = (m[2].match(/href="([^"]+)"/) ?? [])[1];
    if (!BRITISH.test(`${title} ${who}`) || /delayed|postponed|cancel/i.test(dates)) continue;
    const dm = dates.match(new RegExp(`(${MONTHS.join('|')})\\s+(\\d{1,2})`));
    if (!dm) continue;
    const start = zoned(year, MONTHS.indexOf(dm[1]) + 1, Number(dm[2]), 10, 0, LONDON);
    if (start < Date.now() - 2 * DAY) continue;
    out.push({ id: `royal:rw:${title}`, passion: 'royal', who: 'The Royal Family', kind: /state visit/i.test(title) ? (/to the United Kingdom/i.test(title) ? 'state-visit-in' : 'state-visit') : 'ceremony',
      title: `${title}${/tiara/i.test(html) && m[1].includes('*') ? ' (white tie)' : ''}`, start: iso(start), approxTime: true, weight: 2, link, source: 'The Royal Watcher calendar' });
  }
  return out;
}

// ---------- The ceremonial year (rules) ----------
const nthWeekday = (y, m, weekday, n) => 1 + ((weekday - new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 7) % 7) + (n - 1) * 7;

/** Easter Sunday (Anonymous Gregorian algorithm). */
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}

const at = (date, hh, mm) => zoned(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), hh, mm, LONDON);
const addDays = (date, n) => new Date(date.getTime() + n * DAY);

function ceremonies() {
  const out = [];
  const add = (id, title, date, hh, mm, extra = {}) => out.push({ id: `royal:rule:${id}:${date.getUTCFullYear()}`, passion: 'royal', who: 'The Royal Family', kind: 'ceremony', title, start: iso(at(date, hh, mm)), weight: 2, ...extra });
  for (const y of [Y, Y + 1]) {
    const e = easter(y);
    add('commonwealth', 'Commonwealth Day service, Westminster Abbey', new Date(Date.UTC(y, 2, nthWeekday(y, 3, 1, 2))), 15, 0, { approxTime: true, weight: 1, place: 'Westminster Abbey', loc: [-0.127, 51.499], source: 'Rule: second Monday of March' });
    add('maundy', 'Royal Maundy service', addDays(e, -3), 11, 0, { approxTime: true, source: 'Rule: Thursday before Easter' });
    add('easter', 'Easter Sunday service, St George\'s Chapel, Windsor', e, 11, 0, { approxTime: true, weight: 1, place: 'Windsor Castle', loc: [-0.604, 51.484], source: 'Rule: Easter Sunday' });
    // Royal Ascot ends on the first Saturday on or after 18 June; Trooping is the Saturday before, Garter Day the Monday of Ascot week.
    const june18 = new Date(Date.UTC(y, 5, 18));
    const ascotSat = addDays(june18, (6 - june18.getUTCDay() + 7) % 7);
    add('trooping', 'Trooping the Colour (the King\'s Birthday Parade)', addDays(ascotSat, -7), 11, 0, { weight: 3, approxTime: true, tbc: true, place: 'Horse Guards Parade, London', loc: [-0.128, 51.504], source: 'Rule: Saturday before Royal Ascot (to be confirmed)' });
    add('garter', 'Order of the Garter service, Windsor', addDays(ascotSat, -5), 14, 30, { approxTime: true, tbc: true, place: 'Windsor Castle', loc: [-0.604, 51.484], source: 'Rule: Monday of Royal Ascot week' });
    add('ascot', 'Royal Ascot opens · royal procession', addDays(ascotSat, -4), 14, 0, { approxTime: true, tbc: true, place: 'Ascot Racecourse', loc: [-0.673, 51.411], source: 'Rule: Tuesday to Saturday ending the first Saturday from 18 June' });
    add('braemar', 'Braemar Gathering', new Date(Date.UTC(y, 8, nthWeekday(y, 9, 6, 1))), 14, 0, { approxTime: true, weight: 1, place: 'Braemar, Aberdeenshire', loc: [-3.39, 57.0], source: 'Rule: first Saturday of September' });
    const remembrance = new Date(Date.UTC(y, 10, nthWeekday(y, 11, 0, 2)));
    add('festival', 'Festival of Remembrance, Royal Albert Hall', addDays(remembrance, -1), 19, 0, { approxTime: true, weight: 1, place: 'Royal Albert Hall', loc: [-0.177, 51.501], source: 'Rule: Saturday before Remembrance Sunday' });
    add('remembrance', 'Remembrance Sunday at the Cenotaph', remembrance, 11, 0, { weight: 3, place: 'Whitehall, London', loc: [-0.126, 51.502], source: 'Rule: second Sunday of November, two minutes\' silence at 11:00' });
    add('sandringham', 'Christmas Day service at Sandringham', new Date(Date.UTC(y, 11, 25)), 10, 45, { approxTime: true, weight: 1, place: 'Sandringham, Norfolk', loc: [0.51, 52.83], source: 'Rule: 25 December' });
    add('christmas', 'The King\'s Christmas broadcast', new Date(Date.UTC(y, 11, 25)), 15, 0, { weight: 3, place: 'London', loc: [-0.14, 51.5], source: 'Rule: 25 December, 15:00 UK' });
  }
  return out.filter(e => Date.parse(e.start) > Date.now() - 2 * DAY);
}

// ---------- Extraordinary events (news alerts) ----------
// Only real announcements about the British royal family: an event word plus a senior royal's name.
const ALERTS = /\b(announce[sd]?|confirm(?:s|ed)?|to marry|will marry|are engaged|is engaged|announce\w* (?:their |his |her )?engagement|has died|dies aged|died|funeral (?:will|to be|date)|state funeral|lying in state|gives birth|has given birth|is born|welcomes? (?:a )?baby|christening will|abdicat)/i;
const SENIOR = /\b(King Charles|the King|Queen Camilla|Prince William|Princess of Wales|Kate|Catherine|Prince George|Princess Charlotte|Prince Louis|Prince Harry|Meghan|Duchess of Sussex|Princess Anne|Princess Royal|Prince Edward|Duke of Edinburgh|Duchess of Edinburgh|Beatrice|Eugenie|Zara Tindall|Peter Phillips|Lady Louise|Duke of Kent|Duke of Gloucester)\b/;
const GOSSIP = /\b(revisit|throwback|anniversary|years ago|look back|remember|rehearsal|R-rating|movie|film|series)\b/i;

async function alerts() {
  const q = encodeURIComponent('(royal OR king OR prince OR princess) (wedding OR funeral OR engaged OR "royal baby" OR christening OR coronation OR "state funeral") when:7d');
  const xml = await get(`https://news.google.com/rss/search?q=${q}&hl=en-GB&gl=GB&ceid=GB:en`, { browser: true });
  return parseFeed(xml)
    .filter(i => ALERTS.test(i.title) && SENIOR.test(i.title) && !GOSSIP.test(i.title))
    .slice(0, 8)
    .map(i => ({ title: i.title.replace(/\s[-–—]\s[^-–—]+$/, ''), source: (i.title.match(/\s[-–—]\s([^-–—]+)$/) ?? [])[1] ?? 'Google News', time: new Date(i.time).toISOString(), url: i.link }));
}

/** Engagements announced in the press ("Princess Anne set to visit ... later this month"): no exact time, but early notice. */
const UPCOMING = /\b(set to (?:visit|attend|open|meet|host|tour)|will (?:visit|attend|open|meet|host|tour)|to (?:visit|attend|open|tour) .* (?:next|this|later this) (?:week|month)|is due to (?:visit|attend|open))\b/i;

async function pressAnnouncements() {
  const q = encodeURIComponent('("set to visit" OR "will visit" OR "will attend" OR "set to attend" OR "will open" OR "due to visit") (King OR Queen OR Prince OR Princess OR Duke OR Duchess) when:14d');
  const xml = await get(`https://news.google.com/rss/search?q=${q}&hl=en-GB&gl=GB&ceid=GB:en`, { browser: true });
  const seen = new Set();
  return parseFeed(xml)
    .filter(i => UPCOMING.test(i.title) && SENIOR.test(i.title) && !GOSSIP.test(i.title) && !/Harry|Meghan|Sussex/.test(i.title))
    .map(i => ({ title: i.title.replace(/\s[-–—]\s[^-–—]+$/, ''), source: (i.title.match(/\s[-–—]\s([^-–—]+)$/) ?? [])[1] ?? 'Google News', time: new Date(i.time).toISOString(), url: i.link }))
    .filter(i => (seen.has(i.title) ? false : (seen.add(i.title), true)))
    .slice(0, 10);
}

// ---------- Announced by the Palace or the organisers, not (yet) in the Diary ----------
// Facts checked against the Palace press release and the organisers; revisit when the date moves.
const CURATED = [
  { id: 'royal:curated:chogm-2026', who: 'The King & The Queen', people: ['king', 'queen'], kind: 'ceremony', title: 'Commonwealth Heads of Government Meeting (CHOGM), Antigua and Barbuda', date: [2026, 11, 1], place: 'St John’s, Antigua and Barbuda', loc: [-61.845, 17.121], weight: 3, source: 'Palace press release: Autumn Tour, 27 Oct–4 Nov 2026', link: 'https://www.royal.uk/media-centre/press-releases' },
  { id: 'royal:curated:earthshot-2026', who: 'The Prince of Wales', people: ['william'], kind: 'ceremony', title: 'The Earthshot Prize Awards, Mumbai', date: [2026, 11, 17], place: 'Mumbai, India', loc: [72.8777, 19.076], weight: 3, source: 'The Earthshot Prize (organisers)', link: 'https://earthshotprize.org' },
];

function curated() {
  return CURATED.map(({ date, ...c }) => ({ passion: 'royal', approxTime: true, ...c, start: iso(zoned(date[0], date[1], date[2], 10, 0, LONDON)) }))
    .filter(e => Date.parse(e.start) > Date.now() - 2 * DAY);
}

/** Reuse the last reading of royal.uk while it is fresh: one pass every few hours is enough and kind to the site. */
/** Portraits from Wikipedia (lead image of each person's page), kept once found. */
async function portraits(prev) {
  const known = Object.fromEntries((prev?.roster ?? []).filter(p => p.photo).map(p => [p.id, p.photo]));
  const out = {};
  for (const p of PEOPLE) {
    if (known[p.id]) { out[p.id] = known[p.id]; continue; }
    try {
      const j = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(p.wiki.replace(/ /g, '_'))}`, { json: true });
      const src = j.thumbnail?.source;
      if (src) out[p.id] = src;
    } catch { /* no portrait: the page shows initials */ }
  }
  return out;
}

async function previous() {
  try { return JSON.parse(await readFile(FILE, 'utf8')); } catch { return null; }
}
const FRESH = 3 * 3600e3;

export async function collectRoyal() {
  const prev = await previous();
  const reuse = prev?.diaryFetched && Date.now() - Date.parse(prev.diaryFetched) < FRESH && !process.env.ROYAL_FORCE;
  const [trips, al, press, rw] = await Promise.all([travel().catch(() => []), alerts().catch(() => []), pressAnnouncements().catch(() => []), royalWatcher().catch(() => [])]);
  let diary, recent, stays = [], diaryFetched = prev?.diaryFetched;
  if (reuse) {
    diary = prev.events.filter(e => e.kind === 'engagement');
    recent = prev.recent ?? [];
    stays = prev.stays ?? [];
  } else {
    // If royal.uk cannot be read, keep what we had rather than an empty diary
    diary = await collectDiary().catch(err => { console.warn('royal diary:', err.message); return null; });
    const cc = await collectCircular().catch(err => { console.warn('court circular:', err.message); return null; });
    recent = cc?.recent ?? null;
    stays = cc?.stays ?? prev?.stays ?? [];
    if (diary?.length) diaryFetched = new Date().toISOString();
    diary ??= (prev?.events ?? []).filter(e => e.kind === 'engagement');
    recent ??= prev?.recent ?? [];
  }
  await saveGeo();
  diary = diary.filter(e => Date.parse(e.start) > Date.now() - DAY);
  // The blog repeats state visits already known from Wikipedia: keep its entry only when the day is new.
  const days = new Set(trips.map(e => e.start.slice(0, 10)));
  const known = new Set([...trips, ...curated()].map(e => e.start.slice(0, 10)));
  const extra = rw.filter(e => !days.has(e.start.slice(0, 10)) && !known.has(e.start.slice(0, 10)));
  const events = [...trips, ...curated(), ...extra, ...ceremonies(), ...familyDates(zoned, iso), ...diary].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  // Court Circular over the last three weeks: how busy each person has been
  const since = Date.now() - 21 * DAY;
  const activity = Object.fromEntries(PEOPLE.filter(p => p.diary).map(p => [p.id, recent.filter(r => r.people.includes(p.id) && Date.parse(r.start) > since).length]));
  const photos = await portraits(prev);
  const roster = PEOPLE.map(({ id, name, title, born, working, role, lead, homes }) => ({ id, name, title, born, working, role, lead, homes, photo: photos[id] ?? null }));
  // The Palace's own news, with photographs (one page read each run; the previous list if it fails)
  const news = await collectNews().catch(err => { console.warn('royal news:', err.message); return prev?.news ?? []; });
  // Where each royal was last seen (latest engagement with a place) and where the sovereign last held audiences
  const whereabouts = {};
  for (const p of PEOPLE.filter(x => x.diary)) {
    const seen = recent.find(r => r.people.includes(p.id) && (r.place || r.loc));
    const stay = stays.filter(x => x.people.includes(p.id)).sort((a, b) => Date.parse(b.start) - Date.parse(a.start))[0];
    if (seen || stay) whereabouts[p.id] = { ...(seen ? { seen: { t: seen.start, title: seen.title, place: seen.place, loc: seen.loc } } : {}), ...(stay ? { residence: { t: stay.start, name: stay.residence } } : {}) };
  }
  return { updated: new Date().toISOString(), diaryFetched, events, alerts: al, press, recent: recent.filter(r => Date.parse(r.start) > Date.now() - 21 * DAY), roster, news, succession: SUCCESSION, activity, whereabouts, stays: stays.filter(x => Date.parse(x.start) > Date.now() - 21 * DAY) };
}
