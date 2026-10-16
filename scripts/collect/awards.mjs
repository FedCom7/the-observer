// Movie awards season, from Cannes in May to the Oscars in March. All automatic:
// - Dates: Gold Derby's season calendar (every nominations announcement and ceremony,
//   plus each Oscar step: shortlists, voting windows, luncheon), Wikipedia infoboxes.
// - Nominees and winners: the Wikipedia page of each edition of each award.
// - Who is favoured: Gold Derby's public odds (experts and users) for every Oscar
//   category, with a daily history kept in the file.
import { readFile } from 'node:fs/promises';
import { decode, get, infobox, iso, ordinal, parseDate, wikitext, zoned } from './lib.mjs';
import { OSCAR_CATS, colonList, festivalCat, nomineeTables, oscarCat, rowTables, scripterRows } from './awardsParse.mjs';
import { officialDates, radar } from './awardsWatch.mjs';

const DAY = 86400e3;
const now = Date.now();
const today = new Date().toISOString().slice(0, 10);
// The season runs from Cannes (May) to the Oscars (March): S = film year, C = ceremony year
const S = new Date().getUTCMonth() >= 4 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1;
const C = S + 1;

/** Every award followed, in the order they usually happen. */
const AWARDS = [
  { id: 'cannes', name: 'Cannes Film Festival', short: 'Cannes', group: 'festival', pages: [`${S} Cannes Film Festival`], mode: 'colon', tz: 'Europe/Paris' },
  { id: 'venice', name: 'Venice Film Festival', short: 'Venice', group: 'festival', pages: [`${ordinal(S - 1943)} Venice International Film Festival`], mode: 'colon', tz: 'Europe/Rome' },
  { id: 'telluride', name: 'Telluride Film Festival', short: 'Telluride', group: 'festival', pages: [`${ordinal(S - 1973)} Telluride Film Festival`], mode: 'none', tz: 'America/Denver' },
  { id: 'tiff', name: 'Toronto International Film Festival', short: 'TIFF', group: 'festival', pages: [`${S} Toronto International Film Festival`], mode: 'colon', tz: 'America/Toronto' },
  { id: 'gotham', name: 'Gotham Awards', short: 'Gotham', group: 'critics', pages: [`Gotham Independent Film Awards ${S}`, `${S} Gotham Awards`], tz: 'America/New_York' },
  { id: 'nbr', name: 'National Board of Review', short: 'NBR', group: 'critics', pages: [`National Board of Review Awards ${S}`], mode: 'auto', tz: 'America/New_York' },
  { id: 'nyfcc', name: 'New York Film Critics Circle', short: 'NYFCC', group: 'critics', pages: [`${S} New York Film Critics Circle Awards`], mode: 'auto', tz: 'America/New_York' },
  { id: 'lafca', name: 'Los Angeles Film Critics Association', short: 'LAFCA', group: 'critics', pages: [`${S} Los Angeles Film Critics Association Awards`], mode: 'auto', tz: 'America/Los_Angeles' },
  { id: 'ccda', name: "Critics' Choice Documentary Awards", short: 'CC Docs', group: 'critics', pages: [`${ordinal(S - 2015)} Critics' Choice Documentary Awards`], tz: 'America/Los_Angeles' },
  { id: 'cca', name: "Critics' Choice Awards", short: 'Critics Choice', group: 'critics', pages: [`${ordinal(C - 1995)} Critics' Choice Awards`], tz: 'America/Los_Angeles' },
  { id: 'globes', name: 'Golden Globe Awards', short: 'Globes', group: 'major', pages: [`${ordinal(C - 1943)} Golden Globe Awards`], tz: 'America/Los_Angeles' },
  { id: 'nsfc', name: 'National Society of Film Critics', short: 'NSFC', group: 'critics', pages: [`${S} National Society of Film Critics Awards`], mode: 'auto', tz: 'America/New_York' },
  { id: 'dga', name: 'Directors Guild of America Awards', short: 'DGA', group: 'guild', pages: [`${ordinal(C - 1948)} Directors Guild of America Awards`], tz: 'America/Los_Angeles' },
  { id: 'ace', name: 'ACE Eddie Awards (editing)', short: 'ACE', group: 'guild', pages: [`American Cinema Editors Awards ${C}`], tz: 'America/Los_Angeles' },
  { id: 'wga', name: 'Writers Guild of America Awards', short: 'WGA', group: 'guild', pages: [`${ordinal(C - 1948)} Writers Guild of America Awards`], tz: 'America/Los_Angeles' },
  { id: 'ves', name: 'Visual Effects Society Awards', short: 'VES', group: 'guild', pages: [`${ordinal(C - 2002)} Visual Effects Society Awards`], tz: 'America/Los_Angeles' },
  { id: 'csa', name: 'Artios Awards (casting)', short: 'CSA', group: 'guild', pages: [`${ordinal(C - 1985)} Artios Awards`], tz: 'America/Los_Angeles' },
  { id: 'muahs', name: 'Make-Up Artists & Hair Stylists Guild', short: 'MUAHS', group: 'guild', pages: [`Make-Up Artists & Hair Stylists Guild Awards ${S}`], tz: 'America/Los_Angeles' },
  { id: 'annie', name: 'Annie Awards (animation)', short: 'Annie', group: 'guild', pages: [`${ordinal(C - 1973)} Annie Awards`], tz: 'America/Los_Angeles' },
  { id: 'bafta', name: 'BAFTA Film Awards', short: 'BAFTA', group: 'major', pages: [`${ordinal(C - 1947)} British Academy Film Awards`], tz: 'Europe/London' },
  { id: 'cdg', name: 'Costume Designers Guild Awards', short: 'CDG', group: 'guild', pages: [`${ordinal(C - 1998)} Costume Designers Guild Awards`], tz: 'America/Los_Angeles' },
  { id: 'pga', name: 'Producers Guild of America Awards', short: 'PGA', group: 'guild', pages: [`${ordinal(C - 1989)} Producers Guild of America Awards`], tz: 'America/Los_Angeles' },
  { id: 'adg', name: 'Art Directors Guild Awards', short: 'ADG', group: 'guild', pages: [`Art Directors Guild Awards ${S}`], tz: 'America/Los_Angeles' },
  { id: 'sag', name: 'Actor Awards (SAG-AFTRA)', short: 'Actor Awards', group: 'guild', pages: [`${ordinal(C - 1994)} Actor Awards`], tz: 'America/Los_Angeles' },
  { id: 'cas', name: 'Cinema Audio Society Awards', short: 'CAS', group: 'guild', pages: [`Cinema Audio Society Awards ${S}`], tz: 'America/Los_Angeles' },
  { id: 'spirit', name: 'Independent Spirit Awards', short: 'Spirit', group: 'critics', pages: [`${ordinal(C - 1985)} Independent Spirit Awards`], tz: 'America/Los_Angeles' },
  { id: 'mpse', name: 'Golden Reel Awards (sound editing)', short: 'MPSE', group: 'guild', pages: [`Golden Reel Awards ${S}`], tz: 'America/Los_Angeles' },
  { id: 'asc', name: 'American Society of Cinematographers', short: 'ASC', group: 'guild', pages: [`${S} American Society of Cinematographers Awards`], tz: 'America/Los_Angeles' },
  { id: 'scripter', name: 'USC Scripter Awards (adaptation)', short: 'Scripter', group: 'guild', pages: ['USC Scripter Awards'], mode: 'scripter', tz: 'America/Los_Angeles' },
  { id: 'scl', name: 'Society of Composers & Lyricists Awards', short: 'SCL', group: 'guild', pages: [`${ordinal(C - 2019)} Society of Composers & Lyricists Awards`], tz: 'America/Los_Angeles' },
  { id: 'oscars', name: 'Academy Awards', short: 'Oscars', group: 'oscars', pages: [`${ordinal(C - 1928)} Academy Awards`], tz: 'America/Los_Angeles' },
];

