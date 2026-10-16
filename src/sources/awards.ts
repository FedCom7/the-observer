// Shape of public/data/awards.json (scripts/collect/awards.mjs) and its calendar events.
import { getJSON } from '../core/fetcher';
import { MIN } from '../core/time';
import type { ObsEvent } from '../core/types';

export type AwardGroup = 'festival' | 'critics' | 'major' | 'guild' | 'oscars';
export interface Nominee { film: string | null; people: string | null; role: string | null; song: string | null; winner: boolean }
export interface AwardCategory { name: string; oscar: string | null; nominees: Nominee[] }
export interface AwardDate { award: string; kind: string; title: string; date: string; end?: string; approx: boolean }
export interface Award {
  id: string; name: string; short: string; group: AwardGroup; tz: string;
  dates: AwardDate[]; state: 'pending' | 'nominations' | 'winners';
  edition: { page: string | null; url: string | null; categories: AwardCategory[]; span: [string, string] | null } | null;
}
export interface OddsRow { name: string; film: string | null; pct: number; was: number; fraction: string; winner: boolean }
export interface AwardsData {
  season: number; ceremonyYear: number; updated: string; status: Record<string, string>;
  calendarUrl: string | null; calendar: AwardDate[]; oscarSteps: AwardDate[];
  categories: { id: string; name: string }[];
  awards: Award[];
  odds: { league: string; stage: 'nominations' | 'winners'; url: string; updated: string; categories: Record<string, { experts?: OddsRow[]; users?: OddsRow[] }>; history: Record<string, { experts?: { d: string; v: Record<string, number> }[]; users?: { d: string; v: Record<string, number> }[] }> } | null;
}

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
