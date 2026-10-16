// Keeping the awards season current between Wikipedia updates:
// - the news radar: awards headlines from the trade press and the awards blogs, read on
//   every run; a headline about nominations, winners or a date shows up at once and
//   makes the collector re-read that award's Wikipedia page straight away;
// - the official sites: dates written on each award's own site (nominations, ceremony).
import { decode, get, iso, parseFeed, zoned } from './lib.mjs';

export const FEEDS = [
  { source: 'Variety', url: 'https://variety.com/c/awards/feed/' },
  { source: 'The Hollywood Reporter', url: 'https://www.hollywoodreporter.com/t/awards/feed/' },
  { source: 'Gold Derby', url: 'https://www.goldderby.com/feed/' },
  { source: 'AwardsWatch', url: 'https://awardswatch.com/feed/' },
  { source: 'Awards Daily', url: 'https://www.awardsdaily.com/feed/' },
  { source: 'IndieWire', url: 'https://www.indiewire.com/c/awards/feed/' },
  { source: 'Next Best Picture', url: 'https://nextbestpicture.com/feed/' },
];

/** How each award is named in headlines. */
export const ALIASES = {
  cannes: /\bCannes\b|Palme d'Or/i, venice: /\bVenice\b|Golden Lion/i, telluride: /\bTelluride\b/i, tiff: /\bTIFF\b|Toronto (?:International )?Film Festival|People's Choice Award/i,
  gotham: /\bGotham(?: Awards| Film Awards| Independent)/i, nbr: /National Board of Review|\bNBR\b/i, nyfcc: /New York Film Critics|\bNYFCC\b/i, lafca: /Los Angeles Film Critics|\bLAFCA\b/i,
  ccda: /Critics'? Choice Documentary/i, cca: /Critics'? Choice(?! Documentary)/i, globes: /Golden Globe/i, nsfc: /National Society of Film Critics|\bNSFC\b/i,
  dga: /\bDGA\b|Directors Guild/i, ace: /\bACE Eddie|American Cinema Editors|Eddie Awards/i, wga: /\bWGA\b|Writers Guild/i, ves: /\bVES Awards|Visual Effects Society/i,
  csa: /Artios|Casting Society/i, muahs: /\bMUAHS\b|Make-?Up Artists (?:&|and) Hair/i, annie: /Annie Awards?/i, bafta: /\bBAFTA/i, cdg: /Costume Designers Guild|\bCDG\b/i,
  pga: /\bPGA Awards?|Producers Guild/i, adg: /Art Directors Guild|\bADG\b/i, sag: /Actor Awards|\bSAG Awards|SAG-AFTRA Awards/i, cas: /Cinema Audio Society|\bCAS Awards/i,
  spirit: /Spirit Awards/i, mpse: /Golden Reel|\bMPSE\b/i, asc: /\bASC Awards|American Society of Cinematographers/i, scripter: /Scripter/i, scl: /Society of Composers (?:&|and) Lyricists|\bSCL Awards/i,
  oscars: /\bOscars?\b|Academy Awards/i,
};

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan\\.?|Feb\\.?|Mar\\.?|Apr\\.?|Jun\\.?|Jul\\.?|Aug\\.?|Sept?\\.?|Oct\\.?|Nov\\.?|Dec\\.?';
const MON = m => ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m.slice(0, 3).toLowerCase()) + 1;
const DATE_RE = new RegExp(`\\b(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d\\d))?|\\b(\\d{1,2})\\s+(${MONTHS})(?:\\s+(20\\d\\d))?`, 'gi');

/** Dates in a text with the words around them: [{ y, m, d, before, after }] (years inferred within the season). */
export function datesIn(text, S, C) {
  const out = [];
  for (const m of text.matchAll(DATE_RE)) {
    const mo = MON(m[1] ?? m[5]), d = Number(m[2] ?? m[4]);
    const explicit = Number(m[3] ?? m[6]) || null;
    // Without a year, May–December is this season's first half and January–April its second
    const y = explicit ?? (mo >= 5 ? S : C);
    if (!mo || d < 1 || d > 31) continue;
    // Only this season: May of S to April of C
    if (!((y === S && mo >= 5) || (y === C && mo <= 4))) continue;
    out.push({ y, m: mo, d, before: text.slice(Math.max(0, m.index - 160), m.index), after: text.slice(m.index + m[0].length, m.index + m[0].length + 60) });
  }
  return out;
}

