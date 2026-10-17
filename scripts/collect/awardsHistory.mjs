// The study behind the Oscar forecast: twenty seasons (2005–2026) of Oscars and precursors
// from Wikipedia, and how well each precursor has anticipated each Oscar category.
//
// For every Oscar nominee of every year we record its standing at each precursor (won it,
// was nominated, or was left out). From that we get, per precursor and category, how much
// more often eventual Oscar winners were in each standing than the other nominees: the
// likelihood ratios the forecast multiplies together. Recent seasons (the larger, more
// international Academy, from 2016) count double. Each past season is then re-forecast with
// the weights learned from the other seasons, to measure how good the model really is.
import { readFile, writeFile } from 'node:fs/promises';
import { ordinal, wikitext } from './lib.mjs';
import { OSCAR_CATS, colonList, labelBlocks, nomineeTables, oscarCat, rowTables, scripterRows } from './awardsParse.mjs';
import { tkey } from './tmdb.mjs';

const FIRST = 2005, LAST = 2026;
const PERSON = new Set(['actor', 'actress', 'supActor', 'supActress', 'director']);

/** Precursors, with the page of the edition held before the Oscars of year C. */
export const PRECURSORS = [
  { id: 'tiff', short: 'TIFF', pages: C => [`${C - 1} Toronto International Film Festival`], mode: 'festival' },
  { id: 'nbr', short: 'NBR', pages: C => [`National Board of Review Awards ${C - 1}`, `${C - 1} National Board of Review Awards`], mode: 'auto' },
  { id: 'nyfcc', short: 'NYFCC', pages: C => [`${C - 1} New York Film Critics Circle Awards`, `New York Film Critics Circle Awards ${C - 1}`], mode: 'auto' },
  { id: 'lafca', short: 'LAFCA', pages: C => [`${C - 1} Los Angeles Film Critics Association Awards`, `Los Angeles Film Critics Association Awards ${C - 1}`], mode: 'auto' },
  { id: 'cca', short: 'Critics Choice', pages: C => [`${ordinal(C - 1995)} Critics' Choice Awards`, `${ordinal(C - 1995)} Critics' Choice Movie Awards`, `${ordinal(C - 1995)} Broadcast Film Critics Association Awards`] },
  { id: 'globes', short: 'Globes', pages: C => [`${ordinal(C - 1943)} Golden Globe Awards`] },
  { id: 'sag', short: 'SAG / Actor Awards', pages: C => [`${ordinal(C - 1994)} Screen Actors Guild Awards`, `${ordinal(C - 1994)} Actor Awards`] },
  { id: 'pga', short: 'PGA', pages: C => [`${ordinal(C - 1989)} Producers Guild of America Awards`] },
  { id: 'dga', short: 'DGA', pages: C => [`${ordinal(C - 1948)} Directors Guild of America Awards`] },
  { id: 'wga', short: 'WGA', pages: C => [`${ordinal(C - 1948)} Writers Guild of America Awards`] },
  { id: 'scripter', short: 'Scripter', pages: () => ['USC Scripter Awards'], mode: 'scripter' },
  { id: 'ace', short: 'ACE', pages: C => [`American Cinema Editors Awards ${C}`, `${ordinal(C - 1950)} American Cinema Editors Awards`] },
  { id: 'adg', short: 'ADG', pages: C => [`Art Directors Guild Awards ${C - 1}`, `${ordinal(C - 1996)} Art Directors Guild Awards`] },
  { id: 'cdg', short: 'CDG', pages: C => [`${ordinal(C - 1998)} Costume Designers Guild Awards`] },
  { id: 'muahs', short: 'MUAHS', pages: C => [`Make-Up Artists & Hair Stylists Guild Awards ${C - 1}`, `${ordinal(C - 2013)} Make-Up Artists and Hair Stylists Guild Awards`] },
  { id: 'cas', short: 'CAS', pages: C => [`Cinema Audio Society Awards ${C - 1}`, `${ordinal(C - 1964)} Cinema Audio Society Awards`] },
  { id: 'mpse', short: 'MPSE', pages: C => [`Golden Reel Awards ${C - 1}`, `${ordinal(C - 1953)} Golden Reel Awards`] },
  { id: 'asc', short: 'ASC', pages: C => [`${C - 1} American Society of Cinematographers Awards`, `${ordinal(C - 1986)} American Society of Cinematographers Awards`] },
  { id: 'ves', short: 'VES', pages: C => [`${ordinal(C - 2002)} Visual Effects Society Awards`] },
  { id: 'annie', short: 'Annie', pages: C => [`${ordinal(C - 1973)} Annie Awards`] },
  { id: 'spirit', short: 'Spirit', pages: C => [`${ordinal(C - 1985)} Independent Spirit Awards`] },
  { id: 'bafta', short: 'BAFTA', pages: C => [`${ordinal(C - 1947)} British Academy Film Awards`] },
];

