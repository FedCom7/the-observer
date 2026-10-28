// Shape of public/data/apple.json and apple-archive.json (scripts/collect/apple.mjs) and their calendar events.
import { getJSON } from '../core/fetcher';
import { MIN } from '../core/time';
import type { NewsItem, ObsEvent } from '../core/types';

export interface AppleRelease { title: string; url: string; published: string; preorder: string | null; available: string | null; price: string | null; image?: string | null; summary?: string | null }
export interface AppleKeynote { title: string; start: string; past: boolean }
/** An event of Wikipedia's "List of Apple Inc. media events"; m and d are null when only the year or month is known. */
export interface AppleHistoryEvent { title: string; kind: 'wwdc' | 'expo' | 'event'; y: number; m: number | null; d: number | null; date: string; tagline: string | null; summary: string; invite?: AppleInvite }
/** An invitation from appleinvites.com: artwork, day it was sent, event date, what Apple announced, keynote video. */
export interface AppleInvite { date: string; kind: 'event' | 'wwdc'; tagline: string | null; title: string; invited: string | null; location: string | null; image: string | null; announced: string | null; youtube: string | null; podcast: string | null }
export interface AppleLine { name: string; releases: { date: string; models: string[] }[] }
export interface AppleBuild { os: string; version: string; stage: 'beta' | 'rc' | 'release'; n: number; build: string; time: string; url: string }
export interface AppleRumor { title: string; url: string; time: string; source: string; rumor: boolean }
export interface AppleNews { title: string; url: string; time: string; kind?: string | null; summary?: string | null; image?: string | null }
export interface AppleQuarter { u: string; d: string; fy: number; q: number | null; revenue: number | null; eps: number | null; net: number | null }
export interface AppleGurman { title: string; url: string; time: string; source: string; bloomberg: boolean }
/** An event whose invitation the press reported (Apple's "launch experiences" never reach apple.com/apple-events). */
export interface ApplePressEvent { date: string; start: string; tagline: string | null; city: string | null; kind: 'event' | 'experience' | 'wwdc'; announced: string; sources: { title: string; url: string; source: string }[] }
/** One fiscal quarter from the SEC filings, in millions of dollars (EPS in dollars). */
export interface AppleAccount {
  fy: number; q: number; period: string; form: string;
  revenue: number | null; cost: number | null; gross: number | null; rnd: number | null; sga: number | null; operating: number | null; net: number | null; eps: number | null;
  productsRev: number | null; servicesRev: number | null;
  products: Record<string, number | null> | null; regions: Record<string, number | null> | null;
  cash: number | null; securities: number | null; debt: number | null; assets: number | null; equity: number | null;
}
export interface AppleStock { price: number; change: number; pct: number; at: string | null; closes: [string, number][]; nextEarnings: string | null; nextEarningsNote: string | null }
export interface AppleData {
  updated: string;
  keynotes: AppleKeynote[];
  lead: { blurb: string | null; image: string | null; announced: { name: string; copy: string | null; image: string | null; url: string | null }[] } | null;
  releases: AppleRelease[];
  news: AppleNews[];
  history: AppleHistoryEvent[];
  lines: AppleLine[];
  software: AppleBuild[];
  rumors: AppleRumor[];
  stock: AppleStock | null;
  earnings: AppleQuarter[];
  accounts?: AppleAccount[];
  gurman?: AppleGurman[];
  pressEvents?: ApplePressEvent[];
  invites?: AppleInvite[];
  archiveCount: number;
}
/** One Newsroom story: date, type (PRESS RELEASE, UPDATE…), title, path on apple.com, topic. */
export interface AppleStory { d: string; k: string; t: string; u: string; c: string; g?: string }

export const loadApple = () => getJSON<AppleData>(`${import.meta.env.BASE_URL}data/apple.json`, 10 * MIN);
export const loadAppleArchive = () => getJSON<{ updated: string; stories: AppleStory[] }>(`${import.meta.env.BASE_URL}data/apple-archive.json`, 60 * MIN);

/** Short product name from a press release title ("Apple unveils the new Apple TV 4K, supercharged by…" -> "Apple TV 4K"). */
export const productName = (title: string) => title
  .replace(/^(Apple (unveils|announces|introduces|debuts)|Introducing|Meet|Say hello to)\s+(the\s+)?(all-new\s+|new\s+|next generation of\s+|a more powerful\s+)?/i, '')
  .replace(/^the new /i, '').replace(/,.*$| — .*$| (?:are|is) available today$| featuring .*$| with (?:the |best-in-class |M\d).*$|, a new .*$/i, '').trim();

/** Pacific-time keynote start of a past event from the history (10 a.m. PT is Apple's habit since 2008). */
export const historyTime = (e: AppleHistoryEvent) => e.m && e.d ? Date.UTC(e.y, e.m - 1, e.d, 17) : Date.UTC(e.y, (e.m ?? 7) - 1, e.d ?? 1);

export interface AppleUpcoming { title: string; start: number; tagline: string | null; city: string | null; official: boolean; link: string; sources: ApplePressEvent['sources']; invite?: AppleInvite }
const CITY_LOC: Record<string, [number, number]> = { Cupertino: [-122.01, 37.33], 'Los Angeles': [-118.24, 34.05], 'New York': [-74.0, 40.71], London: [-0.13, 51.51] };