// Only explicit announcements count: "will take place on Saturday, January 30", "nominees will be announced on…"
const STRICT = /(?:will (?:be )?(?:held|take place|air(?: live)?|be presented|be handed out|be announced|be revealed|announce(?: (?:its|their|the))?(?: \w+)? nominations?)|takes place|air(?:s|ing)? live on [A-Z]\w+|live on [A-Z]\w+|announced? on)(?: on)?(?:,)?\s*(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*)?$/i;

/** Official dates from one page's text: the sentence around each explicit date decides what it is. */
export function officialDates(html, S, C) {
  const text = decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<footer[\s\S]*?<\/footer>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
  const found = {};
  for (const x of datesIn(text, S, C)) {
    if (!STRICT.test(x.before.slice(-60))) continue;
    const sentence = x.before.split(/[.!?]\s/).pop();
    if (/deadline|submission|eligib|entr(?:y|ies)|ballot|voting|tickets?|screening|stunt|tribute|gala in|festival/i.test(sentence)) continue;
    const kind = /nominat|nominee/i.test(sentence) ? 'nominations' : 'ceremony';
    if (!found[kind]) found[kind] = { ...x, sentence: sentence.slice(-140) };
  }
  return found;
}

const NOT_NEWS = /predictions?|podcast|odds|could (?:score|land|win)|contention|consideration|campaign|race (?:for|heats)|frontrunner|power rank|ranked|review|trailer|box office|\beyes\b|history|hopes?|\bbid\b|\bpush\b|becomes|submission|submits|selected as|\bentry\b|the kind of|interview|talks|explains|how .* (?:won|got)/i;

/** The latest awards headlines, each tied to an award and to what it announces. */
export async function radar(S, C, awardIds) {
  const settled = await Promise.allSettled(FEEDS.map(async f => parseFeed(await get(f.url, { browser: true })).map(i => ({ ...i, source: f.source }))));
  const out = [];
  const seen = new Set();
  for (const r of settled) {
    if (r.status !== 'fulfilled') continue;
    for (const i of r.value) {
      const title = decode(i.title ?? '').replace(/\s+/g, ' ').trim();
      if (!title || seen.has(title.toLowerCase())) continue;
      const t = typeof i.time === 'number' ? i.time : Date.parse(i.time);
      if (!t || Date.now() - t > 21 * 86400e3) continue;
      const award = Object.keys(ALIASES).filter(id => awardIds.includes(id)).find(id => ALIASES[id].test(title));
      if (!award) continue;
      seen.add(title.toLowerCase());
      const kind = NOT_NEWS.test(title) ? 'news' : /\bwin(?:s|ners?)?\b|\bwon\b|takes? (?:top|home)|named best|honou?red|top prize|sweeps?|triumphs?/i.test(title) ? 'winners'
        : /nominat|nominees|longlist|shortlist|\bleads?\b|snubs?|surprises/i.test(title) ? 'nominations'
        : /\bdate|set for|to (?:be )?announce|will announce|moves?|shifts?|reschedul|postpone|calendar/i.test(title) ? 'date' : 'news';
      // A date announced in the headline (or the first lines) becomes a calendar entry
      const when = kind === 'date' || kind === 'nominations' ? datesIn(`${title}. ${decode((i.description ?? '').replace(/<[^>]+>/g, ' ')).slice(0, 400)}`, S, C)[0] : null;
      // A "date" headline without a date in it is just news
      const k = kind === 'date' && !when ? 'news' : kind;
      out.push({ award, kind: k, title, url: i.link, source: i.source, time: new Date(t).toISOString(), date: when ? iso(zoned(when.y, when.m, when.d, 9, 0, 'America/Los_Angeles')) : null });
    }
  }
  return out.sort((a, b) => b.time.localeCompare(a.time));
}
