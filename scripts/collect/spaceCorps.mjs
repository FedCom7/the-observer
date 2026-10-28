// NASA's newest astronaut class: who is in it, where they are in the journey from applicant
// to astronaut (selection, two years of training, graduation), training news from nasa.gov,
// and whether NASA has opened the call for the next class. Wikipedia gives the class and its
// members; nasa.gov's WordPress search gives the news, graduation and the next call.
import { decode, get, infobox, parseDate, wikitext } from './lib.mjs';

const NASA_WP = 'https://www.nasa.gov/wp-json/wp/v2';
// Newest group known when this was written; the collector looks a few numbers ahead for newer ones
const KNOWN = 24;
const YEAR = 365.25 * 86400e3;

// What Wikipedia does not state as dates (NASA press releases). Only for classes already announced.
const FACTS = {
  24: { applicationsOpen: '2024-03-05', applicationsClose: '2024-04-16', applicants: 8000, announcedAt: 'Johnson Space Center, Houston' },
};

const ymd = p => (p ? `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}` : null);
const plain = s => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Highest "NASA Astronaut Group N" page that exists, with its wikitext. */
async function latestGroup() {
  let found = null;
  for (let n = KNOWN; n <= KNOWN + 3; n++) {
    const w = await wikitext(`NASA Astronaut Group ${n}`);
    if (!w) { if (n > KNOWN) break; continue; }
    found = { n, w };
  }
  return found;
}

/** "* [[Ben Bailey (astronaut)|Ben Bailey]]: U.S. Army chief warrant officer, ..." */
function members(w) {
  const sec = w.split(/^==\s*Group members\s*==/m)[1]?.split(/^==[^=]/m)[0] ?? '';
  return [...sec.matchAll(/^\*\s*\[\[([^\]|]+)(?:\|([^\]]+))?\]\]\s*:?\s*(.*)$/gm)].map(m => ({
    wiki: m[1].trim(),
    name: (m[2] ?? m[1]).trim(),
    background: m[3].replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1').replace(/<ref[\s\S]*?(?:<\/ref>|\/>)|\{\{[^}]*\}\}|''+/g, '').trim(),
  }));
}

