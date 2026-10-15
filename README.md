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

Everything runs in the browser, with no server and no paid services.

| Layer | Where | Notes |
|---|---|---|
| Live and scheduled data | `src/sources/` | ESPN (NFL, Patriots, college football, Texas, MLB, NBA, Serie A and Milan in all competitions), Jolpica (F1), Launch Library 2 and Spaceflight News (space), wheretheiss.at (live ISS position). All allow requests straight from the browser. |
| Curated data | `src/data/*.json` | Elections, Royal Family, awards, Apple, tennis, skiing, cycling, WEC, Dakar, America's Cup. Dates that still need confirmation carry `"tbc": true` and show a TBC tag. |
| Store | `src/core/store.tsx` | Each source refreshes on its own schedule. Games that are live or about to start are refreshed every 20 seconds. Responses are cached in `localStorage` to stay inside free rate limits (Launch Library allows 15 requests per hour). |
| Views | `src/views/` | `ControlRoom` (dark operations wall) and `PassionSheet` (one page per passion, Apple and NYT style). |

All times are shown in Rome time. Events between midnight and 07:00 are flagged as night viewing.

## Adding a passion

1. Add it to `PASSIONS` in `src/core/passions.ts` (id, name, category, season intensity by month).
2. Feed it events: an ESPN team schedule or scoreboard in `SOURCES` (`src/core/store.tsx`), a new adapter in `src/sources/`, or entries in `src/data/curated.json`.

## Deploy

Static hosting on Firebase Hosting (free Spark plan). `firebase.json` is ready. The project id is still to be set.

## Known limits

- ESPN's public API is unofficial and can change without notice. It also rejects headless browsers, so automated screenshots need a normal user agent.
- Election polling and ratings are curated by hand in `src/data/elections.json` (FiftyPlusOne averages, Cook ratings, three generic-ballot averages), because the aggregators' APIs are paid. Refresh the file weekly until 3 November.
- Curated dates in `src/data/curated.json` carry a `source` link; the ones still unconfirmed are tagged TBC.
- Apple Newsroom's RSS feed does not allow browser requests; it will be read by a scheduled job.
