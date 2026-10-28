# The Observer

A personal control room for following my passions: Milan, NFL and the Patriots, college football and Texas, MLB, NBA, F1, WEC and Le Mans, Dakar, US elections, human spaceflight, cycling, alpine skiing, tennis Slams, the America's Cup, the Royal Family, awards season, the Big 4 fashion weeks and Apple.

Design notes and decisions: [DESIGN.md](DESIGN.md). Early visual prototypes: [prototype/](prototype/).

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve dist/ on http://localhost:4173
```

## The live wall

`/live` (the **Live wall** chip or **LIVE NOW ›** in the top bar): every event of today and tomorrow, Rome time, with the night up to 07:00 counted with the evening before. My teams' games and title games (World Series, Super Bowl…) get a block of their own with what ESPN's game summary knows before kick-off (form, season leaders, injuries, probable pitchers, lineups, odds, Matchup Predictor, weather, preview) and during the game (situation, win probability, line score, goals with assists, scoring plays, team stats, game leaders, box score, recap), refreshed every 20 seconds. Each league (NFL, college Top 25, MLB, NBA, Serie A) is one block with all its games; a click on a game opens its summary. The other passions have their own blocks: the F1 weekend, the royal diary with portraits and the Palace's photographs, the Apple event and then the Newsroom, launches, ski races, stages, the order of play, the shows of a fashion week, award nominees. `?at=2026-10-28T16:00Z` previews another day.

## How it works

Nothing is typed in by hand. Two layers keep the data fresh:

1. **In the browser, live** (`src/sources/`): sources that allow direct requests, polled every few minutes and every 20 seconds during live games.
2. **Collectors** (`scripts/collect/`): sources that need a server (no CORS, HTML scraping, Wikipedia). They write `public/data/*.json`. Locally the dev server runs them at start and every 30 minutes; online `.github/workflows/collect.yml` runs them every hour and commits the result.

| Passion | Source | Layer |
|---|---|---|
| Milan (all competitions), Serie A table | ESPN | live |
| NFL, Patriots, AFC East | ESPN | live |
| College football: Texas, AP poll and history, all bowls and CFP games | ESPN (site and core APIs) | live |
| MLB league-wide (today's games, standings, playoff picture, run differential), postseason bracket | ESPN | live |
| Los Angeles Dodgers team page (season, October, rivals, history since 1883) | ESPN, Wikipedia | live + hourly |
| NBA league-wide (tonight's games, standings, leaders), playoff bracket | ESPN | live |
| F1: every session, live order, standings with points per round | ESPN | live |
| ISS position and day-night line | wheretheiss.at | live |
| US elections: forecast model, polling averages, forecasters' ratings, calendar | On Point Politics (public JSON), Silver Bulletin (public charts), civicAPI | collector `elections` |
| US elections: live results, calls, county maps, official state counts | civicAPI, Open America | browser, every minute on election night |
| WEC and Le Mans: session times, official classifications, championships | fiawec.com (JSON-LD), Al Kamel Systems (CSV), Wikipedia | collector `wec` |
| Alpine skiing: races with run times, World Championships, results, Cup standings | FIS website | collector `ski` |
| Royal Family: every engagement of the working royals (Royal Diary, 8 weeks ahead) and what they did (Court Circular), the Palace's news with photographs, portraits, UK map, birthdays and anniversaries, state visits and trips, ceremonial year, alerts | royal.uk read through r.jina.ai, Wikipedia portraits, OpenStreetMap Nominatim (cached in `royal-geo.json`), Wikipedia lists, rules, The Royal Watcher, Google News | collector `royal` |
| Human spaceflight: crewed, Starship and Artemis launches, station events, crew in orbit | Launch Library 2 (max one pass per hour), NASA RSS and blogs | collector `space` |
| Dakar: stage-by-stage route, stage and general rankings by category | dakar.com (route page, rankings JSON) | collector `dakar` |
| Apple: keynotes and press-announced launch events, what they announced, pre-order and in-store dates, events since 1984, product clock, OS betas and releases, the Newsroom archive since 2000 by kind of news, rumours and Mark Gurman, AAPL, quarterly accounts by product and region | apple.com/apple-events, Apple Newsroom (feed, archive, press releases), Wikipedia, Apple Developer releases feed, MacRumors and 9to5Mac RSS, appleinvites.com (invitations), Google News (Bloomberg, event invitations), SEC EDGAR filings, Nasdaq public API | collector `apple` |
| America's Cup: regattas, standings, points and time of every race | americascup.com results feeds | collector `ac` |
| Fashion weeks (New York, London, Milan, Paris): dates, runway and presentation schedule, collections reviewed | CFDA (NYFW dates), British Fashion Council (LFW schedule API), Camera Nazionale della Moda Italiana (calendar), FHCM (final calendar), WWD Runway, Vogue Runway | collector `fashion` |
| Tennis Slams, Super Bowl, Election Day | WTA API, Wikipedia, rules | collector `calendar` |
| Milan, Patriots, Texas: full history, trophies, rivals' all-time and recent records, this season vs rivals | Wikipedia season lists and rivalry pages, ESPN | collector `teams` |
| Tennis: Slam dates, men's draw, ATP ranking, all-time champions | WTA calendar, ESPN, Wikipedia | collector `tennis` (draw live from the browser during a Slam) |
| Awards season: dates of every award and Oscar step, nominees and winners, Oscar odds | Gold Derby (season calendar, public odds API), Wikipedia edition pages | collector `awards` |
| Awards season: the Observer Oscar forecast, precursor study 2005–2026, prediction markets | Wikipedia (past seasons), Polymarket and Kalshi public APIs | collectors `awards-history`, `awards` |
| Cycling: men's WorldTour, Worlds and Euros, stages with official times, official rankings, winners, jerseys, results of every race, national champions, stage towns on the map | UCI calendar API, ASO and RCS race sites, Wikipedia race pages, OpenStreetMap Nominatim | collector `cycling` |
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
- Scrapers depend on page layouts (ASO sites, Wikipedia tables, Silver Bulletin's Datawrapper embeds). When one breaks, its previous file stays in place and the collector report says FAILED.
- ProCyclingStats and FirstCycling block automated requests (Cloudflare); we do not bypass them. Cycling relies on official sites, the UCI calendar API, Wikipedia, rules and news. royal.uk blocks scripts too: by the owner's choice (2026-10-20) the Royal Diary and the Court Circular are read through the public reader r.jina.ai, once every 3 hours; if it stops working the collector keeps the last reading. Giro stage times are approximate (the organiser publishes them as an image).
- Launch Library allows 15 requests per hour: the space collector makes one pass per hour and backs off for 20 minutes after a refusal.
- Some times are not published in advance (FIS run times until a few days before, Dakar stage starts, Apple store openings). The app shows the usual time with "≈" and replaces it when the source publishes it.
