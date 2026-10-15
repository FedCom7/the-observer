// News feeds that browsers cannot read directly (no CORS), fetched server-side.
import { get, parseFeed } from './lib.mjs';

const FEEDS = [
  { passion: 'apple', source: 'Apple Newsroom', url: 'https://www.apple.com/newsroom/rss-feed.rss' },
  { passion: 'royal', source: 'The Guardian', url: 'https://www.theguardian.com/uk/monarchy/rss' },
  { passion: 'royal', source: 'BBC News', url: 'https://feeds.bbci.co.uk/news/uk/rss.xml', filter: /king|queen|prince|princess|royal|palace|monarch/i },
  { passion: 'awards', source: 'Variety', url: 'https://variety.com/v/film/awards/feed/' },
  { passion: 'elez', source: 'Politico', url: 'https://rss.politico.com/congress.xml', filter: /senate|house|midterm|election|poll|campaign/i },
  { passion: 'cicl', source: 'Cyclingnews', url: 'https://www.cyclingnews.com/feeds.xml' },
  { passion: 'sci', source: 'Ski Racing', url: 'https://skiracing.com/feed/' },
  { passion: 'tennis', source: 'ESPN', url: 'https://www.espn.com/espn/rss/tennis/news' },
  { passion: 'wec', source: 'FIA WEC', url: 'https://www.fiawec.com/en/news/rss' },
];

export async function collectNews() {
  const results = await Promise.allSettled(FEEDS.map(async f => {
    const xml = await get(f.url, { browser: true });
    return parseFeed(xml)
      .filter(i => i.title && (!f.filter || f.filter.test(i.title)))
      .slice(0, 12)
      .map(i => ({ id: `${f.source}:${i.link || i.title}`, passion: f.passion, title: i.title, source: f.source, time: new Date(i.time).toISOString(), url: i.link }));
  }));
  const status = Object.fromEntries(FEEDS.map((f, i) => [`${f.source} (${f.passion})`, results[i].status === 'fulfilled' ? `${results[i].value.length} items` : String(results[i].reason).slice(0, 80)]));
  const items = results.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
  return { updated: new Date().toISOString(), status, items };
}
