// Apple, automatic: keynotes from apple.com/apple-events, and product releases from
// Apple Newsroom press releases (their "Pricing and Availability" section gives the
// pre-order and in-store dates).
import { decode, get, iso, parseDate, zoned } from './lib.mjs';

const DAY = 86400e3;
const now = Date.now();
const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';

async function keynotes() {
  const html = await get('https://www.apple.com/apple-events/', { browser: true });
  const seen = new Set();
  const out = [];
  for (const m of html.matchAll(new RegExp(`(${MONTHS}) (\\d{1,2}), (20\\d{2})`, 'g'))) {
    const d = parseDate(m[0]);
    if (!d) continue;
    const key = `${d.y}-${d.m}-${d.d}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Apple keynotes start at 10 a.m. Pacific
    const start = zoned(d.y, d.m, d.d, 10, 0, 'America/Los_Angeles');
    out.push({ title: d.m === 6 ? 'WWDC keynote' : 'Apple Event', start: iso(start), past: start < now });
  }
  return out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

const PRODUCT = /introduc|unveil|announc|debut|launch|new .*(available|arrive)|available today|now available/i;

/** "Friday, November 13" (relative to the press release date) -> ISO date at a local time. */
function dateAfter(published, text, hh, mm, tz) {
  const m = text.match(new RegExp(`(?:\\w+day,?\\s+)?(${MONTHS})\\s+(\\d{1,2})`));
  if (!m) return null;
  const pub = new Date(published);
  const month = new RegExp(MONTHS).exec(m[1]) && MONTHS.split('|').indexOf(m[1]) + 1;
  let year = pub.getUTCFullYear();
  if (month < pub.getUTCMonth() + 1 - 1) year += 1; // e.g. a December release announcing January availability
  return iso(zoned(year, month, Number(m[2]), hh, mm, tz));
}

async function release(entry0) {
  let entry = entry0;
  const html = await get(entry0.url, { browser: true });
  const t = decode(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
  // The press release date ("October 13, 2026 PRESS RELEASE") is the reference for "today"
  const pd = t.match(new RegExp(`(${MONTHS}) (\\d{1,2}), (20\\d{2})\\s+(?:PRESS RELEASE|UPDATE|FEATURE)`));
  if (pd) entry = { ...entry, time: iso(zoned(Number(pd[3]), MONTHS.split('|').indexOf(pd[1]) + 1, Number(pd[2]), 6, 0, 'America/Los_Angeles')) };
  const sec = t.slice(t.indexOf('Pricing and Availability'), t.indexOf('Pricing and Availability') + 1800);
  if (!sec.startsWith('Pricing')) return null;
  const pre = sec.match(/pre-?order[^.]*?(starting today|beginning today|today|(?:starting|beginning|on)\s+(?:\w+day,?\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2})/i);
  const avail = sec.match(/(?:availability|available|arrive|in stores)[^.]*?((?:starting|beginning|on)\s+(?:\w+day,?\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}|available (?:starting )?today)/i);
  const price = sec.match(/(?:starts? at|available for|priced at)\s+(\$[\d,.]+(?: \(U\.S\.\))?)/i)?.[1] ?? null;
  // Pre-orders open at 5 a.m. Pacific; stores open in the morning (shown in Rome time, approximate)
  const preorder = pre ? (/today/i.test(pre[1]) ? entry.time : dateAfter(entry.time, pre[1], 5, 0, 'America/Los_Angeles')) : null;
  const available = avail ? (/today/i.test(avail[1]) ? entry.time : dateAfter(entry.time, avail[1], 8, 0, 'Europe/Rome')) : null;
  return { title: entry.title, url: entry.url, published: entry.time, preorder, available, price };
}

export async function collectApple() {
  const xml = await get('https://www.apple.com/newsroom/rss-feed.rss', { browser: true });
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => ({
    title: decode(m[1].match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() ?? ''),
    url: m[1].match(/<link[^>]*href="([^"]+)"/)?.[1] ?? '',
    time: new Date(m[1].match(/<updated>([^<]+)/)?.[1] ?? Date.now()).toISOString(),
  }));
  const candidates = entries.filter(e => PRODUCT.test(e.title) && Date.parse(e.time) > now - 75 * DAY).slice(0, 10);
  const releases = (await Promise.all(candidates.map(e => release(e).catch(() => null)))).filter(Boolean);
  return {
    updated: new Date().toISOString(),
    keynotes: await keynotes().catch(() => []),
    releases,
    news: entries.slice(0, 20),
  };
}
