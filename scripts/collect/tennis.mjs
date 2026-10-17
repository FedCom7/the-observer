// Men's tennis around the Grand Slams, all automatic:
// - dates of the four Slams (WTA's public tournament calendar, same dates for men);
// - the men's singles draw of the latest Slam, round by round with scores (ESPN);
// - the ATP ranking, top 100 (ESPN);
// - every men's singles champion since 1877 (Wikipedia), for the all-time and Open Era tallies.
import { readFile } from 'node:fs/promises';
import { get, iso, wikitext, zoned } from './lib.mjs';
import { grid, plain } from './teamsParse.mjs';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/tennis/atp';
const SLAMS = {
  'AUSTRALIAN OPEN': { name: 'Australian Open', short: 'AO', tz: 'Australia/Melbourne', place: 'Melbourne Park', surface: 'Hard', color: '#0091d2', loc: [144.98, -37.82] },
  'ROLAND GARROS': { name: 'Roland Garros', short: 'RG', tz: 'Europe/Paris', place: 'Stade Roland Garros, Paris', surface: 'Clay', color: '#d35220', loc: [2.25, 48.85] },
  WIMBLEDON: { name: 'Wimbledon', short: 'W', tz: 'Europe/London', place: 'All England Club, London', surface: 'Grass', color: '#3c7d3e', loc: [-0.21, 51.43] },
  'US OPEN': { name: 'US Open', short: 'USO', tz: 'America/New_York', place: 'Flushing Meadows, New York', surface: 'Hard', color: '#2a5ab8', loc: [-73.85, 40.75] },
};

async function slamDates() {
  // Four-month windows (the calendar API caps long ranges): from a year ago to fifteen months ahead
  const day = t => new Date(t).toISOString().slice(0, 10), n = Date.now();
  const windows = Array.from({ length: 7 }, (_, k) => [n - 380 * 86400e3 + k * 120 * 86400e3, n - 380 * 86400e3 + (k + 1) * 120 * 86400e3]);
  const lists = await Promise.all(windows.map(([a, b]) =>
    get(`https://api.wtatennis.com/tennis/tournaments/?page=0&pageSize=200&excludeLevels=ITF&from=${day(a)}&to=${day(b)}`, { browser: true, json: true })));
  const seen = new Set();
  return lists.flatMap(j => j.content ?? []).filter(t => (seen.has(t.tournamentGroup?.id + '-' + t.year) ? false : (seen.add(t.tournamentGroup?.id + '-' + t.year), true))).filter(t => t.level === 'Grand Slam' || t.tournamentGroup?.level === 'Grand Slam').flatMap(t => {
    const key = Object.keys(SLAMS).find(k => (t.tournamentGroup?.name ?? t.title).toUpperCase().includes(k));
    if (!key) return [];
    const s = SLAMS[key];
    const [y, m, d] = t.startDate.split('-').map(Number), [y2, m2, d2] = t.endDate.split('-').map(Number);
    return [{ key, ...s, year: Number(t.year), start: iso(zoned(y, m, d, 11, 0, s.tz)), end: iso(zoned(y2, m2, d2, key === 'AUSTRALIAN OPEN' ? 19 : 15, 0, s.tz)), startDate: t.startDate, endDate: t.endDate }];
  }).sort((a, b) => a.start.localeCompare(b.start));
}

export const ROUND_ORDER = ['Round 1', 'Round 2', 'Round 3', 'Round 4', 'Quarterfinal', 'Semifinal', 'Final'];
const roundIndex = r => (/qualif/i.test(r) ? -1 : ROUND_ORDER.indexOf(r.replace(/^(\d)(?:st|nd|rd|th) Round$/, 'Round $1')));