const unwiki = s => (s ?? '').replace(/<ref[\s\S]*?(?:<\/ref>|\/>)/g, '').replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1').replace(/<br\s*\/?>/g, ', ').replace(/\{\{[^{}]*\}\}/g, '').replace(/''+|&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** A member's own Wikipedia page, read raw (the REST summary API throttles hard): portrait, lead, flights. */
async function profile(title) {
  try {
    const w = await wikitext(title);
    if (!w) return {};
    const image = infobox(w, ['image'])?.replace(/^\[\[(?:File|Image):([^|\]]+).*$/i, '$1').trim();
    const born = w.match(/birth date(?: and age)?\|(\d{4})\|(\d{1,2})\|(\d{1,2})/i);
    // The lead starts at the bolded name, after the infobox and its nested templates
    const lead = unwiki(w.match(/^'''[\s\S]*?(?=^==)/m)?.[0] ?? '');
    return {
      image: image ? `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(image.replace(/ /g, '_'))}?width=240` : null,
      born: born ? `${born[1]}-${born[2].padStart(2, '0')}-${born[3].padStart(2, '0')}` : null,
      type: unwiki(infobox(w, ['type'])),
      missions: unwiki(infobox(w, ['missions'])),
      education: unwiki(infobox(w, ['education'])).replace(/^ubl\s*/i, ''),
      lead: lead.slice(0, 700),
    };
  } catch { return {}; }
}

/** nasa.gov search over the content types that carry crew news, newest first. */
export async function nasaSearch(q, after, types = ['posts', 'press-release', 'image-article', 'nasa-blog']) {
  const all = await Promise.allSettled(types.map(t => get(`${NASA_WP}/${t}?search=${encodeURIComponent(q)}&per_page=30&after=${after}T00:00:00&_fields=date_gmt,title,link,excerpt,content`, { browser: true, json: true })
    .then(list => list.map(p => ({ title: plain(p.title.rendered), url: p.link, time: new Date(`${p.date_gmt}Z`).toISOString(), text: plain(`${p.excerpt.rendered} ${p.content?.rendered ?? ''}`), type: t })))));
  const seen = new Set();
  return all.flatMap(r => (r.status === 'fulfilled' ? r.value : []))
    .filter(p => !/^la nasa|^nasa (selecciona|anuncia)/i.test(p.title)) // Spanish duplicates of the English releases
    .filter(p => (seen.has(p.url) ? false : (seen.add(p.url), true)))
    .sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
}

// Training blocks named in the news, in the order a class usually meets them
const TRAINING = [
  ['Jets', /\bT-38\b|WB-57|jet training|flight training|training flight/i],
  ['Survival', /survival|wilderness|NOLS|water egress/i],
  ['Spacewalks', /Neutral Buoyancy|spacewalk|\bEVA\b|spacesuit/i],
  ['Station systems', /station systems|space station systems|ISS systems|mockup|Space Vehicle Mockup/i],
  ['Robotics', /robotic|Canadarm/i],
  ['Russian', /Russian language|\bRussian\b|Star City/i],
  ['Geology', /geolog|field training|field trip/i],
  ['Artemis', /Orion|lunar (surface|terrain|lander)|Moon ?walk|Artemis/i],
];

export async function collectCorps() {
  const g = await latestGroup();
  if (!g) throw new Error('no NASA Astronaut Group page');
  const { n, w } = g;
  const facts = FACTS[n] ?? {};
  const text = w.replace(/<ref[\s\S]*?(?:<\/ref>|\/>)/g, '');
  const nickname = infobox(w, ['name'])?.replace(/^The\s+/i, 'The ') ?? null;
  const crew = members(w);
  // "The group was announced on September 22, 2025" — the day the candidates were introduced
  const announced = ymd(parseDate(text.match(/(?:group|class|candidates) (?:was|were) (?:announced|introduced|named)[^.]*?on ([^.]+)/i)?.[1]))
    ?? (crew.length ? ymd(parseDate(infobox(w, ['year']))) : null);
  const applicationsClose = facts.applicationsClose ?? ymd(parseDate(text.match(/applications[^.]*?(?:through|until|by) ([^.]+)/i)?.[1]));
  const applicationsOpen = facts.applicationsOpen ?? ymd(parseDate(text.match(/(?:announced the creation|opened applications|began accepting)[^.]*?(?:on|in) ([^.]+)/i)?.[1]));
  const wikiGraduated = ymd(parseDate(text.match(/graduat\w*[^.]*?on ([^.]+)/i)?.[1]));

  const after = applicationsOpen ?? announced ?? `${new Date().getUTCFullYear() - 3}-01-01`;
  const fullNames = crew.map(m => m.name);
  // About this class: the title says so, or the story names one of its members. Before the
  // announcement only the selection itself counts (the previous class was still in the news then).
  const aboutClass = p => {
    if (/years ago|history/i.test(p.title)) return false;
    if (announced && Date.parse(p.time) < Date.parse(announced) - 86400e3) return /announce|applica|select/i.test(p.title) && /astronaut (class|candidate)/i.test(p.title);
    return /astronaut candidate|Platypi|\bascans?\b|astronaut class/i.test(p.title) || fullNames.some(f => p.text.includes(f));
  };
  const [classNews, nameNews, callNews] = [
    await nasaSearch('astronaut candidates', after),
    nickname ? await nasaSearch(nickname.replace(/^The /, ''), after) : [],
    await nasaSearch('astronaut applications', announced ?? after, ['press-release', 'posts']),
  ];
  const seen = new Set();
  const news = [...classNews, ...nameNews].filter(p => aboutClass(p)).filter(p => (seen.has(p.url) ? false : (seen.add(p.url), true)))
    .sort((a, b) => Date.parse(b.time) - Date.parse(a.time))
    .map(p => ({
      title: p.title, url: p.url, time: p.time,
      excerpt: p.text.slice(0, 260),
      tags: TRAINING.filter(([, re]) => re.test(`${p.title} ${p.text}`)).map(([k]) => k),
      who: fullNames.filter(f => `${p.title} ${p.text}`.includes(f)),
    }));

  // Graduation: "NASA's newest astronauts graduate", "... class graduates" after the class was named
  const grad = [...classNews, ...callNews].find(p => /graduat/i.test(p.title) && /astronaut/i.test(p.title) && (!announced || Date.parse(p.time) > Date.parse(announced) + YEAR));
  const graduated = wikiGraduated ?? (grad ? grad.time.slice(0, 10) : null);

  // The next call: NASA opens applications (historically at the previous class's graduation)
  const call = callNews.find(p => /astronaut/i.test(p.title) && /applica|apply|accept|seek|BeAnAstronaut/i.test(p.title) && !/flight director|student|challenge|volunteer/i.test(p.title));
  const nextPage = await wikitext(`NASA Astronaut Group ${n + 1}`);
  const next = call || nextPage ? {
    title: call?.title ?? `NASA Astronaut Group ${n + 1}`,
    url: call?.url ?? `https://en.wikipedia.org/wiki/NASA_Astronaut_Group_${n + 1}`,
    time: call?.time ?? null,
    closes: ymd(parseDate(call?.text.match(/(?:through|until|by|deadline[^.]*?)\s+((?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2},? \d{4})/i)?.[1])),
  } : null;

  // Member cards from each member's Wikipedia page; flights flown and any assignment named in the lead
  const people = [];
  for (const m of crew) {
    const p = await profile(m.wiki);
    const assignment = p.lead?.match(/(?:assigned|selected) (?:to|as)[^.]*?((?:Crew-\d+|Artemis [IVX]+|Soyuz MS-\d+|Expedition \d+|Axiom Mission \d+)[^.,;]*)/i)?.[1] ?? null;
    people.push({
      ...m, ...p, assignment,
      url: `https://en.wikipedia.org/wiki/${m.wiki.replace(/ /g, '_')}`,
      // Wikipedia's infobox "type" is filled unevenly: the class graduation decides, for everyone at once
      candidate: !graduated,
    });
  }

  const status = graduated ? 'graduated' : crew.length ? 'training' : 'selection';
  // NASA quotes "about two years" of training; Groups 22 and 23 took 31 and 27 months
  const expectedGraduation = announced && !graduated ? new Date(Date.parse(announced) + 2 * YEAR).toISOString().slice(0, 10) : null;
  const training = TRAINING.map(([k]) => {
    const hits = news.filter(x => x.tags.includes(k) && (!announced || Date.parse(x.time) >= Date.parse(announced)));
    return hits.length ? { topic: k, last: hits[0].time, title: hits[0].title, url: hits[0].url, count: hits.length } : null;
  }).filter(Boolean);

  return {
    at: new Date().toISOString(),
    group: { number: n, title: `NASA Astronaut Group ${n}`, nickname, size: Number(infobox(w, ['number'])) || crew.length || null, wiki: `https://en.wikipedia.org/wiki/NASA_Astronaut_Group_${n}`, image: infobox(w, ['image']) ? `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(infobox(w, ['image']).replace(/ /g, '_'))}?width=900` : null, applicants: facts.applicants ?? null, announcedAt: facts.announcedAt ?? null },
    status,
    dates: { applicationsOpen, applicationsClose, announced, expectedGraduation, graduated },
    members: people,
    training,
    news: news.slice(0, 20),
    next,
  };
}
