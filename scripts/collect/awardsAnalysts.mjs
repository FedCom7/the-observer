// The statisticians who forecast the Oscars in public.
// Ben Zauzmer (The Hollywood Reporter, "Predicting the Oscars using just math"): two articles a
// season, nominations in January and winners before the ceremony, one Datawrapper chart per
// category whose data is public (dataset.csv). Walt Hickey, who built FiveThirtyEight's Oscar
// model (FiveThirtyEight closed in 2025), now writes Numlock Awards: his forecasts are images,
// so only his posts are listed.
import { get, parseFeed } from './lib.mjs';
import { oscarCat } from './awardsParse.mjs';

const ZAUZMER_FEED = 'https://www.hollywoodreporter.com/author/ben-zauzmer/feed/';
const NUMLOCK_FEED = 'https://awards.substack.com/feed';

/** Each chart in the article and its category: from the chart's own title, or else from the
 *  category headings, which come in the same order as the charts. */
async function zauzmerArticle(url) {
  const html = await get(url, { browser: true });
  const heads = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map(m => oscarCat(m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim(), 'oscars')).filter(Boolean);
  const charts = [...new Set([...html.matchAll(/datawrapper\.dwcdn\.net\/([A-Za-z0-9]{5})\/(\d+)/g)].map(m => `${m[1]}/${m[2]}`))];
  // First the charts that name their category, then the others in order against the headings left
  const titled = [];
  for (const chart of charts) {
    const page = await get(`https://datawrapper.dwcdn.net/${chart}/`, { browser: true }).catch(() => '');
    const title = (page.match(/\\"title\\":\\"([^\\]*)/) ?? [])[1]?.replace(/&nbsp;/g, ' ').trim();
    titled.push({ chart, cat: (title && oscarCat(title, 'oscars')) || null });
  }
  const left = heads.filter(c => !titled.some(t => t.cat === c));
  const blank = titled.filter(t => !t.cat);
  if (blank.length === left.length) blank.forEach((t, i) => { t.cat = left[i]; });
  const cats = {};
  for (const { chart, cat } of titled) {
    if (!cat || cats[cat]) continue;
    const csv = await get(`https://datawrapper.dwcdn.net/${chart}/dataset.csv`, { browser: true }).catch(() => '');
    // "Film, Percent" or "Actor, Film, Percent" (song: "Song, Film, Percent")
    const rows = csv.trim().split('\n').slice(1).map(l => l.split('\t').map(x => x.replace(/^"|"$/g, '').trim()))
      .map(c => ({ name: cat === 'song' ? c[0].replace(/"/g, '').replace(/\s*\([^)]*\)\s*$/, '').trim() : c[0], film: c.length > 2 ? c[1] : null, p: +(Number(c[c.length - 1]) / 100).toFixed(4) }))
      .filter(r => r.name && Number.isFinite(r.p)).sort((a, b) => b.p - a.p);
    if (rows.length) cats[cat] = rows;
  }
  return cats;
}

export async function analysts(C, prev) {
  // The articles come twice a season: a look every six hours is plenty
  if (prev?.updated && Date.now() - Date.parse(prev.updated) < 6 * 3600e3 && !process.env.FORCE_ANALYSTS) return prev;
  const from = Date.UTC(C - 1, 7, 1), to = Date.UTC(C, 4, 1);
  const out = { updated: new Date().toISOString(), zauzmer: prev?.zauzmer ?? {}, reads: prev?.reads ?? [] };
  try {
    const items = parseFeed(await get(ZAUZMER_FEED, { browser: true }));
    for (const it of items) {
      const t = it.time;
      if (!(t >= from && t < to) || !/oscar/i.test(it.title) || !/math|odds/i.test(it.title + it.link)) continue;
      const kind = /nomination/i.test(it.title) ? 'nom' : 'winner';
      if (out.zauzmer[kind]?.url === it.link && Object.keys(out.zauzmer[kind].cats).length) continue;
      const cats = await zauzmerArticle(it.link).catch(() => ({}));
      if (Object.keys(cats).length) out.zauzmer[kind] = { url: it.link, title: it.title, date: new Date(t).toISOString(), cats };
    }
  } catch { /* keep the last reading */ }
  try {
    const reads = [];
    for (const [source, url] of [['Ben Zauzmer · THR', ZAUZMER_FEED], ['Numlock Awards (Walt Hickey)', NUMLOCK_FEED]]) {
      const items = parseFeed(await get(url, { browser: true })).filter(it => { const t = it.time; return t >= from && t < to && (source.startsWith('Numlock') || /oscar/i.test(it.title)); });
      reads.push(...items.slice(0, 8).map(it => ({ source, title: it.title, url: it.link, date: new Date(it.time).toISOString() })));
    }
    out.reads = reads.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  } catch { /* keep the last list */ }
  return out;
}
