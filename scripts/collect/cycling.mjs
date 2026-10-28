// Road cycling, men's elite: UCI WorldTour, World and European Championships.
// - Calendar: the UCI's own calendar API (classes 1.UWT, 2.UWT, CM, CC), the same
//   data as the official XLS export, which needs a token.
// - ASO races (Tour, Vuelta, Paris-Nice, Dauphiné, Roubaix, Flèche, Liège): the
//   official start time, every stage with first start / last arrival, and the
//   official rankings (stage, general, points, mountains, youth, teams).
// - RCS races (Giro, Sanremo, Lombardia, Strade Bianche, Tirreno): the start
//   countdown, the Giro stages, the podium of the last edition.
// - Wikipedia: winners of every race (season table) and of the championships.
// ProCyclingStats and FirstCycling sit behind a Cloudflare challenge and are not used.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UA, decode, get, infobox, iso, parseDate, wikitext, zoned } from './lib.mjs';
import { nationalChampions, raceWiki, teamName } from './cyclingWiki.mjs';

const DAY = 86400e3;
const now = Date.now();
const Y = new Date().getUTCFullYear();
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const aso = host => ({ org: 'aso', base: `https://www.${host}/en` });
const rcs = host => ({ org: 'rcs', base: `https://www.${host}/en` });

/** UCI name -> display name, tier (3 Monuments, Grand Tours, Worlds; 2 the other big races; 1 the rest), tag, organiser site. */
const RACES = [
  [/Milano-Sanremo/, 'Milano–Sanremo', 3, 'monument', rcs('milanosanremo.it')],
  [/Ronde van Vlaanderen/, 'Tour of Flanders', 3, 'monument'],
  [/Paris-Roubaix/, 'Paris–Roubaix', 3, 'monument', aso('paris-roubaix.fr')],
  [/Liège-Bastogne/, 'Liège–Bastogne–Liège', 3, 'monument', aso('liege-bastogne-liege.be')],
  [/Il Lombardia/, 'Il Lombardia', 3, 'monument', rcs('ilombardia.it')],
  [/Giro d'Italia/, "Giro d'Italia", 3, 'grand', rcs('giroditalia.it')],
  [/Tour de France/, 'Tour de France', 3, 'grand', aso('letour.fr')],
  [/Vuelta/, 'La Vuelta', 3, 'grand', aso('lavuelta.es')],
  [/World Championships/, 'World Championships', 3, 'worlds'],
  [/European Championships/, 'European Championships', 2, 'euros'],
  [/Strade Bianche/, 'Strade Bianche', 2, null, rcs('strade-bianche.it')],
  [/Omloop/, 'Omloop Nieuwsblad', 2],
  [/E3 /, 'E3 Saxo Classic', 2],
  [/In Flanders Fields/, 'Gent–Wevelgem', 2],
  [/Amstel/, 'Amstel Gold Race', 2],
  [/Flèche Wallonne/, 'La Flèche Wallonne', 2, null, aso('la-fleche-wallonne.be')],
  [/Paris-Nice/, 'Paris–Nice', 2, null, aso('paris-nice.fr')],
  [/Tirreno/, 'Tirreno–Adriatico', 2, null, rcs('tirrenoadriatico.it')],
  [/Catalunya/, 'Volta a Catalunya', 2],
  [/Itzulia/, 'Itzulia Basque Country', 2],
  [/Romandie/, 'Tour de Romandie', 2],
  [/Auvergne/, 'Tour Auvergne-Rhône-Alpes', 2, null, aso('tour-auvergne-rhone-alpes.fr')],
  [/Tour de Suisse/, 'Tour de Suisse', 2],
  [/San Sebastian|DSSK/, 'Clásica San Sebastián', 2],
  [/Québec/, 'GP Québec', 2],
  [/Montréal/, 'GP Montréal', 2],
  [/Cadel Evans/, 'Cadel Evans Road Race', 1],
  [/Tour Down Under/, 'Tour Down Under', 1],
  [/Dwars door/, 'Dwars door Vlaanderen', 1],
  [/Ronde Van Brugge/, 'Ronde van Brugge', 1],
  [/Bretagne Classic/, 'Bretagne Classic', 1],
];

// Start (or finish) town of the one-day classics, so the map tells them apart: [UCI name, lon, lat]
const CLASSIC_LOC = [
  [/Milano-Sanremo/, 7.78, 43.82], [/Ronde van Vlaanderen/, 4.4, 51.22], [/Paris-Roubaix/, 3.17, 50.69], [/Liège-Bastogne/, 5.57, 50.63], [/Il Lombardia/, 9.09, 45.81],
  [/Strade Bianche/, 11.33, 43.32], [/Omloop/, 3.72, 51.05], [/E3 /, 3.35, 50.86], [/In Flanders Fields/, 3.2, 50.81], [/Amstel/, 5.83, 50.86], [/Flèche Wallonne/, 5.24, 50.52],
  [/Dwars door/, 3.43, 50.89], [/Ronde Van Brugge/, 3.22, 51.21], [/Bretagne Classic/, -3.29, 47.93], [/Cyclassics/, 9.99, 53.55], [/San Sebastian|DSSK/, -1.98, 43.32],
  [/Québec/, -71.21, 46.81], [/Montréal/, -73.57, 45.5], [/Cadel Evans/, 144.35, -38.15],
];

// Country -> time zone and a point for the map (race start regions)
const GEO = {
  BEL: ['Europe/Brussels', [4.4, 50.9]], FRA: ['Europe/Paris', [2.3, 46.6]], ITA: ['Europe/Rome', [11.3, 44.2]], ESP: ['Europe/Madrid', [-2.5, 42.8]],
  NED: ['Europe/Amsterdam', [5.8, 50.9]], GER: ['Europe/Berlin', [9.9, 53.55]], SUI: ['Europe/Zurich', [7.4, 46.9]], DEN: ['Europe/Copenhagen', [12.57, 55.68]],
  POL: ['Europe/Warsaw', [19.9, 50.06]], SLO: ['Europe/Ljubljana', [14.5, 46.05]], AUS: ['Australia/Adelaide', [138.6, -34.93]], UAE: ['Asia/Dubai', [54.4, 24.45]],
  CAN: ['America/Toronto', [-73.57, 45.5]], CHN: ['Asia/Shanghai', [108.3, 22.8]], GBR: ['Europe/London', [-1.5, 53.8]], NOR: ['Europe/Oslo', [10.75, 59.9]],
};

const text = html => decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' | ')).replace(/\s+/g, ' ').replace(/(\s*\|\s*)+/g, ' | ');
const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** "13 Oct - 18 Oct 2026", "20 Mar 2027", "28 Dec 2026 - 02 Jan 2027" -> [start, end] as YYYY-MM-DD */
function uciDates(s) {
  const parts = s.split(' - ').map(p => p.trim().split(/\s+/));
  const year = Number(parts[parts.length - 1][2]);
  const one = (p, fallback) => ymd(Number(p[2] ?? fallback), MONTHS.indexOf(p[1].slice(0, 3).toLowerCase()) + 1, Number(p[0]));
  const end = one(parts[parts.length - 1], year);
  let start = one(parts[0], year);
  if (start > end) start = one(parts[0], year - 1);
  return [start, end];
}

