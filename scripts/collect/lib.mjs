// Shared helpers for the collectors. Plain Node (18+), no dependencies.

export const UA = 'TheObserver/0.1 (personal dashboard; https://github.com/)';
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

export async function get(url, { browser = false, json = false } = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': browser ? BROWSER_UA : UA, Accept: json ? 'application/json' : '*/*' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return json ? res.json() : res.text();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Wikipedia asks clients to send one request at a time; we queue them with a short gap
// and back off when told to slow down (HTTP 429).
let wikiQueue = Promise.resolve();

/**
 * Wikitext of a Wikipedia page (redirects followed). Returns null when the page does not exist yet.
 * Read through index.php?action=raw: served from Wikipedia's cache, it is not throttled like the API.
 */
export async function wikitext(title, section, hops = 0) {
  const params = new URLSearchParams({ title: title.replace(/ /g, '_'), action: 'raw' });
  if (section !== undefined) params.set('section', String(section));
  let w;
  try { w = await wikiRaw(`https://en.wikipedia.org/w/index.php?${params}`); } catch (err) { if (String(err.message).startsWith('404')) return null; throw err; }
  const redirect = w.match(/^#REDIRECT\s*\[\[([^\]|#]+)/i);
  if (redirect) {
    const to = redirect[1].trim();
    // A redirect to a generic page means the edition page has not been written yet.
    if (hops > 1 || !to.match(/\d{4}|\b\d+(st|nd|rd|th)\b|[IVXLC]{2,}/) && title.match(/\d{4}|\b\d+(st|nd|rd|th)\b/)) return null;
    return wikitext(to, section, hops + 1);
  }
  return w;
}

function wikiRaw(url) {
  const run = async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        const t = await get(url);
        await sleep(300);
        return t;
      } catch (err) {
        if (!String(err.message).startsWith('429') || attempt >= 4) throw err;
        await sleep(2000 * 2 ** attempt);
      }
    }
  };
  const p = wikiQueue.then(run, run);
  wikiQueue = p.catch(() => {});
  return p;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/**
 * Parses the first date in free text such as "March 14, 2027", "12–13 June",
 * "10-18 July 2027" or {{Start date|2027|1|17}}. Returns { y, m, d } (m 1-12) or null.
 */
export function parseDate(text, fallbackYear) {
  if (!text) return null;
  const tpl = text.match(/\{\{\s*(?:start[ _]date|dts|date)[^|}]*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/i);
  if (tpl) return { y: +tpl[1], m: +tpl[2], d: +tpl[3] };
  const clean = text.replace(/\[\[|\]\]|''+|<[^>]+>|\{\{[^}]*\}\}/g, ' ');
  const year = clean.match(/\b(20\d{2})\b/);
  const y = year ? +year[1] : fallbackYear;
  // "March 14" / "March 14–20"
  let m = clean.match(new RegExp(`\\b(${MONTHS.join("|")})\\s+(\\d{1,2})(?!\\d)`, "i"));
  if (m) return { y, m: MONTHS.indexOf(m[1].toLowerCase()) + 1, d: +m[2] };
  // "14 March" / "12–13 June" / "10-18 July"
  m = clean.match(new RegExp(`\\b(\\d{1,2})(?:\\s*[–-]\\s*\\d{1,2})?\\s+(${MONTHS.join('|')})`, 'i'));
  if (m) return { y, m: MONTHS.indexOf(m[2].toLowerCase()) + 1, d: +m[1] };
  return null;
}

/** First "| key = value" infobox field among the given keys. */
export function infobox(w, keys) {
  for (const k of keys) {
    // [ \t] instead of \s: an empty field must not swallow the next line.
    const m = w.match(new RegExp(`^[ \\t]*\\|[ \\t]*${k}[ \\t]*=[ \\t]*(.*)$`, 'mi'));
    if (m && m[1].trim()) return m[1].trim();
  }
  return null;
}

/** Epoch ms for a wall-clock time in an IANA time zone (handles DST). */
export function zoned(y, m, d, hh, mm, tz) {
  let t = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
      .formatToParts(t).map(p => [p.type, p.value]));
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    t += Date.UTC(y, m - 1, d, hh, mm) - asUtc;
  }
  return t;
}

export const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

export function roman(n) {
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, r] of map) while (n >= v) { s += r; n -= v; }
  return s;
}

/** Items of an RSS/Atom feed: { title, link, time }. */
export function parseFeed(xml) {
  const items = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/g)].map(m => m[0]);
  const pick = (s, tag) => {
    const m = s.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
    return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
  };
  return items.map(s => ({
    title: decode(pick(s, 'title')),
    link: pick(s, 'link') || (s.match(/<link[^>]*href="([^"]+)"/) ?? [])[1] || '',
    time: Date.parse(pick(s, 'pubDate') || pick(s, 'updated') || pick(s, 'published')) || Date.now(),
    description: decode(pick(s, 'description') || pick(s, 'summary')),
  }));
}

export const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&#x27;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&nbsp;/g, ' ');

export const iso = t => new Date(t).toISOString();
