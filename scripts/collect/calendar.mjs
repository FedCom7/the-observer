// Dated events for passions without a live API. Every entry is derived
// automatically: from Wikipedia edition pages (the title is computed from the
// year, so next season's page is picked up as soon as someone writes it) or
// from fixed calendar rules. Nothing here is typed in by hand.
import { infobox, iso, ordinal, parseDate, roman, wikitext, zoned } from './lib.mjs';
import { asoEvents, skiCalendar, tennisSlams, wecCalendar } from './sports.mjs';

const now = new Date();
const Y = now.getUTCFullYear();

/**
 * Each source: the passion, how to name the page for a given year, which
 * years to look at, and the usual local start time (Wikipedia gives dates only,
 * so the time is marked approximate).
 */
const WIKI = [
  // Awards season: ceremonies fall early in the year after the films.
  { passion: 'awards', years: [Y, Y + 1], page: y => `${ordinal(y - 1928)} Academy Awards`, label: y => `${ordinal(y - 1928)} Academy Awards`, time: ['16:00', 'America/Los_Angeles'], weight: 3, place: 'Dolby Theatre, Hollywood', loc: [-118.34, 34.1] },
  { passion: 'awards', years: [Y, Y + 1], page: y => `${ordinal(y - 1943)} Golden Globes`, label: y => `${ordinal(y - 1943)} Golden Globes`, time: ['17:00', 'America/Los_Angeles'], weight: 3, place: 'The Beverly Hilton', loc: [-118.41, 34.07] },
  { passion: 'awards', years: [Y, Y + 1], page: y => `${ordinal(y - 1947)} British Academy Film Awards`, label: y => `${ordinal(y - 1947)} BAFTA Film Awards`, time: ['19:00', 'Europe/London'], weight: 2, place: 'Royal Festival Hall, London', loc: [-0.12, 51.51] },
  { passion: 'awards', years: [Y, Y + 1], page: y => `${ordinal(y - 1995)} Critics' Choice Awards`, label: y => `${ordinal(y - 1995)} Critics' Choice Awards`, time: ['19:00', 'America/Los_Angeles'], weight: 1 },
  // Giro d'Italia (Tour and Vuelta come from the ASO sites)
  { passion: 'cicl', years: [Y, Y + 1], page: y => `${y} Giro d'Italia`, label: () => "Giro d'Italia · Stage 1", time: ['13:00', 'Europe/Rome'], weight: 3 },
  // America's Cup
  { passion: 'ac', years: [Y, Y + 1], page: y => `${y} America's Cup`, label: () => "America's Cup Match", time: ['14:00', 'Europe/Rome'], weight: 3, place: 'Gulf of Naples', loc: [14.25, 40.83] },
  // Season finales
  { passion: 'nfl', years: [Y, Y + 1], page: y => `Super Bowl ${roman(y - 1966)}`, label: y => `Super Bowl ${roman(y - 1966)}`, time: ['18:30', 'America/New_York'], weight: 3 },
];

async function fromWikipedia(src, year) {
  const title = src.page(year);
  const w = await wikitext(title, 0);
  if (!w) return null;
  const raw = infobox(w, ['dates?', 'date_of_event', 'start_date', 'event_date']);
  const d = parseDate(raw, year);
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

/** Royal calendar fixtures that follow fixed rules. */
function royalRules() {
  const out = [];
  for (const y of [Y, Y + 1]) {
    out.push({ id: `rule:remembrance:${y}`, passion: 'royal', title: 'Remembrance Sunday at the Cenotaph', start: iso(zoned(y, 11, nthWeekday(y, 11, 0, 2), 11, 0, 'Europe/London')), weight: 2, place: 'Whitehall, London', loc: [-0.126, 51.502], source: 'Fixed date: second Sunday of November' });
    out.push({ id: `rule:xmas:${y}`, passion: 'royal', title: "The King's Christmas broadcast", start: iso(zoned(y, 12, 25, 15, 0, 'Europe/London')), weight: 2, place: 'London', loc: [-0.14, 51.5], source: 'Fixed date: 25 December, 15:00 UK' });
    out.push({ id: `rule:commonwealth:${y}`, passion: 'royal', title: 'Commonwealth Day service', start: iso(zoned(y, 3, nthWeekday(y, 3, 1, 2), 11, 0, 'Europe/London')), weight: 1, place: 'Westminster Abbey', loc: [-0.127, 51.499], source: 'Fixed date: second Monday of March' });
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
  const jobs = { wikipedia: wikiJob, tennis: tennisSlams, aso: asoEvents, ski: skiCalendar, wec: wecCalendar, royalRules: async () => royalRules(), electionRules: async () => electionRules() };
  const settled = await Promise.allSettled(Object.values(jobs).map(f => f()));
  const status = Object.fromEntries(Object.keys(jobs).map((k, i) => [k, settled[i].status === 'fulfilled' ? `${settled[i].value.length} events` : String(settled[i].reason).slice(0, 80)]));
  const seen = new Set();
  const events = settled.flatMap(r => (r.status === 'fulfilled' ? r.value : []))
    .filter(e => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .filter(e => Date.parse(e.start) > Date.now() - 30 * 86400e3)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return { updated: new Date().toISOString(), status, events };
}
