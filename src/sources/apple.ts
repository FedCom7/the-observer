// Shape of public/data/apple.json (scripts/collect/apple.mjs) and its calendar events.
import { getJSON } from '../core/fetcher';
import { MIN } from '../core/time';
import type { NewsItem, ObsEvent } from '../core/types';

export interface AppleRelease { title: string; url: string; published: string; preorder: string | null; available: string | null; price: string | null }
export interface AppleData { updated: string; keynotes: { title: string; start: string; past: boolean }[]; releases: AppleRelease[]; news: { title: string; url: string; time: string }[] }

export const loadApple = () => getJSON<AppleData>('/data/apple.json', 10 * MIN);

/** Short product name from a press release title ("Apple unveils the new Apple TV 4K, supercharged by…" -> "Apple TV 4K"). */
export const productName = (title: string) => title
  .replace(/^(Apple (unveils|announces|introduces|debuts)|Introducing|Meet)\s+(the\s+)?(new\s+|next generation of\s+)?/i, '')
  .replace(/^the new /i, '').replace(/,.*$| — .*$| are available today$| is available today$/i, '').trim();

export function appleEvents(d: AppleData): ObsEvent[] {
  const out: ObsEvent[] = d.keynotes.filter(k => !k.past).map(k => ({
    id: `apple:keynote:${k.start}`, passion: 'apple', title: k.title, sub: 'Apple Park · livestream on apple.com', start: Date.parse(k.start), state: 'pre', weight: 3,
    place: 'Apple Park, Cupertino', loc: [-122.01, 37.33], link: 'https://www.apple.com/apple-events/',
  }));
  for (const r of d.releases) {
    const name = productName(r.title);
    if (r.preorder) out.push({ id: `apple:pre:${r.url}`, passion: 'apple', title: `${name} · pre-orders`, sub: r.price ?? undefined, start: Date.parse(r.preorder), state: 'pre', weight: 1, link: r.url });
    if (r.available) out.push({ id: `apple:avail:${r.url}`, passion: 'apple', title: `${name} · in stores`, sub: r.price ?? undefined, start: Date.parse(r.available), state: 'pre', weight: 2, approx: true, link: r.url });
  }
  return out;
}

export const appleNews = (d: AppleData): NewsItem[] => d.news.map(n => ({ id: `apple:${n.url}`, passion: 'apple', title: n.title, source: 'Apple Newsroom', time: Date.parse(n.time), url: n.url }));
