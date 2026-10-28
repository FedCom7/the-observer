// Fashion weeks of the Big 4 (New York, London, Milan, Paris): dates and show schedules from
// the organisers (CFDA, British Fashion Council, Camera Nazionale della Moda Italiana, FHCM),
// plus the collections WWD Runway reviewed (with the matching Vogue Runway page).
import { decode, get, zoned } from './lib.mjs';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const TZ = { Paris: 'Europe/Paris', Milan: 'Europe/Rome', London: 'Europe/London', 'New York': 'America/New_York' };
const pad = n => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const text = html => decode(html.replace(/&[nm]dash;/g, '–').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, '\n')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n');

const KIND = { women: 'Womenswear', men: 'Menswear', couture: 'Haute couture' };
const week = (city, kind, season, start, end, extra = {}) => ({
  id: `${city.toLowerCase().replace(' ', '')}-${kind}-${start}`, city, kind, season, start, end, ...extra,
});

/** "Monday, March 1st to Tuesday, March 9th 2027" → [start, end] ISO days. */
function range(s, fallbackYear) {
  const m = s.match(/(?:[A-Za-z]+,?\s+)?([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*(?:to|–|-)\s*(?:[A-Za-z]+,?\s+)?(?:([A-Za-z]+)\s+)?(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/);
  if (!m) return null;
  const y = +(m[5] ?? fallbackYear);
  const m1 = MONTHS.indexOf(m[1].toLowerCase()) + 1;
  const m2 = m[3] ? MONTHS.indexOf(m[3].toLowerCase()) + 1 : m1;
  return m1 && m2 ? [ymd(y, m1, +m[2]), ymd(y, m2, +m[4])] : null;
}

// ---- Paris: FHCM ---------------------------------------------------------------------------

async function parisWeeks() {
  const t = text(await get('https://www.fhcm.paris/en/upcoming-seasons-and-previous-editions', { browser: true }));
  const out = [];
  for (const m of t.matchAll(/^(Womenswear|Menswear|Haute Couture)\s+(Spring\/Summer|Fall\/Winter)\s+([\d-]+)\s+from\s+(.+)$/gim)) {
    const r = range(m[4], m[3].slice(0, 4));
    if (!r) continue;
    const kind = m[1] === 'Womenswear' ? 'women' : m[1] === 'Menswear' ? 'men' : 'couture';
    out.push(week('Paris', kind, `${m[2].replace('Fall', 'Autumn')} ${m[3]}`, r[0], r[1], { link: 'https://www.fhcm.paris/en/upcoming-seasons-and-previous-editions', official: 'FHCM' }));
  }
  return out;
}

/** The final calendar FHCM publishes for the edition on its site (womenswear or couture page). */
async function parisShows(url) {
  const html = await get(url, { browser: true });
  const shows = [];
  for (const day of html.split(/<div class="day\s*"/).slice(1)) {
    for (const house of day.split('<div class="cal-item').slice(1)) {
      const brand = decode((house.match(/<h3>([^<]+)<\/h3>/) ?? [])[1] ?? '').trim();
      const link = (house.match(/href="(https:\/\/www\.fhcm\.paris\/[^"]*house[^"]*)"/) ?? [])[1];
      for (const e of house.matchAll(/data-date-start="(\d{8}T\d{6}Z)"[\s\S]*?<span class="type">([^<]+)<\/span>[\s\S]*?<span class="modality">([^<]*)<\/span>/g)) {
        const s = e[1];
        const start = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:00Z`;
        shows.push({ city: 'Paris', brand, start, type: /show/i.test(e[2]) ? 'show' : 'presentation', note: e[3].trim() || undefined, link });
      }
    }
  }
  return shows;
}

// ---- Milan: Camera Nazionale della Moda Italiana -------------------------------------------

async function milanWeeks() {
  const html = await get('https://www.cameramoda.it/en/milano-moda-donna/calendar/', { browser: true });
  const out = [];
  // The page carries the "Dates" modals of the women's (mmd) and men's (mmu) weeks
  for (const [id, kind] of [['mmd', 'women'], ['mmu', 'men']]) {
    const modal = text((html.match(new RegExp(`id="modal-dates-${id}"[\\s\\S]*?</div>\\s*</div>\\s*</div>`)) ?? [''])[0]);
    const next = (modal.match(/NEXT EDITIONS([\s\S]*?)PREVIOUS EDITIONS/i) ?? [])[1] ?? '';
    const lines = next.split('\n').map(l => l.trim()).filter(Boolean);
    for (let i = 0; i + 1 < lines.length; i += 2) {
      const m = lines[i + 1].match(/(\d{1,2})(?:st|nd|rd|th)?\s*([A-Za-z]+)?\s*[–-]\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/);
      if (!m) continue;
      const m2 = MONTHS.indexOf(m[4].toLowerCase()) + 1, m1 = m[2] ? MONTHS.indexOf(m[2].toLowerCase()) + 1 : m2;
      if (!m1 || !m2) continue;
      const season = lines[i].replace(/\s+/g, ' ').replace(/(\d{4})\/(\d{4})/, '$1-$2');
      out.push(week('Milan', kind, season, ymd(+m[5], m1, +m[1]), ymd(+m[5], m2, +m[3]), { link: 'https://www.cameramoda.it/en/', official: 'CNMI' }));
    }
  }
  return out;
}

/** Fashion shows and presentations in a CNMI calendar page. */
async function milanShows(url, startIso) {
  const html = await get(url, { browser: true });
  const [y, m, d] = startIso.split('-').map(Number);
  const shows = [];
  const days = html.split(/<div class="day" id="day-(\d+)">/);
  for (let i = 1; i < days.length; i += 2) {
    const n = +days[i];
    const date = new Date(Date.UTC(y, m - 1, d + n - 1));
    for (const row of days[i + 1].split('<div class="cal-table-row').slice(1)) {
      const kind = (row.match(/^\s*(sfilata|presentazione)/) ?? [])[1];
      if (!kind) continue;
      const time = (row.match(/event-time">\s*<strong>\s*(\d{1,2}):(\d{2})/) ?? []);
      const brand = decode(((row.match(/event-title">([\s\S]*?)<\/div>/) ?? [])[1] ?? '').replace(/<[^>]+>/g, '').trim());
      if (!time[1] || !brand) continue;
      const place = decode(((row.match(/event-address">([\s\S]*?)<\/div>/) ?? [])[1] ?? '').replace(/<[^>]+>/g, '').trim());
      shows.push({
        city: 'Milan', brand: brand.replace(/\s+/g, ' '), type: kind === 'sfilata' ? 'show' : 'presentation', place: place || undefined,
        start: new Date(zoned(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), +time[1], +time[2], TZ.Milan)).toISOString(),
        live: /class="live"/.test(row) || undefined,
      });
    }
  }
  return shows;
}

// ---- London: British Fashion Council -------------------------------------------------------

async function londonWeek() {
  const t = text(await get('https://londonfashionweek.co.uk/', { browser: true }));
  // "takes place between Thursday 17th to Monday 21st September 2026"
  const m = t.replace(/(\d)(?:th|st|nd|rd)\b/g, '$1').match(/takes place between\s+\w+\s+(\d{1,2})\s+to\s+\w+\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
  const mo = m ? MONTHS.indexOf(m[3].toLowerCase()) + 1 : 0;
  if (!m || !mo) return [];
  const y = +m[4];
  const season = mo <= 6 ? `Autumn/Winter ${y}-${y + 1}` : `Spring/Summer ${y + 1}`;
  return [week('London', 'women', season, ymd(y, mo, +m[1]), ymd(y, mo, +m[2]), { link: 'https://londonfashionweek.co.uk/schedule', official: 'BFC' })];
}

async function londonShows() {
  const d = (await get('https://londonfashionweek.co.uk/api/events', { json: true, browser: true })).data;
  const shows = [];
  for (const day of d.dates ?? []) {
    for (const e of day.physical ?? []) {
      if (!/catwalk|presentation/i.test(e.type) || /appointment/i.test(e.type)) continue;
      shows.push({
        city: 'London', brand: decode(e.title).trim(), type: /catwalk/i.test(e.type) ? 'show' : 'presentation',
        start: new Date(e.start_dt).toISOString(), note: e.cta?.label ? e.cta.label.toLowerCase() : undefined,
        link: e.uri ? `https://londonfashionweek.co.uk${e.uri}` : undefined,
      });
    }
  }
  return shows;
}

// ---- New York: CFDA (the show-level calendar is behind a subscription) -----------------------

/** Dates announced by the CFDA for the Official NYFW Schedule, read from its news posts. */
async function newYorkWeeks() {
  const list = await get('https://cfda.com/news-and-insights/?category=new-york-fashion-week', { browser: true });
  const links = [...new Set([...list.matchAll(/href="(https:\/\/cfda\.com\/news\/[^"]*official-nyfw[^"]*schedule[^"]*)"/g)].map(m => m[1]))].filter(u => !/bridal/.test(u));
  const out = [];
  for (const url of links.slice(0, 3)) {
    const t = text(await get(url, { browser: true }));
    const season = t.match(/for the\s+(spring-summer|fall-winter|spring|fall)\s+(\d{4})/i);
    const m = t.match(/on\s+\w+day,\s+([A-Za-z]+)\s+(\d{1,2}),?\s+and closes with[^.]*?on\s+\w+day,\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/i);
    if (!m || !season) continue;
    const y = +m[5];
    const a = MONTHS.indexOf(m[1].toLowerCase()) + 1, b = MONTHS.indexOf(m[3].toLowerCase()) + 1;
    const ss = /spring/i.test(season[1]);
    out.push(week('New York', 'women', ss ? `Spring/Summer ${season[2]}` : `Autumn/Winter ${season[2]}-${+season[2] + 1}`, ymd(y, a, +m[2]), ymd(y, b, +m[4]), { link: url, official: 'CFDA' }));
  }
  return out;
}

// ---- Wanted but not yet announced: shown as "dates to be confirmed" ------------------------

/** The next women's weeks of New York and London when the organisers have not published dates. */
function expected(known, today) {
  const out = [];
  for (const city of ['New York', 'London']) {
    const upcoming = known.some(w => w.city === city && w.kind === 'women' && w.start > today);
    if (upcoming) continue;
    const y = +today.slice(0, 4), after = today.slice(5);
    // Autumn/Winter shows in February; the next September season when February has gone by
    const feb = after < '03-01';
    const season = feb ? `Autumn/Winter ${y}-${y + 1}` : `Autumn/Winter ${y + 1}-${y + 2}`;
    const sy = feb ? y : y + 1;
    out.push(week(city, 'women', season, ymd(sy, 2, city === 'New York' ? 11 : 19), ymd(sy, 2, city === 'New York' ? 16 : 23), {
      tbc: true, official: city === 'New York' ? 'CFDA' : 'BFC',
      link: city === 'New York' ? 'https://cfda.com/fashion-calendar' : 'https://londonfashionweek.co.uk/',
    }));
  }
  return out;
}

// ---- WWD Runway: the collections reviewed ---------------------------------------------------

const titleCase = s => s.split('-').map(w => (w.length > 2 || /^(by|of|for|and|de)$/.test(w) ? w[0].toUpperCase() + w.slice(1) : w.toUpperCase())).join(' ').replace(/\b(For|Of|By|And|De)\b/g, x => x.toLowerCase());

async function wwdCollections() {
  const idx = await get('https://wwd.com/runway/', { browser: true });
  const seasons = [...new Set([...idx.matchAll(/href="https:\/\/wwd\.com\/runway\/([a-z-]*(?:spring|fall|couture|resort|pre-fall)[a-z-]*-?\d{4}|[a-z-]*\d{4})\/"/g)].map(m => m[1]))].slice(0, 4);
  const out = [];
  for (const season of seasons) {
    for (const [city, slug] of [['New York', 'new-york'], ['London', 'london'], ['Milan', 'milan'], ['Paris', 'paris']]) {
      let html;
      try { html = await get(`https://wwd.com/runway/${season}/${slug}/`, { browser: true }); } catch { continue; }
      const seen = new Set();
      for (const m of html.matchAll(new RegExp(`href="(https://wwd\\.com/runway/${season}/${slug}/([a-z0-9-]+)/review/)"`, 'g'))) {
        if (seen.has(m[2])) continue;
        seen.add(m[2]);
        out.push({ season, city, brand: titleCase(m[2]), url: m[1] });
      }
    }
  }
  // Vogue Runway has a page per collection; it does not say the city, so match WWD's brands by slug
  const vogueSeason = s => (s.startsWith('mens-') ? `${s.slice(5)}-menswear` : `${s}-ready-to-wear`);
  for (const season of new Set(out.map(c => c.season))) {
    let slugs;
    try {
      const html = await get(`https://www.vogue.com/fashion-shows/${vogueSeason(season)}`, { browser: true });
      slugs = new Set([...html.matchAll(new RegExp(`href="/fashion-shows/${vogueSeason(season)}/([a-z0-9-]+)"`, 'g'))].map(m => m[1]));
    } catch { continue; }
    for (const c of out.filter(x => x.season === season)) {
      const slug = c.url.split('/').at(-3);
      const hit = [slug, slug.replace(/-collection$/, '')].find(x => slugs.has(x));
      if (hit) c.vogue = `https://www.vogue.com/fashion-shows/${vogueSeason(season)}/${hit}`;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------

export async function collectFashion() {
  const today = new Date().toISOString().slice(0, 10);
  const settle = async (label, fn, fallback) => { try { return await fn(); } catch (err) { status[label] = String(err.message).slice(0, 80); return fallback; } };
  const status = {};
  const [paris, milan, london, ny, collections] = await Promise.all([
    settle('FHCM dates', parisWeeks, []), settle('CNMI dates', milanWeeks, []), settle('BFC dates', londonWeek, []),
    settle('CFDA dates', newYorkWeeks, []), settle('WWD Runway', wwdCollections, []),
  ]);

  // Past editions are known only through their calendars: build their weeks from the shows
  const shows = [];
  const parisPages = [['https://www.fhcm.paris/en/paris-fashion-week/calendar', 'women'], ['https://www.fhcm.paris/en/haute-couture-week/calendar', 'couture']];
  for (const [url, kind] of parisPages) shows.push(...(await settle(`FHCM ${kind} calendar`, () => parisShows(url), [])).map(s => ({ ...s, kind })));
  shows.push(...(await settle('BFC calendar', londonShows, [])).map(s => ({ ...s, kind: 'women' })));

  let weeks = [...paris, ...milan, ...london, ...ny];
  // Milan calendars are published a few weeks before the show: read whatever is online now
  for (const [url, kind] of [['https://www.cameramoda.it/en/milano-moda-donna/calendar/', 'women'], ['https://www.cameramoda.it/en/milano-moda-uomo/calendar/', 'men']]) {
    const html = await settle(`CNMI ${kind} calendar`, () => get(url, { browser: true }), '');
    const m = html.match(/<title>[^<]*?(SS|FW|AW)\s*(\d{4})[^<]*?(?:(\d{1,2})\s*[-–/]\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4}))/i) ?? html.match(/(SPRING\/SUMMER|FALL\/WINTER|AUTUMN\/WINTER)\s+(\d{4})\s*-\s*(\d{1,2})\s*[-–/]\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
    if (!m) continue;
    const mo = MONTHS.indexOf(m[5].toLowerCase()) + 1;
    if (!mo) continue;
    const start = ymd(+m[6], mo, +m[3]);
    shows.push(...(await settle(`CNMI ${kind} shows`, () => milanShows(url, start), [])).map(s => ({ ...s, kind })));
    // The calendar page itself tells us the edition when the "Next editions" modal no longer lists it
    if (!weeks.some(w => w.city === 'Milan' && w.kind === kind && w.start === start)) {
      weeks.push(week('Milan', kind, `${/SS|SPRING/i.test(m[1]) ? 'Spring/Summer' : 'Autumn/Winter'} ${m[2]}`, start, ymd(+m[6], mo, +m[4]), { link: url, official: 'CNMI' }));
    }
  }

  // Paris and London calendars of weeks the lists above already dropped: derive the week from the shows
  for (const key of new Set(shows.map(s => `${s.city}|${s.kind}`))) {
    const [city, kind] = key.split('|');
    const mine = shows.filter(s => s.city === city && s.kind === kind).map(s => s.start.slice(0, 10)).sort();
    const start = mine[0], end = mine.at(-1);
    if (weeks.some(w => w.city === city && w.kind === kind && w.start <= end && w.end >= start)) continue;
    const y = +start.slice(0, 4), mo = +start.slice(5, 7);
    const season = kind === 'couture'
      ? `Haute Couture ${mo <= 3 ? `Spring/Summer ${y}` : `Autumn/Winter ${y}-${y + 1}`}`
      : mo >= 7 ? `Spring/Summer ${y + 1}` : `Autumn/Winter ${y}-${y + 1}`;
    weeks.push(week(city, kind, season, start, end, { official: city === 'Paris' ? 'FHCM' : 'BFC' }));
  }

  // De-duplicate by id, keeping the first (organiser) record; add expected weeks not yet announced
  weeks = [...new Map(weeks.map(w => [w.id, w])).values()];
  weeks.push(...expected(weeks, today));
  weeks.sort((a, b) => a.start.localeCompare(b.start));

  // Attach each show to its week
  for (const s of shows) {
    const day = s.start.slice(0, 10);
    const w = weeks.find(x => x.city === s.city && x.kind === s.kind && day >= x.start && day <= x.end);
    if (w) s.week = w.id;
  }
  const keep = shows.filter(s => s.week).map(({ kind, ...s }, i) => ({ id: `${s.week}:${i}`, ...s }));
  const horizon = Date.now() - 400 * 864e5;
  return {
    updated: new Date().toISOString(),
    status,
    weeks: weeks.filter(w => Date.parse(w.end) > horizon),
    shows: keep,
    collections,
  };
}

