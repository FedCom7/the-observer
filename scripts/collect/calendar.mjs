// Dated events for passions without a live API. Every entry is derived
// automatically: from Wikipedia edition pages (the title is computed from the
// year, so next season's page is picked up as soon as someone writes it) or
// from fixed calendar rules. Nothing here is typed in by hand.
import { get, infobox, iso, ordinal, parseDate, roman, wikitext, zoned } from './lib.mjs';
import { asoEvents, cyclingWorldTour, tennisSlams } from './sports.mjs';

const now = new Date();
const Y = now.getUTCFullYear();

/**
 * Each source: the passion, how to name the page for a given year, which
 * years to look at, and the usual local start time (Wikipedia gives dates only,
 * so the time is marked approximate).
 */
const WIKI = [
  // Awards season: ceremonies fall early in the year after the films.
  { passion: 'awards', years: [Y, Y + 1], page: y => `${ordinal(y - 1928)} Academy Awards`, label: y => `${ordinal(y - 1928)} Academy Awards`, list: { page: 'List of Academy Awards ceremonies', edition: y => ordinal(y - 1928) }, time: ['16:00', 'America/Los_Angeles'], weight: 3, place: 'Dolby Theatre, Hollywood', loc: [-118.34, 34.1] },
  { passion: 'awards', years: [Y, Y + 1], page: y => `${ordinal(y - 1943)} Golden Globes`, label: y => `${ordinal(y - 1943)} Golden Globes`, list: { page: 'List of Golden Globe Awards ceremonies', edition: y => ordinal(y - 1943) }, time: ['17:00', 'America/Los_Angeles'], weight: 3, place: 'The Beverly Hilton', loc: [-118.41, 34.07] },
  { passion: 'awards', years: [Y, Y + 1], page: y => `${ordinal(y - 1947)} British Academy Film Awards`, label: y => `${ordinal(y - 1947)} BAFTA Film Awards`, time: ['19:00', 'Europe/London'], weight: 2, place: 'Royal Festival Hall, London', loc: [-0.12, 51.51] },
  { passion: 'awards', years: [Y, Y + 1], page: y => `${ordinal(y - 1995)} Critics' Choice Awards`, label: y => `${ordinal(y - 1995)} Critics' Choice Awards`, time: ['19:00', 'America/Los_Angeles'], weight: 1 },
  // Giro d'Italia (Tour and Vuelta come from the ASO sites)
  { passion: 'cicl', years: [Y, Y + 1], page: y => `${y} Giro d'Italia`, label: () => "Giro d'Italia · Stage 1", time: ['13:00', 'Europe/Rome'], weight: 3 },
  // America's Cup
  { passion: 'ac', years: [Y, Y + 1], page: y => `${y} America's Cup`, label: () => "America's Cup Match", time: ['14:00', 'Europe/Rome'], weight: 3, place: 'Gulf of Naples', loc: [14.25, 40.83] },
  // Season finales
  { passion: 'nfl', years: [Y, Y + 1], page: y => `Super Bowl ${roman(y - 1966)}`, label: y => `Super Bowl ${roman(y - 1966)}`, time: ['18:30', 'America/New_York'], weight: 3 },
];

/** Date of an edition from a "List of ... ceremonies" table row ("| 84th || January 10, 2027"). */
async function fromList(list, year) {
  const w = await wikitext(list.page);
  if (!w) return null;
  const ed = list.edition(year);
  const line = w.split('\n').find(l => new RegExp(`^\\|\\s*(?:\\[\\[[^|\\]]*\\|)?${ed}\\b`).test(l));
  return line ? parseDate(line.replace(/<ref[\s\S]*$/, ''), year) : null;
}

