// The Observer's Oscar forecast. For each Oscar category it looks at every contender's record
// at the precursors announced so far (won, nominated, left out) and multiplies the likelihood
// ratios learned from twenty seasons (scripts/collect/awardsHistory.mjs): how much more often
// eventual Oscar winners had that record than the other nominees. The ratios are damped
// because precursors share voters and taste, so they are not independent evidence.
import { PERSON_CATS, filmKey, key, type Award, type AwardsData } from '../sources/awards';

export interface Lr { win: number; nom: number; none: number; hit: number; n: number }
export interface History {
  updated: string; years: [number, number]; damp?: number;
  hits?: { year: number; by: Record<string, Record<string, 0 | 1>> }[];
  precursors: { id: string; short: string; seasons: number }[];
  lr: Record<string, Record<string, Lr>>;
  accuracy: Record<string, { n: number; hits: number; recent: number; recentHits: number } | null>;
  upsets: { year: number; cat: string; winnerP: number; favorite: string | null; favoriteP: number; winner: string }[];
  backtest: { year: number; cat: string; signal: boolean; hit: boolean; winnerP: number; favorite: string | null; favoriteP: number; winner: string }[];
}
export type Status = 'win' | 'nom' | 'none';
export interface Factor { award: string; short: string; status: Status; lr: number; t: number }
export interface ForecastRow { key: string; name: string; film: string | null; p: number; score: number; factors: Factor[] }

const DAMP_DEFAULT = 0.42;

/** When an award's nominations and winners became (or become) known. */
export function awardTimes(a: Award) {
  const d = (k: string) => a.dates.find(x => x.kind === k);
  const fest = d('festival');
  const nom = d('nominations') ?? d('ceremony') ?? fest;
  const win = d('ceremony') ?? (fest ? { ...fest, date: fest.end ?? fest.date } : undefined);
  return { nom: nom ? Date.parse(nom.date) : null, win: win ? Date.parse(win.date) : null };
}

const firstPerson = (s: string | null | undefined) => (s ?? '').split(/,| and | & /)[0].trim();
/** One key per contender across sources: a person's name, or the film's canonical title (songs: the song's title). */
export function contenderKey(d: AwardsData, cat: string, name: string | null | undefined) {
  if (PERSON_CATS.has(cat)) return key(firstPerson(name));
  if (cat === 'song') return key((name ?? '').split(/\s+[-–]\s+/)[0]);
  return filmKey(d, name);
}

/** Everyone in the running in a category: Gold Derby, the markets, the precursors' nominees. */
export function contenders(d: AwardsData, cat: string) {
  const out = new Map<string, { name: string; film: string | null }>();
  const add = (name: string | null | undefined, film: string | null = null) => {
    const k = contenderKey(d, cat, name);
    if (k && !out.has(k)) out.set(k, { name: PERSON_CATS.has(cat) ? firstPerson(name) : name!, film });
  };
  for (const r of [...(d.odds?.categories[cat]?.experts ?? []).slice(0, 12), ...(d.odds?.categories[cat]?.users ?? []).slice(0, 8)]) add(r.name, r.film);
  for (const src of [d.markets?.polymarket?.[cat], d.markets?.kalshi?.[cat]]) for (const r of [...(src?.winner ?? []).slice(0, 10), ...(src?.nom ?? []).slice(0, 10)]) add(r.name);
  for (const a of d.awards) for (const c of a.edition?.categories ?? []) if (c.oscar === cat) for (const n of c.nominees) add(PERSON_CATS.has(cat) ? n.people : cat === 'song' ? n.song ?? n.film : n.film, PERSON_CATS.has(cat) ? n.film : null);
  return out;
}

/** A contender's record at one award, as known at time t (null when the award has not spoken yet). */
export function recordAt(d: AwardsData, a: Award, cat: string, k: string, t: number): Status | null { return statusAt(d, a, cat, k, t); }
function statusAt(d: AwardsData, a: Award, cat: string, k: string, t: number): Status | null {
  const cats = (a.edition?.categories ?? []).filter(c => c.oscar === cat);
  if (!cats.length) return null;
  const { nom, win } = awardTimes(a);
  if (nom != null && t < nom) return null;
  const all = cats.flatMap(c => c.nominees);
  const isK = (n: { people: string | null; film: string | null; song: string | null }) => contenderKey(d, cat, PERSON_CATS.has(cat) ? n.people : cat === 'song' ? n.song ?? n.film : n.film) === k;
  const winnersKnown = a.state === 'winners' && (win == null || t >= win);
  if (winnersKnown && all.some(n => n.winner && isK(n))) return 'win';
  if (all.some(isK)) return 'nom';
  return 'none';
}

/** Probabilities for a category at time t (now by default), with each contender's factors. */
export function forecastCategory(d: AwardsData, h: History, cat: string, t = Date.now()): ForecastRow[] {
  const people = contenders(d, cat);
  const rows: ForecastRow[] = [...people.entries()].map(([k, v]) => {
    const factors: Factor[] = [];
    for (const a of d.awards) {
      const L = h.lr[a.id]?.[cat];
      if (!L) continue;
      const st = statusAt(d, a, cat, k, t);
      if (!st) continue;
      factors.push({ award: a.id, short: a.short, status: st, lr: L[st], t: (st === 'win' ? awardTimes(a).win : awardTimes(a).nom) ?? 0 });
    }
    const score = factors.reduce((s, f) => s + (h.damp ?? DAMP_DEFAULT) * Math.log(f.lr), 0);
    return { key: k, name: v.name, film: v.film, p: 0, score, factors };
  });
  if (!rows.length) return rows;
  const m = Math.max(...rows.map(r => r.score));
  const e = rows.map(r => Math.exp(r.score - m));
  const tot = e.reduce((a, b) => a + b, 0);
  rows.forEach((r, i) => { r.p = e[i] / tot; });
  return rows.sort((a, b) => b.p - a.p);
}

/** How many precursors have spoken in a category (the forecast means little before a few have). */
export const evidence = (rows: ForecastRow[]) => new Set(rows.flatMap(r => r.factors.map(f => f.award))).size;

/** The forecast replayed after every announcement of the season, for the race chart. */
export function raceSeries(d: AwardsData, h: History, cat: string, top = 6) {
  const now = Date.now();
  const events: { t: number; award: string; short: string; kind: 'nominations' | 'winners' }[] = [];
  for (const a of d.awards) {
    if (!h.lr[a.id]?.[cat] || !(a.edition?.categories ?? []).some(c => c.oscar === cat)) continue;
    const { nom, win } = awardTimes(a);
    if (nom != null && nom <= now) events.push({ t: nom, award: a.id, short: a.short, kind: 'nominations' });
    if (win != null && win <= now && a.state === 'winners' && win !== nom) events.push({ t: win, award: a.id, short: a.short, kind: 'winners' });
  }
  events.sort((a, b) => a.t - b.t);
  const steps = events.map(e => ({ ...e, rows: forecastCategory(d, h, cat, e.t + 60e3) }));
  const final = steps.length ? steps[steps.length - 1].rows : forecastCategory(d, h, cat);
  const keys = final.slice(0, top).map(r => r.key);
  const series = keys.map(k => ({ key: k, name: final.find(r => r.key === k)!.name, values: steps.map(s => s.rows.find(r => r.key === k)?.p ?? 0) }));
  return { events: steps.map(({ rows, ...e }) => { void rows; return e; }), series };
}