const nameKey = (cat, n) => (PERSON.has(cat) ? tkey((n.people ?? '').split(/,| and /)[0]) : tkey(n.film ?? n.song ?? n.people));

/** One edition's categories mapped to Oscar categories: { cat: { noms: Set, wins: Set } } */
async function precursorYear(p, C) {
  for (const page of p.pages(C)) {
    const w = await wikitext(page);
    if (!w) continue;
    let cats;
    if (p.mode === 'scripter') cats = scripterRows(w, C - 1);
    else if (p.mode === 'festival') {
      const sec = (w.split(/\n==\s*(?:Official awards|Awards|Winners|Prizes)\s*==\s*\n/i)[1] ?? '').split(/\n==[^=]/)[0];
      cats = [...colonList(sec, true), ...rowTables(sec)].filter(c => /^people's choice award$/i.test(c.category));
    } else {
      // The standard nominee tables; older pages fall back to labelled lists, winners' tables, "Award: film" lines
      const mapped = list => list.filter(c => oscarCat(c.category, p.id));
      cats = mapped(nomineeTables(w));
      if (!cats.length) cats = mapped(labelBlocks(w));
      if (!cats.length) cats = mapped(rowTables(w));
      if (!cats.length) cats = mapped(colonList(w));
    }
    const out = {};
    for (const c of cats) {
      const cat = p.mode === 'festival' ? 'picture' : p.mode === 'scripter' ? 'adaptScreenplay' : oscarCat(c.category, p.id);
      if (!cat) continue;
      const r = (out[cat] ??= { noms: [], wins: [] });
      for (const n of c.nominees) {
        const k = nameKey(cat, n);
        if (!k) continue;
        r.noms.push(k);
        if (n.winner) r.wins.push(k);
      }
    }
    // A page without winners marked (critics lists) only names winners: every entry is a winner
    for (const r of Object.values(out)) { r.noms = [...new Set(r.noms)]; r.wins = [...new Set(r.wins)]; }
    return Object.keys(out).length ? out : null;
  }
  return null;
}

async function oscarYear(C) {
  const w = await wikitext(`${ordinal(C - 1928)} Academy Awards`);
  if (!w) return null;
  const out = {};
  for (const c of nomineeTables(w)) {
    const cat = oscarCat(c.category, 'oscars');
    if (!cat) continue;
    const r = (out[cat] ??= { noms: [], wins: [], names: {} });
    for (const n of c.nominees) {
      const k = nameKey(cat, n);
      if (!k) continue;
      r.noms.push(k);
      r.names[k] = PERSON.has(cat) ? `${(n.people ?? '').split(/,| and /)[0]}${n.film ? ` (${n.film})` : ''}` : n.film ?? n.song ?? n.people;
      if (n.winner) r.wins.push(k);
    }
  }
  return out;
}

const statusOf = (rec, k) => (!rec ? null : rec.wins.includes(k) ? 'win' : rec.noms.includes(k) ? 'nom' : 'none');
const weightOf = C => (C >= 2016 ? 2 : 1);

/**
 * Likelihood ratios per precursor and category, from a set of seasons:
 * lr[p][cat] = { win, nom, none, n }: how much more likely an Oscar winner was to have won /
 * been nominated / been left out at that precursor than a losing nominee (Laplace-smoothed).
 */
export function learn(seasons, skipYear = null) {
  const acc = {};
  for (const s of seasons) {
    if (s.year === skipYear) continue;
    const w = weightOf(s.year);
    for (const [cat, o] of Object.entries(s.oscars)) {
      if (!o.wins.length) continue;
      for (const [pid, pr] of Object.entries(s.precursors)) {
        const rec = pr?.[cat];
        if (!rec) continue;
        const a = (((acc[pid] ??= {})[cat]) ??= { W: { win: 0, nom: 0, none: 0, t: 0 }, L: { win: 0, nom: 0, none: 0, t: 0 }, years: 0, hits: 0 });
        a.years += w;
        // "Precursor winner = Oscar winner", the headline hit rate
        if (rec.wins.some(k => o.wins.includes(k))) a.hits += w;
        for (const k of o.noms) {
          const side = o.wins.includes(k) ? a.W : a.L;
          side[statusOf(rec, k)] += w; side.t += w;
        }
      }
    }
  }
  const lr = {};
  for (const [pid, cats] of Object.entries(acc)) for (const [cat, a] of Object.entries(cats)) {
    if (a.W.t < 3) continue;
    const r = st => ((a.W[st] + 0.5) / (a.W.t + 1.5)) / ((a.L[st] + 0.5) / (a.L.t + 1.5));
    (lr[pid] ??= {})[cat] = { win: +r('win').toFixed(3), nom: +r('nom').toFixed(3), none: +r('none').toFixed(3), hit: +(a.hits / a.years).toFixed(3), n: a.years };
  }
  return lr;
}

/** Naive-Bayes forecast for one category: probabilities for the given contenders. */
// Calibrated on the 2005–2026 back-test (best log-likelihood of the actual winners)
export const DAMP = 0.42;

export function forecast(lr, cat, contenders, statusFn, damp = DAMP) {
  const scores = contenders.map(k => {
    let s = 0;
    for (const [pid, cats] of Object.entries(lr)) {
      const L = cats[cat];
      if (!L) continue;
      const st = statusFn(pid, k);
      if (st) s += damp * Math.log(L[st]);
    }
    return s;
  });
  const m = Math.max(...scores);
  const e = scores.map(s => Math.exp(s - m));
  const t = e.reduce((a, b) => a + b, 0);
  return e.map(x => x / t);
}

export async function collectAwardsHistory() {
  // The raw seasons live in their own file (the page reads only the summary)
  const SEASONS = new URL('../../public/data/awards-history-seasons.json', import.meta.url);
  let prev = {};
  try { prev = { seasons: JSON.parse(await readFile(SEASONS, 'utf8')) }; } catch {
    try { prev = JSON.parse(await readFile(new URL('../../public/data/awards-history.json', import.meta.url), 'utf8')); } catch { /* first run */ }
  }
  // Past seasons do not change: read only the missing ones
  const seasons = [...(prev.seasons ?? [])].filter(s => s.year >= FIRST && s.year <= LAST);
  const status = {};
  for (let C = FIRST; C <= LAST; C++) {
    // Past seasons do not change: re-read one only if it was incomplete and a month has passed
    const old = seasons.find(s => s.year === C);
    if (old && (Object.keys(old.precursors).length >= 18 || Date.now() - Date.parse(old.at ?? 0) < 30 * 86400e3)) continue;
    const oscars = await oscarYear(C);
    if (!oscars) { status[C] = 'no Oscars page'; continue; }
    const precursors = {};
    for (const p of PRECURSORS) {
      try { const r = await precursorYear(p, C); if (r) precursors[p.id] = r; } catch { /* missing page */ }
    }
    const i = seasons.findIndex(s => s.year === C);
    const rec = { year: C, at: new Date().toISOString(), oscars, precursors };
    if (i >= 0) seasons[i] = rec; else seasons.push(rec);
    status[C] = `${Object.keys(precursors).length} precursors`;
  }
  seasons.sort((a, b) => a.year - b.year);
  await writeFile(SEASONS, JSON.stringify(seasons));

  // Weights learned from every season
  const lr = learn(seasons);

  // Back-test: each season forecast with the weights of all the others
  const backtest = [];
  for (const s of seasons) {
    const lrX = learn(seasons, s.year);
    for (const [cat, o] of Object.entries(s.oscars)) {
      if (!o.wins.length || o.noms.length < 2) continue;
      // Wikipedia lists the winner first: sort the nominees so that ties cannot favour it
      const noms = [...o.noms].sort();
      const probs = forecast(lrX, cat, noms, (pid, k) => statusOf(s.precursors[pid]?.[cat], k));
      const top = Math.max(...probs);
      const signal = probs.filter(x => Math.abs(x - top) < 1e-9).length === 1;
      const best = signal ? noms[probs.indexOf(top)] : null;
      const winnerP = Math.max(...o.wins.map(w => probs[noms.indexOf(w)] ?? 0));
      backtest.push({ year: s.year, cat, signal, hit: signal && o.wins.includes(best), winnerP: +winnerP.toFixed(3), favorite: best ? o.names[best] : null, favoriteP: +top.toFixed(3), winner: o.wins.map(w => o.names[w]).join(' / ') });
    }
  }
  const byCat = Object.fromEntries(OSCAR_CATS.map(([c]) => {
    const rows = backtest.filter(b => b.cat === c && b.signal);
    return [c, rows.length ? { n: rows.length, hits: rows.filter(b => b.hit).length, recent: rows.filter(b => b.year >= 2016).length, recentHits: rows.filter(b => b.year >= 2016 && b.hit).length } : null];
  }));
  // The biggest surprises: winners the model gave the least chance
  const upsets = backtest.filter(b => b.signal && !b.hit).sort((a, b) => a.winnerP - b.winnerP).slice(0, 15);

  return {
    updated: new Date().toISOString(), status, years: [FIRST, LAST],
    precursors: PRECURSORS.map(p => ({ id: p.id, short: p.short, seasons: seasons.filter(s => s.precursors[p.id]).length })),
    damp: DAMP, lr, accuracy: byCat, upsets, backtest,
    // How often each precursor's winner went on to win the Oscar, season by season (for the study's charts)
    hits: seasons.map(s => ({ year: s.year, by: Object.fromEntries(Object.entries(s.precursors).map(([pid, cats]) => [pid, Object.fromEntries(Object.entries(cats).filter(([c]) => s.oscars[c]?.wins.length).map(([c, r]) => [c, r.wins.some(k => s.oscars[c].wins.includes(k)) ? 1 : 0]))])) })),
  };
}
