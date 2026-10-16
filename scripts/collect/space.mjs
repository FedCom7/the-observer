// Human spaceflight, collected server-side once per run to respect Launch Library's
// 15 requests/hour: crewed launches, Starship and Artemis flights, upcoming station
// events (dockings, spacewalks, splashdowns), who is in orbit, and official NASA news.
// Each section falls back to the previous file when a request fails or is throttled.
import { readFile } from 'node:fs/promises';
import { get, parseFeed } from './lib.mjs';

const LL = 'https://ll.thespacedevs.com/2.3.0';

const launch = (l, past = false) => ({
  id: l.id,
  name: l.name,
  mission: l.mission?.name ?? l.name.split('|').pop().trim(),
  description: l.mission?.description ?? '',
  rocket: l.rocket?.configuration?.name ?? l.name.split('|')[0].trim(),
  provider: l.launch_service_provider?.name ?? '',
  net: l.net,
  windowEnd: l.window_end,
  precision: l.net_precision?.name ?? null,
  tbc: (l.net_precision?.id ?? 0) >= 6 || ['TBD', 'TBC'].includes(l.status?.abbrev),
  status: l.status?.abbrev ?? '',
  statusName: l.status?.name ?? '',
  crewed: /crew|axiom|shenzhou|soyuz ms|artemis i{2,}|starliner|polaris|fram/i.test(l.name) || l.mission?.type === 'Human Exploration',
  starship: /starship/i.test(l.name),
  artemis: /artemis/i.test(l.name),
  orbit: l.mission?.orbit?.abbrev ?? '',
  pad: l.pad?.name ?? '',
  location: l.pad?.location?.name ?? '',
  loc: l.pad?.longitude != null ? [Number(l.pad.longitude), Number(l.pad.latitude)] : null,
  webcast: l.webcast_live ?? false,
  past,
});

async function ll(path) {
  return get(`${LL}${path}`, { json: true });
}

const NASA_FEEDS = [
  { source: 'NASA · Space Station blog', url: 'https://www.nasa.gov/blogs/spacestation/feed/' },
  { source: 'NASA · Artemis', url: 'https://www.nasa.gov/missions/artemis/feed/' },
  { source: 'NASA · Artemis blog', url: 'https://www.nasa.gov/blogs/artemis/feed/' },
  { source: 'NASA · Commercial Crew blog', url: 'https://www.nasa.gov/blogs/commercialcrew/feed/' },
  { source: 'NASA · News releases', url: 'https://www.nasa.gov/news-release/feed/' },
];
const HUMAN = /crew|astronaut|cosmonaut|spacewalk|station|iss\b|artemis|orion|sls|starship|dragon|starliner|gateway|moon|lunar/i;

async function nasaNews() {
  const all = await Promise.allSettled(NASA_FEEDS.map(async f => parseFeed(await get(f.url, { browser: true })).slice(0, 8)
    .filter(i => f.source.includes('blog') || f.source.includes('Artemis') || HUMAN.test(i.title))
    .map(i => ({ title: i.title, source: f.source, time: new Date(i.time).toISOString(), url: i.link }))));
  const seen = new Set();
  return all.flatMap(r => (r.status === 'fulfilled' ? r.value : []))
    .filter(n => (seen.has(n.title) ? false : (seen.add(n.title), true)))
    .sort((a, b) => Date.parse(b.time) - Date.parse(a.time)).slice(0, 25);
}

export async function collectSpace() {
  let prev = {};
  try { prev = JSON.parse(await readFile(new URL('../../public/data/space.json', import.meta.url), 'utf8')); } catch { /* first run */ }
  // Launch Library: at most one full pass per hour (8 requests of the 15 allowed)
  // After a 429, stay away for 20 minutes: retrying while throttled only extends the block.
  const llFresh = prev.llAt && Date.now() - Date.parse(prev.llAt) < 55 * 60e3;
  let blockedUntil = prev.llBlockedUntil && Date.parse(prev.llBlockedUntil) > Date.now() ? prev.llBlockedUntil : null;
  let llOk = false;
  const section = async (key, fn) => {
    if (key !== 'news' && (llFresh || blockedUntil)) return prev[key] ?? null;
    try { const v = await fn(); if (key !== 'news') llOk = true; return v; } catch (err) {
      if (String(err.message).startsWith('429')) blockedUntil = new Date(Date.now() + 20 * 60e3).toISOString();
      console.error(`[space] ${key}: ${err.message}`);
      return prev[key] ?? null;
    }
  };

  // One request each, in sequence (about 8 Launch Library requests per run)
  const crewed = await section('crewed', async () => (await ll('/launches/upcoming/?is_crewed=true&limit=10&mode=normal')).results.map(l => launch(l)));
  const starship = await section('starship', async () => {
    const [up, past] = [await ll('/launches/upcoming/?search=Starship&limit=4&mode=normal'), await ll('/launches/previous/?search=Starship&limit=12&mode=normal')];
    return { upcoming: up.results.map(l => launch(l)), previous: past.results.map(l => launch(l, true)) };
  });
  const artemis = await section('artemis', async () => {
    const [up, past] = [await ll('/launches/upcoming/?search=Artemis&limit=5&mode=normal'), await ll('/launches/previous/?search=Artemis&limit=5&mode=normal')];
    return [...past.results.map(l => launch(l, true)).reverse(), ...up.results.map(l => launch(l))];
  });
  const recentCrewed = await section('recentCrewed', async () => (await ll('/launches/previous/?is_crewed=true&limit=5&mode=normal')).results.map(l => launch(l, true)));
  const events = await section('events', async () => (await ll('/events/upcoming/?limit=15&mode=normal')).results
    .filter(e => /dock|undock|spacewalk|eva|splashdown|landing|berth|relocation|artemis|starship|crew/i.test(`${e.type?.name} ${e.name}`))
    .map(e => ({ id: e.id, name: e.name, type: e.type?.name ?? '', date: e.date, description: e.description ?? '', location: e.location ?? '', webcast: e.webcast_live ?? false })));
  const people = await section('people', async () => {
    const j = await ll('/astronauts/?in_space=true&limit=40&mode=normal');
    return j.results.map(a => ({
      name: a.name, agency: a.agency?.abbrev ?? '', nationality: a.nationality?.[0]?.nationality_name ?? '',
      lastFlight: a.last_flight, timeInSpace: a.time_in_space, image: a.image?.thumbnail_url ?? null,
    }));
  });
  const stations = await section('stations', async () => {
    const j = await ll('/space_stations/?status=1&mode=normal');
    return j.results.map(s => ({ id: s.id, name: s.name, onboard: s.onboard_crew ?? null, owners: (s.owners ?? []).map(o => o.abbrev).join(', '), founded: s.founded }));
  });
  const news = await section('news', nasaNews);

  return { updated: new Date().toISOString(), llAt: llOk ? new Date().toISOString() : prev.llAt ?? null, llBlockedUntil: blockedUntil, crewed, starship, artemis, recentCrewed, events, people, stations, news };
}
