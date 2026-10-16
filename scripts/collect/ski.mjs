// Alpine skiing from the FIS website, fully automatic:
// - season calendar (World Cup + World Championships) -> events
// - event details: every race with discipline, gender and the official start time of each run
//   (FIS fills times in a few days before the race; until then the usual time is used, marked approximate)
// - results (top 10) of finished races, World Cup standings (overall and per discipline)
import { readFile } from 'node:fs/promises';
import { decode, get, iso, zoned } from './lib.mjs';

const FIS = 'https://www.fis-ski.com/DB';
const DAY = 86400e3;
const now = Date.now();

// Season code: the 2026-27 season is "2027"
const season = new Date().getUTCMonth() >= 6 ? new Date().getUTCFullYear() + 1 : new Date().getUTCFullYear();

const DISC = { DH: 'Downhill', SG: 'Super G', GS: 'Giant Slalom', SL: 'Slalom', AC: 'Alpine Combined', TC: 'Team Combined', PG: 'Parallel', TP: 'Team Parallel' };
/** Usual first-run start, local time, until FIS publishes the real one. */
const USUAL = [[/downhill training/i, '11:00'], [/downhill/i, '11:00'], [/super g/i, '11:30'], [/giant/i, '10:00'], [/slalom/i, '10:00'], [/combined/i, '10:30'], [/parallel/i, '12:00']];

const text = html => decode(html.replace(/<[^>]+>/g, ' | ')).replace(/\s+/g, ' ').replace(/(\s*\|\s*)+/g, ' | ').replace(/^\s*\|\s*|\s*\|\s*$/g, '').trim();

