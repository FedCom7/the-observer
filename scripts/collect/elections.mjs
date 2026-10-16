// US elections, everything automatic:
// - On Point Politics: the 2026 forecast model (every Senate, House and governor race,
//   chances of control, seat distributions) and its polling averages (Trump approval,
//   generic ballot, right/wrong track, 2028), all from the site's public JSON.
// - Silver Bulletin: the public Trump approval average and its issue breakdown
//   (the Datawrapper charts embedded in the free pages; the models are paid and not used).
// - civicAPI: ratings from the main forecasters (Cook, Sabato, Inside Elections, Split
//   Ticket, Decision Desk, prediction markets) and the calendar of upcoming races.
// Live results on election night are read by the browser (civicAPI, Open America).
import { get, iso, zoned } from './lib.mjs';

const CYCLE = 2026;
const OP = 'https://www.onpointpolitics.us';
const CIVIC = 'https://civicapi.org/api/v2';
const r1 = v => (v == null ? null : Math.round(v * 10) / 10);
const r3 = v => (v == null ? null : Math.round(v * 1000) / 1000);

// ---------- On Point Politics: forecast ----------
async function forecast() {
  const m = await get(`${OP}/forecast/model.json`, { json: true, browser: true });
  const chambers = {};
  for (const [k, c] of Object.entries(m.chambers)) {
    chambers[k] = {
      total: c.seatsTotal, dem: r3(c.demControl), demSeats: r1(c.demSeats), gopSeats: r1(c.gopSeats),
      p10: c.demP10, p90: c.demP90, median: c.median, hist: c.hist, trend: c.trend.map(t => ({ dem: r3(t.dem), seats: r1(t.demSeats) })),
    };
  }
  chambers.senate.notUp = { D: m.meta.senNotUpD, R: m.meta.senNotUpR };
  chambers.governor.notUp = { D: m.meta.govNotUpD, R: m.meta.govNotUpR };
  // The model's margins are Republican minus Democrat and its probability is the Republican's;
  // we store everything from the Democratic side (positive = Democratic lead).
  const races = m.races
    .filter(r => r.office !== 'house' || r.marquee || Math.abs(r.est?.margin ?? 100) < 15)
    .map(r => ({
      id: r.id, office: r.office, st: r.st, state: r.state, district: r.district || null, name: r.name,
      dem: r.dem, gop: r.gop, incParty: r.inc === 1 ? 'R' : r.inc === -1 ? 'D' : null, open: r.open, marquee: r.marquee,
      margin: r1(-r.est.margin), pDem: r3(1 - r.est.prob), lo: r1(-r.est.p90), hi: r1(-r.est.p10),
      poll: r.pollAvg == null ? null : r1(-r.pollAvg), polls: (r.polls ?? []).length,
      trend: (r.trend ?? []).map(t => r3(1 - t.p)),
    }));
  // House seats not in the list above are safe: count them by side for the seat bar
  const safeHouse = m.races.filter(r => r.office === 'house' && !races.some(x => x.id === r.id));
  return {
    updated: m.meta.updated, sims: m.meta.sims, chambers, races,
    safeHouse: { D: safeHouse.filter(r => r.est.margin < 0).length, R: safeHouse.filter(r => r.est.margin >= 0).length },
    url: `${OP}/forecast`,
  };
}

// ---------- On Point Politics: polling averages ----------
const POLLS = { approval: 'trump-approval', generic: 'generic-ballot', track: 'right-wrong-track', vance: 'vance-favorability', y2028: '2028-vance-newsom' };