/** Each award's own site, read for explicitly announced dates (twice a day). */
const OFFICIAL = {
  globes: 'https://goldenglobes.com/', sag: 'https://www.actorawards.org/', cca: 'https://www.criticschoice.com/', pga: 'https://producersguild.org/pga-awards/',
  dga: 'https://www.dga.org/Awards/Annual.aspx', wga: 'https://awards.wga.org/', ace: 'https://americancinemaeditors.org/eddie-awards/', asc: 'https://theasc.com/asc-awards',
  adg: 'https://www.adg.org/awards', cas: 'https://cinemaaudiosociety.org/cas-awards/', annie: 'https://annieawards.org/', spirit: 'https://www.filmindependent.org/spirit-awards/',
  nbr: 'https://nationalboardofreview.org/', nyfcc: 'https://www.nyfcc.com/', nsfc: 'https://nationalsocietyoffilmcritics.com/', scripter: 'https://scripter.usc.edu/',
  scl: 'https://thescl.com/scl-awards/', gotham: 'https://www.thegotham.org/', mpse: 'https://www.mpse.org/', cdg: 'https://www.costumedesignersguild.com/',
  csa: 'https://www.castingsociety.com/', muahs: 'https://www.local706.org/', lafca: 'https://www.lafca.net/', ccda: 'https://www.criticschoice.com/',
};

