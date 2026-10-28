// The Dakar's history: the winners of cars, bikes and trucks of every edition since 1979
// (Wikipedia, "List of winners"), with the make; read once a week.
import { readFile } from 'node:fs/promises';
import { wikitext } from './lib.mjs';

const link = s => s?.match(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/)?.[1] ?? s?.replace(/\{\{[^}]*\}\}/g, '').replace(/<[^>]+>/g, '').trim() ?? null;
const flag = s => s?.match(/\{\{flagicon\|([A-Z]{3})/)?.[1] ?? null;
const make = s => { const m = link(s); return m ? m.replace(/^(Mitsubishi|Peugeot|Citroën|Toyota|Volkswagen|Mini|Audi|Dacia|Ford|KTM|Honda|Yamaha|BMW|Cagiva|Husqvarna|GasGas|Hero|Kamaz|Iveco|Tatra|DAF|MAN|Mercedes-Benz|Renault|Hino|Range Rover|Porsche|Lada|Schlesser|Nissan|Sherco|Hummer|X-raid|Bowler|Rover|Perlini|Gas Gas).*$/i, '$1') : null; };

async function winners() {
  const w = await wikitext('Dakar Rally');
  if (!w) return [];
  const i = w.indexOf('===Cars, bikes and trucks===');
  const table = w.slice(w.indexOf('{|', i), w.indexOf('\n|}', i));
  const out = [];
  for (const raw of table.split(/\n\|-[^\n]*/).slice(1)) {
    const y = raw.match(/!\s*\[\[(\d{4}) Dakar Rally\|/);
    if (!y) continue;
    const cells = raw.split('\n').filter(l => /^\|(?!-|\})/.test(l)).map(l => l.slice(1).replace(/^\s*(?:rowspan|colspan)="?\d+"?\s*\|/, ''));
    if (cells.length < 5 || /cancel/i.test(raw)) { if (/cancel/i.test(raw)) out.push({ year: +y[1], cancelled: true }); continue; }
    out.push({
      year: +y[1], route: cells[0].replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1').replace(/<[^>]+>/g, '').trim(),
      car: { name: link(cells[1]), nation: flag(cells[1]), make: make(cells[2]) },
      bike: { name: link(cells[3]), nation: flag(cells[3]), make: make(cells[4]) },
      truck: cells[5] && !/Not held/i.test(cells[5]) ? { name: link(cells[5]), nation: flag(cells[5]), make: make(cells[6]) } : null,
    });
  }
  return out.sort((a, b) => a.year - b.year);
}

export async function collectDakarSeason() {
  let prev = null;
  try { prev = JSON.parse(await readFile(new URL('../../public/data/dakar-season.json', import.meta.url), 'utf8')); } catch { /* first run */ }
  if (prev?.winners?.length && Date.now() - Date.parse(prev.updated) < 7 * 86400e3) return prev;
  return { updated: new Date().toISOString(), winners: (await winners().catch(() => null)) ?? prev?.winners ?? [] };
}
