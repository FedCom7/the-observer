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
import { collectWec } from './wec.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../public/data');

const JOBS = {
  elections: collectElections,
  calendar: collectCalendar,
  news: collectNews,
  wec: collectWec,
  royal: collectRoyal,
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