async function polls() {
  const out = {};
  for (const [key, id] of Object.entries(POLLS)) {
    try {
      const j = await get(`${OP}/api/polls/${id}`, { json: true, browser: true });
      const s = j.series ?? [];
      // Daily points for the last four months, weekly before that
      const cut = new Date(Date.now() - 120 * 86400e3).toISOString().slice(0, 10);
      const series = s.filter((p, i) => p.date >= cut || i % 7 === 0 || i === s.length - 1).map(p => ({ d: p.date, a: p.a, b: p.b }));
      out[key] = {
        title: j.avg.title, a: j.avg.a, b: j.avg.b, margin: j.avg.margin, marginText: j.avg.marginText, marginDefinition: j.avg.marginDefinition,
        updated: j.updated, n: (j.polls ?? []).length, url: j.avg.page.replace('onpointpolitics.com', 'www.onpointpolitics.us'), series,
        latest: (j.polls ?? []).slice(0, 12).map(p => ({ pollster: p.pollster, date: p.date, n: p.sampleSize, type: p.sampleType, a: p.a, b: p.b, margin: p.margin })),
      };
    } catch (err) { console.error(`[elections] polls ${id}: ${err.message}`); }
  }
  return out;
}

// ---------- Silver Bulletin: public charts ----------
const SB_PAGES = ['trump-approval-ratings-nate-silver-bulletin', 'generic-ballot-average-2026-nate-silver-bulletin-congress-polls'];

