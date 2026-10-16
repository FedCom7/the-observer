// FIA WEC, fully automatic:
// - fiawec.com race pages: schema.org JSON-LD with every session and its exact start time
// - Al Kamel Systems (official timing): CSV classification of every session, hour by hour in races
// - Wikipedia season page: championship standings with each round's result
import { get, wikitext } from './lib.mjs';

const WEC = 'https://www.fiawec.com';
const AK = 'https://fiawec.alkamelsystems.com';
const now = Date.now();
const DAY = 86400e3;

// ---------- Schedule (fiawec.com) ----------
async function raceSlugs() {
  const html = await get(`${WEC}/en`, { browser: true });
  return [...new Set([...html.matchAll(/href="\/en\/race\/([a-z0-9-]+-(20\d\d))"/g)].map(m => m[1]))]
    .filter(s => !/prologue/.test(s));
}

function jsonLd(html) {
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const j = JSON.parse(m[1]);
      const ev = [j, ...(j['@graph'] ?? [])].find(x => x['@type'] === 'SportsEvent' && x.subEvent);
      if (ev) return ev;
    } catch { /* not the block we want */ }
  }
  return null;
}

const sessionKind = n => (/race/i.test(n) ? 'race' : /hyperpole/i.test(n) ? 'hyperpole' : /qualif/i.test(n) ? 'qualifying' : /practice|test/i.test(n) ? 'practice' : 'other');

async function raceSchedule(slug) {
  const html = await get(`${WEC}/en/race/${slug}`, { browser: true });
  const ev = jsonLd(html);
  const title = (html.match(/<title>([^<|:]+)/)?.[1] ?? slug).replace(/\s+\d{4}\s*$/, '').trim();
  const name = ev?.name?.replace(/\s*-\s*FIA WEC.*$/i, '') ?? title;
  const sessions = (ev?.subEvent ?? []).map(s => ({
    // "Qualifying - HYPERCAR - 6 Hours of Barcelona": drop the race name, keep the class
    name: s.name.split(' - ').slice(0, -1).join(' · ').replace(/HYPERCAR/g, 'Hypercar').trim() || s.name,
    start: s.startDate,
    kind: sessionKind(s.name),
  })).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const dates = html.match(/From (\d{1,2}) to (\d{1,2} \w+ 20\d\d)/i);
  // Placeholder schedules use the same clock time for every session (00:00 or 12:00): not real yet.
  const placeholder = x => ['00:00', '12:00'].includes(x.start.slice(11, 16));
  const provisional = sessions.filter(placeholder).length > sessions.length / 2;
  for (const x of sessions) x.tbc = x.start.slice(11, 16) === '00:00' || (provisional && placeholder(x));
  return { slug, name: name.replace(/ 20\d\d$/, '').replace(/^WEC\s+/i, ''), provisional, year: Number(slug.slice(-4)), url: `${WEC}/en/race/${slug}`, start: ev?.startDate ?? null, end: ev?.endDate ?? null, datesText: dates ? `${dates[1]}–${dates[2]}` : null, sessions };
}

// ---------- Results (Al Kamel CSV) ----------
function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const head = lines.shift().split(';');
  return lines.map(l => Object.fromEntries(l.split(';').map((v, i) => [head[i], v])));
}