// ---------- UCI calendar ----------
async function uciCalendar() {
  const found = new Map();
  for (const cls of ['1.UWT', '2.UWT', 'CM', 'CC']) {
    for (const [kind, y] of [['past', Y], ['upcoming', Y], ['upcoming', Y + 1]]) {
      const j = await get(`https://www.uci.org/api/calendar/${kind}?discipline=ROA&raceClass=${cls}&raceCategory=ME&year=${y}`, { json: true, browser: true });
      for (const m of j.items ?? []) for (const d of m.items ?? []) for (const c of d.items ?? []) {
        const url = c.detailsLink?.url ?? '';
        const id = url.split('/').pop();
        if (!id || found.has(id)) continue;
        if (cls === 'CC' && !/European|UEC/i.test(c.name)) continue; // only the European Championships
        const [startDate, endDate] = uciDates(c.dates);
        if (startDate < `${Y}-01-01`) continue;
        found.set(id, { id, uciName: c.name, cls, country: c.country, venue: (c.venue ?? '').replace(/^(A DEFINIR|A DETERMINER|A CONFIRMER|TBC)$/i, '').trim(), startDate, endDate, uci: `https://www.uci.org${url}` });
      }
    }
  }
  return [...found.values()].map(r => {
    const def = RACES.find(([re]) => re.test(r.uciName));
    const [, name = r.uciName.replace(/\s*-\s*(Men|CIC)$/, ''), tier = 1, tag = null, site = null] = def ?? [];
    const kind = r.cls === 'CM' || r.cls === 'CC' ? 'champs' : r.cls.startsWith('1.') ? 'one-day' : 'stage';
    const [tz, countryLoc] = GEO[r.country] ?? ['Europe/Paris', null];
    const own = CLASSIC_LOC.find(([re]) => re.test(r.uciName));
    const loc = own ? [own[1], own[2]] : countryLoc;
    const [y, m, d] = r.startDate.split('-').map(Number);
    const [y2, m2, d2] = r.endDate.split('-').map(Number);
    // Usual local start: around 10:00 for a classic, early afternoon for a stage; marked approximate
    const start = iso(zoned(y, m, d, kind === 'one-day' ? 10 : 12, kind === 'one-day' ? 0 : 30, tz));
    const end = iso(zoned(y2, m2, d2, 17, 0, tz));
    return { ...r, year: y, name, tier, tag, kind, tz, loc, site: site?.base ?? null, org: site?.org ?? null, start, end, approx: true };
  }).sort((a, b) => a.start.localeCompare(b.start));
}