function csv(text) {
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0].split(',');
  return lines.slice(1).map(l => Object.fromEntries(l.split(',').map((v, i) => [head[i], v])));
}
const usDate = s => { const [m, d, y] = s.split('/').map(Number); return `${y < 100 ? 2000 + y : y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; };

async function silver() {
  const charts = new Set();
  for (const p of SB_PAGES) {
    const html = (await get(`https://www.natesilver.net/p/${p}`, { browser: true })).replace(/&quot;/g, '"');
    for (const m of html.matchAll(/datawrapper\.dwcdn\.net\/([A-Za-z0-9]{5})\/(\d+)\//g)) charts.add(`${m[1]}/${m[2]}`);
  }
  const out = {};
  for (const c of charts) {
    const text = await get(`https://datawrapper.dwcdn.net/${c}/dataset.csv`, { browser: true }).catch(() => '');
    const head = text.split('\n')[0] ?? '';
    const rows = text ? csv(text) : [];
    const thin = r => rows.filter((_, i) => i % 3 === 0 || i === rows.length - 1).map(r);
    if (/^modeldate,approve_estimate/.test(head)) out.approval = { series: thin(x => ({ d: usDate(x.modeldate), a: +(+x.approve_estimate).toFixed(1), b: +(+x.disapprove_estimate).toFixed(1) })) };
    else if (/^modeldate,immg/.test(head)) {
      const last = rows[rows.length - 1];
      out.issues = { date: usDate(last.modeldate), net: { Immigration: +last.immg, Economy: +last.econ, 'Trade and tariffs': +last.trade, 'Cost of living': +last.cost } };
    } else if (/^modeldate,dem,rep/.test(head)) out.generic = { series: thin(x => ({ d: usDate(x.modeldate), a: +(+x.dem).toFixed(1), b: +(+x.rep).toFixed(1) })) };
  }
  for (const k of ['approval', 'generic']) if (out[k]) out[k].updated = out[k].series[out[k].series.length - 1]?.d ?? null;
  return { ...out, url: 'https://www.natesilver.net/p/trump-approval-ratings-nate-silver-bulletin' };
}

// ---------- civicAPI: forecasters' ratings ----------
const RATERS = { cook: 'Cook', sabato: 'Sabato', insideelections: 'Inside Elections', splitticket: 'Split Ticket', ddhq: 'Decision Desk', fiftyplusone: 'FiftyPlusOne', kalshi: 'Kalshi', polymarket: 'Polymarket' };

async function raters() {
  const out = { names: RATERS, senate: {}, governor: {}, totals: { senate: {}, governor: {} }, asOf: null };
  for (const office of ['senate', 'governor']) {
    for (const [id] of Object.entries(RATERS)) {
      if (id === 'fiftyplusone' && office === 'governor') continue;
      try {
        const j = await get(`${CIVIC}/forecast/${office}/${CYCLE}/${id}`, { json: true });
        out.totals[office][id] = j.totals;
        out.asOf = j.last_updated ?? out.asOf;
        for (const [st, v] of Object.entries(j.states ?? {})) {
          (out[office][st] ??= {})[id] = v.rating;
          // Markets give a percentage instead of a category
          if (v.democrat_pct != null && /kalshi|polymarket/.test(id)) out[office][st][id] = `${Math.round(v.democrat_pct)}% D`;
        }
      } catch { /* this forecaster does not cover the office */ }
    }
  }
  return out;
}

// ---------- calendar of upcoming US elections ----------
/** n-th weekday of a month (weekday 0 = Sunday). */
const nthWeekday = (y, m, weekday, n) => 1 + ((weekday - new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 7) % 7) + (n - 1) * 7;
const electionDay = y => nthWeekday(y, 11, 1, 1) + 1;

async function calendar() {
  const Y = new Date().getUTCFullYear();
  const out = [];
  for (let y = Y; y <= Y + 2; y++) {
    const d = `${y}-11-${String(electionDay(y)).padStart(2, '0')}`;
    if (y % 2 === 0) out.push({ date: d, title: y % 4 === 0 ? 'Presidential election, plus House, a third of the Senate and governors' : 'Midterm elections: House, a third of the Senate, 36 governors', kind: 'general' });
    else out.push({ date: d, title: 'Off-year elections: Virginia and New Jersey governors, mayors, ballot measures', kind: 'offyear' });
  }
  // Races civicAPI already lists after today (specials, runoffs, next cycle)
  const from = new Date(Date.now() + 86400e3).toISOString().slice(0, 10), to = `${Y + 2}-12-31`;
  for (const q of ['US Senate', 'Governor', 'US House', 'President', 'Runoff', 'Special']) {
    try {
      const j = await get(`${CIVIC}/race/search?startDate=${from}&endDate=${to}&country=US&query=${encodeURIComponent(q)}&limit=100`, { json: true });
      for (const r of j.races ?? []) {
        if (!/US Senate|Governor|House of Representatives|President/.test(r.type) || r.type === 'Lieutenant Governor') continue;
        out.push({ date: r.election_date.slice(0, 10), title: r.election_name, kind: /Primary/i.test(r.election_type) ? 'primary' : 'race', civicId: r.id });
      }
    } catch { /* keep the rules */ }
  }
  // Single races on a general Election Day are already covered by that day's entry
  const general = new Set(out.filter(e => e.kind !== 'race' && e.kind !== 'primary').map(e => e.date));
  const seen = new Set();
  return out.filter(e => !(e.civicId && general.has(e.date))).filter(e => (seen.has(e.title + e.date) ? false : (seen.add(e.title + e.date), true))).sort((a, b) => a.date.localeCompare(b.date));
}

export async function collectElections() {
  const status = {};
  const step = async (name, fn) => { try { const v = await fn(); status[name] = 'ok'; return v; } catch (err) { status[name] = `failed: ${err.message.slice(0, 80)}`; return null; } };
  const [model, avg, sb, ratings, cal] = await Promise.all([step('onpoint-model', forecast), step('onpoint-polls', polls), step('silver-bulletin', silver), step('civicapi-ratings', raters), step('calendar', calendar)]);
  if (!model && !avg) throw new Error(`no data: ${JSON.stringify(status)}`);
  const day = electionDay(CYCLE);
  return {
    cycle: CYCLE,
    electionDay: iso(zoned(CYCLE, 11, day, 6, 0, 'America/New_York')),
    updated: new Date().toISOString(),
    status,
    senate: { current: { D: 47, R: 53 }, majority: 51 },
    house: { majority: 218 },
    model, polls: avg, silver: sb, ratings, calendar: cal,
  };
}
