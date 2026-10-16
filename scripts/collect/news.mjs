// News feeds that browsers cannot read directly (no CORS), fetched server-side.
import { get, parseFeed } from './lib.mjs';

const gnews = q => `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:7d')}&hl=en-US&gl=US&ceid=US:en`;

const FEEDS = [
  { passion: 'apple', source: 'Apple Newsroom', url: 'https://www.apple.com/newsroom/rss-feed.rss' },
  { passion: 'royal', source: 'The Guardian', url: 'https://www.theguardian.com/uk/monarchy/rss' },
  { passion: 'royal', source: 'Royal Central', url: 'https://royalcentral.co.uk/feed/' },
  { passion: 'royal', source: 'BBC News', url: 'https://feeds.bbci.co.uk/news/uk/rss.xml', filter: /\b(king|queen|prince|princess|royals?|palace|monarch|monarchy)\b/i },
  { passion: 'awards', source: 'Variety', url: 'https://variety.com/v/film/awards/feed/' },
  { passion: 'elez', source: 'Politico', url: 'https://rss.politico.com/congress.xml', filter: /senate|house|midterm|election|poll|campaign/i },
  { passion: 'cicl', source: 'Cyclingnews', url: 'https://www.cyclingnews.com/feeds.xml' },
  { passion: 'sci', source: 'Ski Racing', url: 'https://skiracing.com/feed/' },
  { passion: 'tennis', source: 'ESPN', url: 'https://www.espn.com/espn/rss/tennis/news' },
  { passion: 'wec', source: 'Sportscar365', url: 'https://sportscar365.com/feed/', filter: /WEC|Le Mans|Hypercar|endurance/i },
  // Google News search feeds for the passions without a dedicated feed
  { passion: 'dakar', source: 'Google News', url: gnews('"Dakar Rally"') },
  { passion: 'ac', source: 'Google News', url: gnews('"America\'s Cup" Naples') },
  { passion: 'wec', source: 'Google News', url: gnews('WEC Hypercar') },
  { passion: 'space', source: 'Google News', url: gnews('astronauts OR "Starship" OR "Artemis"') },
];

export async function collectNews() {
  const results = await Promise.allSettled(FEEDS.map(async f => {
    const xml = await get(f.url, { browser: true });
    return parseFeed(xml)
      .filter(i => i.title && (!f.filter || f.filter.test(i.title)))
      .slice(0, 12)
      .map(i => {
        const [title, pub] = f.source === 'Google News' ? [i.title.replace(/ - [^-]+$/, ''), (i.title.match(/ - ([^-]+)$/) ?? [])[1]] : [i.title, null];
        return { ...i, title, source: pub ?? f.source };
      })
      .map(i => ({ id: `${f.source}:${i.link || i.title}`, passion: f.passion, title: i.title, source: i.source, time: new Date(i.time).toISOString(), url: i.link }));
  }));
  const status = Object.fromEntries(FEEDS.map((f, i) => [`${f.source} (${f.passion})`, results[i].status === 'fulfilled' ? `${results[i].value.length} items` : String(results[i].reason).slice(0, 80)]));
  const items = results.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
  return { updated: new Date().toISOString(), status, items };
}