// ---------- ASO ----------
const hms = s => {
  const m = String(s).match(/(?:(\d+)h\s*)?(\d+)'\s*(\d+)''/);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
};
const nameCase = n => n.replace(/\p{L}[\p{L}'’-]*/gu, w => (w === w.toUpperCase() && w.length > 1 ? w[0] + w.slice(1).toLowerCase() : w));

/** Every ranking ajax path on a rankings page: sub-tabs and the JSON "ajax stack" of the general tabs. */
const ajaxPaths = html => [...new Set([...html.replace(/&quot;/g, '"').replace(/\\\//g, '/').matchAll(/\/en\/ajax\/ranking\/\d+\/[a-z]{3}\/[0-9a-f]+\/(?:subtab|none)/g)].map(m => m[0]))];

function tableRows(html) {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(r => [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(c => decode(c[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')).replace(/\s+/g, ' ').trim()));
}

/** Ranking table -> rows, read by cell content (the sites differ in their extra columns). */
function ranking(html, limit = 10) {
  const rows = tableRows(html);
  const head = rows.find(r => r[0] === 'Rank') ?? [];
  const riders = head[1]?.toLowerCase() === 'rider';
  const isTime = c => /^(\d+h\s*)?\d+'\s*\d+''$/.test(c);
  return rows.filter(r => /^\d+$/.test(r[0])).slice(0, limit).map(r => {
    const t = r.findIndex(isTime);
    const team = r.slice(riders ? 2 : 1).find(c => /[A-Za-z]{2}/.test(c) && !/PTS$|^B :/.test(c) && !isTime(c)) ?? '';
    const gap = t >= 0 ? r[t + 1] : null;
    const pts = r.find(c => /\d+ PTS$/i.test(c));
    return {
      pos: Number(r[0]),
      rider: riders ? nameCase(r[1]) : null,
      team,
      time: t >= 0 ? r[t] : null,
      gap: gap && gap !== '-' ? gap.replace(/^\+\s*/, '+') : null,
      gapS: t >= 0 ? (gap && gap !== '-' ? hms(gap) : 0) : null,
      points: pts ? Number(pts.replace(/\D/g, '')) : null,
    };
  });
}

/** "Sat 07/04/2026" (MM/DD) or "Sunday, march 8, 2026" -> [y, m, d] */
function asoDate(s) {
  let m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return [Number(m[3]), Number(m[1]), Number(m[2])];
  m = s.match(/([a-z]+) (\d{1,2}), (\d{4})/i);
  return m ? [Number(m[3]), MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, Number(m[2])] : null;
}

async function asoSite(race) {
  const out = { source: race.site.replace(/^https:\/\/(www\.)?/, '').split('/')[0] };
  const home = await get(race.site, { browser: true });
  const cd = home.match(/data-countdown="(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})/);
  if (cd) {
    const [, y, m, d, hh, mm] = cd.map(Number);
    out.countdown = { year: y, start: iso(zoned(y, m, d, hh, mm, race.tz)) };
  }
  if (race.kind === 'stage') {
    const t = text(await get(`${race.site}/overall-route`, { browser: true }));
    const table = t.slice(t.indexOf('| Stage | Type | Date |'));
    const rows = [...table.matchAll(/\|\s*(\d+|-)\s*\|\s*([^|]+?)\s*\|\s*([^|]*\d{4})\s*\|\s*([^|]+?)\s*\|\s*(?:([\d.,]+) km\s*\|\s*)?(?:Stage \d+|Rest \d*)/g)];
    out.stages = rows.map(r => {
      const [y, m, d] = asoDate(r[3]) ?? [];
      const rest = r[1] === '-';
      const [from, to] = r[4].split(' > ').map(s => s.trim());
      return { num: rest ? null : Number(r[1]), type: rest ? 'Rest day' : r[2], rest, date: y ? ymd(y, m, d) : null, from, to: to ?? from, km: r[5] ? Number(r[5].replace(',', '.')) : null };
    }).filter(s => s.date);
    out.edition = out.stages[0] ? Number(out.stages[0].date.slice(0, 4)) : null;
  } else {
    out.edition = out.countdown?.year ?? null;
  }
  return out;
}

/** First start / last arrival of each stage, from the stage pages (local time). */
async function asoStageTimes(race, stages, prevStages) {
  const out = [];
  for (const s of stages) {
    const old = prevStages?.find(p => p.num === s.num && p.date === s.date);
    if (s.rest) { out.push(s); continue; }
    const [y, m, d] = s.date.split('-').map(Number);
    let first = old?.firstStart ?? null, last = old?.lastArrival ?? null;
    const stale = !old?.timesAt || now - Date.parse(old.timesAt) > 12 * 3600e3;
    if (stale) {
      try {
        const t = text(await get(`${race.site}/stage-${s.num}`, { browser: true }));
        const fs = t.match(/First start \| : (\d{1,2}):(\d{2})/), la = t.match(/Last arrival \| : (\d{1,2}):(\d{2})/);
        first = fs ? iso(zoned(y, m, d, +fs[1], +fs[2], race.tz)) : null;
        last = la ? iso(zoned(y, m, d, +la[1], +la[2], race.tz)) : null;
      } catch { /* keep what we had */ }
    }
    out.push({ ...s, firstStart: first, lastArrival: last, timesAt: stale ? new Date().toISOString() : old?.timesAt });
  }
  return out;
}

/** Official rankings. Stage races: after the latest stage, plus the general classification after every stage. */
async function asoRankings(race, prevR) {
  const page = await get(`${race.site}/rankings`, { browser: true });
  const tabs = ajaxPaths(page);
  if (race.kind !== 'stage') {
    const rows = ranking(page, 10);
    return rows.length ? { result: rows } : null;
  }
  const latest = Number(tabs[0]?.match(/\/ranking\/(\d+)\//)?.[1]);
  if (!latest) return null;
  const host = new URL(race.site).origin;
  const tab = async (paths, code, limit) => {
    const p = paths.find(x => x.includes(`/${code}/`) && x.endsWith('/subtab')) ?? paths.find(x => x.includes(`/${code}/`));
    return p ? ranking(await get(`${host}${p}`, { browser: true }), limit) : [];
  };
  // General classification after each stage, kept from the previous run once the stage is done
  const history = [];
  for (let k = 1; k <= latest; k++) {
    const old = prevR?.v === RANKINGS_V ? prevR.history?.find(h => h.stage === k) : null;
    if (old && k < latest) { history.push(old); continue; }
    try {
      const sp = await get(`${race.site}/rankings/stage-${k}`, { browser: true });
      const paths = ajaxPaths(sp);
      let stage = await tab(paths, 'ite', 10);
      if (!stage.length) stage = await tab(paths, 'ete', 10); // team time trial
      const gc = await tab(paths, 'itg', 15);
      history.push({ stage: k, winner: stage[0] ?? null, stageTop: stage, gc });
    } catch { if (old) history.push(old); }
  }
  const lastPaths = ajaxPaths(await get(`${race.site}/rankings/stage-${latest}`, { browser: true }));
  const [points, mountains, youth, teams] = await Promise.all([tab(lastPaths, 'ipg', 5), tab(lastPaths, 'img', 5), tab(lastPaths, 'ijg', 5), tab(lastPaths, 'etg', 5)]);
  const h = history[history.length - 1];
  return { stage: latest, stageResult: h?.stageTop ?? [], gc: h?.gc ?? [], points, mountains, youth, teams, history: history.map(({ stage, winner, gc }) => ({ stage, winner, gc })) };
}

/** Starters of the current edition: [{ team, riders: [{ bib, rider, nat }] }]; null until the organiser publishes them. */
async function asoStartlist(race) {
  const html = await get(`${race.site}/riders`, { browser: true });
  const year = Number(html.match(/<title>[^<]*?(\d{4})\s*<\/title>/)?.[1]);
  const teams = html.split('<h3 class="list__heading">').slice(1).map(block => ({
    team: decode(block.match(/<a [^>]*>([^<]+)<\/a>/)?.[1] ?? '').trim(),
    riders: [...block.matchAll(/<span class="bib">(\d+)<\/span>[\s\S]*?flag--(\w+)"[\s\S]*?runner__link"[^>]*>\s*([^<]+?)\s*</g)].map(m => ({ bib: Number(m[1]), nat: m[2].toUpperCase(), rider: nameCase(decode(m[3])) })),
  })).filter(t => t.team && t.riders.length);
  return teams.length ? { year, teams } : null;
}

// Bump when the shape of the stored rankings changes, so finished races are read again
const RANKINGS_V = 3;

// ---------- RCS ----------
async function rcsSite(race) {
  const html = await get(race.site, { browser: true });
  const out = { source: race.site.replace(/^https:\/\/(www\.)?/, '').split('/')[0] };
  const c = html.match(/data-counter="(\d{12,})"/);
  if (c) out.countdown = { year: new Date(Number(c[1])).getUTCFullYear(), start: iso(Number(c[1])) };
  // Podium of the last edition (men's tab comes first)
  const i = html.indexOf('podio-wrapper');
  if (i > 0) {
    const t = text(html.slice(i, i + 4000));
    const m = t.match(/winner \| ([^|]+) \| ([^|]+) \| ([\d:]+) \| 2° \| ([^|]+) \| ([^|]+) \| ([^|]+) \| 3° \| ([^|]+) \| ([^|]+) \| ([^|]+) \|/);
    if (m) out.podium = [[m[1], m[2], m[3]], [m[4], m[5], m[6]], [m[7], m[8], m[9]]].map(([rider, team, time], k) => ({ pos: k + 1, rider: nameCase(rider.replace(/^(\S+) (.+)$/, '$2 $1')), team, time: k ? null : time, gap: k ? time : null }));
  }
  return out;
}

async function giroStages() {
  const html = await get('https://www.giroditalia.it/en/the-route/', { browser: true });
  const out = [];
  for (const m of html.matchAll(/<div class="row single-tappa" id="tappa-(\d+)"[^>]*data-tipologia="([^"]*)"[\s\S]*?(\d{2})\/(\d{2})\/(\d{4})[\s\S]*?partenza-value">([^<]+)<[\s\S]*?arrivo-value">([^<]+)<[\s\S]*?distanza-value">([\d.,]+)</g)) {
    const [, num, type, d, mo, y, from, to, km] = m;
    out.push({ num: Number(num), type: type.replace(/^\w/, c => c.toUpperCase()), rest: false, date: ymd(+y, +mo, +d), from: decode(from).split(' / ')[0].trim(), to: decode(to).split(' / ')[0].trim(), km: Number(km.replace(',', '.')) });
  }
  return out;
}

// ---------- Wikipedia winners ----------
const wikiClean = s => s.replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, '').replace(/\{\{[^|}]*\|\[\[(?:[^|\]]*\|)?([^\]]+)\]\][^}]*\}\}/g, '$1').replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1').replace(/'''?/g, '').trim();

async function wtWinners(y) {
  const w = await wikitext(`${y} UCI World Tour`);
  if (!w || !w.includes(`[[${y} `)) return [];
  const out = [];
  for (const row of w.split(/\n\|-/)) {
    const head = row.match(/^\s*!\s*scope="row"\s*\|.*?\[\[(?:([^|\]]*)\|)?([^\]]+)\]\]/m);
    const dateLine = row.split('\n').find(l => /^\|\s*\d{1,2}(?:\s*[–-]\s*\d{1,2})?\s+[A-Z]/.test(l) || /^\|\s*\d{1,2} [A-Z][a-z]+ [–-] \d/.test(l));
    if (!head || !dateLine) continue;
    const d = parseDate(dateLine, y);
    const winner = row.match(/flagathlete\|\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/i);
    // Races still to come have no winner yet but already have their page
    if (d) out.push({ race: head[2].trim(), page: (head[1] ?? head[2]).trim(), date: ymd(d.y, d.m, d.d), winner: winner?.[1].trim() ?? null });
  }
  return out;
}

async function champsWinners(race) {
  const page = race.tag === 'worlds' ? `${race.year} UCI Road World Championships` : `${race.year} European Road Championships`;
  const events = [];
  for (const [label, sub, tier] of [["Men's road race", "Men's road race", 3], ["Men's time trial", "Men's time trial", 2]]) {
    const w = await wikitext(`${page} – ${sub}`);
    if (!w) continue;
    const d = parseDate(infobox(w, ['date', 'dates']) ?? '', race.year);
    const first = infobox(w, ['first']);
    events.push({ title: label, date: d ? ymd(d.y, d.m, d.d) : null, winner: first ? wikiClean(first) : null, nat: infobox(w, ['first_nat']) ?? null, tier });
  }
  return events;
}

// ---------- assemble ----------
export async function collectCycling() {
  let prev = {};
  try { prev = JSON.parse(await readFile(new URL('../../public/data/cycling.json', import.meta.url), 'utf8')); } catch { /* first run */ }
  const status = {};
  let races;
  try {
    races = await uciCalendar();
    status.uci = `${races.length} races`;
  } catch (err) {
    status.uci = `failed: ${err.message}`;
    races = prev.races ?? [];
    if (!races.length) throw err;
  }
  const prevOf = r => prev.races?.find(p => p.id === r.id);

  // Organiser sites, one at a time per site
  await Promise.all([...new Set(races.filter(r => r.site).map(r => r.site))].map(async site => {
    const mine = races.filter(r => r.site === site);
    const r0 = mine[0];
    try {
      const info = r0.org === 'aso' ? await asoSite(r0) : await rcsSite(r0);
      if (r0.org === 'aso') info.startlist = await asoStartlist(r0).catch(() => null);
      if (/giroditalia/.test(site)) { info.stages = await giroStages().catch(() => []); info.edition = info.stages[0] ? Number(info.stages[0].date.slice(0, 4)) : null; }
      for (const r of mine) {
        const p = prevOf(r);
        if (info.countdown?.year === r.year) { r.start = info.countdown.start; r.approx = r.org === 'rcs'; }
        r.source = info.source;
        // The organiser's page shows the latest edition: keep it only for the race of that year
        if (info.startlist?.year === r.year) r.startlist = info.startlist.teams;
        else if (p?.startlist) r.startlist = p.startlist;
        if (info.stages?.length && info.edition === r.year) {
          const near = Date.parse(r.start) - now < 60 * DAY && Date.parse(r.end) > now - 2 * DAY;
          r.stages = r.org === 'aso' && near ? await asoStageTimes(r, info.stages, p?.stages) : info.stages.map(s => ({ ...s, ...(p?.stages?.find(o => o.num === s.num && o.date === s.date && o.firstStart) ?? {}) }));
        }
        if (info.podium && r.year < Y + 1 && Date.parse(r.end) < now && info.countdown?.year !== r.year) r.podium = info.podium;
        // Official rankings: the site shows the latest edition held, i.e. its most recent race that has started
        const latestHeld = mine.filter(x => Date.parse(x.start) < now + 3600e3).pop();
        if (p?.rankings?.final && p.rankings.v === RANKINGS_V) r.rankings = p.rankings;
        else if (r.org === 'aso' && r === latestHeld) {
          const done = Date.parse(r.end) < now - 2 * DAY;
          try {
            const rk = await asoRankings(r, p?.rankings);
            if (rk) r.rankings = { ...rk, final: done, v: RANKINGS_V };
          } catch (err) { if (p?.rankings) r.rankings = p.rankings; status[r.name] = `rankings: ${err.message}`; }
        }
      }
      status[info.source] = 'ok';
    } catch (err) {
      status[site] = `failed: ${err.message.slice(0, 80)}`;
      for (const r of mine) { const p = prevOf(r); if (p) Object.assign(r, { start: p.start, approx: p.approx, stages: p.stages, rankings: p.rankings, podium: p.podium, startlist: p.startlist }); }
    }
  }));

  // Wikipedia: the season table (winners, and the title of every race page), then each race page
  let wiki = [];
  try { wiki = (await Promise.all([wtWinners(Y), wtWinners(Y + 1)])).flat(); status.wikipedia = `${wiki.filter(x => x.winner).length} winners`; } catch (err) { status.wikipedia = `failed: ${err.message}`; }
  const teamCodes = { ...(prev.teamCodes ?? {}) };
  let pages = 0;
  for (const r of races) {
    if (r.kind === 'champs' || Date.parse(r.start) > now) continue;
    const row = wiki.find(x => x.date === r.startDate);
    const p = prevOf(r)?.wiki;
    // A page is settled a few days after the race: keep what we have
    if (p?.result?.length && Date.parse(r.end) < now - 4 * DAY && p.v === WIKI_V) { r.wiki = p; continue; }
    if (!row) { if (p) r.wiki = p; continue; }
    try {
      const data = await raceWiki(row.page, r.year);
      if (data) { r.wiki = { ...data, v: WIKI_V }; pages++; } else if (p) r.wiki = p;
    } catch (err) { if (p) r.wiki = p; status[`wiki ${r.name}`] = err.message.slice(0, 80); }
  }
  // Team codes ("TVL men|2026") to names, once each
  const codes = new Set();
  const walk = x => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { if (TEAM_KEY.test(k) && typeof v === 'string' && v.includes('|')) codes.add(v); else walk(v); } };
  races.forEach(r => walk(r.wiki));
  let nationals = prev.nationals ?? null;
  try { const n = await nationalChampions(Y); if (n) { nationals = n; walk(n); } } catch (err) { status.nationals = err.message.slice(0, 80); }
  for (const c of codes) { try { await teamName(c, teamCodes); } catch { /* keep the code */ } }
  const name = c => (typeof c === 'string' && c.includes('|') ? teamCodes[c] ?? c.split('|')[0].replace(/ men$/, '') : c);
  const fix = x => { if (Array.isArray(x)) x.forEach(fix); else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { if (TEAM_KEY.test(k)) x[k] = name(v); else fix(v); } };
  races.forEach(r => r.wiki && fix(r.wiki));
  if (nationals) fix(nationals);
  status.wikiPages = `${pages} race pages read, ${Object.keys(teamCodes).length} teams`;

  // Races without official data from the organiser: stages and rankings from Wikipedia
  for (const r of races) {
    const wk = r.wiki;
    if (!wk) continue;
    if (!r.stages?.length && wk.stages?.length) r.stages = wk.stages.map(({ winner, winnerNat, winnerTeam, ...s }) => s);
    if (!r.rankings) r.rankings = wikiRankings(r, wk);
    if (!r.podium?.length && wk.podium?.length) r.podium = wk.podium.map(x => ({ pos: x.pos, rider: x.rider, team: x.team, time: null, gap: null }));
  }

  // Stage start times: official first start when the organiser publishes it, else ≈ local afternoon
  for (const r of races) {
    if (!r.stages) continue;
    r.stages = r.stages.map(s => {
      if (s.firstStart) return { ...s, start: s.firstStart, approx: false };
      const [y, m, d] = s.date.split('-').map(Number);
      return { ...s, start: iso(zoned(y, m, d, s.rest ? 12 : 12, s.rest ? 0 : 30, r.tz)), approx: true };
    });
    const first = r.stages.find(s => !s.rest);
    if (first && !first.approx) { r.start = first.start; r.approx = false; }
  }

  // Winners
  for (const r of races) {
    if (r.kind === 'champs') {
      try { r.events = await champsWinners(r); } catch { r.events = prevOf(r)?.events ?? []; }
      // Before Wikipedia has the race pages: the men's road race closes the championships
      if (!r.events.some(e => /road race/.test(e.title))) r.events.push({ title: "Men's road race", date: r.endDate, winner: null, tier: 3 });
      r.events = r.events.map(e => ({ ...e, start: iso(zoned(...e.date.split('-').map(Number), /road race/.test(e.title) ? 10 : 14, 0, r.tz)), approx: true })).sort((a, b) => a.start.localeCompare(b.start));
      continue;
    }
    // Wikipedia gives full names with accents ("Tadej Pogačar"); the organisers' "T. Pogacar" is the fallback
    const w = wiki.find(x => x.date === r.startDate);
    const official = r.rankings?.final ? (r.rankings.gc?.[0] ?? r.rankings.result?.[0]) : null;
    r.winner = Date.parse(r.end) < now ? w?.winner ?? official?.rider ?? r.podium?.[0]?.rider ?? null : null;
  }

  await geocodeStages(races, status);
  return { updated: new Date().toISOString(), status, races, nationals, teamCodes };
}

const WIKI_V = 2;
const TEAM_KEY = /^(team|winnerTeam|rrTeam|ittTeam)$/;

/** Wikipedia classification rows in the shape of the organisers' rankings. */
function wikiRankings(r, wk) {
  const rank = rows => rows.map((x, i) => {
    const t = x.time ?? '';
    const gap = i > 0 && /^\+/.test(t.trim()) ? t.replace(/^\+\s*/, '+') : null;
    const s = gapSecs(t);
    return { pos: x.pos, rider: x.rider, team: x.team ?? '', time: i === 0 ? t : null, gap, gapS: i === 0 ? 0 : s, points: x.points ?? null };
  });
  const done = Date.parse(r.end) < now;
  if (r.kind === 'one-day') return wk.result?.length ? { final: done, result: rank(wk.result), source: 'Wikipedia' } : undefined;
  if (!wk.history?.length && !wk.result?.length) return undefined;
  const winners = new Map((wk.stages ?? []).filter(s => !s.rest).map(s => [s.num, s.winner ? { pos: 1, rider: s.winner, team: s.winnerTeam ?? '', time: null, gap: null, gapS: 0, points: null } : s.winnerTeam ? { pos: 1, rider: null, team: s.winnerTeam, time: null, gap: null, gapS: 0, points: null } : null]));
  const history = (wk.history ?? []).map(h => ({ stage: h.stage, winner: winners.get(h.stage) ?? null, gc: rank(h.gc) }));
  const last = history[history.length - 1];
  return {
    final: done, stage: last?.stage ?? null, source: 'Wikipedia',
    gc: wk.result?.length && done ? rank(wk.result) : last?.gc ?? rank(wk.result ?? []),
    points: rank(wk.classes?.points ?? []), mountains: rank(wk.classes?.mountains ?? []), youth: rank(wk.classes?.youth ?? []),
    history,
  };
}

/** "+ 5' 22"" -> 322; the leader's total time is not a gap. */
function gapSecs(t) {
  if (!t || !/^\s*\+/.test(t)) return /s\.?\s*t/i.test(t ?? '') ? 0 : null;
  const m = t.replace(/^[\s+]+/, '').replace(/[″]/g, '"').replace(/[′’]/g, "'").match(/(?:(\d+)\s*h)?\s*(?:(\d+)\s*')?\s*(?:(\d+)\s*")?/);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : null;
}

// ---------- Stage towns on the map (OpenStreetMap Nominatim, 1 request a second, answers cached in the repo) ----------
const GEO_FILE = join(dirname(fileURLToPath(import.meta.url)), '../../public/data/cycling-geo.json');
const COUNTRY_NAME = { BEL: 'Belgium', FRA: 'France', ITA: 'Italy', ESP: 'Spain', NED: 'Netherlands', GER: 'Germany', SUI: 'Switzerland', DEN: 'Denmark', POL: 'Poland', SLO: 'Slovenia', AUS: 'Australia', CAN: 'Canada', UAE: 'United Arab Emirates', CHN: 'China' };
const km = (a, b) => { const R = 6371, d = Math.PI / 180, x = (b[0] - a[0]) * d * Math.cos((a[1] + b[1]) / 2 * d), y = (b[1] - a[1]) * d; return R * Math.hypot(x, y); };

/** Adds `fromLoc` / `toLoc` ([lon, lat]) to the stages of the races under way or coming; towns far from their race are dropped. */
async function geocodeStages(races, status) {
  let geo = {};
  try { geo = JSON.parse(await readFile(GEO_FILE, 'utf8')); } catch { /* first run */ }
  let budget = Number(process.env.GEO_BUDGET ?? 150), last = 0, dirty = false;
  const ask = async q => {
    if (q in geo) return geo[q] || null;
    if (budget <= 0) return null;
    budget--;
    const wait = 1100 - (Date.now() - last);
    if (wait > 0) await new Promise(ok => setTimeout(ok, wait));
    last = Date.now();
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20e3) });
      if (!res.ok) return null;
      const j = await res.json();
      geo[q] = j[0] ? [+(+j[0].lon).toFixed(4), +(+j[0].lat).toFixed(4)] : 0;
      dirty = true;
      return geo[q] || null;
    } catch { return null; }
  };
  // "Falset . Costa Daurada" is the town and its region: ask for the town; then try the town alone (a stage can cross the border)
  const find = async (raw, r, country) => {
    const town = raw.split(/\s+[-.]\s+|\.\s*/)[0].trim();
    return (await ask(`${town}, ${country ?? COUNTRY_NAME[r.country] ?? r.country}`)) ?? (await ask(town));
  };
  for (const r of races) {
    if (!r.stages || r.year < Y) continue;
    for (const s of r.stages) {
      if (s.rest) continue;
      for (const [k, town, country] of [['fromLoc', s.from, s.fromCountry], ['toLoc', s.to, s.toCountry]]) {
        const p = town ? await find(town, r, country) : null;
        // A wrong namesake can be a continent away: stage races stay within a few hundred km of their centre
        if (p && (!r.loc || km(p, r.loc) < 1800)) s[k] = p;
      }
    }
  }
  if (dirty) await writeFile(GEO_FILE, JSON.stringify(geo, null, 1));
  status.geocoding = `${Object.keys(geo).length} towns, ${budget} lookups left`;
}
