// Olympic Games, summer and winter, from Wikipedia (every page title is computed from the
// year, so the next edition is picked up as soon as its pages are written):
// - the next Games: dates, host, number of events, the day-by-day competition calendar
// - Italy at the next Games: quota places won so far, sport by sport, and how they were won
// - qualification in the key sports: nations qualified, Italy's places, upcoming qualifiers
// - the last Games: medal table and Italy's medallists
import { iso, parseDate, wikitext, zoned } from './lib.mjs';

const Y = new Date().getUTCFullYear();
const NOW = Date.now();

const KEY_SPORTS = {
  Summer: ['Athletics', 'Swimming', 'Cycling', 'Fencing', 'Volleyball', 'Gymnastics', 'Rowing', 'Sailing', 'Canoeing', 'Shooting', 'Judo', 'Tennis', 'Water polo', 'Basketball', 'Football', 'Boxing'],
  Winter: ['Alpine skiing', 'Biathlon', 'Cross-country skiing', 'Speed skating', 'Short-track speed skating', 'Luge', 'Bobsleigh', 'Figure skating', 'Snowboarding', 'Freestyle skiing', 'Ski jumping', 'Ice hockey', 'Curling'],
};

const unwiki = s => (s ?? '').replace(/<ref[\s\S]*?(?:<\/ref>|\/>)/g, '').replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\{\{sortname\|([^|}]+)\|([^|}]+)[^}]*\}\}/g, '$1 $2').replace(/\{\{(?:flagIOC2?|flagIOCteam)\|([A-Z]{3})[^}]*\}\}/g, '$1')
  .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1').replace(/\{\{dts\|([^}]*)\}\}/g, (_, d) => d.split('|').join(' '))
  .replace(/\{\{[^{}]*\}\}/g, '').replace(/<br\s*\/?>/g, ', ').replace(/<[^>]+>/g, '').replace(/''+|&nbsp;/g, ' ').replace(/\s+/g, ' ').replace(/^[,\s]+|[,\s]+$/g, '').trim();

/** Rows of the first wikitable after `from`, each as its list of raw cells. */
function tableRows(w, from) {
  const i = typeof from === 'string' ? w.indexOf(from) : w.search(from);
  if (i < 0) return [];
  const start = w.indexOf('{|', i), end = w.indexOf('\n|}', start);
  if (start < 0) return [];
  return w.slice(start, end < 0 ? undefined : end).split(/\n\|-[^\n]*/).slice(1).map(r => r.split('\n').filter(l => /^[|!]/.test(l))
    .flatMap(l => l.replace(/^[|!]/, '').split(/\s*(?:\|\||!!)\s*/))
    .map(c => c.replace(/^\s*(?:style|align|rowspan|colspan|class|nowrap|width)[^|[{]*\|(?!\|)/i, '').replace(/^nowrap\s*\|/, '').trim()));
}

const field = (w, k) => w.match(new RegExp(`\\|\\s*${k}\\s*=([^\\n]*)`))?.[1]?.trim() ?? '';
const dayOf = (text, year) => { const d = parseDate(unwiki(text), year); return d ? iso(Date.UTC(d.y, d.m - 1, d.d)) : null; };

// ---------- The Games ----------
async function games(year, season) {
  const w = await wikitext(`${year} ${season} Olympics`);
  if (!w) return null;
  const opening = dayOf(field(w, 'opening'), year), closing = dayOf(field(w, 'closing'), year);
  const host = unwiki(field(w, 'host_city')) || unwiki(field(w, 'location'));
  const events = unwiki(field(w, 'events'));
  return { year, season, host, opening, closing, events, calendar: calendar(w, year) };
}

/**
 * The competition calendar: one row per sport, one cell per day, with the number of
 * gold medal events (or 0 for days with competition only).
 */
function calendar(w, year) {
  const a = w.indexOf('<section begin="Calendar" />'), b = w.indexOf('<section end="Calendar"', a);
  if (a < 0) return null;
  const c = w.slice(a, b < 0 ? undefined : b);
  const month = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].findIndex(m => new RegExp(`\\|\\s*${m} ${year}`).test(c));
  if (month < 0) return null;
  let days = null;
  const sports = [];
  for (const row of c.split(/\n\|-[^\n]*/)) {
    const cells = [...row.matchAll(/^<!--(\d+)-->\s*[|!](.*)$/gm)].map(m => ({ day: Number(m[1]), v: m[2] }));
    if (!cells.length) continue;
    const name = [...row.matchAll(/\[\[[^\]|]+ at the \d{4} \w+ Olympics\|([^\]]+)\]\]/g)].pop()?.[1] ?? unwiki(row.split('\n')[0]).replace(/^\d+px\S*\s*/, '');
    if (!name || /ceremon/i.test(name)) continue;
    if (!days) {
      // Days are numbered within the month; a smaller number means the next month began
      let m = month, prev = 0;
      days = cells.map(x => { if (x.day < prev) m++; prev = x.day; return iso(Date.UTC(year, m, x.day)); });
    }
    const marks = cells.map(x => {
      const golds = x.v.match(/'''\s*(\d+)\s*'''|\|\s*(\d+)\s*$/);
      return golds ? Number(golds[1] ?? golds[2]) : /●/.test(x.v) ? 0 : null;
    });
    if (marks.some(v => v !== null)) sports.push({ name: name.trim(), marks, golds: marks.reduce((n, v) => n + (v ?? 0), 0) });
  }
  return days && sports.length ? { days, sports } : null;
}

