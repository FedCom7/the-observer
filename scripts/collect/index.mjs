// Runs every collector and writes public/data/*.json.
// Usage: node scripts/collect/index.mjs            (all)
//        node scripts/collect/index.mjs elections  (one)
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { collectCalendar } from './calendar.mjs';
import { collectElections } from './elections.mjs';
import { collectNews } from './news.mjs';
import { collectRoyal } from './royal.mjs';
import { collectSki } from './ski.mjs';
import { collectSpace } from './space.mjs';
import { collectDakar } from './dakar.mjs';
import { collectApple } from './apple.mjs';
import { collectAc } from './ac.mjs';
import { collectCycling } from './cycling.mjs';
import { collectAwards } from './awards.mjs';
import { collectAwardsHistory } from './awardsHistory.mjs';
import { collectTeams } from './teams.mjs';
import { collectTennis } from './tennis.mjs';
import { collectWec } from './wec.mjs';
import { collectFashion } from './fashion.mjs';
import { collectFootball } from './football.mjs';
import { collectOlympics } from './olympics.mjs';
import { collectMore } from './more.mjs';
import { collectNfl } from './nfl.mjs';
import { collectRosters } from './rosters.mjs';
import { collectNbaSeason } from './nbaSeason.mjs';
import { collectF1Season } from './f1Season.mjs';
import { collectSkiSeason } from './skiSeason.mjs';
import { collectRoyalArchive } from './royalArchive.mjs';
import { collectCfbSeason } from './cfbSeason.mjs';
import { collectMlbSeason } from './mlbSeason.mjs';
import { collectWecSeason } from './wecSeason.mjs';
import { collectMoreSeason } from './moreSeason.mjs';
import { collectTennisSeason } from './tennisSeason.mjs';
import { collectDakarSeason } from './dakarSeason.mjs';
import { collectAcHistory } from './acHistory.mjs';
import { collectFootballSeason } from './footballSeason.mjs';
import { collectOlympicsHistory } from './olympicsHistory.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../public/data');

// Local secrets (TMDB_KEY…) from .env; online they come from the workflow's secrets
try { process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), '../../.env')); } catch { /* no .env */ }

const JOBS = {
  elections: collectElections,
  calendar: collectCalendar,
  news: collectNews,
  wec: collectWec,
  royal: collectRoyal,
  ski: collectSki,
  space: collectSpace,
  dakar: collectDakar,
  apple: collectApple,
  ac: collectAc,
  cycling: collectCycling,
  awards: collectAwards,
  'awards-history': collectAwardsHistory,
  teams: collectTeams,
  tennis: collectTennis,
  fashion: collectFashion,
  football: collectFootball,
  olympics: collectOlympics,
  more: collectMore,
  nfl: collectNfl,
  rosters: collectRosters,
  'nba-season': collectNbaSeason,
  'f1-season': collectF1Season,
  'ski-season': collectSkiSeason,
  'royal-archive': collectRoyalArchive,
  'cfb-season': collectCfbSeason,
  'mlb-season': collectMlbSeason,
  'wec-season': collectWecSeason,
  'more-season': collectMoreSeason,
  'tennis-season': collectTennisSeason,
  'dakar-season': collectDakarSeason,
  'ac-history': collectAcHistory,
  'football-season': collectFootballSeason,
  'olympics-history': collectOlympicsHistory,
};

export async function collect(only = Object.keys(JOBS)) {
  await mkdir(OUT, { recursive: true });
  const report = {};
  await Promise.all(only.map(async name => {
    const t = Date.now();
    try {
      const data = await JOBS[name]();
      await writeFile(join(OUT, `${name}.json`), JSON.stringify(data, null, 1));
      report[name] = `ok in ${Date.now() - t} ms`;
    } catch (err) {
      // Keep the previous file: stale data beats an empty panel.
      report[name] = `FAILED: ${err.message}`;
    }
  }));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const only = process.argv.slice(2).filter(a => a in JOBS);
  const report = await collect(only.length ? only : undefined);
  console.log(JSON.stringify(report, null, 2));
  if (Object.values(report).some(r => r.startsWith('FAILED'))) process.exitCode = 1;
}
