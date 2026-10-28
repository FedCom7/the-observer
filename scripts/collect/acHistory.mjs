// The America's Cup since 1851 (Wikipedia, "Challengers and defenders"): venue, defender,
// challenger, score and winner of every match; read once a week.
import { readFile } from 'node:fs/promises';
import { wikitext } from './lib.mjs';

const plain = s => (s ?? '').replace(/\{\{won\|align=left\s*\|\s*/g, '').replace(/\{\{flagicon\|[^}]*\}\}/g, '').replace(/\{\{nowrap\|([^}]*)\}\}/g, '$1').replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1').replace(/\{\{[^}]*\}\}/g, '').replace(/''+/g, '').replace(/<[^>]+>/g, ' ').replace(/\{\{|\}\}/g, '').replace(/\s+/g, ' ').replace(/^nowrap\|/, '').trim();
const flag = s => s?.match(/\{\{flagicon\|([A-Z]{2,3})/)?.[1] ?? null;

async function matches() {
  const w = await wikitext("America's Cup");
  if (!w) return [];
  const i = w.indexOf('|+ Challengers and defenders');
  const table = w.slice(i, w.indexOf('\n|}', i));
  const out = [];
  for (const raw of table.split(/\n\|-[^\n]*/).slice(1)) {
    const cells = raw.split('\n').filter(l => /^\|(?!-|\})/.test(l)).map(l => l.slice(1).trim());
    const yi = cells.findIndex(c => /^(?:\[\[\d{4} America's Cup\|)?(\d{4})(?:\]\])?$/.test(c.replace(/^\[\[38th America's Cup\|(\d{4})\]\]$/, '$1')));
    if (yi < 0) continue;
    const year = +(cells[yi].match(/(\d{4})(?:\]\])?$/)?.[1] ?? 0);
    const [venue, dClub, defender, score, challenger, cClub] = cells.slice(yi + 1, yi + 7);
    const defWon = /\{\{won/.test(defender ?? ''), chWon = /\{\{won/.test(challenger ?? '');
    out.push({ year, venue: plain(venue), defendingClub: plain(dClub), defendingNation: flag(dClub), defender: plain(defender), score: plain(score) || null, challenger: plain(challenger), challengingClub: plain(cClub), challengingNation: flag(cClub), winner: defWon ? 'defender' : chWon ? 'challenger' : null });
  }
  return out.filter(m => m.year).sort((a, b) => a.year - b.year);
}

export async function collectAcHistory() {
  let prev = null;
  try { prev = JSON.parse(await readFile(new URL('../../public/data/ac-history.json', import.meta.url), 'utf8')); } catch { /* first run */ }
  if (prev?.matches?.length && Date.now() - Date.parse(prev.updated) < 7 * 86400e3) return prev;
  return { updated: new Date().toISOString(), matches: (await matches().catch(() => null)) ?? prev?.matches ?? [] };
}
