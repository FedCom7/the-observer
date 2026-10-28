// Alpine skiing beyond the next race (FIS): the complete result of every finished race
// (both runs, skis), kept one file per race in ski-races/<season>/<raceid>.json; World Cup
// points of every athlete in every discipline and the Nations Cup, this season and last;
// the history of the crystal globes (Wikipedia).
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { decode, get, wikitext } from './lib.mjs';

const FIS = 'https://www.fis-ski.com/DB';
const DATA = new URL('../../public/data/', import.meta.url);
const flat = html => decode(html.replace(/<[^>]+>/g, ' | ')).replace(/\s+/g, ' ').replace(/(\s*\|\s*)+/g, ' | ').replace(/-->/g, '').replace(/(\s*\|\s*)+/g, ' | ').trim();
const num = s => (s == null || s === '' || s === '---' ? null : Number(String(s).replace(/['’]/g, '')));
const DISC = { Overall: 'ALL', Downhill: 'DH', 'Super G': 'SG', 'Super-G': 'SG', 'Giant Slalom': 'GS', Slalom: 'SL', 'Alpine Combined': 'AC', Combined: 'AC', Parallel: 'PAR' };

/** Complete result of one race: rank, bib, name, skis, year, nation, run times, total, gap, cup points. */
async function raceResult(raceid, discipline) {
  const twoRun = /slalom/i.test(discipline) && !/parallel/i.test(discipline);
  const html = await get(`${FIS}/general/results.html?sectorcode=AL&raceid=${raceid}`, { browser: true });
  const body = html.slice(html.indexOf('id="events-info-results"'));
  const rows = [];
  for (const r of body.split('class="table-row"').slice(1)) {
    const p = flat(r).split('|').map(x => x.trim()).filter(Boolean);
    // rank | bib | FIS code | NAME | skis | year | NATION | run 1 | run 2 | total | gap | FIS points | cup points
    const fisAt = p.findIndex(x => /^\d{6,8}$/.test(x));
    const natAt = p.findIndex((x, i) => i > fisAt + 1 && /^[A-Z]{3}$/.test(x));
    if (fisAt < 1 || natAt < 0) continue;
    const rankCell = fisAt >= 2 && /^\d+$/.test(p[fisAt - 2]) ? +p[fisAt - 2] : null;
    const rest = p.slice(natAt + 1);
    const isTime = x => /^(\d+:)?\d{1,2}\.\d{2}$/.test(x);
    const run1 = twoRun && isTime(rest[0]) ? rest[0] : null, run2 = twoRun && isTime(rest[1]) ? rest[1] : null;
    const total = twoRun ? (run2 && isTime(rest[2]) ? rest[2] : null) : isTime(rest[0]) ? rest[0] : null;
    rows.push({
      rank: rankCell, bib: num(p[fisAt - 1]), name: p[fisAt + 1] ?? '', skis: natAt - fisAt > 3 ? p[fisAt + 2] : null, year: num(p[natAt - 1]), nation: p[natAt],
      run1, run2, time: total, gap: rankCell === 1 ? '0.00' : rest.find(x => /^\+\d/.test(x)) ?? null, points: rankCell ? num(rest.filter(x => /^\d+$/.test(x)).at(-1)) : null,
      status: rankCell ? null : (p.find(x => /^(DNF|DNS|DSQ|DNQ)/.test(x)) ?? (run1 && !run2 ? 'Out after run 1' : 'DNF')),
    });
  }
  return rows;
}

/** World Cup (cupcode WC) or Nations Cup (NC) standings, every discipline at once. */
async function cup(season, cupcode, gender) {
  const html = await get(`${FIS}/alpine-skiing/cup-standings.html?sectorcode=AL&seasoncode=${season}&cupcode=${cupcode}&disciplinecode=ALL&gendercode=${gender}`, { browser: true });
  const t = flat(html);
  const out = new Map();
  // "NAME | NAT | Overall | ALL | 1 | 1'626 | Downhill | DH | 1 | 706 | Slalom | SL | --- | …", one block per athlete
  const heads = [...t.matchAll(/([^|]+?) \| ([A-Z]{3}) \| Overall \| ALL \| /g)];
  heads.forEach((m, k) => {
    const name = m[1].trim();
    if (out.has(name) || /^(Name|Nation)$/.test(name)) return;
    const seg = t.slice(m.index + m[0].length - 'Overall | ALL | '.length, heads[k + 1]?.index ?? t.length);
    const cells = seg.split('|').map(x => x.trim()).filter(Boolean);
    const by = {};
    for (let i = 0; i < cells.length - 1; i++) {
      const code = DISC[cells[i]];
      if (!code || cells[i + 1] !== code && !(code === 'AC' && /^(AC|CO|SC)$/.test(cells[i + 1]))) continue;
      by[code] = cells[i + 2] === '---' ? null : { rank: num(cells[i + 2]), points: num(cells[i + 3]) };
    }
    if (by.ALL) out.set(name, { name, nation: m[2], ...by });
  });
  return [...out.values()].sort((a, b) => (a.ALL?.rank ?? 999) - (b.ALL?.rank ?? 999));
}

/** Crystal globes by season from Wikipedia: overall and each discipline. */
async function globes(gender) {
  const w = await wikitext(`List of FIS Alpine Ski World Cup ${gender}'s champions`);
  if (!w) return [];
  const start = w.indexOf('==Winners by discipline==');
  const table = w.slice(w.indexOf('{| class="wikitable sortable"', start));
  // Column order differs between the men's and women's pages: read it from the header
  const codeOf = h => (/Overall/.test(h) ? 'ALL' : /Giant/i.test(h) ? 'GS' : /Slalom/.test(h) ? 'SL' : /Downhill/.test(h) ? 'DH' : /Super-G/.test(h) ? 'SG' : /Combined/.test(h) ? 'AC' : /Parallel/.test(h) ? 'PAR' : null);
  const head = table.slice(0, table.search(/\n\|-[^\n]*\n!\s*\[\[/)).split('\n').filter(l => l.startsWith('!')).map(codeOf).filter(Boolean);
  const out = [];
  for (const raw of table.split(/\n\|-[^\n]*/).slice(1)) {
    const y = raw.match(/!\s*\[\[[^\]|]*\|(\d{4})\]\]/);
    if (!y) continue;
    const cells = raw.split('\n').filter(l => /^\|(?!-|\})/.test(l));
    const row = { year: +y[1] };
    cells.slice(0, head.length).forEach((c, i) => {
      const nat = c.match(/\{\{flagicon\|([A-Z]{3})\}\}/)?.[1];
      const name = c.match(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/)?.[1];
      if (name) row[head[i]] = { name, nation: nat === 'CHE' ? 'SUI' : nat === 'DEU' ? 'GER' : nat ?? null };
    });
    out.push(row);
  }
  return out.sort((a, b) => a.year - b.year);
}

export async function collectSkiSeason() {
  const now = Date.now();
  const cal = JSON.parse(await readFile(new URL('ski.json', DATA), 'utf8'));
  const season = cal.season;
  let prev = null;
  try { prev = JSON.parse(await readFile(new URL('ski-season.json', DATA), 'utf8')); } catch { /* first run */ }
  const dir = new URL(`ski-races/${season}/`, DATA);
  await mkdir(dir, { recursive: true });
  const have = new Set(await readdir(dir).catch(() => []));
  // Finished races: read once, reread for a day while FIS may still correct them
  const races = [];
  for (const r of cal.races.filter(x => !x.cancelled && Date.parse(x.start) < now - 3 * 3600e3)) {
    const file = `${r.raceid}.json`;
    let x = null;
    if (have.has(file)) try { x = JSON.parse(await readFile(new URL(file, dir), 'utf8')); } catch { /* reread */ }
    if (!x || (!x.final && now - Date.parse(r.start) > 3 * 3600e3)) {
      try {
        const rows = await raceResult(r.raceid, r.discipline);
        x = { ...r, rows, final: rows.length > 0 && now - Date.parse(r.start) > 30 * 3600e3 };
        await writeFile(new URL(file, dir), JSON.stringify(x));
      } catch { if (!x) continue; }
    }
    if (x.rows.length) races.push({ raceid: x.raceid, place: x.place, country: x.country, discipline: x.discipline, gender: x.gender, start: x.start, category: x.category, podium: x.rows.filter(y => y.rank && y.rank <= 3).map(y => ({ rank: y.rank, name: y.name, nation: y.nation, skis: y.skis })), finishers: x.rows.filter(y => y.rank).length, points: x.rows.filter(y => y.points).map(y => [y.name, y.nation, y.points, y.skis]) });
  }
  const safe = async (fn, fallback) => { try { return await fn(); } catch { return fallback; } };
  const standings = {};
  for (const s of [season, season - 1]) {
    const old = prev?.standings?.[s];
    // Last season's tables are final: keep them once read
    if (s < season && old?.men?.length) { standings[s] = old; continue; }
    standings[s] = {
      men: await safe(() => cup(s, 'WC', 'M'), old?.men ?? []),
      women: await safe(() => cup(s, 'WC', 'W'), old?.women ?? []),
      nations: await safe(() => cup(s, 'NC', 'A'), old?.nations ?? []),
      nationsMen: await safe(() => cup(s, 'NC', 'M'), old?.nationsMen ?? []),
      nationsWomen: await safe(() => cup(s, 'NC', 'W'), old?.nationsWomen ?? []),
    };
  }
  const history = prev?.history?.men?.length && now - Date.parse(prev.history.at ?? 0) < 7 * 86400e3 ? prev.history : {
    at: new Date(now).toISOString(),
    men: await safe(() => globes('men'), prev?.history?.men ?? []),
    women: await safe(() => globes('women'), prev?.history?.women ?? []),
  };
  return { updated: new Date(now).toISOString(), season, races, standings, history };
}