// ---------- Gold Derby season calendar ----------
const CAL_MAP = [
  [/Critics Choice Documentary/i, 'ccda'], [/Critics Choice/i, 'cca'], [/Scripter/i, 'scripter'], [/Society of Composers/i, 'scl'], [/Golden Globe/i, 'globes'], [/Producers Guild/i, 'pga'], [/Art Directors/i, 'adg'], [/Directors Guild/i, 'dga'], [/Writers Guild/i, 'wga'],
  [/Actor Awards|SAG/i, 'sag'], [/BAFTA|British Academy/i, 'bafta'], [/Costume Designers/i, 'cdg'], [/Make-?Up Artists/i, 'muahs'],
  [/Cinema Audio/i, 'cas'], [/Golden Reel|MPSE/i, 'mpse'], [/Visual Effects Society/i, 'ves'], [/American Cinema Editors|\bACE\b/i, 'ace'], [/Casting Society|Artios/i, 'csa'],
  [/Spirit Awards/i, 'spirit'], [/Annie Awards/i, 'annie'], [/Society of Cinematographers/i, 'asc'], [/Gotham/i, 'gotham'], [/National Board of Review/i, 'nbr'],
  [/New York Film Critics/i, 'nyfcc'], [/Los Angeles Film Critics/i, 'lafca'], [/National Society of Film Critics/i, 'nsfc'], [/Oscar|Academy|Governors Awards|Scientific and Technical/i, 'oscars'],
];
const MON = { jan: 1, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7, aug: 8, sept: 9, sep: 9, oct: 10, nov: 11, dec: 12 };

/** Usual local time of each kind of announcement (marked approximate). */
function timeOf(award, kind) {
  if (award === 'oscars') return kind === 'ceremony' ? [16, 0] : kind === 'nominations' ? [5, 30] : kind === 'shortlist' ? [12, 0] : kind === 'voting-end' ? [17, 0] : kind === 'voting-start' ? [9, 0] : [12, 0];
  if (award === 'bafta') return kind === 'ceremony' ? [19, 0] : [7, 0];
  if (award === 'globes') return kind === 'ceremony' ? [17, 0] : [5, 0];
  if (award === 'sag') return kind === 'ceremony' ? [17, 0] : [6, 0];
  if (award === 'cca') return kind === 'ceremony' ? [16, 0] : [8, 0];
  return kind === 'ceremony' ? [18, 0] : [9, 0];
}