/** Events of a calendar category (WC = World Cup, WSC = World Championships). */
async function calendar(category) {
  const html = await get(`${FIS}/alpine-skiing/calendar-results.html?eventselection=&sectorcode=AL&seasoncode=${season}&categorycode=${category}`, { browser: true });
  return html.split('class="table-row').slice(1).flatMap(r => {
    const id = r.match(/eventid=(\d+)/)?.[1];
    if (!id) return [];
    const parts = text(r).split(' | ');
    const place = parts.find((p, i) => i > 4 && /^[A-Z][\w' -]+$/.test(p) && !/^(WC|WSC|AL|D|P|C|W|M)$/.test(p)) ?? '';
    const country = parts.find(p => /^[A-Z]{3}$/.test(p) && !['WSC', 'AL'].includes(p)) ?? '';
    return [{ id, place, country, category }];
  });
}

/** Races of one event, with run times when published. */
async function eventDetails(ev) {
  const html = await get(`${FIS}/general/event-details.html?sectorcode=AL&eventid=${ev.id}&seasoncode=${season}`, { browser: true });
  const title = decode(html.match(/<h1[^>]*>([^<]+)<\/h1>/)?.[1] ?? ev.place).trim();
  return html.split('class="table-row reset-padding').slice(1).flatMap(r => {
    const raceid = r.match(/raceid=(\d+)/)?.[1];
    if (!raceid) return [];
    const [date, time, tz] = ['date', 'time', 'timezone'].map(k => r.match(new RegExp(`data-${k}="([^"]*)"`))?.[1] ?? '');
    const t = text(r);
    const parts = t.split(' | ');
    const codexAt = parts.findIndex(p => /^\d{4}$/.test(p));
    const name = parts[codexAt + 1] ?? '';
    const cat = parts[codexAt + 3] ?? '';
    // Gender cells are single letters (M / W) after the category; both present means a mixed team event
    const after = parts.slice(codexAt + 2, codexAt + 8);
    const hasM = after.includes('M'), hasW = after.includes('W');
    const gender = hasM && !hasW ? 'men' : hasW && !hasM ? 'women' : /team|parallel/i.test(name) ? 'mixed' : hasM ? 'men' : 'women';
    if (/training/i.test(name) || cat === 'TRA') return []; // keep official races only
    const runs = [...t.matchAll(/\b(1st|2nd|3rd)\s*\|\s*(\d{1,2}:\d{2})/g)].map(m => ({ run: m[1], time: m[2] }));
    const cancelled = /title="Cancelled"|Cancelled/.test(r) && !/Not cancelled/.test(r.match(/title="[^"]*cancel[^"]*"/i)?.[0] ?? 'Not cancelled');
    const local = runs[0]?.time || time;
    const usual = USUAL.find(([re]) => re.test(name))?.[1] ?? '10:00';
    const [y, m, d] = date.split('-').map(Number);
    const zone = tz || 'Europe/Zurich';
    const at = hm => { const [hh, mm] = hm.split(':').map(Number); return iso(zoned(y, m, d, hh, mm, zone)); };
    return [{
      raceid, eventid: ev.id, category: ev.category, place: title.replace(/\s*\([A-Z]{3}\)$/, ''), country: ev.country || (title.match(/\(([A-Z]{3})\)/)?.[1] ?? ''),
      discipline: name, gender, start: at(local || usual), approxTime: !local, tz: zone,
      runs: runs.map(x => ({ run: x.run, start: at(x.time) })), cancelled,
    }];
  });
}

/** Top ten of a finished race. */
async function results(raceid) {
  const html = await get(`${FIS}/general/results.html?sectorcode=AL&raceid=${raceid}`, { browser: true });
  const body = html.slice(html.indexOf('id="events-info-results"'));
  return body.split('class="table-row"').slice(1, 11).map(r => {
    const p = text(r).split(' | ').filter(x => x && x !== '-->');
    // rank | bib | fis code | NAME | year | NAT | time | diff ...
    const nat = p.find(x => /^[A-Z]{3}$/.test(x)) ?? '';
    const natAt = p.indexOf(nat);
    return { rank: Number(p[0]) || null, name: p[3] ?? '', nation: nat, time: p[natAt + 1] ?? '', gap: p[natAt + 2] ?? '' };
  }).filter(x => x.rank);
}

/** World Cup standings: overall plus per-discipline points, for one gender. */
async function standings(s, gender) {
  const html = await get(`${FIS}/alpine-skiing/cup-standings.html?sectorcode=AL&seasoncode=${s}&cupcode=WC&disciplinecode=ALL&gendercode=${gender}`, { browser: true });
  return html.split('class="table-row').slice(1, 26).map(r0 => {
    const r = r0.slice(r0.indexOf('>') + 1); // drop the rest of the opening tag
    const p = text(r).split(' | ').filter(x => x && x !== '&nbsp;');
    const pts = code => { const i = p.indexOf(code); return i >= 0 && /^[\d']+$/.test(p[i + 2] ?? '') ? Number(p[i + 2].replace(/'/g, '')) : null; };
    const overallAt = p.indexOf('ALL');
    return {
      name: p[0], nation: p[1], rank: Number(p[overallAt + 1]) || null, points: Number((p[overallAt + 2] ?? '').replace(/'/g, '')) || 0,
      DH: pts('DH'), SG: pts('SG'), GS: pts('GS'), SL: pts('SL'),
    };
  }).filter(x => x.name && x.rank);
}

export async function collectSki() {
  let previous = null;
  try { previous = JSON.parse(await readFile(new URL('../../public/data/ski.json', import.meta.url), 'utf8')); } catch { /* first run */ }
  const prevRaces = new Map((previous?.races ?? []).map(r => [r.raceid, r]));

  const events = [...await calendar('WC'), ...await calendar('WSC').catch(() => [])];
  const races = [];
  for (const ev of events) {
    // Event details change only near race day: refresh events within [-10, +21] days, reuse the rest
    const known = [...prevRaces.values()].filter(r => r.eventid === ev.id);
    const near = known.length === 0 || known.some(r => Math.abs(Date.parse(r.start) - now) < 21 * DAY);
    if (!near) { races.push(...known); continue; }
    try { races.push(...await eventDetails(ev)); } catch { races.push(...known); }
  }
  // Results for races finished in the last 10 days (or missing)
  for (const r of races) {
    const t = Date.parse(r.start);
    const old = prevRaces.get(r.raceid);
    if (old?.results?.length) { r.results = old.results; continue; }
    if (t < now - 3 * 3600e3 && t > now - 10 * DAY && !r.cancelled) {
      try { r.results = await results(r.raceid); } catch { /* not yet */ }
    }
  }
  races.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  // Standings: this season once racing starts, otherwise last season's final table
  // Until the first World Cup race is run, show last season's final standings
  const started = races.some(r => r.category === 'WC' && Date.parse(r.start) < now - 3 * 3600e3 && !r.cancelled);
  const sSeason = started ? season : season - 1;
  const st = { season: sSeason, final: !started, men: await standings(sSeason, 'M').catch(() => []), women: await standings(sSeason, 'W').catch(() => []) };

  const worlds = races.filter(r => r.category === 'WSC');
  return {
    updated: new Date().toISOString(),
    season,
    races,
    standings: st,
    worlds: worlds.length ? { place: worlds[0].place, from: worlds[0].start, to: worlds[worlds.length - 1].start } : null,
  };
}
