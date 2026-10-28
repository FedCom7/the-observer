// Apple's accounts from its SEC filings (EDGAR, free): for every 10-Q and 10-K since fiscal 2015,
// the income statement, net sales by product (iPhone, Mac, iPad, Wearables, Services) and by region,
// and the balance sheet. Read from the filing's XBRL "R" pages; filings already read are not read again.
import { decode } from './lib.mjs';

// The SEC asks automated clients to identify themselves and stay under 10 requests a second
const SEC_UA = 'TheObserver personal dashboard (federico, comerio.federico@gmail.com)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function sec(url) {
  await sleep(150);
  const res = await fetch(url, { headers: { 'User-Agent': SEC_UA, Accept: '*/*' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

const num = s => {
  const m = s.replace(/[$,\s]/g, '').match(/^\((-?[\d.]+)\)$|^(-?[\d.]+)$/);
  return m ? (m[1] ? -Number(m[1]) : Number(m[2])) : null;
};

/** Rows of an R page: { ctx, label, v } where v is the first value column and ctx the last heading row above. */
function rows(html) {
  const out = [];
  let ctx = '';
  for (const tr of html.split(/Definition/)[0].match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const cells = [...tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(c => decode(c[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim());
    if (cells.length < 2 || /Months Ended|^\w{3}\. \d{1,2}, \d{4}$/.test(cells[1])) continue;
    const vals = cells.slice(1).map(num);
    if (vals.every(v => v === null)) { if (!/\[(?:Line Items|Abstract|Table|Axis|Domain)\]/.test(cells[0])) ctx = cells[0]; continue; }
    out.push({ ctx, label: cells[0], v: vals.find(v => v !== null) });
  }
  return out;
}

const PRODUCTS = [['iPhone', /^iPhone/], ['Mac', /^Mac\b/], ['iPad', /^iPad/], ['Wearables', /^Wearables|^Other Products/], ['Services', /^Services/]];
const REGIONS = [['Americas', /^Americas/], ['Europe', /^Europe/], ['Greater China', /^Greater China/], ['Japan', /^Japan/], ['Rest of Asia Pacific', /^Rest of Asia/]];

/** The figures of one filing, in millions of dollars (EPS in dollars). */
export async function filing(acc, form, reportDate) {
  const base = `https://www.sec.gov/Archives/edgar/data/320193/${acc.replace(/-/g, '')}/`;
  const summary = await sec(`${base}FilingSummary.xml`);
  const reports = [...summary.matchAll(/<Report[\s\S]*?<\/Report>/g)].map(m => ({
    file: m[0].match(/<HtmlFileName>([^<]+)/)?.[1], name: decode(m[0].match(/<ShortName>([^<]+)/)?.[1] ?? ''),
  })).filter(r => r.file);
  const find = re => reports.find(r => re.test(r.name));
  const ops = find(/^CONSOLIDATED STATEMENTS? OF OPERATIONS|^CONDENSED CONSOLIDATED STATEMENTS? OF OPERATIONS/i);
  const bal = find(/^(CONDENSED )?CONSOLIDATED BALANCE SHEETS?(?! \(Parenthetical\))/i);
  const details = reports.filter(r => /detail/i.test(r.name) && /net sales|revenue|segment|product/i.test(r.name));

  const out = { acc, form, period: reportDate };
  if (ops) {
    const r = rows(await sec(base + ops.file));
    const first = (re, ctx) => r.find(x => re.test(x.label) && (ctx === undefined || ctx.test(x.ctx)))?.v ?? null;
    Object.assign(out, {
      revenue: first(/^(Total )?net sales$/i), cost: first(/^(Total )?cost of sales$/i), gross: first(/^Gross margin$/i),
      rnd: first(/^Research and development$/i), sga: first(/^Selling, general and administrative$/i),
      operating: first(/^Operating income$/i), net: first(/^Net income$/i), eps: first(/^Diluted/i),
      productsRev: first(/^Net sales$/i, /^Products$/i) ?? first(/^Products$/i), servicesRev: first(/^Net sales$/i, /^Services$/i) ?? first(/^Services$/i),
    });
  }
  if (bal) {
    const r = rows(await sec(base + bal.file));
    const sum = re => r.filter(x => re.test(x.label)).reduce((a, x) => a + x.v, 0);
    Object.assign(out, {
      cash: r.find(x => /^Cash and cash equivalents$/i.test(x.label))?.v ?? null, securities: sum(/^(?:Short-term |Long-term )?marketable securities$/i),
      debt: sum(/^(?:Long-term |Term )debt$|^Commercial paper$/i), assets: r.find(x => /^Total assets$/i.test(x.label))?.v ?? null,
      equity: r.find(x => /^Total shareholders.? equity$/i.test(x.label))?.v ?? null,
    });
  }
  // Products and regions: the first "Details" pages that list them
  for (const d of details) {
    if (out.products && out.regions) break;
    const r = rows(await sec(base + d.file));
    const pick = (list, label) => {
      const got = {};
      for (const [k, re] of list) {
        const hit = r.find(x => (re.test(x.ctx) && /^Net sales$/i.test(x.label)) || (re.test(x.label) && !/Months/.test(x.label) && x.ctx && !/^Total/i.test(x.label) && label.test(x.ctx)));
        if (hit) got[k] = (got[k] ?? 0) + hit.v;
      }
      return Object.keys(got).length >= list.length - 1 ? got : null;
    };
    out.products ??= pick(PRODUCTS, /product|line items/i);
    out.regions ??= pick(REGIONS, /segment|line items/i);
  }
  return out;
}

/** Fiscal year and quarter of a filing period end (Apple's year ends in late September). */
function fiscal(period) {
  const [y, m] = period.split('-').map(Number);
  const fy = m >= 10 ? y + 1 : y;
  const q = m >= 10 || m <= 1 ? 1 : m <= 4 ? 2 : m <= 7 ? 3 : 4;
  return { fy, q };
}

const FLOWS = ['revenue', 'cost', 'gross', 'rnd', 'sga', 'operating', 'net', 'eps', 'productsRev', 'servicesRev'];

/**
 * One row per fiscal quarter. A 10-K reports the whole year, so its fourth quarter is the year
 * minus the three quarters before it (for products and regions too).
 */
export async function secQuarters(prev = []) {
  const subs = JSON.parse(await sec('https://data.sec.gov/submissions/CIK0000320193.json')).filings.recent;
  const list = subs.form.map((f, i) => ({ form: f, acc: subs.accessionNumber[i], period: subs.reportDate[i] })).filter(f => f.form === '10-Q' || f.form === '10-K');
  const raw = new Map(prev.filter(p => p.raw).map(p => [p.raw.acc, p.raw]));
  for (const f of list) {
    if (raw.has(f.acc)) continue;
    try { raw.set(f.acc, await filing(f.acc, f.form, f.period)); } catch { /* next run */ }
  }
  const byFy = new Map();
  for (const r of raw.values()) {
    const { fy, q } = fiscal(r.period);
    byFy.set(`${fy}-${q}`, { fy, q, raw: r });
  }
  const out = [];
  for (const { fy, q, raw: r } of [...byFy.values()].sort((a, b) => a.fy - b.fy || a.q - b.q)) {
    const row = { fy, q, period: r.period, form: r.form, raw: r };
    const earlier = [1, 2, 3].map(k => byFy.get(`${fy}-${k}`)?.raw);
    const complete = q !== 4 || earlier.every(Boolean);
    for (const k of FLOWS) {
      if (r[k] === null || r[k] === undefined) { row[k] = null; continue; }
      // EPS is not additive across quarters with different share counts; the derived Q4 is close enough
      row[k] = q === 4 && r.form === '10-K' ? (complete ? +(r[k] - earlier.reduce((a, e) => a + (e[k] ?? 0), 0)).toFixed(2) : null) : r[k];
    }
    for (const group of ['products', 'regions']) {
      if (!r[group]) { row[group] = null; continue; }
      row[group] = Object.fromEntries(Object.entries(r[group]).map(([k, v]) => [k, q === 4 && r.form === '10-K' ? (complete && earlier.every(e => e[group]?.[k] !== undefined) ? v - earlier.reduce((a, e) => a + e[group][k], 0) : null) : v]));
    }
    for (const k of ['cash', 'securities', 'debt', 'assets', 'equity']) row[k] = r[k] ?? null;
    out.push(row);
  }
  return out;
}