async function seasonCalendar() {
  const url = `https://www.goldderby.com/film/${C - 1}/${ordinal(C - 1928)}-and-${ordinal(C - 1927)}-oscars-calendar-key-dates-${C}-${C + 1}/`;
  const html = await get(url, { browser: true });
  const lines = decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '\n')).split('\n').map(l => l.trim()).filter(Boolean);
  const start = lines.findIndex(l => /^Here is the current Oscars calendar/.test(l));
  const out = [];
  let year = null;
  for (let i = start; i < lines.length; i++) {
    const l = lines[i];
    if (/^We are still waiting/.test(l)) break;
    if (/^20\d\d$/.test(l)) { year = Number(l); continue; }
    const m = l.match(/^([A-Z][a-z]+)\.? (\d{1,2})(?:\s*[-–]\s*\d{1,2})? —\s*(.*)$/);
    if (!m || !year) continue;
    const text = (m[3] || lines[i + 1] || '').trim();
    if (/^\d/.test(m[2]) && /[-–]\s*\d/.test(l.split('—')[0])) continue; // multi-day festivals (Palm Springs, Sundance…)
    const id = CAL_MAP.find(([re]) => re.test(text))?.[1];
    if (!id) continue;
    if (/for TV|Sports|Children|Short Form|Innovation|Documentary Motion|Tea Party|Lunch(?!eon)/i.test(text) && !/Luncheon/.test(text)) continue;
    const kind = /voting begins/i.test(text) ? 'voting-start' : /voting ends/i.test(text) ? 'voting-end' : /Longlist/i.test(text) ? 'longlist' : /Shortlist/i.test(text) ? 'shortlist'
      : /Nominations? Announced/i.test(text) ? 'nominations' : /Luncheon/i.test(text) ? 'luncheon' : /Governors Awards/i.test(text) ? 'governors' : /Scientific/i.test(text) ? 'scitech' : 'ceremony';
    const mo = MON[m[1].toLowerCase()];
    if (!mo) continue;
    const def = AWARDS.find(a => a.id === id);
    const [hh, mm] = timeOf(id, kind);
    const exact = l.match(/(\d{1,2})(?::(\d\d))? ?(a\.m\.|p\.m\.) PT/i) ?? text.match(/(\d{1,2})(?::(\d\d))? ?(a\.m\.|p\.m\.) PT/i);
    const t = exact ? zoned(year, mo, Number(m[2]), (Number(exact[1]) % 12) + (/p/i.test(exact[3]) ? 12 : 0), Number(exact[2] ?? 0), 'America/Los_Angeles') : zoned(year, mo, Number(m[2]), hh, mm, def?.tz ?? 'America/Los_Angeles');
    // Only this season: from Cannes to this year's Oscars
    if (t < Date.UTC(S, 4, 1) || t > Date.UTC(C, 3, 30)) continue;
    out.push({ award: id, kind, title: text.replace(/\s+/g, ' '), date: iso(t), approx: !exact });
  }
  return { url, events: out };
}

