// Human spaceflight, collected server-side once per run to respect Launch Library's
// 15 requests/hour: crewed launches, Starship and Artemis flights, upcoming station
// events (dockings, spacewalks, splashdowns), who is in orbit, official NASA news, and
// NASA's newest astronaut class (spaceCorps.mjs).
// Each section falls back to the previous file when a request fails or is throttled.
import { readFile } from 'node:fs/promises';
import { get, infobox, parseFeed, wikitext } from './lib.mjs';
import { collectCorps } from './spaceCorps.mjs';
import { collectIss, collectSpacex } from './spaceDeep.mjs';
import { collectArtemisFlow } from './spaceArtemis.mjs';
import { collectAgenda, mergeEvents } from './spaceAgenda.mjs';

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
  image: l.image?.thumbnail_url ?? null,
  // Only in mode=detailed: the patch and the crew
  patch: l.mission_patches?.[0]?.image_url ?? null,
  // Mannequins and plush toys ("Anthropomorphic Test Device", "Zero-G Indicator") are listed as crew too
  crew: [].concat(l.rocket?.spacecraft_stage ?? [])[0]?.launch_crew?.filter(c => !/test device|indicator|mannequin/i.test(c.role?.role ?? '')).map(c => ({ name: c.astronaut?.name ?? '', role: c.role?.role ?? '', agency: c.astronaut?.agency?.abbrev ?? '', image: c.astronaut?.image?.thumbnail_url ?? null })) ?? null,
  past,
});

async function ll(path) {
  return get(`${LL}${path}`, { json: true });
}

