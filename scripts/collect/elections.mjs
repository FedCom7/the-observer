// US elections: Senate ratings from ten forecasters (Wikipedia), polling averages
// and the generic ballot (FiftyPlusOne public pages). Runs unattended.
import { decode, get, wikitext } from './lib.mjs';

const CYCLE = 2026;
const SCORE = { safe: 3, solid: 3, likely: 2, lean: 1, tilt: 0.5, tossup: 0, 'toss-up': 0 };

/** Parses the "Predictions" table of the Senate elections page: one row per seat, one cell per forecaster. */
export async function senateRatings() {
  const w = await wikitext(`${CYCLE} United States Senate elections`);
  if (!w) throw new Error('Senate elections page missing');
  const blocks = w.split(/\n\|-/).filter(b => b.includes('<!--Cook-->'));
  const races = [];
  for (const b of blocks) {
    const head = b.match(/^! \[\[[^|\]]*?election in ([^|\]]+)\|([^\]]+)\]\]/m);
    if (!head) continue;
    const label = head[2].trim();
    const special = /special/i.test(label) || /special/i.test(b.split('\n')[1] ?? '');
    const incParty = /Party shading\/(Democratic|DFL)/.test(b) ? 'D' : /Party shading\/Republican/.test(b) ? 'R' : 'I';
    const inc = b.match(/\{\{sortname\|([^|}]+)\|([^|}]+)/);
    const retiring = /Retiring|Lost renomination|Resign/i.test(b);
    const raters = {};
    for (const m of b.matchAll(/<!--\s*([^>]+?)\s*-->\s*\|\s*\{\{USRaceRating\|([^|}]+)\|?([DRI])?/g)) {
      const level = m[2].toLowerCase().replace(/\s/g, '');
      const side = (m[3] ?? '').toUpperCase();
      const base = SCORE[level] ?? 0;
      raters[m[1]] = { label: level === 'tossup' || level === 'toss-up' ? 'Toss Up' : `${m[2]} ${side}`.trim(), score: side === 'R' ? -base : base };
    }
    const scores = Object.values(raters).map(r => r.score);
    if (!scores.length) continue;
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    races.push({
      state: head[1].trim().replace(/ \(special\)/i, ''),
      special,
      incumbent: inc ? `${inc[1]} ${inc[2]}` : null,
      incumbentParty: incParty,
      open: retiring,
      raters,
      cook: raters.Cook?.label ?? null,
      consensus: Math.round(avg * 100) / 100,
      consensusLabel: label3(avg),
    });
  }
  const asOf = (w.match(/Cook Political Report\|Cook\]\]''<br \/>\{\{small\|([^}]+)\}\}/) ?? [])[1]?.replace(/<br \/>/g, ' ') ?? null;
  return { races, cookAsOf: asOf };
}

function label3(avg) {
  const a = Math.abs(avg), side = avg > 0 ? 'D' : 'R';
  if (a < 0.35) return 'Toss Up';
  if (a < 1.2) return `Lean ${side}`;
  if (a < 2.4) return `Likely ${side}`;
  return `Safe ${side}`;
}

const slug = s => s.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');

/** Candidates and polling average from a FiftyPlusOne race page (server-rendered HTML). */
async function fpoAverage(path) {
  const html = await get(`https://fiftyplusone.news/polls/${path}`, { browser: true });
  const lines = [...html.matchAll(/<button class="flex (text-(?:blue|red|gray|green|purple)[\w-]*)[^"]*"[^>]*aria-label="View line for ([^"]+)"><span class="pr-1">[^<]*<\/span><br\/>\s*<span class="font-bold">([\d.]+)%<\/span>/g)]
    .map(m => ({ name: decode(m[2]).trim(), party: m[1].includes('blue') ? 'D' : m[1].includes('red') ? 'R' : 'I', pct: +m[3] }));
  const date = (html.match(/<span class="color-gray pr-1 uppercase">([^<]+)<\/span>/) ?? [])[1] ?? null;
  // Only the first chart on the page is the headline average.
  const seen = new Set();
  const head = lines.filter(l => (seen.has(l.name) ? false : (seen.add(l.name), true))).slice(0, 3);
  return { lines: head, asOf: date ? new Date(`${date} 12:00 UTC`).toISOString().slice(0, 10) : null, url: `https://fiftyplusone.news/polls/${path}` };
}

export async function collectElections() {
  const { races, cookAsOf } = await senateRatings();
  // Battlegrounds: any race a forecaster does not call safe for one side.
  const battle = races.filter(r => Math.abs(r.consensus) < 2.6);
  const polled = await Promise.all(battle.map(async r => {
    try {
      const fpo = await fpoAverage(`senate/general/${slug(r.state)}`);
      const d = fpo.lines.find(l => l.party === 'D') ?? fpo.lines.find(l => l.party === 'I');
      const rep = fpo.lines.find(l => l.party === 'R');
      return { ...r, dem: d?.name ?? null, rep: rep?.name ?? null, demPct: d?.pct ?? null, repPct: rep?.pct ?? null, margin: d && rep ? Math.round((d.pct - rep.pct) * 10) / 10 : null, pollsAsOf: fpo.asOf, pollsUrl: fpo.url };
    } catch {
      return { ...r, dem: null, rep: null, margin: null };
    }
  }));
  let generic = null;
  try {
    const g = await fpoAverage('generic-ballot/generic-ballot');
    const d = g.lines.find(l => l.party === 'D'), rep = g.lines.find(l => l.party === 'R');
    if (d && rep) generic = { dem: d.pct, rep: rep.pct, margin: Math.round((d.pct - rep.pct) * 10) / 10, asOf: g.asOf, source: 'FiftyPlusOne', url: g.url };
  } catch { /* keep null */ }

  // Senate seats not up this cycle, from the same table's totals are not exposed, so derive:
  // current composition = 47 D (incl. independents) / 53 R at the start of the cycle.
  const current = { D: 47, R: 53 };
  return {
    cycle: CYCLE,
    updated: new Date().toISOString(),
    ratingsSource: { name: 'Wikipedia forecast table (Cook, Sabato, Inside Elections, Economist and others)', asOf: cookAsOf, url: `https://en.wikipedia.org/wiki/${CYCLE}_United_States_Senate_elections#Predictions` },
    pollsSource: { name: 'FiftyPlusOne polling averages', url: 'https://fiftyplusone.news/polls/senate/general/georgia' },
    senate: { current, majority: 51 },
    generic,
    races,
    battlegrounds: polled.sort((a, b) => (b.margin ?? b.consensus) - (a.margin ?? a.consensus)),
  };
}