const toRow = r => ({
  pos: Number(r.POSITION) || null, number: r.NUMBER, team: r.TEAM, vehicle: r.VEHICLE, cls: r.CLASS,
  drivers: [r.DRIVER_1, r.DRIVER_2, r.DRIVER_3, r.DRIVER_4, r.DRIVER_5].filter(Boolean).map(d => d.replace(/\b([A-ZÀ-Ý'-]{2,})\b/g, w => w[0] + w.slice(1).toLowerCase())),
  laps: Number(r.LAPS) || null, gap: r.GAP_FIRST || '', time: r.TOTAL_TIME || '', status: r.STATUS, bestLap: r.FL_TIME,
});

/** Seasons and events from the selector on the Al Kamel results site. */
export async function akEvents(year) {
  const home = await get(`${AK}/`, { browser: true });
  const season = [...home.matchAll(/<option Value="(\d+_(\d{4})(?:-\d{4})?)"/g)].find(m => m[2] === String(year) || m[1].endsWith(String(year)))?.[1];
  if (!season) return { season: null, events: [] };
  const page = await get(`${AK}/?season=${encodeURIComponent(season)}`, { browser: true });
  const events = [...page.matchAll(/<option Value="((\d{2})_[^"]+)"/g)]
    .filter(m => !/^\d{2}_\d{4}/.test(m[1])) // the season selector uses the same pattern
    .map(m => ({ code: m[1], round: Number(m[2]) }));
  return { season, events };
}

/** Latest classification of each WEC session of one event (final when available, last race hour otherwise). */
export async function akResults(season, event) {
  // The results site sometimes answers with an empty event page: retry a couple of times.
  let files = [];
  for (let attempt = 0; attempt < 3 && !files.length; attempt++) {
    if (attempt) await new Promise(r => setTimeout(r, 1500));
    const html = await get(`${AK}/?season=${encodeURIComponent(season)}&evvent=${encodeURIComponent(event)}`, { browser: true });
    // The site sometimes serves another event's page: only trust files inside the requested event folder.
    const prefix = `Results/${season}/${event}/`;
    files = [...new Set([...html.matchAll(/Results\/[^"']+?\.CSV/gi)].map(m => decodeURIComponent(m[0])))]
      .filter(f => f.startsWith(prefix) && /FIA WEC\//i.test(f) && /\/03_Classification_/i.test(f));
  }
  const bySession = new Map();
  for (const f of files) {
    const m = f.match(/\/(\d{12})_([^/]+)\/(?:(\d{2})_Hour (\d+)\/)?03_Classification_[^/]+?(_Final)?\.CSV$/i);
    if (!m) continue;
    const [, stamp, session, , hour, final] = m;
    const rank = (final ? 1000 : 0) + Number(hour ?? 0);
    const prev = bySession.get(session);
    if (!prev || rank > prev.rank) bySession.set(session, { file: f, stamp, session, hour: hour ? Number(hour) : null, final: Boolean(final), rank });
  }
  const out = [];
  for (const s of [...bySession.values()].sort((a, b) => a.stamp.localeCompare(b.stamp))) {
    try {
      const csv = await get(`${AK}/${s.file.split('/').map(encodeURIComponent).join('/')}`, { browser: true });
      const rows = parseCsv(csv).map(toRow).filter(r => r.pos);
      if (rows.length) out.push({ session: s.session, kind: sessionKind(s.session), hour: s.hour, final: s.final, rows });
    } catch { /* skip one bad file */ }
  }
  return out;
}

// ---------- Standings (Wikipedia) ----------
const cleanCell = c => c.replace(/^[^|]*\|(?!\|)/, '').replace(/\{\{flagicon\|[^}]*\}\}/g, '').replace(/<[^>]+>/g, '').replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1').replace(/'''?/g, '').trim();

function standingsTable(w, heading, hasTeam) {
  const at = w.search(heading);
  if (at < 0) return [];
  const start = w.indexOf('{|class="wikitable"', at) >= 0 ? w.indexOf('{|class="wikitable"', at) : w.indexOf('{| class="wikitable"', at);
  const end = w.indexOf('\n|}', start);
  const table = w.slice(start, end);
  const out = [];
  for (const block of table.split(/\n\|-/).slice(1)) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    const posLine = lines.find(l => /^!\s*(?:rowspan=\d+\s*\|)?\s*\d+\s*$/.test(l));
    const num = l => Number(l.replace(/^!\s*(?:rowspan=\d+\s*\|)?/, '').replace(/[^\d.]/g, ''));
    const cells = lines.filter(l => l.startsWith('|')).map(l => cleanCell(l.slice(1)));
    const pointsLine = [...lines].reverse().find(l => /^!\s*(?:rowspan=\d+\s*\|)?\s*[\d.]+\s*$/.test(l) && l !== posLine);
    if (posLine) {
      const name = cells.shift() ?? '';
      const team = hasTeam ? cells.shift() ?? '' : '';
      out.push({ pos: num(posLine), name, team, results: cells, points: pointsLine ? num(pointsLine) : null });
    } else if (out.length && cells.length) {
      out[out.length - 1].results2 = cells; // second car of a manufacturer
    }
  }
  return out;
}

/** Group drivers who share a car (same team, same results, same points) into one crew. */
function crews(rows) {
  const out = [];
  for (const r of rows) {
    const key = `${r.team}|${r.points}|${r.results.join(',')}`;
    const c = out.find(x => x.key === key);
    if (c) c.names.push(r.name); else out.push({ key, pos: r.pos, names: [r.name], team: r.team, points: r.points, results: r.results });
  }
  return out.map(({ key, ...c }) => c);
}

async function standings(year) {
  const w = await wikitext(`${year} FIA World Endurance Championship`);
  if (!w) return null;
  const rounds = [...(w.match(/=+\s*Hypercar World Endurance Drivers[\s\S]*?\n\|-/)?.[0] ?? '').matchAll(/\|([A-ZÃÉ]{3})\]\]/g)].map(m => m[1]);
  return {
    rounds,
    hypercarDrivers: crews(standingsTable(w, /=+\s*Hypercar World Endurance Drivers/, true)),
    hypercarManufacturers: standingsTable(w, /=+\s*Hypercar World Endurance Manufacturers/, false),
    lmgt3Drivers: crews(standingsTable(w, /=+\s*FIA Endurance Trophy for LMGT3 Drivers/, true)),
    lmgt3Teams: standingsTable(w, /=+\s*FIA Endurance Trophy for LMGT3 Teams/, false),
    url: `https://en.wikipedia.org/wiki/${year}_FIA_World_Endurance_Championship#Results_and_standings`,
  };
}

// ---------- Assemble ----------
export async function collectWec() {
  const year = new Date().getUTCFullYear();
  const slugs = await raceSlugs();
  const races = [];
  for (const slug of slugs.filter(s => Number(s.slice(-4)) >= year)) {
    try { races.push(await raceSchedule(slug)); } catch { /* keep going */ }
  }
  races.sort((a, b) => Date.parse(a.start ?? a.sessions[0]?.start ?? '2100') - Date.parse(b.start ?? b.sessions[0]?.start ?? '2100'));

  // Results: this season's events that have started (final race result for past ones, every session for this weekend)
  const ak = await akEvents(year);
  const thisYear = races.filter(r => r.year === year);
  const results = {};
  for (const ev of ak.events) {
    const race = thisYear[ev.round - 1];
    const first = race?.sessions[0]?.start ? Date.parse(race.sessions[0].start) : null;
    if (first && first > now + DAY) continue; // not started yet
    try {
      let sessions = await akResults(ak.season, ev.code);
      const current = race && first && now - first < 5 * DAY;
      // Past events: keep only the race, and its last hourly classification is the result.
      if (!current) sessions = sessions.filter(s => s.kind === 'race').map(s => ({ ...s, final: true }));
      results[ev.round] = { event: ev.code.replace(/^\d+_/, ''), sessions };
    } catch { /* skip event */ }
  }
  return { updated: new Date().toISOString(), season: year, races, results, standings: await standings(year).catch(() => null) };
}
