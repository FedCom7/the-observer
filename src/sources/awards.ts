// Shape of public/data/awards.json (scripts/collect/awards.mjs) and its calendar events.
import { getJSON } from '../core/fetcher';
import { MIN } from '../core/time';
import type { ObsEvent } from '../core/types';

export type AwardGroup = 'festival' | 'critics' | 'major' | 'guild' | 'oscars';
export interface Nominee { film: string | null; people: string | null; role: string | null; song: string | null; winner: boolean }
export interface AwardCategory { name: string; oscar: string | null; nominees: Nominee[] }
export interface AwardDate { award: string; kind: string; title: string; date: string; end?: string; approx: boolean; source?: string; url?: string }
export interface RadarItem { award: string; kind: 'nominations' | 'winners' | 'date' | 'news'; title: string; url: string; source: string; time: string; date: string | null }
export interface Award {
  id: string; name: string; short: string; group: AwardGroup; tz: string;
  dates: AwardDate[]; state: 'pending' | 'nominations' | 'winners';
  edition: { page: string | null; url: string | null; categories: AwardCategory[]; span: [string, string] | null; lineup?: string[] | null } | null;
  official?: { fetched: string; url: string } | null;
  news?: RadarItem[];
}
export interface MarketRow { name: string; p: number; vol?: number }
export interface OddsRow { name: string; film: string | null; pct: number; was: number; fraction: string; winner: boolean }
export interface AwardsData {
  season: number; ceremonyYear: number; updated: string; status: Record<string, string>;
  calendarUrl: string | null; calendar: AwardDate[]; oscarSteps: AwardDate[];
  categories: { id: string; name: string }[];
  awards: Award[];
  radar?: RadarItem[];
  tmdb?: { films: Record<string, TmdbFilm>; people: Record<string, TmdbPerson> };
  markets?: {
    updated: string;
    polymarket: Record<string, { winner?: MarketRow[]; nom?: MarketRow[] }>;
    kalshi: Record<string, { winner?: MarketRow[]; nom?: MarketRow[] }>;
    history: Record<string, Record<string, { d: string; v: Record<string, number> }[]>>;
  } | null;
  /** Public statisticians: Ben Zauzmer's per-category odds (THR), reads from him and Numlock Awards. */
  analysts?: {
    updated: string;
    zauzmer: Partial<Record<'nom' | 'winner', { url: string; title: string; date: string; cats: Record<string, { name: string; film: string | null; p: number }[]> }>>;
    reads: { source: string; title: string; url: string; date: string }[];
  } | null;
  odds: { league: string; stage: 'nominations' | 'winners'; url: string; updated: string; categories: Record<string, { experts?: OddsRow[]; users?: OddsRow[] }>; history: Record<string, { experts?: { d: string; v: Record<string, number> }[]; users?: { d: string; v: Record<string, number> }[] }> } | null;
}

export interface TmdbFilm { id?: number; title?: string; original?: string | null; aka?: string[]; release?: string | null; runtime?: number | null; genres?: string[]; overview?: string | null; poster?: string | null; backdrop?: string | null; countries?: string[]; director?: string | null; cast?: { name: string; role: string; photo: string | null }[]; missing?: boolean }
export interface TmdbPerson { id?: number; name?: string; photo?: string | null; dept?: string | null; missing?: boolean }

/** TMDB image URL (w92, w185, w342, w780…). */
export const tmdbImg = (path: string | null | undefined, size = 'w185') => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null);

export const loadAwards = () => getJSON<AwardsData>('/data/awards.json', 10 * MIN);

export const KIND_LABEL: Record<string, string> = {
  nominations: 'nominations', ceremony: 'ceremony', longlist: 'longlist', shortlist: 'shortlists', festival: 'festival',
  'voting-start': 'voting opens', 'voting-end': 'voting closes', luncheon: 'nominees luncheon', governors: 'Governors Awards', scitech: 'Sci-Tech Awards', eligibility: 'eligibility deadline',
};
const MAJOR = new Set(['globes', 'bafta', 'cca', 'sag', 'pga', 'dga']);

/** Every announcement and ceremony of the season as calendar events. */
export function awardsEvents(d: AwardsData): ObsEvent[] {
  const byId = Object.fromEntries(d.awards.map(a => [a.id, a]));
  const all = [...d.awards.flatMap(a => a.dates), ...d.oscarSteps];
  return all.map(x => {
    const a = byId[x.award];
    const oscar = x.award === 'oscars';
    const title = oscar ? (x.kind === 'ceremony' ? `${d.ceremonyYear - 1928}th Academy Awards` : `Oscars · ${KIND_LABEL[x.kind] ?? x.kind}`) : `${a?.short ?? x.award} · ${KIND_LABEL[x.kind] ?? x.kind}`;
    const weight = oscar ? (x.kind === 'ceremony' || x.kind === 'nominations' ? 3 : 2) : MAJOR.has(x.award) ? (x.kind === 'ceremony' ? 3 : 2) : a?.group === 'festival' ? 2 : 1;
    return {
      id: `aw:${x.award}:${x.kind}:${x.date}`, passion: 'awards' as const, title, sub: oscar ? x.title : a?.name,
      start: Date.parse(x.date), state: 'pre' as const, weight: weight as 1 | 2 | 3, approx: x.approx, link: a?.edition?.url ?? undefined,
    };
  });
}

/** Comparable form of a title or a name. */
export const key = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();
export const PERSON_CATS = new Set(['actor', 'actress', 'supActor', 'supActress', 'director']);

/** Does a precursor's nominee correspond to this Gold Derby contender? */
export function sameContender(cat: string, n: Nominee, c: { name: string; film: string | null }) {
  const name = key(c.name), film = key(c.film);
  if (PERSON_CATS.has(cat)) return Boolean(name) && key(n.people).includes(name);
  const nf = key(n.film), ns = key(n.song);
  return (Boolean(nf) && (nf === name || nf === film)) || (Boolean(ns) && ns === name);
}

/** TMDB record of a film or a person by name, if the collector found one. */
const aliasCache = new WeakMap<object, Map<string, string>>();
/** Every name a film goes by (TMDB title, original title, English titles) -> one canonical key. */
function aliases(d: AwardsData) {
  const films = d.tmdb?.films;
  if (!films) return null;
  let m = aliasCache.get(films);
  if (!m) {
    m = new Map();
    for (const [k, f] of Object.entries(films)) {
      if (f.missing) continue;
      const canon = key(f.title) || k;
      for (const name of [k, f.title, f.original, ...(f.aka ?? [])]) if (name && !m.has(key(name))) m.set(key(name), canon);
    }
    aliasCache.set(films, m);
  }
  return m;
}
/** Canonical key of a film title, so that "The Black Ball" and "La bola negra" are the same film. */
export const filmKey = (d: AwardsData, title: string | null | undefined) => { const k = key(title); return aliases(d)?.get(k) ?? k; };

export const filmOf = (d: AwardsData, title: string | null | undefined) => {
  const films = d.tmdb?.films;
  if (!films || !title) return null;
  const k = filmKey(d, title);
  const f = films[k] ?? Object.values(films).find(x => !x.missing && key(x.title) === k);
  return f && !f.missing ? f : null;
};
export const personOf = (d: AwardsData, name: string | null | undefined) => { const p = d.tmdb?.people[key(name?.split(/,| and /)[0])]; return p && !p.missing ? p : null; };
