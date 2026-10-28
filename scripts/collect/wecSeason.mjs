// FIA WEC beyond this weekend, from the public results pages of fiawec.com: every
// session of the season (Hypercar classification: laps, times, gaps, average speed, best
// lap), kept one file per session in wec-sessions/<year>/<id>.json, every car with its
// crew, the manufacturers' pace round by round; Le Mans winners from Wikipedia.
// (The Al Kamel timing site moved to a new application in October 2026; these pages are
// the public replacement for the classifications.)
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { decode, get, wikitext } from './lib.mjs';

const WEC = 'https://www.fiawec.com';
const DATA = new URL('../../public/data/', import.meta.url);
const round = (v, d = 3) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const secs = t => { if (!t || t === '-') return null; const p = t.replace(/'/g, ':').split(':').map(Number); return p.reduce((a, v) => a * 60 + v, 0); };
const strip = s => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const title = s => s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

/** One results page: the session list (sidebar) and the first classification table. */
async function resultsPage(raceId, sessionId) {
  const html = await get(`${WEC}/en/page/resultats-1?raceId=${raceId}&sessionId=${sessionId}`, { browser: true });
  const sessions = [...html.matchAll(/data-live-id-param="(\d+)"[^>]*title="([^"]+)"/g)].map(m => ({ id: m[1], name: decode(m[2]) }));
  const i = html.indexOf('<table class="table table-sm table-standing');
  const rows = [];
  if (i >= 0) {
    const table = html.slice(i, html.indexOf('</table>', i));
    // Columns differ by session (a race has total time and the lap of the best lap; qualifying the time of day):
    // read them from the header. "Competitors" spans two cells (the pictures and the number).
    const heads = [...table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(m => strip(m[1]));
    const at = name => { const k = heads.indexOf(name); return k < 0 ? -1 : k >= 2 ? k + 1 : k; };
    for (const tr of table.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
      const c = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => strip(m[1]));
      if (c.length < 6) continue;
      const brand = tr.match(/alt="([^"#]+)"\s+class="brand-logo"/)?.[1] ?? null;
      const cell = name => (at(name) >= 0 ? c[at(name)] : null);
      rows.push({
        pos: Number(c[0]) || null, number: c[2].replace('#', ''), brand: brand ? title(brand) : null, team: title(c[3]), laps: Number(cell('Laps')) || null,
        time: cell('Total time'), gap: cell('Gap'), avg: Number(cell('Avg. (km/h)')) || null, best: cell('Best lap'), bestOn: Number(cell('On')) || null,
      });
    }
  }
  const cls = /HYPERCAR/i.test(html.match(/title="([^"]+)"[^>]*border-primary/)?.[1] ?? '') ? 'HYPERCAR' : /LMGT3/i.test(html.match(/title="([^"]+)"[^>]*border-primary/)?.[1] ?? '') ? 'LMGT3' : null;
  return { sessions, cls, state: null, rows };
}

/** A car's model, class and crew (fixed for the season: read once). */
async function car(year, num) {
  const html = await get(`${WEC}/en/car/${year}/${num}`, { browser: true });
  let vehicle = null, cls = null;
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { const j = JSON.parse(m[1]); const v = (j['@graph'] ?? []).find(g => g['@type'] === 'Vehicle'); if (v) { vehicle = v.name.replace(/^#\d+\s*/, ''); cls = v.vehicleConfiguration ?? null; } } catch { /* other block */ }
  }
  const drivers = [...new Set([...html.matchAll(/\/en\/driver\/\d{4}\/\d+[^>]*>[\s\S]{0,400}?alt="([^"]+)"/g)].map(m => decode(m[1])).filter(n => !/^#/.test(n)))]
    .map(n => { const w = n.split(' '); return w.length > 1 ? `${w.at(-1)} ${w.slice(0, -1).join(' ')}` : n; });
  return { vehicle: vehicle ? vehicle.replace(/\b([A-Z]{2,})\b/g, w => (w.length > 3 ? w[0] + w.slice(1).toLowerCase() : w)) : null, cls, drivers };
}

/** Le Mans wins by manufacturer and by driver, with the years. */
async function leMans() {
  const w = await wikitext('List of 24 Hours of Le Mans winners');
  if (!w) return null;
  const table = head => { const i = w.indexOf(head); if (i < 0) return []; const t = w.slice(w.indexOf('{|', i), w.indexOf('\n|}', i)); return t.split(/\n\|-[^\n]*/).slice(1); };
  const parse = rows => rows.map(r => {
    const head = r.match(/!\s*scope=row\s*\|([^\n]*)/)?.[1] ?? '';
    const sn = head.match(/\{\{sortname\|([^|}]+)\|([^|}]+)/);
    const name = sn ? `${sn[1]} ${sn[2]}` : head.match(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/)?.[1];
    const nat = head.match(/\{\{flagicon\|([^|}]+)/)?.[1] ?? null;
    const wins = Number(r.match(/\n\|\s*(\d+)\s*\n/)?.[1]);
    const years = [...r.matchAll(/\{\{24hLM\|(\d{4})\}\}/g)].map(m => +m[1]);
    return name && wins ? { name: name.replace(/ in motorsport$/, ''), nation: nat, wins, years } : null;
  }).filter(Boolean);
  return { manufacturers: parse(table('===By manufacturer===')), drivers: parse(table('===By driver===')).slice(0, 30) };
}

export async function collectWecSeason() {
  const now = Date.now();
  const cal = JSON.parse(await readFile(new URL('wec.json', DATA), 'utf8'));
  const year = cal.season;
  let prev = null;
  try { prev = JSON.parse(await readFile(new URL('wec-season.json', DATA), 'utf8')); } catch { /* first run */ }
  const dir = new URL(`wec-sessions/${year}/`, DATA);
  await mkdir(dir, { recursive: true });
  const have = new Set(await readdir(dir).catch(() => []));
  const rounds = [];
  const cars = { ...(prev?.year === year ? prev.cars : {}) };
  const started = cal.races.filter(r => r.year === year && r.sessions[0] && Date.parse(r.sessions[0].start) < now);
  for (const [i, r] of started.entries()) {
    const page = await get(r.url, { browser: true }).catch(() => null);
    const ids = page ? [...page.matchAll(/resultats-1\?raceId=(\d+)&amp;sessionId=(\d+)/g)] : [];
    if (!ids.length) { const old = prev?.rounds?.find(x => x.slug === r.slug); if (old) rounds.push(old); continue; }
    const raceId = ids[0][1];
    const first = await resultsPage(raceId, ids[0][2]).catch(() => null);
    const sessions = [];
    for (const s of first?.sessions ?? []) {
      const file = `${s.id}.json`;
      let x = null;
      if (have.has(file)) try { x = JSON.parse(await readFile(new URL(file, dir), 'utf8')); } catch { /* reread */ }
      if (!x || !x.final) {
        const res = s.id === ids[0][2] ? first : await resultsPage(raceId, s.id).catch(() => null);
        if (!res || !res.rows.length) continue;
        const end = Date.parse(r.end ?? r.start) + 86400e3;
        x = { id: s.id, round: i + 1, race: r.name, name: s.name, cls: res.cls, state: res.state, rows: res.rows, final: now > end + 86400e3 };
        await writeFile(new URL(file, dir), JSON.stringify(x));
      }
      sessions.push({ id: x.id, name: x.name, cls: x.cls, state: x.state });
      for (const row of x.rows) if (!cars[row.number]) cars[row.number] = null;
    }
    rounds.push({ round: i + 1, slug: r.slug, name: r.name, start: r.start, end: r.end, raceId, sessions });
  }
  // Cars: model, class, crew (read once a season)
  for (const num of Object.keys(cars).filter(k => !cars[k])) cars[num] = await car(year, num).catch(() => null);
  // Manufacturer pace per round: best lap against the best, in qualifying (hyperpole) and in the race
  const pace = {};
  for (const rd of rounds) {
    for (const s of rd.sessions) {
      const x = JSON.parse(await readFile(new URL(`${s.id}.json`, dir), 'utf8'));
      const kind = /^race$/i.test(s.name) ? 'race' : /hyperpole/i.test(s.name) ? 'hyperpole' : /qualifying/i.test(s.name) ? 'quali' : null;
      if (!kind) continue;
      const bestBy = {};
      const hyper = x.rows.filter(row => /hypercar/i.test(cars[row.number]?.cls ?? ''));
      if (!hyper.length) continue;
      for (const row of hyper) { const b = secs(row.best), m = row.brand; if (b && m) bestBy[m] = Math.min(bestBy[m] ?? Infinity, b); }
      const top = Math.min(...Object.values(bestBy));
      for (const [m, b] of Object.entries(bestBy)) ((pace[m] ??= {})[`${kind}${rd.round}`] = round((b / top - 1) * 100));
      if (kind === 'race') {
        const fin = hyper.filter(row => row.pos && row.brand);
        const bestPos = {};
        fin.forEach((row, k) => { if (!bestPos[row.brand]) bestPos[row.brand] = k + 1; });
        for (const [m, p] of Object.entries(bestPos)) (pace[m] ??= {})[`pos${rd.round}`] = p;
        const lead = fin[0]?.avg;
        for (const row of fin) if (row.avg && lead && !(pace[row.brand][`avg${rd.round}`])) pace[row.brand][`avg${rd.round}`] = round((1 - row.avg / lead) * 100);
      }
    }
  }
  const lm = (await leMans().catch(() => null)) ?? prev?.leMans ?? null;
  return { updated: new Date(now).toISOString(), year, rounds, cars, pace, leMans: lm };
}
