// Apple, automatic:
// - keynotes and "what we announced" from apple.com/apple-events;
// - product releases from Apple Newsroom press releases (their "Pricing and Availability"
//   section gives the pre-order and in-store dates);
// - the whole Newsroom archive and quarterly results (appleNewsroom.mjs), written to apple-archive.json;
// - event history since 1984 and the product lines (appleWiki.mjs, Wikipedia, every 12 hours);
// - OS betas and releases (Apple Developer releases feed), rumours (MacRumors, 9to5Mac) and Mark Gurman
//   (Bloomberg, through Google News), event invitations (appleinvites.com, a fan archive of every
//   invite, and Google News headlines for the ones it has not added yet),
//   Apple's accounts by quarter, product and region (SEC filings, appleSec.mjs),
//   AAPL price and the next earnings date (Nasdaq public API).
import { readFile, writeFile } from 'node:fs/promises';
import { decode, get, iso, parseDate, parseFeed, zoned } from './lib.mjs';
import { earningsHistory, newsroomArchive } from './appleNewsroom.mjs';
import { mediaEvents, productLines } from './appleWiki.mjs';
import { secQuarters } from './appleSec.mjs';

const DAY = 86400e3;
const now = Date.now();
const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
const DATA = new URL('../../public/data/', import.meta.url);

const plainText = html => decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ')).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