// ---------- Medal tables ----------
async function medalTable(year, season) {
  const w = await wikitext(`${year} ${season} Olympics medal table`);
  if (!w) return null;
  const block = w.slice(w.indexOf('{{Medals table'));
  const host = field(block, 'host');
  const skip = new Set([...block.matchAll(/skip_([A-Z]{3})\s*=\s*yes/g)].map(m => m[1]));
  const by = {};
  for (const m of block.matchAll(/\b(gold|silver|bronze)_([A-Z]{3})\s*=\s*(\d+)/g)) (by[m[2]] ??= { code: m[2], gold: 0, silver: 0, bronze: 0 })[m[1]] = Number(m[3]);
  const rows = Object.values(by).filter(r => !skip.has(r.code)).map(r => ({ ...r, total: r.gold + r.silver + r.bronze }))
    .sort((a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze);
  rows.forEach((r, i) => { r.rank = i && rows[i - 1].gold === r.gold && rows[i - 1].silver === r.silver && rows[i - 1].bronze === r.bronze ? rows[i - 1].rank : i + 1; });
  return { year, season, host, nations: rows.length, rows };
}

// ---------- Italy ----------
async function italyAt(year, season) {
  const w = await wikitext(`Italy at the ${year} ${season} Olympics`);
  if (!w) return null;
  // Competitors by sport: Sport | Men | Women | Total
  const competitors = tableRows(w, /==\s*Competitors\s*==/).map(r => r.map(unwiki)).filter(r => r.length >= 4 && r[0] && !/^total$/i.test(r[0]) && /^\d*$/.test(r[r.length - 1]) && !/^sport$/i.test(r[0]))
    .map(r => ({ sport: r[0], men: Number(r[1]) || 0, women: Number(r[2]) || 0, total: Number(r[3]) || 0 }));
  // How each place was won: the first prose paragraph of each sport's section
  const how = {};
  for (const m of w.matchAll(/\n==\s*([^=\n]+?)\s*==\s*\n([\s\S]*?)(?=\n==[^=])/g)) {
    const para = m[2].split('\n').find(l => l.trim() && !/^[{|!=*[<]/.test(l.trim()));
    if (para && !/^(competitors|medalists|references|see also|external links)$/i.test(m[1])) how[m[1]] = unwiki(para).slice(0, 400);
  }
  // Medallists, for Games already held
  const medalists = tableRows(w, /==\s*Medalists\s*==/).filter(r => /\{\{(gold|silver|bronze) medal\}\}/.test(r[0] ?? '')).map(r => ({
    medal: r[0].match(/(gold|silver|bronze)/)[1], name: unwiki(r[1]), sport: unwiki(r[2]), event: unwiki(r[3]), date: dayOf(r[4] ?? '', year),
  }));
  return { year, season, competitors, how, medalists, total: Number(unwiki(field(w, 'competitors'))) || competitors.reduce((n, c) => n + c.total, 0) };
}

// ---------- Qualification, sport by sport ----------
async function qualification(sport, year, season) {
  const w = await wikitext(`${sport} at the ${year} ${season} Olympics – Qualification`);
  if (!w) return { sport, page: false };
  // Summary table: one row per nation with its quota total in the last cell
  const sum = tableRows(w, /==\s*(?:Qualification summary|Summary)\s*==/);
  const nations = sum.map(r => ({ code: r.join(' ').match(/\{\{flagIOC\w*\|([A-Z]{3})/)?.[1], total: Number(unwiki(r[r.length - 1]).replace(/\D/g, '')) || null })).filter(r => r.code);
  const ita = nations.find(n => n.code === 'ITA');
  // Timeline: event | date | location, possibly split by discipline header rows
  let discipline = null;
  const timeline = tableRows(w, /==\s*Timeline\s*==/).flatMap(r => {
    if (r.length === 1 && !/^Event/.test(unwiki(r[0]))) { discipline = unwiki(r[0]); return []; }
    if (r.length < 3 || /^Event$/i.test(unwiki(r[0]))) return [];
    const date = r[1].replace(/<br\s*\/?>/g, '\n').split('\n').map(s => s.trim()).find(s => /\d/.test(s)) ?? '';
    const d = parseDate(unwiki(date), year);
    return d ? [{ discipline, event: unwiki(r[0].split('\n')[0]), dates: unwiki(date), start: iso(Date.UTC(d.y, d.m - 1, d.d)), place: unwiki(r[2]) }] : [];
  });
  return { sport, page: true, nations: nations.length, places: nations.reduce((n, x) => n + (x.total ?? 0), 0), italy: ita?.total ?? 0, timeline };
}

/** The next edition of a season: the first year in the four-year cycle whose Games are not over. */
const nextYear = (first, season) => { let y = first; while (y < Y || (y === Y && NOW > Date.UTC(y, season === 'Winter' ? 2 : 8, 1))) y += 4; return y; };

async function edition(season) {
  const next = nextYear(season === 'Summer' ? 2028 : 2030, season);
  const last = next - 4;
  const [g, italy, prevGames, table, italyPrev] = await Promise.all([games(next, season), italyAt(next, season), games(last, season), medalTable(last, season), italyAt(last, season)]);
  // Sport-by-sport qualification, only when it is under way (two and a half years before the Games)
  const opening = g?.opening ? Date.parse(g.opening) : Date.UTC(next, season === 'Winter' ? 1 : 6, 1);
  const quals = opening - NOW < 2.5 * 365 * 86400e3 ? await Promise.all(KEY_SPORTS[season].map(s => qualification(s, next, season).catch(() => ({ sport: s, page: false })))) : [];
  return {
    next: g ?? { year: next, season, host: null, opening: null, closing: null, events: '', calendar: null },
    italy, qualification: quals,
    last: prevGames ? { ...prevGames, calendar: null, medals: table, italy: italyPrev ? { medalists: italyPrev.medalists, total: italyPrev.total } : null } : null,
  };
}

export async function collectOlympics() {
  const [summer, winter] = await Promise.all([edition('Summer'), edition('Winter')]);
  // Opening ceremony at the usual local evening start (approximate), in the host's time zone
  const TZ = [[/Los Angeles/, 'America/Los_Angeles'], [/Brisbane/, 'Australia/Brisbane'], [/French Alps|France/, 'Europe/Paris'], [/Salt Lake|Utah/, 'America/Denver']];
  for (const g of [summer.next, winter.next]) {
    const tz = TZ.find(([re]) => re.test(g.host ?? ''))?.[1];
    g.openingTime = g.opening && tz ? iso(zoned(Number(g.opening.slice(0, 4)), Number(g.opening.slice(5, 7)), Number(g.opening.slice(8, 10)), 20, 0, tz)) : g.opening;
  }
  return { updated: new Date().toISOString(), summer, winter };
}
