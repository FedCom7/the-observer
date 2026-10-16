// Calendars for tennis, alpine skiing, WEC, Dakar and the ASO Grand Tours.
// All automatic: official APIs and pages, or Wikipedia season tables.
import { get, iso, parseDate, wikitext, zoned } from './lib.mjs';

const DAY = 86400e3;
const now = Date.now();
const Y = new Date().getUTCFullYear();

// ---------- Tennis: Grand Slams from the WTA's public tournament API ----------
const SLAM_PLACE = {
  'AUSTRALIAN OPEN': { title: 'Australian Open', tz: 'Australia/Melbourne', loc: [144.98, -37.82], place: 'Melbourne Park' },
  'ROLAND GARROS': { title: 'Roland Garros', tz: 'Europe/Paris', loc: [2.25, 48.85], place: 'Stade Roland Garros, Paris' },
  'WIMBLEDON': { title: 'Wimbledon', tz: 'Europe/London', loc: [-0.21, 51.43], place: 'All England Club, London' },
  'US OPEN': { title: 'US Open', tz: 'America/New_York', loc: [-73.85, 40.75], place: 'Flushing Meadows, New York' },
};

export async function tennisSlams() {
  const from = new Date(now - 30 * DAY).toISOString().slice(0, 10);
  const to = new Date(now + 450 * DAY).toISOString().slice(0, 10);
  const j = await get(`https://api.wtatennis.com/tennis/tournaments/?page=0&pageSize=200&excludeLevels=ITF&from=${from}&to=${to}`, { browser: true, json: true });
  return (j.content ?? [])
    .filter(t => t.level === 'Grand Slam' || t.tournamentGroup?.level === 'Grand Slam')
    .flatMap(t => {
      const key = Object.keys(SLAM_PLACE).find(k => (t.tournamentGroup?.name ?? t.title).toUpperCase().includes(k));
      if (!key) return [];
      const s = SLAM_PLACE[key];
      const [y, m, d] = t.startDate.split('-').map(Number);
      const [y2, m2, d2] = t.endDate.split('-').map(Number);
      return [
        { id: `wta:${t.year}:${key}`, passion: 'tennis', title: `${s.title} · day 1`, start: iso(zoned(y, m, d, 11, 0, s.tz)), weight: 3, approxTime: true, place: s.place, loc: s.loc, source: 'WTA tournament calendar' },
        { id: `wta:${t.year}:${key}:final`, passion: 'tennis', title: `${s.title} · men's final`, start: iso(zoned(y2, m2, d2, key === 'AUSTRALIAN OPEN' ? 19 : 15, 0, s.tz)), weight: 3, approxTime: true, place: s.place, loc: s.loc, source: 'WTA tournament calendar' },
      ];
    });
}

// ---------- ASO events: countdown target embedded in the official home pages ----------
const ASO = [
  { passion: 'cicl', url: 'https://www.letour.fr/en/', name: 'Tour de France', label: 'Stage 1' },
  { passion: 'cicl', url: 'https://www.lavuelta.es/en', name: 'La Vuelta', label: 'Stage 1' },
];

export async function asoEvents() {
  const out = await Promise.all(ASO.map(async a => {
    try {
      const html = await get(a.url, { browser: true });
      const cd = html.match(/data-countdown="(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})/);
      const tz = (html.match(/data-timezone="([^"]+)"/) ?? [])[1] ?? 'Europe/Paris';
      if (!cd) return [];
      const [, y, m, d, hh, mm] = cd.map(Number);
      const ev = [{ id: `aso:${a.name}:${y}`, passion: a.passion, title: `${a.name} ${y} · ${a.label}`, start: iso(zoned(y, m, d, hh, mm, tz)), weight: 3, place: a.place, loc: a.loc, link: a.url, source: a.url.replace(/^https:\/\/(www\.)?/, '').split('/')[0] }];
      // "01/01 > 01/15/2027" gives the finish too
      const range = html.match(/header__date">\s*(\d{2})\/(\d{2})\s*&?g?t?;?>?\s*(\d{2})\/(\d{2})\/(\d{4})/);
      if (range) ev.push({ ...ev[0], id: ev[0].id + ':finish', title: `${a.name} ${y} · finish`, start: iso(zoned(+range[5], +range[3], +range[4], 12, 0, tz)), approxTime: true });
      return ev;
    } catch {
      return [];
    }
  }));
  return out.flat();
}

// ---------- Wikipedia season tables ----------
const clean = s => s.replace(/\{\{flagicon\|[^}]*\}\}/g, '').replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, '').replace(/\{\{efn[\s\S]*?\}\}/g, '').replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1').replace(/<br\s*\/?>.*$/i, '').replace(/'''?/g, '').trim();

// ---------- Cycling: UCI World Tour calendar (Wikipedia season pages) ----------
const MONUMENTS = /Milan–San Remo|Tour of Flanders|Paris–Roubaix|Liège–Bastogne–Liège|Il Lombardia/;
const GRAND_TOURS = /Giro d'Italia|Tour de France|Vuelta a España/; // these come from the ASO sites and Giro page

/** Every World Tour race of this season and next, with the winner once it is run. */
export async function cyclingWorldTour() {
  const out = [];
  for (const y of [Y, Y + 1]) {
    const page = `${y} UCI World Tour`;
    const w = await wikitext(page);
    if (!w || !w.includes(`[[${y} `)) continue; // a redirect to the generic article has no season table
    for (const row of w.split(/\n\|-/)) {
      const head = row.match(/^\s*!\s*scope="row"\s*\|.*?\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/m);
      const dateLine = row.split('\n').find(l => /^\|\s*\d{1,2}(?:\s*[–-]\s*\d{1,2})?\s+[A-Z]/.test(l) || /^\|\s*\d{1,2} [A-Z][a-z]+ [–-] \d/.test(l));
      if (!head || !dateLine) continue;
      const race = head[1].trim();
      if (GRAND_TOURS.test(race)) continue;
      const d = parseDate(dateLine, y);
      if (!d) continue;
      const winner = row.match(/flagathlete\|\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/i);
      out.push({
        id: `uci:${y}:${race}`,
        passion: 'cicl',
        title: race,
        sub: winner ? `Winner: ${winner[1]}` : `UCI World Tour ${y}`,
        start: iso(zoned(d.y, d.m, d.d, 10, 0, 'Europe/Rome')),
        weight: MONUMENTS.test(race) ? 3 : /–| Classic|Gent|Amstel|Flèche|Strade/.test(race) ? 2 : 1,
        approxTime: true,
        link: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.replace(/ /g, '_'))}`,
        source: 'Wikipedia',
      });
    }
  }
  return out;
}
