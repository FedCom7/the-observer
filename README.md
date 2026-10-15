# The Observer

A personal control room for following my passions: Milan, NFL and the Patriots, college football and Texas, MLB, NBA, F1, WEC and Le Mans, Dakar, US elections, human spaceflight, cycling, alpine skiing, tennis Slams, the America's Cup, the Royal Family, awards season and Apple.

Design notes and decisions: [DESIGN.md](DESIGN.md). Early visual prototypes: [prototype/](prototype/).

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve dist/ on http://localhost:4173
```

## How it works

Nothing is typed in by hand. Two layers keep the data fresh:

1. **In the browser, live** (`src/sources/`): sources that allow direct requests, polled every few minutes and every 20 seconds during live games.
2. **Collectors** (`scripts/collect/`): sources that need a server (no CORS, HTML scraping, Wikipedia). They write `public/data/*.json`. Locally the dev server runs them at start and every 30 minutes; online `.github/workflows/collect.yml` runs them every hour and commits the result.

| Passion | Source | Layer |
|---|---|---|
| Milan (all competitions), Serie A table | ESPN | live |
| NFL, Patriots, AFC East | ESPN | live |
| College football, Texas, AP Top 25 | ESPN | live |
| MLB, NBA | ESPN | live |
| F1 calendar, results, standings | Jolpica (Ergast) | live |
| F1 live session order (practice, qualifying, race) | ESPN racing scoreboard, every minute | live |
| Human spaceflight, people in orbit, ISS position | Launch Library 2, Spaceflight News, wheretheiss.at | live |
| US elections: ratings from 10 forecasters | Wikipedia forecast table | collector |
| US elections: Senate polling averages, generic ballot | FiftyPlusOne public pages | collector |
| Election Day | Rule: Tuesday after the first Monday of November | collector |
| Election night results (vote share, winner) | Each race's Wikipedia infobox, every 5 minutes on 3-4 November | collector |
| Tennis Grand Slams | WTA tournament API | collector |
| Alpine skiing World Cup | Wikipedia season page | collector |
| WEC and Le Mans | Wikipedia season pages | collector |
| Dakar, Tour de France, Vuelta | Countdown on the official ASO sites | collector |
| Giro, Oscars, Golden Globes, BAFTA, Critics' Choice, America's Cup, Super Bowl | Wikipedia edition pages, or the list of ceremonies when the edition page is not written yet | collector |
| Royal Family | State visits made and received (Wikipedia lists) and fixed fixtures (Remembrance, Christmas, Commonwealth Day) | collector |
| Apple keynotes | apple.com/apple-events | collector |
| Cycling World Tour, with winners | Wikipedia season pages | collector |
| News for every passion without an ESPN feed | RSS (Apple Newsroom, Guardian, BBC, Variety, Politico, Cyclingnews, Ski Racing, ESPN, Sportscar365) and Google News searches (Dakar, America's Cup, WEC, spaceflight) | collector |

Run the collectors by hand with `npm run collect` (or `npm run collect -- elections`).

Times come out in Rome time. When a source gives only the day, the app shows the usual start time with "≈".

## Adding a passion

1. Add it to `PASSIONS` in `src/core/passions.ts` (id, name, category, season intensity by month).
2. Feed it events: an ESPN team schedule or scoreboard in `SOURCES` (`src/core/store.tsx`), a new adapter in `src/sources/`, or entries in `src/data/curated.json`.

## Deploy

Static hosting on Firebase Hosting (free Spark plan). `firebase.json` is ready. The project id is still to be set.

## Known limits

- ESPN's public API is unofficial and can change without notice. It also rejects headless browsers, so automated screenshots need a normal user agent.
- Scrapers depend on page layouts (FiftyPlusOne, ASO sites, Wikipedia tables). When one breaks, its previous file stays in place and the collector report says FAILED.
- ProCyclingStats, FirstCycling and royal.uk block automated requests, so cycling and the Royals rely on Wikipedia, the ASO sites, rules and news feeds.
