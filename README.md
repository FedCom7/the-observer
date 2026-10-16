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
| College football: Texas, AP poll and history, all bowls and CFP games | ESPN (site and core APIs) | live |
| MLB with Dodgers focus, postseason bracket | ESPN | live |
| NBA with Lakers focus, standings, playoff bracket | ESPN | live |
| F1: every session, live order, standings with points per round | ESPN | live |
| ISS position and day-night line | wheretheiss.at | live |
| US elections: ratings (10 forecasters), polls, generic ballot, election-night results | Wikipedia, FiftyPlusOne | collector `elections` |
| WEC and Le Mans: session times, official classifications, championships | fiawec.com (JSON-LD), Al Kamel Systems (CSV), Wikipedia | collector `wec` |
| Alpine skiing: races with run times, World Championships, results, Cup standings | FIS website | collector `ski` |
| Royal Family: state visits and trips, ceremonial year, galas, press notices, alerts | Wikipedia lists, rules, The Royal Watcher, Google News | collector `royal` |
| Human spaceflight: crewed, Starship and Artemis launches, station events, crew in orbit | Launch Library 2 (max one pass per hour), NASA RSS and blogs | collector `space` |
| Dakar: stage-by-stage route, stage and general rankings by category | dakar.com (route page, rankings JSON) | collector `dakar` |
| Apple: keynotes, pre-order and in-store dates | apple.com/apple-events, Apple Newsroom press releases | collector `apple` |
| America's Cup: regattas, standings, points and time of every race | americascup.com results feeds | collector `ac` |
| Tennis Slams, awards, Super Bowl, Election Day | WTA API, Wikipedia, rules | collector `calendar` |
| Cycling: men's WorldTour, Worlds and Euros, stages with official times, official rankings, winners | UCI calendar API, ASO and RCS race sites, Wikipedia | collector `cycling` |
| News for passions without an ESPN feed | RSS (Guardian, BBC, Royal Central, Variety, Politico, Cyclingnews, Ski Racing, ESPN, Sportscar365) and Google News searches | collector `news` |

Passion by passion, with what each page shows: [PASSIONI.md](PASSIONI.md).

Run the collectors by hand with `npm run collect` (or `npm run collect -- elections`).

Times come out in Rome time. When a source gives only the day, the app shows the usual start time with "≈".

## Adding a passion

1. Add it to `PASSIONS` in `src/core/passions.ts` (id, name, category, season intensity by month).
2. Feed it events: an ESPN team schedule or scoreboard in `SOURCES` (`src/core/store.tsx`), a browser adapter in `src/sources/`, or a collector in `scripts/collect/` that writes `public/data/<name>.json`.
3. Give it a page in `src/views/` and route it in `src/views/PassionSheet.tsx`.

## Deploy

Static hosting on Firebase Hosting (free Spark plan). `firebase.json` is ready. The project id is still to be set.

## Known limits

- ESPN's public API is unofficial and can change without notice. It also rejects headless browsers, so automated screenshots need a normal user agent.
- Scrapers depend on page layouts (FiftyPlusOne, ASO sites, Wikipedia tables). When one breaks, its previous file stays in place and the collector report says FAILED.
- ProCyclingStats, FirstCycling and royal.uk block automated requests (Cloudflare); we do not bypass them. Cycling and the Royals rely on official sites, the UCI calendar API, Wikipedia, rules and news. Giro stage times are approximate (the organiser publishes them as an image).
- Launch Library allows 15 requests per hour: the space collector makes one pass per hour and backs off for 20 minutes after a refusal.
- Some times are not published in advance (FIS run times until a few days before, Dakar stage starts, Apple store openings). The app shows the usual time with "≈" and replaces it when the source publishes it.