/** Mission insignia from Wikipedia, for flights Launch Library has no patch for (Soyuz, often). */
async function wikiPatch(mission) {
  for (const title of [mission, `SpaceX ${mission}`]) {
    try {
      const w = await wikitext(title);
      const f = w && infobox(w, ['insignia', 'mission_patch', 'patch']);
      // "[[File:A.png|...]] [[File:B.png|...]]" or a bare file name: the first file is the patch
      const file = f?.match(/(?:File:|Image:)?([^\[\]|]+\.(?:png|svg|jpg|jpeg))/i)?.[1]?.trim();
      // Only a patch: an infobox can also show a photo of the crew or the rocket
      if (file && /patch|insignia|logo|emblem/i.test(file)) return `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}?width=240`;
    } catch { /* no patch: the page shows the mission name */ }
  }
  return null;
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
  // Launch Library: at most one full pass per hour (8 requests of the 15 allowed), plus one of
  // the deeper bundles (ISS 4, SpaceX 5) when it is older than six hours
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

  // One request each, in sequence (8 Launch Library requests per run)
  const crewed = await section('crewed', async () => (await ll('/launches/upcoming/?is_crewed=true&limit=10&mode=normal')).results.map(l => launch(l)));
  const starship = await section('starship', async () => {
    const [up, past] = [await ll('/launches/upcoming/?search=Starship&limit=4&mode=normal'), await ll('/launches/previous/?search=Starship&limit=12&mode=normal')];
    return { upcoming: up.results.map(l => launch(l)), previous: past.results.map(l => launch(l, true)) };
  });
  const artemis = await section('artemis', async () => {
    // Detailed: each flight's patch and crew, for the Artemis screen
    const [up, past] = [await ll('/launches/upcoming/?search=Artemis&limit=6&mode=detailed'), await ll('/launches/previous/?search=Artemis&limit=5&mode=detailed')];
    // Only NASA's crewed lunar programme ("Artemis I", "Artemis II", ...), not satellites sharing the name
    const isProgramme = l => /^Artemis [IVX]+\b/.test(l.mission);
    const flights = [...past.results.map(l => launch(l, true)).reverse(), ...up.results.map(l => launch(l))].filter(isProgramme);
    // Patches Launch Library lacks come from Wikipedia's insignia, kept once found
    for (const f of flights) f.patch ??= (prev.artemis ?? []).find(p => p.id === f.id)?.patch ?? await wikiPatch(f.mission.replace(/\s*\(.*\)$/, ''));
    return flights;
  });
  // Launch Library's own events, kept apart: the page shows them merged with the agenda below
  const llEvents = await section('llEvents', async () => (await ll('/events/upcoming/?limit=15&mode=normal')).results
    .filter(e => /dock|undock|spacewalk|eva|splashdown|landing|berth|relocation|artemis|starship|crew/i.test(`${e.type?.name} ${e.name}`))
    .map(e => ({ id: e.id, name: e.name, type: e.type?.name ?? '', date: e.date, description: e.description ?? '', location: e.location ?? '', webcast: e.webcast_live ?? false })));
  const people = await section('people', async () => {
    const j = await ll('/astronauts/?in_space=true&limit=40&mode=normal');
    // Launch Library lists SpaceX's mannequin "Starman" as being in space: leave him out
    return j.results.filter(a => !/^starman$/i.test(a.name)).map(a => ({
      name: a.name, agency: a.agency?.abbrev ?? '', nationality: a.nationality?.[0]?.nationality_name ?? '',
      lastFlight: a.last_flight, timeInSpace: a.time_in_space, image: a.image?.thumbnail_url ?? null,
    }));
  });
  // The last crewed launches, and among them the missions people are aloft on now, with patch and crew
  let recentCrewed = prev.recentCrewed ?? null;
  const missions = await section('missions', async () => {
    const aloft = new Set((people ?? []).map(p => p.name));
    const j = await ll('/launches/previous/?is_crewed=true&limit=10&mode=detailed');
    recentCrewed = j.results.slice(0, 5).map(l => launch(l, true));
    const out = [];
    for (const l of j.results) {
      const sc = [].concat(l.rocket?.spacecraft_stage ?? [])[0];
      const crew = (sc?.launch_crew ?? []).map(c => ({ name: c.astronaut?.name ?? '', role: c.role?.role ?? '', agency: c.astronaut?.agency?.abbrev ?? '' }));
      if (!crew.some(c => aloft.has(c.name))) continue;
      const name = l.mission?.name ?? l.name.split('|').pop().trim();
      const known = (prev.missions ?? []).find(m => m.id === l.id)?.patch;
      out.push({
        id: l.id, name, launched: l.net,
        spacecraft: sc?.spacecraft?.name ?? '', destination: sc?.destination ?? l.mission?.orbit?.name ?? '',
        patch: l.mission_patches?.[0]?.image_url ?? known ?? await wikiPatch(name),
        landing: sc?.landing?.description ?? '',
        crew,
      });
    }
    return out;
  });
  // One deep bundle per run at most, the stalest first, so a run never goes over the hourly limit
  let { iss = null, spacex = null } = prev;
  const age = b => (b?.at ? Date.now() - Date.parse(b.at) : Infinity);
  const due = [['iss', age(iss)], ['spacex', age(spacex)]].filter(([, a]) => a > 6 * 3600e3).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (due && !blockedUntil) {
    try { if (due === 'iss') iss = await collectIss(ll); else spacex = await collectSpacex(ll, spacex); } catch (err) {
      if (String(err.message).startsWith('429')) blockedUntil = new Date(Date.now() + 20 * 60e3).toISOString();
      console.error(`[space] ${due}: ${err.message}`);
    }
  }
  const news = await section('news', nasaNews);
  // The astronaut class moves slowly: Wikipedia and nasa.gov every six hours are plenty
  let corps = prev.corps ?? null;
  if (!corps || Date.now() - Date.parse(corps.at) > 6 * 3600e3) {
    try { corps = await collectCorps(); } catch (err) { console.error(`[space] corps: ${err.message}`); }
  }
  // The road to launch of the next Artemis flight, from nasa.gov every six hours
  const nextArtemis = (artemis ?? []).find(l => !l.past)?.mission ?? null;
  let artemisFlow = prev.artemisFlow ?? null;
  if (nextArtemis && (!artemisFlow || artemisFlow.mission !== nextArtemis.replace(/\s*\(.*\)$/, '') || Date.now() - Date.parse(artemisFlow.at) > 6 * 3600e3)) {
    try { artemisFlow = await collectArtemisFlow(nextArtemis, (artemis ?? []).map(l => l.mission)) ?? artemisFlow; } catch (err) { console.error(`[space] artemisFlow: ${err.message}`); }
  }

  // AstronauticAgenda (a public Google Calendar) every three hours: the ISS traffic plan, spacewalks,
  // broadcasts and deep-space milestones; its station events join Launch Library's
  let agenda = prev.agenda ?? null;
  if (!agenda || Date.now() - Date.parse(agenda.at) > 3 * 3600e3) {
    try { agenda = await collectAgenda(); } catch (err) { console.error(`[space] agenda: ${err.message}`); }
  }
  const allEvents = mergeEvents(llEvents ?? (prev.events ?? []).filter(e => !e.source), agenda);

  return { updated: new Date().toISOString(), llAt: llOk ? new Date().toISOString() : prev.llAt ?? null, llBlockedUntil: blockedUntil, crewed, starship, artemis, recentCrewed, llEvents, events: allEvents, people, missions, iss, spacex, news, corps, artemisFlow, agenda };
}