/** The men's singles draw of the Slam being played on a given day, from ESPN's scoreboard. */
export async function slamDraw(day) {
  const j = await get(`${SITE}/scoreboard?dates=${day.replace(/-/g, '')}`, { json: true });
  const ev = (j.events ?? []).find(e => e.major);
  if (!ev) return null;
  const g = (ev.groupings ?? []).find(x => /^Men's Singles$/i.test(x.grouping?.displayName ?? ''));
  if (!g) return null;
  const matches = g.competitions.filter(c => !/qualif/i.test(c.round?.displayName ?? '')).map(c => ({
    id: c.id, round: c.round?.displayName ?? '', r: roundIndex(c.round?.displayName ?? ''), date: c.date ?? c.startDate ?? null,
    state: c.status?.type?.state ?? 'pre', detail: c.status?.type?.detail ?? '', court: c.venue?.court ?? null,
    players: (c.competitors ?? []).map(p => ({
      id: p.athlete?.id ?? p.id, name: p.athlete?.displayName ?? p.athlete?.shortName ?? 'TBD', short: p.athlete?.shortName ?? null, country: p.athlete?.flag?.alt ?? p.athlete?.citizenshipCountry?.abbreviation ?? null,
      seed: p.seed ? Number(p.seed) || null : (p.curatedRank?.current && p.curatedRank.current < 99 ? null : null), winner: !!p.winner, sets: (p.linescores ?? []).map(l => ({ g: l.value, tb: l.tiebreak ?? null, won: !!l.winner })),
    })),
  })).filter(m => m.r >= 0).sort((a, b) => a.r - b.r);
  return { id: ev.id, name: ev.name, start: ev.date, end: ev.endDate ?? null, matches };
}

async function rankings() {
  const j = await get(`${SITE}/rankings`, { json: true });
  const r = j.rankings?.[0];
  return {
    name: r?.name ?? 'ATP Rankings', updated: r?.update ?? null,
    ranks: (r?.ranks ?? []).slice(0, 100).map(x => ({ rank: x.current, prev: x.previous, points: x.points, trend: x.trend, name: x.athlete?.displayName, short: x.athlete?.shortname ?? null, country: x.athlete?.flag?.alt ?? x.athlete?.citizenshipCountry ?? null, id: x.athlete?.id })),
  };
}

/** Every champion since 1877: [{ year, slam, name, country }] */
async function champions() {
  const w = await wikitext("List of Grand Slam men's singles champions");
  const sec = w?.split(/==\s*Champions by year\s*==/)[1]?.split(/\n==[^=]/)[0] ?? '';
  // The champions table is the one with a column per Slam (the others are legends)
  const table = sec.split(/\n\{\|/).map(t => t.split(/\n\|\}/)[0]).filter(t => /\n\|\s*'''(?:\[\[)?\d{4}/.test(t)).join('\n|-\n');
  const slams = ['Australian Open', 'French Open', 'Wimbledon', 'US Open'];
  const out = [];
  // grid() expands the merged cells of the years before a Slam existed, so columns stay aligned
  for (const row of grid(table)) {
    const year = row[0]?.raw.match(/(\d{4})/)?.[1];
    if (!year || row[0].head && /Year/.test(row[0].text)) continue;
    row.slice(1, 5).forEach((c, i) => {
      if (!c || c.head) return;
      const country = c.raw.match(/flag\|icon\|([A-Z]{3})/)?.[1] ?? null;
      const name = plain(c.raw.replace(/\{\{small\|[^}]*\}\}/g, '')).replace(/\(.*?\)/g, '').trim();
      if (!name || !/[A-Za-z]{2}/.test(name) || /[{}]|no competition|not held|tournament|cancel|—|n\/a/i.test(name)) return;
      out.push({ year: Number(year), slam: slams[i], name, country });
    });
  }
  return out;
}

export async function collectTennis() {
  let prev = {};
  try { prev = JSON.parse(await readFile(new URL('../../public/data/tennis.json', import.meta.url), 'utf8')); } catch { /* first run */ }
  const status = {};
  const step = async (k, fn, fallback) => { try { const v = await fn(); status[k] = 'ok'; return v; } catch (err) { status[k] = `failed: ${err.message.slice(0, 60)}`; return fallback; } };
  const slams = await step('slams', slamDates, prev.slams ?? []);
  const now = Date.now();
  // The draw of the Slam under way, or else of the latest one played
  const latest = [...slams].reverse().find(s => Date.parse(s.start) <= now);
  let draw = prev.draw ?? null;
  if (latest && (!draw || draw.slamKey !== `${latest.key}${latest.year}` || Date.parse(latest.end) > now - 2 * 86400e3)) {
    // ESPN gives the whole draw for a day in the middle of the event, and the latest matches for the last day: merge both
    const mid = new Date(Math.min(now, Date.parse(latest.start) + 7 * 86400e3)).toISOString().slice(0, 10);
    const last = new Date(Math.min(now, Date.parse(latest.end))).toISOString().slice(0, 10);
    const d = await step('draw', async () => {
      const [a, b] = [await slamDraw(mid), mid === last ? null : await slamDraw(last)];
      if (!a && !b) return null;
      const byId = new Map([...(a?.matches ?? []), ...(b?.matches ?? [])].map(m => [m.id, m]));
      return { ...(b ?? a), matches: [...byId.values()].sort((x, y) => x.r - y.r) };
    }, null);
    if (d) draw = { ...d, slamKey: `${latest.key}${latest.year}`, slam: latest };
  }
  const champs = prev.champions?.length && prev.championsAt && now - Date.parse(prev.championsAt) < 7 * 86400e3 ? prev.champions : await step('champions', champions, prev.champions ?? []);
  return {
    updated: new Date().toISOString(), status, slams, draw,
    rankings: await step('rankings', rankings, prev.rankings ?? null),
    champions: champs, championsAt: champs !== prev.champions ? new Date().toISOString() : prev.championsAt,
  };
}
