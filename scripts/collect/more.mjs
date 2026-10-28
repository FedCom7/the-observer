// "More sports": the series and races that do not need a page of their own.
// - MotoGP: the official API (api.pulselive.motogp.com) with every session of every class
//   and its start time, race winners and the championship standings
// - Formula 2 and Formula 3: the official sites, round pages with schema.org JSON-LD
//   (exact session times) and the standings table with the points of each race
// - WRC: Wikipedia season page (wrc.com refuses scripts): calendar, winners, standings
// - Indianapolis 500 and Daytona 500: date of the next edition from Wikipedia,
//   results of the past editions from ESPN
// - Vendée Globe: Wikipedia (past editions); the start of the next one is set by the
//   organiser late, so until then it is the usual November Sunday, marked TBC
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, get, infobox, iso, parseDate, wikitext, zoned } from './lib.mjs';

const Y = new Date().getUTCFullYear();
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../public/data/more.json');

/** The previous file: finished rounds keep their results instead of being fetched again. */
async function previous() {
  try { return JSON.parse(await readFile(OUT, 'utf8')); } catch { return null; }
}

const unwiki = s => (s ?? '').replace(/<ref[\s\S]*?(?:<\/ref>|\/>)/g, '').replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\{\{flag(?:icon|athlete)?\|[^}]*\}\}/gi, '').replace(/\{\{(?:nowrap|small)\|([^{}]*)\}\}/gi, '$1')
  .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1').replace(/\{\{[^{}]*\}\}/g, '').replace(/<br\s*\/?>/g, ' ')
  .replace(/''+|&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const flagOf = s => s?.match(/\{\{flag(?:icon|athlete)?\|(?:[^|}]*\|)?([A-Z]{3})(?:\||\}\})/)?.[1] ?? s?.match(/\{\{flag(?:icon|athlete)?\|([A-Z]{3})/)?.[1] ?? '';

/** Rows of the first wikitable after a heading, as raw cell strings. */
function wikiTable(w, heading) {
  const i = w.search(heading);
  if (i < 0) return [];
  const start = w.indexOf('{|', i);
  const end = w.indexOf('\n|}', start);
  if (start < 0 || end < 0) return [];
  return w.slice(start, end).split(/\n\|-[^\n]*/).slice(1).map(r => r.split('\n').filter(l => /^[|!]/.test(l))
    .flatMap(l => l.replace(/^[|!]/, '').split(/\s*(?:\|\||!!)\s*/))
    .map(c => c.replace(/^\s*(?:style|align|valign|rowspan|colspan|class|nowrap|data-sort-value)[^|[{]*\|(?!\|)/i, '').trim()));
}

// ---------- MotoGP ----------
const MGP = 'https://api.pulselive.motogp.com/motogp/v1';
const RES = 'https://api.motogp.pulselive.com/motogp/v1/results';
const CLASS = { MGP: 'MotoGP', MT2: 'Moto2', MT3: 'Moto3' };
const SESSION = { FP1: 'Practice 1', FP2: 'Practice 2', PR: 'Practice', Q1: 'Q1', Q2: 'Q2', SPR: 'Sprint', WUP: 'Warm Up', RAC: 'Race' };
const titleCase = s => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).replace(/\bOf\b/g, 'of').replace(/\bThe\b/g, 'the').replace(/\bAnd\b/g, 'and');

async function motogp(prev) {
  const [events, seasons] = await Promise.all([get(`${MGP}/events?seasonYear=${Y}`, { json: true }), get(`${RES}/seasons`, { json: true })]);
  const season = seasons.find(s => s.year === Y);
  const cats = season ? await get(`${RES}/categories?seasonUuid=${season.id}`, { json: true }) : [];
  const catId = name => cats.find(c => c.name.startsWith(name))?.id;
  const done = season ? await get(`${RES}/events?seasonUuid=${season.id}&isFinished=true`, { json: true }) : [];
  const prevRounds = new Map((prev?.motogp?.rounds ?? []).map(r => [r.id, r]));

  const gps = events.filter(e => e.kind === 'GP').sort((a, b) => Date.parse(a.date_start) - Date.parse(b.date_start));
  const rounds = await Promise.all(gps.map(async (e, i) => {
    const sessions = (e.broadcasts ?? []).filter(b => b.type === 'SESSION' && CLASS[b.category?.acronym]).map(b => ({
      cls: CLASS[b.category.acronym], key: b.shortname?.trim(), name: SESSION[b.shortname?.trim()] ?? b.name, start: iso(b.date_start),
    })).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    const name = titleCase((e.name ?? '').replace(/^.*?GRAND PRIX/i, 'Grand Prix').replace(/^Grand Prix of (the )?/i, '')).replace(/\s+/g, ' ').trim();
    const round = {
      id: e.id, round: i + 1, name: `${name} GP`, sponsor: titleCase(e.name ?? ''), circuit: e.circuit?.name ?? '', city: e.circuit?.city ?? '', country: e.circuit?.country ?? '',
      loc: e.circuit?.lng ? [Number(e.circuit.lng), Number(e.circuit.lat)] : null, start: iso(e.date_start), end: iso(e.date_end), status: e.status, sessions, results: null,
    };
    // Winners: from the previous file when the weekend was already complete, otherwise from the results API
    const old = prevRounds.get(e.id);
    if (old?.results?.race?.length) round.results = old.results;
    else {
      // The two APIs share the first day of the weekend (local date)
      const r = done.find(d => !d.test && d.date_start === e.date_start.slice(0, 10));
      if (r && Date.parse(e.date_start) < Date.now()) round.results = await gpResults(r.id, catId('MotoGP')).catch(() => null);
    }
    return round;
  }));

  const standings = async name => {
    const id = catId(name);
    if (!season || !id) return [];
    const j = await get(`${RES}/standings?seasonUuid=${season.id}&categoryUuid=${id}`, { json: true });
    return (j.classification ?? []).map(c => ({ pos: c.position, name: c.rider?.full_name ?? '', number: c.rider?.number ?? null, nation: c.rider?.country?.iso ?? '', team: c.team?.name ?? '', constructor: c.constructor?.name ?? '', points: c.points ?? 0, wins: c.race_wins ?? 0, podiums: c.podiums ?? 0, sprintWins: c.sprint_wins ?? 0 }));
  };
  const [riders, moto2, moto3] = await Promise.all([standings('MotoGP'), standings('Moto2').catch(() => []), standings('Moto3').catch(() => [])]);
  return { season: Y, rounds, riders, moto2: moto2.slice(0, 5), moto3: moto3.slice(0, 5) };
}

async function gpResults(eventId, catId) {
  const sessions = await get(`${RES}/sessions?eventUuid=${eventId}&categoryUuid=${catId}`, { json: true });
  const top = async type => {
    const s = sessions.find(x => x.type === type);
    if (!s) return [];
    const j = await get(`${RES}/session/${s.id}/classification?test=false`, { json: true });
    return (j.classification ?? []).slice(0, 3).map(c => ({ pos: c.position, name: c.rider?.full_name ?? '', nation: c.rider?.country?.iso ?? '', team: c.team?.name ?? '' }));
  };
  const [race, sprint] = await Promise.all([top('RAC'), top('SPR')]);
  return race.length || sprint.length ? { race, sprint } : null;
}

// ---------- Formula 2 and Formula 3 ----------
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

const cellText = h => decode(h.replace(/<[^>]+>/g, '|')).split('|').map(s => s.trim()).filter(Boolean);

async function feeder(site, series) {
  const base = `https://www.${site}.com`;
  const [cal, table] = await Promise.all([get(`${base}/Calendar`, { browser: true }), get(`${base}/en/standings/${Y}/drivers`, { browser: true })]);
  const slugs = [...new Set([...cal.matchAll(new RegExp(`href="/en/racing/${Y}/([a-z-]+)"`, 'g'))].map(m => m[1]))];

  // Standings: one header cell per round ("Qatar | Lusail | 27 - 29 Nov"), then SR / FR columns
  const tb = table.slice(table.indexOf('<thead'), table.indexOf('</table>'));
  const head = [...tb.slice(0, tb.indexOf('</thead>')).matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(m => cellText(m[1]));
  const roundHeads = head.filter(c => c.some(x => /\d{1,2}\s*-\s*\d{1,2} \w{3}|\d{1,2} \w{3} - \d{1,2} \w{3}/.test(x)));
  const races = head.filter(c => c.length === 1 && /^(SR|FR)$/.test(c[0])).map(c => c[0]);
  const rows = [...tb.slice(tb.indexOf('<tbody')).matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m => [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(c => cellText(c[1])));
  const drivers = rows.map(r => {
    const [pos, name] = r[0];
    const pts = r.slice(1, -1).map(c => (c[0] && c[0] !== '-' ? Number(c[0]) : null));
    return { pos: Number(pos), name: name ?? '', points: Number(r[r.length - 1]?.[0]) || 0, perRace: pts };
  }).filter(d => d.name);

  // Rounds: name and dates from the standings header; exact session times from each round's page
  const rounds = await Promise.all(roundHeads.map(async (c, i) => {
    const [country, city, dates] = c.length >= 3 ? c.slice(-3) : [c[0], c[0], c[c.length - 1]];
    // Round pages are named after the city ("Yas Marina" → yas-marina, "Montréal" → montreal)
    const citySlug = city.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
    const slug = slugs.includes(citySlug) ? citySlug : slugs.find(x => citySlug.startsWith(x) || x.startsWith(citySlug)) ?? null;
    let sessions = [];
    if (slug) {
      try {
        const ev = jsonLd(await get(`${base}/en/racing/${Y}/${slug}`, { browser: true }));
        sessions = (ev?.subEvent ?? []).map(s => ({ name: s.name.split(' - ')[0].trim(), start: s.startDate }))
          .filter(s => s.start).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
      } catch { /* the round page is optional */ }
    }
    const m = dates.match(/(\d{1,2})(?: (\w{3}))?\s*-\s*(\d{1,2}) (\w{3})/);
    const mon = s => ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(s.toLowerCase()) + 1;
    const start = m ? iso(Date.UTC(Y, mon(m[2] ?? m[4]) - 1, Number(m[1]))) : sessions[0]?.start ?? null;
    const end = m ? iso(Date.UTC(Y, mon(m[4]) - 1, Number(m[3]))) : sessions[sessions.length - 1]?.start ?? null;
    return { round: i + 1, name: country, city, slug: slug ?? null, start, end, sessions, url: slug ? `${base}/en/racing/${Y}/${slug}` : `${base}/Calendar` };
  }));
  return { series, season: Y, races, rounds, drivers };
}

// ---------- WRC ----------
async function wrc() {
  for (const year of [Y, Y - 1]) {
    const w = await wikitext(`${year} World Rally Championship`);
    if (!w) continue;
    const cal = wikiTable(w, /==\s*Calendar\s*==/).filter(r => /^\d+$/.test(unwiki(r[0])));
    const summary = wikiTable(w, /===\s*Season summary\s*===/).filter(r => /^\d+$/.test(unwiki(r[0])));
    const month = d => parseDate(`${d} ${year}`, year);
    const rounds = cal.map(r => {
      const [round, from, to, rally, hq, surface] = r;
      const a = month(unwiki(from)), b = month(unwiki(to));
      const s = summary.find(x => unwiki(x[0]) === unwiki(round));
      return {
        round: Number(unwiki(round)), name: unwiki(rally), country: flagOf(rally), hq: unwiki(hq), surface: unwiki(surface),
        start: a ? iso(zoned(a.y, a.m, a.d, 8, 0, 'UTC')) : null, end: b ? iso(zoned(b.y, b.m, b.d, 14, 0, 'UTC')) : null,
        winner: s && unwiki(s[2]) ? { driver: unwiki(s[2]), nation: flagOf(s[2]), codriver: unwiki(s[3]), team: unwiki(s[4]) } : null,
      };
    }).filter(r => r.start);
    const st = wikiTable(w, /===\s*FIA World Rally Championship for Drivers\s*===/);
    const drivers = st.filter(r => /^\d+$/.test(unwiki(r[0])) && r.length > 3).map(r => ({ pos: Number(unwiki(r[0])), name: unwiki(r[1]), nation: flagOf(r[1]), points: Number(unwiki(r[r.length - 1])) || 0 })).slice(0, 10);
    if (rounds.length) return { season: year, rounds, drivers };
  }
  return null;
}

// ---------- Indianapolis 500 and Daytona 500 ----------
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/racing';

async function classic({ id, name, league, match, page, rule, tz, hm, place, loc }) {
  // Next edition: Wikipedia infobox date, else the calendar rule (marked TBC)
  let next = null;
  for (const year of [Y, Y + 1]) {
    const w = await wikitext(page(year), 0);
    const lead = w?.match(/(?:will be|was|is scheduled to be) held on ([^.]*)/)?.[1];
    const d = w ? parseDate(infobox(w, ['date', 'dates']), year) ?? parseDate(lead, year) : null;
    const t = d && d.y === year ? zoned(d.y, d.m, d.d, ...hm, tz) : null;
    if (t && t > Date.now() - 86400e3) { next = { year, start: iso(t), tbc: false, approxTime: true }; break; }
  }
  if (!next) {
    const year = Date.now() > rule(Y) ? Y + 1 : Y;
    next = { year, start: iso(rule(year)), tbc: true, approxTime: true };
  }
  // Past editions from ESPN, newest first
  const years = Array.from({ length: 10 }, (_, i) => Y - i);
  const past = (await Promise.all(years.map(async year => {
    try {
      const j = await get(`${ESPN}/${league}/scoreboard?dates=${year}`, { json: true });
      const e = (j.events ?? []).find(x => match.test(x.name));
      const c = e?.competitions?.[0];
      if (!c || c.status?.type?.state !== 'post') return null;
      if (!c.competitors?.some(x => x.athlete?.displayName)) return null;
      const top = [...(c.competitors ?? [])].sort((a, b) => (a.order ?? 99) - (b.order ?? 99)).slice(0, 3).map(x => ({ name: x.athlete?.displayName ?? '', nation: x.athlete?.flag?.alt ?? '' }));
      return { year, date: e.date, podium: top };
    } catch { return null; }
  }))).filter(Boolean);
  return { id, name, place, loc, next, past };
}

/** Last Monday of May (Memorial Day) minus one day. */
const indyRule = y => { const d = new Date(Date.UTC(y, 4, 31)); while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() - 1); return zoned(y, 5, d.getUTCDate() - 1, 12, 45, 'America/Indiana/Indianapolis'); };
/** Third Sunday of February (Presidents' Day weekend). */
const daytonaRule = y => { const d = new Date(Date.UTC(y, 1, 1)); while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1); return zoned(y, 2, d.getUTCDate() + 14, 14, 30, 'America/New_York'); };

// ---------- Vendée Globe ----------
async function vendee() {
  const w = await wikitext('Vendée Globe');
  // "Overall winners' times": one row per edition with the winner, the boat and the time at each mark
  const sec = w ? w.slice(w.indexOf("=== Overall winners' times ==="), w.indexOf('===', w.indexOf("=== Overall winners' times ===") + 30)) : '';
  const linked = s => s.match(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/)?.[1] ?? '';
  const winners = sec.split(/\n\|-/).map(r => {
    const year = Number(r.match(/\[\[(\d{4})[–-]\d{4} Vendée Globe/)?.[1]);
    const who = r.match(/\{\{flagathlete\|(\[\[[^\]]+\]\])\|([A-Z]{3})\}\}/);
    const times = [...r.matchAll(/(\d+)d (\d\d)h (\d\d)m/g)];
    const t = times[times.length - 1];
    return year && who ? { year, edition: `${year}–${String(year + 1).slice(2)}`, winner: linked(who[1]), nation: who[2], boat: linked(r.split(/<br\s*\/?>\s*\//)[1] ?? ''), days: t ? Number(t[1]) + Number(t[2]) / 24 + Number(t[3]) / 1440 : null } : null;
  }).filter(Boolean).sort((a, b) => b.year - a.year);
  // Every four years (2020, 2024, 2028…), on the second Sunday of November
  let year = 1992 + Math.ceil((Y - 1992) / 4) * 4;
  if (year === Y && Date.now() > Date.UTC(Y, 10, 20)) year += 4;
  const d = new Date(Date.UTC(year, 10, 1));
  while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1);
  const start = zoned(year, 11, d.getUTCDate() + 7, 13, 2, 'Europe/Paris');
  return { id: 'vendee', name: 'Vendée Globe', place: "Les Sables-d'Olonne", loc: [-1.78, 46.5], next: { year, start: iso(start), tbc: true, approxTime: true }, winners };
}

export async function collectMore() {
  const prev = await previous();
  const keep = (key, fallback) => err => { console.error(`more/${key}: ${err.message}`); return prev?.[key] ?? fallback; };
  const [mgp, f2, f3, rally, indy, daytona, vg] = await Promise.all([
    motogp(prev).catch(keep('motogp', null)),
    feeder('fiaformula2', 'F2').catch(keep('f2', null)),
    feeder('fiaformula3', 'F3').catch(keep('f3', null)),
    wrc().catch(keep('wrc', null)),
    classic({ id: 'indy500', name: 'Indianapolis 500', league: 'irl', match: /Indianapolis 500/, page: y => `${y} Indianapolis 500`, rule: indyRule, tz: 'America/Indiana/Indianapolis', hm: [12, 45], place: 'Indianapolis Motor Speedway', loc: [-86.23, 39.79] }).catch(() => prev?.classics?.find(c => c.id === 'indy500') ?? null),
    classic({ id: 'daytona500', name: 'Daytona 500', league: 'nascar-premier', match: /^Daytona 500/, page: y => `${y} Daytona 500`, rule: daytonaRule, tz: 'America/New_York', hm: [14, 30], place: 'Daytona International Speedway', loc: [-81.07, 29.19] }).catch(() => prev?.classics?.find(c => c.id === 'daytona500') ?? null),
    vendee().catch(keep('vendee', null)),
  ]);
  return { updated: new Date().toISOString(), motogp: mgp, f2, f3, wrc: rally, classics: [indy, daytona].filter(Boolean), vendee: vg };
}