async function fromWikipedia(src, year) {
  let title = src.page(year);
  const w = await wikitext(title, 0);
  let d = w ? parseDate(infobox(w, ['dates?', 'date_of_event', 'start_date', 'event_date']), year) : null;
  // The edition page may not exist yet, or may lack the date: fall back to the list of ceremonies.
  if (!d && src.list) { d = await fromList(src.list, year); if (d) title = src.list.page; }
  if (!d || d.y !== year && d.y !== year - 1) return null;
  const [hm, tz] = src.time;
  const [hh, mm] = hm.split(':').map(Number);
  const start = zoned(d.y, d.m, d.d, hh, mm, tz);
  return {
    id: `wiki:${title}`,
    passion: src.passion,
    title: src.label(year),
    start: iso(start),
    weight: src.weight,
    approxTime: true,
    place: src.place,
    loc: src.loc,
    link: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    source: 'Wikipedia',
  };
}

/** n-th weekday of a month (weekday 0 = Sunday). */
const nthWeekday = (y, m, weekday, n) => {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
};

/** Apple events: every dated event on apple.com/apple-events, so a new keynote appears as soon as Apple announces it. */
async function appleEvents() {
  const html = await get('https://www.apple.com/apple-events/', { browser: true });
  const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
  const seen = new Set();
  const out = [];
  for (const m of html.matchAll(new RegExp(`(${MONTHS}) (\\d{1,2}), (20\\d{2})`, 'g'))) {
    const d = parseDate(m[0]);
    if (!d) continue;
    const key = `${d.y}-${d.m}-${d.d}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const start = zoned(d.y, d.m, d.d, 10, 0, 'America/Los_Angeles');
    if (start < Date.now() - 2 * 86400e3) continue;
    out.push({ id: `apple:event:${key}`, passion: 'apple', title: d.m === 6 ? 'WWDC keynote' : 'Apple Event', start: iso(start), weight: 3, place: 'Apple Park, Cupertino', loc: [-122.01, 37.33], link: 'https://www.apple.com/apple-events/', source: 'apple.com' });
  }
  return out;
}

/** US federal elections: the Tuesday after the first Monday of November in even years. */
function electionRules() {
  const out = [];
  for (const y of [Y, Y + 1, Y + 2].filter(y => y % 2 === 0)) {
    const firstMonday = nthWeekday(y, 11, 1, 1);
    const day = firstMonday + 1;
    const kind = y % 4 === 0 ? 'Presidential election' : 'Midterms';
    out.push({ id: `rule:election:${y}`, passion: 'elez', title: `Election Day · ${kind}`, start: iso(zoned(y, 11, day, 6, 0, 'America/New_York')), weight: 3, place: 'United States', loc: [-77.04, 38.9], source: 'Fixed date: Tuesday after the first Monday of November' });
    out.push({ id: `rule:election:${y}:close`, passion: 'elez', title: 'First polls close (Indiana, Kentucky)', start: iso(zoned(y, 11, day, 18, 0, 'America/New_York')), weight: 3, place: 'Indiana', loc: [-86.16, 39.77], source: 'Fixed: polls close at 18:00 Eastern in most of Indiana and Kentucky' });
  }
  return out;
}

export async function collectCalendar() {
  const wikiJob = async () => {
    const out = [];
    for (const src of WIKI) for (const y of src.years) {
      const e = await fromWikipedia(src, y).catch(() => null);
      if (e) out.push(e);
    }
    return out;
  };
  const jobs = { wikipedia: wikiJob, tennis: tennisSlams, aso: asoEvents, electionRules: async () => electionRules(), apple: appleEvents, cycling: cyclingWorldTour };
  const settled = await Promise.allSettled(Object.values(jobs).map(f => f()));
  const status = Object.fromEntries(Object.keys(jobs).map((k, i) => [k, settled[i].status === 'fulfilled' ? `${settled[i].value.length} events` : String(settled[i].reason).slice(0, 80)]));
  const seen = new Set();
  const events = settled.flatMap(r => (r.status === 'fulfilled' ? r.value : []))
    .filter(e => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .filter(e => Date.parse(e.start) > Date.now() - 30 * 86400e3)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return { updated: new Date().toISOString(), status, events };
}
