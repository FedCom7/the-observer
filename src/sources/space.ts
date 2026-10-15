// Launch Library 2 (The Space Devs) and Spaceflight News API. Untyped JSON, read as `any`.
// Launch Library allows 15 anonymous requests per hour, hence the long cache times.
import { getJSON } from '../core/fetcher';
import { HOUR, MIN } from '../core/time';
import type { NewsItem, ObsEvent } from '../core/types';

const LL = 'https://ll.thespacedevs.com/2.3.0';

function launch(l: any, past = false): ObsEvent {
  const lat = Number(l.pad?.latitude), lon = Number(l.pad?.longitude);
  const crewed = /crew|axiom|shenzhou|soyuz ms|artemis|starliner|polaris|fram/i.test(l.name);
  return {
    id: `ll:${l.id}`,
    passion: 'space',
    title: l.mission?.name ?? l.name,
    sub: `${l.rocket?.configuration?.name ?? l.name.split('|')[0].trim()} · ${l.status?.abbrev ?? ''}`.trim(),
    start: Date.parse(l.net),
    state: past ? 'post' : 'pre',
    place: l.pad?.location?.name ?? l.pad?.name,
    loc: Number.isFinite(lat) && Number.isFinite(lon) ? [lon, lat] : undefined,
    weight: crewed ? 3 : 2,
    // Month or year precision means the date is a placeholder.
    tbc: (l.net_precision?.id ?? 0) >= 6 || l.status?.abbrev === 'TBD',
    link: l.url,
  };
}

/** Crewed flights plus Starship tests: the human-spaceflight story. */
export async function launches(): Promise<ObsEvent[]> {
  const [crewed, starship, recent] = await Promise.all([
    getJSON<any>(`${LL}/launches/upcoming/?is_crewed=true&limit=6&mode=normal`, 2 * HOUR),
    getJSON<any>(`${LL}/launches/upcoming/?search=Starship&limit=3&mode=normal`, 2 * HOUR),
    getJSON<any>(`${LL}/launches/previous/?is_crewed=true&limit=3&mode=normal`, 6 * HOUR),
  ]);
  const seen = new Set<string>();
  return [...(crewed.results ?? []).map((l: any) => launch(l)), ...(starship.results ?? []).map((l: any) => launch(l)), ...(recent.results ?? []).map((l: any) => launch(l, true))]
    .filter(e => (seen.has(e.id) ? false : (seen.add(e.id), true)));
}

export interface InOrbit { total: number; byAgency: [string, number][]; names: string[] }

export async function inOrbit(): Promise<InOrbit> {
  const j = await getJSON<any>(`${LL}/astronauts/?in_space=true&limit=40&mode=list`, 6 * HOUR);
  const people: any[] = j.results ?? [];
  const counts = new Map<string, number>();
  people.forEach(p => counts.set(p.agency?.abbrev ?? 'Other', (counts.get(p.agency?.abbrev ?? 'Other') ?? 0) + 1));
  return { total: j.count ?? people.length, byAgency: [...counts.entries()].sort((a, b) => b[1] - a[1]), names: people.map(p => p.name) };
}

const HUMAN = /crew|astronaut|cosmonaut|taikonaut|starship|iss\b|space station|artemis|dragon|starliner|spacewalk|tiangong|gateway|orion/i;

export async function spaceNews(): Promise<NewsItem[]> {
  const j = await getJSON<any>('https://api.spaceflightnewsapi.net/v4/articles/?limit=30', 20 * MIN);
  return (j.results ?? [])
    .filter((a: any) => HUMAN.test(a.title))
    .map((a: any) => ({ id: `snapi:${a.id}`, passion: 'space' as const, title: a.title, source: a.news_site, time: Date.parse(a.published_at), url: a.url }));
}