// ---------- Wikipedia: nominees and winners ----------
async function readEdition(a, prev, force = false) {
  // Pages are re-read every six hours, on every run around their announcement days,
  // and at once when the news radar sees nominations or winners
  const hot = force || prev?.dates?.some(d => Math.abs(Date.parse(d.date) - now) < 2 * DAY);
  if (prev?.fetched && now - Date.parse(prev.fetched) < 6 * 3600e3 && !hot) return prev;
  for (const page of a.pages) {
    const w = await wikitext(page);
    if (!w) continue;
    const box = infobox(w, ['date', 'dates', 'ceremony_date', 'awarded_date']) ?? '';
    // Some infoboxes are written on one line: look for the date range anywhere in the lead
    const range = (box + w.slice(0, 4000)).match(/\{\{Date range\|(\d{4})\|(\d{1,2})\|(\d{1,2})\|(\d{4})\|(\d{1,2})\|(\d{1,2})/i);
    const d = range ? null : parseDate(box, C);
    const announced = infobox(w, ['announced', 'nominations_announced', 'announcement_date']);
    // Festivals: only the official awards section (up to the next top-level heading)
    const section = (w.split(/\n==\s*(?:Official awards|Awards|Winners|Prizes)\s*==\s*\n/i)[1] ?? '').split(/\n==[^=]/)[0];
    // ...and of that, the main competition: the text up to its second sub-heading
    const subs = section.split(/\n(?====[^=])/);
    const main = subs.slice(1).find(x => !/^===\s*[^=\n]*(?:tribute|honorary|lifetime|jur(?:y|ies))/i.test(x));
    const official = main ? `${subs[0]}\n${main}` : subs[0];
    let cats = a.mode === 'none' ? [] : a.mode === 'scripter' ? scripterRows(w, S) : a.mode === 'colon' ? [...colonList(official), ...rowTables(official)] : nomineeTables(w);
    if (a.mode === 'auto' && !cats.length) cats = colonList(w);
    // Festivals list sections ("In Competition", "Independent awards"): keep only the official prizes
    const categories = cats.map(c => ({ name: c.category, oscar: a.group === 'festival' ? festivalCat(c.category) : oscarCat(c.category, a.id), nominees: c.nominees.map(({ film, people, role, song, winner }) => ({ film, people, role, song, winner })) }))
      .filter((c, i, all) => all.findIndex(x => x.name === c.name) === i);
    return {
      page, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.replace(/ /g, '_'))}`, fetched: new Date().toISOString(),
      span: range ? [iso(zoned(+range[1], +range[2], +range[3], 12, 0, a.tz)), iso(zoned(+range[4], +range[5], +range[6], 20, 0, a.tz))] : null,
      wikiDate: d ? iso(zoned(d.y, d.m, d.d, ...timeOf(a.id, 'ceremony'), a.tz)) : null,
      wikiAnnounced: announced ? (p => (p ? iso(zoned(p.y, p.m, p.d, ...timeOf(a.id, 'nominations'), a.tz)) : null))(parseDate(announced, S)) : null,
      categories,
    };
  }
  // Not written yet: remember the attempt, so the six-hour pause applies to it too
  return prev?.page ? { ...prev, fetched: new Date().toISOString() } : { page: null, url: null, fetched: new Date().toISOString(), span: null, wikiDate: null, wikiAnnounced: null, categories: [] };
}

// ---------- Gold Derby odds ----------
const GD = 'https://www.goldderby.com/wp-json';

async function league(title) {
  const list = await get(`${GD}/wp/v2/gd-featured-api?search=${encodeURIComponent(title)}&per_page=5`, { json: true, browser: true });
  return list.find(x => x.title.rendered.trim().toLowerCase() === title.toLowerCase()) ?? null;
}

async function odds(prev) {
  // Gold Derby refreshes its odds a few times a day: every three hours is enough
  if (prev?.updated && now - Date.parse(prev.updated) < 3 * 3600e3) return prev;
  // Before the nominations: "Oscars Nominations C"; after them, the winners' league "Oscars C"
  const [nomL, winL] = await Promise.all([league(`Oscars Nominations ${C}`), league(`Oscars ${C}`)]);
  const L = winL ?? nomL;
  if (!L) return prev ?? null;
  const name = L.title.rendered;
  const same = prev?.league === name;
  // Category ids are stable, but the endpoint that names them returns a random few per call:
  // learn them over the runs, and find which ids exist by probing the per-category odds
  // Seen on the Oscar leagues so far (the same ids are used every year); the rest are learned
  const KNOWN = { 14: 'Best Film Editing', 15: 'Best Makeup and Hairstyling', 16: 'Best Original Score', 1: 'Best Production Design', 2: 'Best Actor', 3: 'Best Picture', 4: 'Best Actress', 5: 'Best Supporting Actor', 6: 'Best Supporting Actress', 7: 'Best Director', 8: 'Best Adapted Screenplay', 9: 'Best Original Screenplay', 10: 'Best Animated Feature', 12: 'Best Cinematography', 13: 'Best Costume Design', 17: 'Best Song', 18: 'Best Casting', 19: 'Best Sound', 20: 'Best Visual Effects', 22: 'Best Documentary Feature' };
  const catMap = { ...KNOWN, ...(same ? prev.catMap ?? {} : {}) };
  let ids = same ? prev.ids ?? null : null;
  if (!ids) {
    ids = [];
    for (let id = 1; id <= 32; id++) {
      const rows = await get(`${GD}/gameplay/v1/latest-odds-v3/${L.id}/${id}/experts`, { json: true, browser: true }).catch(() => []);
      if (Array.isArray(rows) && rows.length) ids.push(id);
    }
  }
  for (let k = 0; k < 6 && ids.some(id => !catMap[id]); k++) {
    await new Promise(r => setTimeout(r, 1500));
    for (const who of ['experts', 'users']) {
      const j = await get(`${GD}/gameplay/v1/categories-odds/${L.id}/${who}?r=${Date.now()}${k}`, { json: true, browser: true }).catch(() => ({}));
      for (const c of j.categories ?? []) catMap[c.category_id] = c.category_name;
    }
  }
  const out = { league: name, stage: winL ? 'winners' : 'nominations', url: `https://www.goldderby.com/odds/expert-odds/oscars-${C}-predictions-best-picture/`, updated: new Date().toISOString(), catMap, ids, categories: {}, history: same ? prev.history ?? {} : {} };
  for (const id of ids) {
    const cat = catMap[id] ? oscarCat(catMap[id], 'oscars') : null;
    if (!cat) continue;
    for (const who of ['experts', 'users']) {
      const list = await get(`${GD}/gameplay/v1/latest-odds-v3/${L.id}/${id}/${who}`, { json: true, browser: true }).catch(() => null);
      if (!Array.isArray(list)) continue;
      const rows = list.slice(0, 15).map(o => ({ name: decode(o.title).trim(), film: decode(o.related_title ?? '').trim() || null, pct: parseFloat(o.percentage) || 0, was: parseFloat(o.old_percentage) || 0, fraction: o.fraction, winner: o.is_winner === '1' || o.is_winner === 1 }));
      (out.categories[cat] ??= {})[who] = rows;
      // One point a day per contender (top 10), to draw how the race moves over the season
      const h = ((out.history[cat] ??= {})[who] ??= []);
      const point = { d: today, v: Object.fromEntries(rows.slice(0, 10).map(r => [r.name, r.pct])) };
      if (h.length && h[h.length - 1].d === today) h[h.length - 1] = point; else h.push(point);
    }
  }
  return out;
}

export async function collectAwards() {
  let prev = {};
  try { prev = JSON.parse(await readFile(new URL('../../public/data/awards.json', import.meta.url), 'utf8')); } catch { /* first run */ }
  if (prev.season !== S) prev = {};
  const status = {};
  let cal = { events: prev.calendar ?? [], url: prev.calendarUrl ?? null };
  try { cal = await seasonCalendar(); status.calendar = `${cal.events.length} dates`; } catch (err) { status.calendar = `failed: ${err.message.slice(0, 80)}`; }

  // News radar first: it tells which awards just announced something
  let news = prev.radar ?? [];
  try { news = await radar(S, C, AWARDS.map(x => x.id)); status.radar = `${news.length} headlines`; } catch (err) { status.radar = `failed: ${err.message.slice(0, 60)}`; }
  const hotIds = new Set(news.filter(n => (n.kind === 'nominations' || n.kind === 'winners') && now - Date.parse(n.time) < 2 * DAY).map(n => n.award));

  const awards = [];
  for (const a of AWARDS) {
    const old = prev.awards?.find(x => x.id === a.id);
    let ed = null;
    try { ed = await readEdition(a, old?.edition ? { ...old.edition, dates: old.dates } : null, hotIds.has(a.id)); } catch (err) { status[a.id] = `wiki: ${err.message.slice(0, 60)}`; ed = old?.edition ?? null; }

    // Official site: dates the organisers state explicitly (twice a day)
    let official = old?.official ?? null;
    if (OFFICIAL[a.id] && (!official || now - Date.parse(official.fetched) > 12 * 3600e3 || hotIds.has(a.id))) {
      try {
        const f = officialDates(await get(OFFICIAL[a.id], { browser: true }), S, C);
        official = { fetched: new Date().toISOString(), url: OFFICIAL[a.id], ...Object.fromEntries(Object.entries(f).map(([k, x]) => [k, { date: iso(zoned(x.y, x.m, x.d, ...timeOf(a.id, k), a.tz)), text: x.sentence }])) };
      } catch (err) { status[`${a.id}-official`] = err.message.slice(0, 50); }
    }

    // Dates, best source first: the official site, Gold Derby's calendar, Wikipedia, then the news
    const dates = [];
    const add = (kind, d) => { if (!dates.some(x => x.kind === kind)) dates.push({ award: a.id, kind, ...d }); };
    for (const kind of ['nominations', 'ceremony']) if (official?.[kind]) add(kind, { title: `${a.name} ${kind}`, date: official[kind].date, approx: true, source: 'official site', url: official.url });
    for (const e of cal.events.filter(x => x.award === a.id && a.id !== 'oscars')) {
      if (e.kind === 'nominations' || e.kind === 'ceremony') add(e.kind, { ...e, source: 'Gold Derby' });
      else dates.push({ ...e, source: 'Gold Derby' });
    }
    if (a.mode !== 'scripter') {
      if (ed?.span && a.group === 'festival') add('festival', { title: a.name, date: ed.span[0], end: ed.span[1], approx: true, source: 'Wikipedia' });
      if (ed?.wikiAnnounced) add('nominations', { title: `${a.name} nominations`, date: ed.wikiAnnounced, approx: true, source: 'Wikipedia' });
      if (ed?.wikiDate && a.group !== 'festival') add('ceremony', { title: a.name, date: ed.wikiDate, approx: true, source: 'Wikipedia' });
    }
    // From the news: a date announcement, or — when nominations are out — the ceremony date they mention;
    // the nominations themselves happened when the first article came out
    for (const n of news.filter(x => x.award === a.id)) {
      if (n.kind === 'date' && n.date) add(/nominat/i.test(n.title) ? 'nominations' : 'ceremony', { title: n.title, date: n.date, approx: true, source: n.source, url: n.url });
      if (n.kind === 'nominations') {
        const first = news.filter(x => x.award === a.id && x.kind === 'nominations').map(x => x.time).sort()[0];
        add('nominations', { title: n.title, date: first, approx: false, source: n.source, url: n.url });
        if (n.date) add('ceremony', { title: `${a.name} ceremony`, date: n.date, approx: true, source: n.source, url: n.url });
      }
    }

    const cats = ed?.categories ?? [];
    const state = cats.some(c => c.nominees.some(n => n.winner)) ? 'winners' : cats.length ? 'nominations' : 'pending';
    const { pages, mode, ...meta } = a;
    void pages; void mode;
    awards.push({ ...meta, dates: dates.sort((x, y) => x.date.localeCompare(y.date)), state, edition: ed, official, news: news.filter(n => n.award === a.id).slice(0, 5) });
  }

  let gd = prev.odds ?? null;
  try { gd = await odds(prev.odds); status.odds = gd ? `${Object.keys(gd.categories).length} categories (${gd.stage})` : 'no league yet'; } catch (err) { status.odds = `failed: ${err.message.slice(0, 80)}`; }

  // The Academy's own steps for this ceremony, plus the fixed eligibility deadline
  const oscarSteps = cal.events.filter(e => e.award === 'oscars');
  oscarSteps.push({ award: 'oscars', kind: 'eligibility', title: `Eligibility period ends: films must open by December 31, ${S}`, date: iso(zoned(S, 12, 31, 23, 59, 'America/Los_Angeles')), approx: false });

  return {
    season: S, ceremonyYear: C, updated: new Date().toISOString(), status,
    calendarUrl: cal.url, calendar: cal.events,
    oscarSteps: oscarSteps.sort((a, b) => a.date.localeCompare(b.date)),
    categories: OSCAR_CATS.map(([id, name]) => ({ id, name })),
    awards, odds: gd,
    radar: news.slice(0, 40),
  };
}
