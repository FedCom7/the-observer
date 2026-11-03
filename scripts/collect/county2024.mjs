// The 2024 presidential vote in every county, the baseline for the "shift since 2024"
// views of the elections screens. It never changes, so it is run once by hand
// (node scripts/collect/county2024.mjs) and not by the hourly collector.
// Source: tonmcg/US_County_Level_Election_Results_08-24 on GitHub (from the states' certified counts).
import { writeFile } from 'node:fs/promises';
import { get } from './lib.mjs';

const SRC = 'https://raw.githubusercontent.com/tonmcg/US_County_Level_Election_Results_08-24/master/2024_US_County_Level_Presidential_Results.csv';

const lines = (await get(SRC)).trim().split(/\r?\n/).slice(1);
const counties = {};
const states = {};
for (const l of lines) {
  // state_name,county_fips,county_name,votes_gop,votes_dem,total_votes,...
  const [, fips, , gop, dem, total] = l.split(',');
  const d = Number(dem), r = Number(gop), t = Number(total);
  if (!t) continue;
  // Harris minus Trump, in points of the total vote, and the total
  counties[fips.padStart(5, '0')] = [Math.round(((d - r) / t) * 1000) / 10, t];
  const s = (states[fips.padStart(5, '0').slice(0, 2)] ??= [0, 0, 0]);
  s[0] += d; s[1] += r; s[2] += t;
}
const byState = Object.fromEntries(Object.entries(states).map(([k, [d, r, t]]) => [k, [Math.round(((d - r) / t) * 1000) / 10, t]]));
await writeFile(new URL('../../public/data/us-county-2024.json', import.meta.url), JSON.stringify({ source: SRC, note: 'Harris minus Trump in points, total votes; keys are county FIPS (states: 2-digit FIPS)', counties, states: byState }));
console.log(`${Object.keys(counties).length} counties, ${Object.keys(byState).length} states`);