/** Keynote dates on apple.com/apple-events, and the event the page leads with (its products once it is over). */
async function appleEvents() {
  const html = await get('https://www.apple.com/apple-events/', { browser: true });
  const seen = new Set();
  const keynotes = [];
  for (const m of html.matchAll(new RegExp(`(${MONTHS}) (\\d{1,2}), (20\\d{2})`, 'g'))) {
    const d = parseDate(m[0]);
    if (!d) continue;
    const key = `${d.y}-${d.m}-${d.d}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Apple keynotes start at 10 a.m. Pacific
    const start = zoned(d.y, d.m, d.d, 10, 0, 'America/Los_Angeles');
    keynotes.push({ title: d.m === 6 ? 'WWDC keynote' : 'Apple Event', start: iso(start), past: start < now });
  }
  const announced = html.split('class="announced-item').slice(1).map(item => {
    const img = item.match(/<img src="([^"]+)"/)?.[1], name = item.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1];
    const copy = item.match(/<p class="product-copy[^>]*>([\s\S]*?)<\/p>/)?.[1], href = item.match(/<a href="([^"]+)"/)?.[1];
    return name ? { name: plainText(name), copy: copy ? plainText(copy).replace(/\s\d{1,2}(?=\s|$)/g, '') : null, image: img ? new URL(img, 'https://www.apple.com').href : null, url: href ? new URL(href, 'https://www.apple.com').href : null } : null;
  }).filter(Boolean);
  const blurb = html.match(/<meta property="og:description" content="([^"]+)"/)?.[1];
  const image = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  return {
    keynotes: keynotes.sort((a, b) => Date.parse(a.start) - Date.parse(b.start)),
    lead: { blurb: blurb ? decode(blurb) : null, image: image ?? null, announced },
  };
}

const PRODUCT = /introduc|unveil|announc|debut|launch|new .*(available|arrive)|available today|now available|say hello|meet the/i;

/** "Friday, November 13" (relative to the press release date) -> ISO date at a local time. */
function dateAfter(published, text, hh, mm, tz) {
  const m = text.match(new RegExp(`(?:\\w+day,?\\s+)?(${MONTHS})\\s+(\\d{1,2})`));
  if (!m) return null;
  const pub = new Date(published);
  const month = MONTHS.split('|').indexOf(m[1]) + 1;
  let year = pub.getUTCFullYear();
  if (month < pub.getUTCMonth() + 1 - 1) year += 1; // e.g. a December release announcing January availability
  return iso(zoned(year, month, Number(m[2]), hh, mm, tz));
}

async function release(entry0) {
  let entry = entry0;
  const html = await get(entry0.url, { browser: true });
  const t = plainText(html);
  // The press release date ("PRESS RELEASE September 9, 2026") is the reference for "today"
  const pd = t.match(new RegExp(`(?:PRESS RELEASE|UPDATE|FEATURE)\\s+(${MONTHS}) (\\d{1,2}), (20\\d{2})`));
  if (pd) entry = { ...entry, time: iso(zoned(Number(pd[3]), MONTHS.split('|').indexOf(pd[1]) + 1, Number(pd[2]), 6, 0, 'America/Los_Angeles')) };
  const image = entry.image ?? html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ?? null;
  // "5 a.m. PT" must not end the sentence for the date searches below
  const raw = t.slice(t.indexOf('Pricing and Availability'), t.indexOf('Pricing and Availability') + 3500);
  const sec = raw.replace(/\b([ap])\.m\./g, '$1m').replace(/U\.S\./g, 'US');
  if (!sec.startsWith('Pricing')) return null;
  const pre = sec.match(/pre-?order[^.]*?(starting today|beginning today|today|(?:starting|beginning|on|this)\s+(?:\w+day,?\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2})/i);
  const avail = sec.match(/(?:availability|available|arrive|in stores)[^.]*?((?:starting|beginning|on|this)\s+(?:\w+day,?\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}|available (?:starting )?today)/i);
  const price = raw.match(/(?:starts? at|available for|priced at|today for)\s+(\$[\d,.]+(?: \(U\.S\.\))?)/i)?.[1] ?? null;
  // Pre-orders open at 5 a.m. Pacific; stores open in the morning (shown in Rome time, approximate)
  const preorder = pre ? (/today/i.test(pre[1]) ? entry.time : dateAfter(entry.time, pre[1], 5, 0, 'America/Los_Angeles')) : null;
  const available = avail ? (/today/i.test(avail[1]) ? entry.time : dateAfter(entry.time, avail[1], 8, 0, 'Europe/Rome')) : null;
  return { title: entry.title, url: entry.url, published: entry.time, preorder, available, price, image, summary: entry.summary ?? null };
}

/** Newsroom RSS: the latest 20 stories with their type (PRESS RELEASE, UPDATE…), summary and image. */
async function newsroomFeed() {
  const xml = await get('https://www.apple.com/newsroom/rss-feed.rss', { browser: true });
  const cdata = s => decode((s ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').trim());
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => ({
    title: cdata(m[1].match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]),
    url: m[1].match(/<link href="([^"]+)"\/>/)?.[1] ?? m[1].match(/<link[^>]*href="([^"]+)"/)?.[1] ?? '',
    time: new Date(cdata(m[1].match(/<updated>([\s\S]*?)<\/updated>/)?.[1]) || Date.now()).toISOString(),
    kind: m[1].match(/<category term="([^"]+)"/)?.[1] ?? null,
    summary: cdata(m[1].match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1]) || null,
    image: m[1].match(/<link href="([^"]+)" rel="enclosure"/)?.[1] ?? null,
  }));
}

const OS = /^(iOS|iPadOS|macOS|watchOS|tvOS|visionOS|Xcode)\s+([\d.]+)\s*(beta(?:\s*\d+)?|RC(?:\s*\d+)?|Release Candidate(?:\s*\d+)?)?\s*\(([^)]+)\)/;

/** Betas, release candidates and releases of every OS from the Apple Developer releases feed. */
async function software(prev = []) {
  const items = parseFeed(await get('https://developer.apple.com/news/releases/rss/releases.rss', { browser: true }));
  const fresh = items.map(i => {
    const m = i.title.match(OS);
    if (!m) return null;
    const stage = !m[3] ? 'release' : /^beta/i.test(m[3]) ? 'beta' : 'rc';
    return { os: m[1], version: m[2], stage, n: Number(m[3]?.match(/\d+/)?.[0] ?? 1), build: m[4], time: iso(i.time), url: i.link };
  }).filter(Boolean);
  const seen = new Set();
  return [...fresh, ...prev].filter(s => !seen.has(`${s.os} ${s.build}`) && seen.add(`${s.os} ${s.build}`) && Date.parse(s.time) > now - 730 * DAY)
    .sort((a, b) => b.time.localeCompare(a.time));
}

const RUMOR = /rumou?r|report(?:s|edly|ed)?\b|expected|said to|could|\bmay\b|might|leak|gurman|\bkuo\b|tipped|plans?\b|code (?:reveals|suggests|hints)|in the works|coming (?:soon|later|next)|will reportedly|supply chain|analyst|predict|roadmap|\bwhat to expect/i;

/** Rumour sites' latest headlines, flagged when they report something Apple has not announced. */
async function rumors() {
  const feeds = [['MacRumors', 'https://feeds.macrumors.com/MacRumors-All'], ['9to5Mac', 'https://9to5mac.com/feed/']];
  const all = await Promise.all(feeds.map(([source, url]) => get(url, { browser: true })
    .then(xml => parseFeed(xml).slice(0, 30).map(i => ({ title: i.title, url: i.link, time: iso(i.time), source, rumor: RUMOR.test(i.title) })))
    .catch(() => [])));
  return all.flat().sort((a, b) => b.time.localeCompare(a.time)).slice(0, 50);
}

const gnews = q => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
/** Google News items with the outlet split off the title ("Headline - Bloomberg.com"). */
async function gnewsItems(q) {
  return parseFeed(await get(gnews(q), { browser: true })).map(i => {
    const m = i.title.match(/^(.*) - ([^-]+)$/);
    return { title: (m?.[1] ?? i.title).trim(), url: i.link, time: iso(i.time), source: (m?.[2] ?? '').replace(/\.com$/, '').trim() };
  });
}

const SOCIAL = /^(?:X|Facebook|Threads|Instagram|Reddit|YouTube|TikTok|LinkedIn|Bluesky)$|cricclubs/i;

/** Mark Gurman: his Bloomberg stories and Power On, and the reports that cite him. */
async function gurman() {
  const [own, cited] = await Promise.all([
    gnewsItems('"Gurman" site:bloomberg.com when:60d').catch(() => []),
    gnewsItems('"Mark Gurman" OR "Gurman says" OR "Gurman:" -site:bloomberg.com when:14d').catch(() => []),
  ]);
  const seen = new Set();
  return [...own.map(i => ({ ...i, bloomberg: true })), ...cited.map(i => ({ ...i, bloomberg: false }))]
    // Outlets only (no social posts), and only headlines that credit him
    .filter(i => (i.bloomberg ? /apple|iphone|ipad|mac|watch|vision|airpods|siri|ios|ternus|cook|power on/i : /mark gurman|gurman(?::|'s|’s| says| reports)|bloomberg/i).test(i.title) && !SOCIAL.test(i.source))
    .filter(i => { const k = i.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 60); return !seen.has(k) && seen.add(k); })
    .sort((a, b) => b.time.localeCompare(a.time)).slice(0, 40);
}

const MONTH_ABBR = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';
const ANNOUNCED = /\bapple\b.*\b(?:announces?|announced|confirms?|sets|invites|sends (?:out )?invit|unveils special)\b|\b(?:launch|event) announced\b/i;
const NOT_YET = /rumou?r|report(?:ed|edly)?\b|expected|could|might|\bmay\b|what to expect|plans?\b|planned|\?|vs\.|recap|everything|live blog|how to watch/i;
const TRUSTED = /9to5Mac|MacRumors|Bloomberg|CNBC|Reuters|The Verge|MacStories|Apple|Associated Press|AP News|TechCrunch|Engadget/i;
const CITIES = [['Los Angeles', /\b(?:LA|Los Angeles)\b/], ['New York', /\b(?:NYC|New York)\b/], ['Cupertino', /Cupertino|Apple Park/], ['London', /London/]];

/**
 * Apple events announced to the press: Apple now also holds "launch experiences" that never reach
 * apple.com/apple-events. A date counts once a headline reports the invitation (not a rumour) from
 * two outlets or a trusted one. Tagline and city come from the headlines.
 */
async function pressEvents(prev = []) {
  const items = (await Promise.all(['Apple announces event when:45d', 'Apple event invites date when:45d', 'Apple announces WWDC when:60d'].map(q => gnewsItems(q).catch(() => [])))).flat();
  const byDate = new Map();
  for (const i of items) {
    if (!ANNOUNCED.test(i.title) || NOT_YET.test(i.title)) continue;
    const m = i.title.match(new RegExp(`\\b(${MONTHS.split('|').join('|')}|${MONTH_ABBR})\\.?\\s+(\\d{1,2})\\b`, 'i'));
    if (!m) continue;
    const month = MONTHS.toLowerCase().split('|').findIndex(x => x.startsWith(m[1].toLowerCase().slice(0, 3))) + 1;
    const pub = new Date(i.time);
    let year = pub.getUTCFullYear();
    if (month < pub.getUTCMonth() + 1 - 1) year += 1;
    const start = zoned(year, month, +m[2], 10, 0, 'America/Los_Angeles');
    // The invitation comes before the event, at most about a month ahead
    if (start < Date.parse(i.time) || start - Date.parse(i.time) > 40 * DAY) continue;
    const key = iso(start).slice(0, 10);
    const e = byDate.get(key) ?? { date: key, start: iso(start), headlines: [] };
    e.headlines.push(i);
    byDate.set(key, e);
  }
  const fresh = [...byDate.values()].map(e => {
    const outlets = new Set(e.headlines.map(h => h.source));
    if (outlets.size < 2 && !e.headlines.some(h => TRUSTED.test(h.source))) return null;
    const all = e.headlines.map(h => h.title).join(' | ');
    // The tagline as the trusted outlets spell it (others Title-Case it), else the most quoted one
    const tags = [...e.headlines].sort((a, b) => (TRUSTED.test(b.source) ? 1 : 0) - (TRUSTED.test(a.source) ? 1 : 0))
      .map(h => h.title.match(/[‘“'"]([^‘’“”'"]{3,40})[’”'"]/)?.[1]).filter(Boolean);
    const count = t => tags.filter(x => x.toLowerCase() === t.toLowerCase()).length;
    const tagline = [...tags].sort((a, b) => count(b) - count(a))[0] ?? null;
    const spelled = tagline ? tags.find(t => t.toLowerCase() === tagline.toLowerCase()) : null;
    return {
      date: e.date, start: e.start, tagline: spelled ? spelled.charAt(0).toUpperCase() + spelled.slice(1) : null,
      city: CITIES.find(([, re]) => re.test(all))?.[0] ?? null, kind: /experience/i.test(all) && !/special event/i.test(all) ? 'experience' : /wwdc/i.test(all) ? 'wwdc' : 'event',
      announced: e.headlines.map(h => h.time).sort()[0],
      sources: e.headlines.sort((a, b) => (TRUSTED.test(b.source) ? 1 : 0) - (TRUSTED.test(a.source) ? 1 : 0)).slice(0, 4).map(({ title, url, source }) => ({ title, url, source })),
    };
  }).filter(Boolean);
  // Keep what earlier runs found: headlines fall out of the search after a few weeks
  return [...fresh, ...prev.filter(p => !fresh.some(f => f.date === p.date))].sort((a, b) => a.date.localeCompare(b.date));
}

/** "October 28, 2026" / "June 8–12, 2026" -> "2026-10-28" (first day). */
function isoDay(text) {
  const m = text.match(new RegExp(`(${MONTHS})\\s+(\\d{1,2})(?:\\s*[–-]\\s*\\d{1,2})?,\\s*(\\d{4})`, 'i'));
  if (!m) return null;
  const month = MONTHS.toLowerCase().split('|').indexOf(m[1].toLowerCase()) + 1;
  return `${m[3]}-${String(month).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

/**
 * appleinvites.com: every Apple event invitation with its artwork, the day it was sent, the event
 * date, what Apple announced and the keynote video. A fan archive, updated within hours of an invite.
 */
async function invites() {
  const pages = await Promise.all(['https://appleinvites.com/', 'https://appleinvites.com/wwdc/'].map(u => get(u, { browser: true })));
  const out = [];
  pages.forEach((html, pi) => {
    for (const card of html.replace(/<!--[\s\S]*?-->/g, '').split('<div class="card">').slice(1)) {
      const field = label => card.match(new RegExp(`${label}</div>\\s*<p[^>]*>([\\s\\S]*?)</p>`))?.[1];
      const title = plainText(card.match(/<h3 class="card-title">([\s\S]*?)<\/h3>/)?.[1] ?? '');
      const date = isoDay(plainText(field('EVENT DATE') ?? ''));
      if (!title || !date) continue;
      const img = card.match(/<img\s+src="\s*([^"]+)"/)?.[1]?.trim();
      const link = cls => card.match(new RegExp(`<a href="(http[^"]+)" class="${cls}"`))?.[1] ?? null;
      const announced = plainText(field('WHAT APPLE ANNOUNCED') ?? '');
      out.push({
        date, kind: pi === 1 ? 'wwdc' : 'event',
        tagline: pi === 1 || /^Apple Launch$/i.test(title) ? null : title.replace(/\.$/, ''),
        title: pi === 1 ? title : /^Apple Launch$/i.test(title) ? 'Apple launch' : 'Apple event',
        invited: isoDay(plainText(card.match(/<div class="title-category">([^<]*\d{4})<\/div>/)?.[1] ?? '')),
        location: plainText(field('LOCATION') ?? '') || null,
        image: img && !/not-found/.test(img) ? new URL(img, 'https://appleinvites.com/').href : null,
        announced: announced && !/update later/i.test(announced) ? announced : null,
        youtube: link('youtube'), podcast: link('podcast'),
      });
    }
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const usd = s => Number(String(s).replace(/[$,]/g, ''));

/** AAPL: last price and five years of daily closes, and the next earnings date (Nasdaq). */
async function stock() {
  const from = new Date(now - 5 * 366 * DAY).toISOString().slice(0, 10), to = new Date(now).toISOString().slice(0, 10);
  const [hist, info, earn] = await Promise.all([
    get(`https://api.nasdaq.com/api/quote/AAPL/historical?assetclass=stocks&fromdate=${from}&todate=${to}&limit=2000`, { browser: true, json: true }),
    get('https://api.nasdaq.com/api/quote/AAPL/info?assetclass=stocks', { browser: true, json: true }),
    get('https://api.nasdaq.com/api/analyst/AAPL/earnings-date', { browser: true, json: true }).catch(() => null),
  ]);
  const closes = (hist.data?.tradesTable?.rows ?? []).map(r => {
    const [m, d, y] = r.date.split('/');
    return [`${y}-${m}-${d}`, usd(r.close)];
  }).reverse();
  const p = info.data?.primaryData ?? {};
  const nextText = earn?.data?.announcement ?? '';
  const nd = nextText.match(/(\w{3}) (\d{1,2}), (\d{4})/);
  // Apple reports after the US close, at 2 p.m. Pacific (the call starts at 2:00 PT)
  const next = nd ? iso(zoned(+nd[3], 'JanFebMarAprMayJunJulAugSepOctNovDec'.indexOf(nd[1]) / 3 + 1, +nd[2], 14, 0, 'America/Los_Angeles')) : null;
  return {
    price: usd(p.lastSalePrice), change: Number(p.netChange), pct: Number(String(p.percentageChange).replace('%', '')), at: p.lastTradeTimestamp ?? null,
    closes, nextEarnings: next, nextEarningsNote: earn?.data?.reportText?.replace(/\s+/g, ' ').trim() ?? null,
  };
}

/** A section from the previous file when its source fails, so one broken site never empties the page. */
const keep = async (fn, fallback) => { try { return await fn(); } catch { return fallback; } };

export async function collectApple() {
  let prev = {};
  try { prev = JSON.parse(await readFile(new URL('apple.json', DATA), 'utf8')); } catch { /* first run */ }
  let prevArchive = [];
  try { prevArchive = JSON.parse(await readFile(new URL('apple-archive.json', DATA), 'utf8')).stories ?? []; } catch { /* first run */ }

  const [news, archive] = await Promise.all([keep(newsroomFeed, prev.news ?? []), keep(() => newsroomArchive(prevArchive), prevArchive)]);
  // Product launches: press releases of the last 75 days (the archive reaches further back than the 20-story feed)
  const feedOf = new Map(news.map(n => [new URL(n.url).pathname, n]));
  const candidates = archive.filter(e => e.k === 'PRESS RELEASE' && PRODUCT.test(e.t) && Date.parse(e.d) > now - 75 * DAY).slice(0, 20)
    .map(e => ({ title: e.t, url: `https://www.apple.com${e.u}`, time: `${e.d}T13:00:00.000Z`, image: feedOf.get(e.u)?.image, summary: feedOf.get(e.u)?.summary }));
  const fresh = (await Promise.all(candidates.map(e => release(e).catch(() => null)))).filter(Boolean);
  // Releases stay on the board for a year after they reach the stores
  const releases = [...fresh, ...(prev.releases ?? []).filter(r => !fresh.some(f => f.url === r.url))]
    .filter(r => Date.parse(r.available ?? r.published) > now - 365 * DAY)
    .sort((a, b) => b.published.localeCompare(a.published));

  const wikiFresh = prev.wikiAt && now - Date.parse(prev.wikiAt) < 12 * 3600e3 && prev.history?.length;
  const [ev, history, lines, sw, rum, aapl, gur, press, inv] = await Promise.all([
    keep(appleEvents, { keynotes: prev.keynotes ?? [], lead: prev.lead ?? null }),
    wikiFresh ? prev.history : keep(mediaEvents, prev.history ?? []),
    wikiFresh ? prev.lines : keep(productLines, prev.lines ?? []),
    keep(() => software(prev.software), prev.software ?? []),
    keep(rumors, prev.rumors ?? []),
    keep(stock, prev.stock ?? null),
    keep(gurman, prev.gurman ?? []),
    keep(() => pressEvents(prev.pressEvents), prev.pressEvents ?? []),
    keep(invites, prev.invites ?? []),
  ]);
  // Accounts: the SEC cache lives with the archive (it is large); a new filing arrives once a quarter
  let secCache = [];
  try { secCache = JSON.parse(await readFile(new URL('apple-archive.json', DATA), 'utf8')).sec ?? []; } catch { /* first run */ }
  const quarters = wikiFresh && secCache.length ? secCache : await keep(() => secQuarters(secCache), secCache);
  const earnings = await keep(() => earningsHistory(archive, prev.earnings), prev.earnings ?? []);
  if (archive.length) await writeFile(new URL('apple-archive.json', DATA), JSON.stringify({ updated: new Date().toISOString(), stories: archive, sec: quarters }));
  // Diluted EPS as Apple reported it (a fourth quarter derived from the annual report is not exact)
  const pressEps = new Map(earnings.map(e => [`${e.fy}-${e.q}`, e.eps]));
  const accounts = quarters.filter(q => q.revenue).map(({ raw, ...q }) => ({ ...q, eps: pressEps.get(`${q.fy}-${q.q}`) ?? (q.q === 4 ? null : q.eps) }));

  return {
    updated: new Date().toISOString(),
    wikiAt: wikiFresh ? prev.wikiAt : new Date().toISOString(),
    keynotes: ev.keynotes,
    lead: ev.lead,
    releases,
    news,
    history: history.length ? history : prev.history ?? [],
    lines: lines.length ? lines : prev.lines ?? [],
    software: sw,
    rumors: rum.length ? rum : prev.rumors ?? [],
    stock: aapl,
    earnings,
    accounts,
    gurman: gur.length ? gur : prev.gurman ?? [],
    pressEvents: press,
    invites: inv.length ? inv : prev.invites ?? [],
    archiveCount: archive.length,
  };
}