/** Events still to come: apple.com/apple-events first, then invitations reported by the press. */
export function upcomingEvents(d: AppleData, now = Date.now()): AppleUpcoming[] {
  const out: AppleUpcoming[] = d.keynotes.filter(k => Date.parse(k.start) > now - 3 * 3600e3).map(k => {
    const press = d.pressEvents?.find(p => p.date === k.start.slice(0, 10));
    return { title: k.title, start: Date.parse(k.start), tagline: press?.tagline ?? null, city: press?.city ?? 'Cupertino', official: true, link: 'https://www.apple.com/apple-events/', sources: press?.sources ?? [] };
  });
  const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
  // appleinvites.com posts the invitation within hours; its artwork and tagline win
  for (const inv of d.invites ?? []) {
    const start = Date.UTC(+inv.date.slice(0, 4), +inv.date.slice(5, 7) - 1, +inv.date.slice(8, 10), 17);
    if (start < now - 3 * 3600e3) continue;
    const same = out.find(o => dayOf(o.start) === inv.date);
    const press = d.pressEvents?.find(p => p.date === inv.date);
    if (same) { same.invite = inv; same.tagline = inv.tagline ?? same.tagline; continue; }
    out.push({ title: inv.kind === 'wwdc' ? 'WWDC keynote' : press?.kind === 'experience' ? 'Apple launch experience' : 'Apple Event', start: press ? Date.parse(press.start) : start, tagline: inv.tagline, city: press?.city ?? inv.location, official: false, link: 'https://appleinvites.com/', sources: press?.sources ?? [], invite: inv });
  }
  for (const p of d.pressEvents ?? []) {
    if (Date.parse(p.start) < now - 3 * 3600e3 || out.some(o => dayOf(o.start) === p.date)) continue;
    out.push({ title: p.kind === 'wwdc' ? 'WWDC keynote' : p.kind === 'experience' ? 'Apple launch experience' : 'Apple Event', start: Date.parse(p.start), tagline: p.tagline, city: p.city, official: false, link: p.sources[0]?.url ?? 'https://www.apple.com/newsroom/', sources: p.sources });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The history with the events Wikipedia has not added yet (taken from the press invitations). */
export function fullHistory(d: AppleData): AppleHistoryEvent[] {
  const known = new Set(d.history.map(e => e.date));
  const extra: AppleHistoryEvent[] = (d.pressEvents ?? []).filter(p => !known.has(p.date)).map(p => {
    const [y, m, dd] = p.date.split('-').map(Number);
    return {
      title: p.kind === 'experience' ? 'Apple launch experience' : p.kind === 'wwdc' ? `WWDC ${y}` : 'Apple event', kind: p.kind === 'wwdc' ? 'wwdc' : 'event', y, m, d: dd, date: p.date, tagline: p.tagline,
      summary: `Invitation announced ${new Date(p.announced).toUTCString().slice(5, 16)}${p.city ? `, in ${p.city}` : ''}. ${p.sources.map(s => `${s.source}: “${s.title}”`).join(' · ')}`,
    };
  });
  // Invitations: artwork and "what Apple announced" on the events Wikipedia lists, and the launches it does not
  const invites = d.invites ?? [];
  const all = [...d.history, ...extra].map(e => ({ ...e, invite: invites.find(i => i.date === e.date) }));
  for (const inv of invites) {
    if (all.some(e => e.date === inv.date) || Date.parse(inv.date) > Date.now()) continue;
    const [y, m, dd] = inv.date.split('-').map(Number);
    all.push({ title: inv.title === 'Apple launch' ? 'Apple launch' : inv.kind === 'wwdc' ? inv.title : 'Apple event', kind: inv.kind, y, m, d: dd, date: inv.date, tagline: inv.tagline, summary: inv.announced ? `Apple announced: ${inv.announced}` : '', invite: inv });
  }
  return all.sort((a, b) => a.date.localeCompare(b.date));
}

export function appleEvents(d: AppleData): ObsEvent[] {
  const out: ObsEvent[] = upcomingEvents(d).map(k => ({
    id: `apple:keynote:${k.start}`, passion: 'apple', title: k.tagline ? `${k.title} · “${k.tagline}”` : k.title, sub: `${k.city ?? 'Apple Park'}${k.official ? ' · livestream on apple.com' : ' · invitation reported by the press'}`,
    start: k.start, state: 'pre', weight: 3, approx: !k.official, place: k.city ?? 'Apple Park, Cupertino', loc: CITY_LOC[k.city ?? 'Cupertino'] ?? CITY_LOC.Cupertino, link: k.link,
  }));
  for (const r of d.releases) {
    const name = productName(r.title);
    // A pre-order that opens with the announcement is not a separate moment
    if (r.preorder && r.preorder !== r.published) out.push({ id: `apple:pre:${r.url}`, passion: 'apple', title: `${name} · pre-orders`, sub: r.price ?? undefined, start: Date.parse(r.preorder), state: 'pre', weight: 1, link: r.url });
    if (r.available && r.available !== r.published) out.push({ id: `apple:avail:${r.url}`, passion: 'apple', title: `${name} · in stores`, sub: r.price ?? undefined, start: Date.parse(r.available), state: 'pre', weight: 2, approx: true, link: r.url });
  }
  if (d.stock?.nextEarnings) out.push({ id: `apple:earnings:${d.stock.nextEarnings}`, passion: 'apple', title: 'Apple quarterly results', sub: 'Expected date · call at 2 p.m. Pacific', start: Date.parse(d.stock.nextEarnings), state: 'pre', weight: 1, tbc: true, link: 'https://investor.apple.com/' });
  return out;
}

export const appleNews = (d: AppleData): NewsItem[] => d.news.map(n => ({ id: `apple:${n.url}`, passion: 'apple', title: n.title, source: 'Apple Newsroom', time: Date.parse(n.time), url: n.url }));
