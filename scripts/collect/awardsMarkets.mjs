// Prediction markets on the Oscars, read from their public APIs (no key):
// Polymarket (winner and nomination markets for almost every category) and Kalshi
// (winner markets for the six main categories, nominations for Best Picture).
import { get } from './lib.mjs';
import { oscarCat } from './awardsParse.mjs';

const KALSHI = 'https://api.elections.kalshi.com/trade-api/v2';
const KALSHI_SERIES = { KXOSCARPIC: ['picture', 'winner'], KXOSCARDIR: ['director', 'winner'], KXOSCARACTO: ['actor', 'winner'], KXOSCARACTR: ['actress', 'winner'], KXOSCARSUPACTO: ['supActor', 'winner'], KXOSCARSUPACTR: ['supActress', 'winner'], KXOSCARNOMPIC: ['picture', 'nom'] };

/** { cat: { winner?: [{ name, p }], nom?: [...] } } */
async function polymarket(C) {
  const j = await get(`https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(`oscars ${C}`)}&limit_per_type=60`, { json: true, browser: true });
  const out = {};
  for (const e of j.events ?? []) {
    const m = e.title.match(new RegExp(`Oscars ${C}:\\s*(.+?)\\s+(Winner|Nominations?)\\s*$`, 'i'));
    if (!m) continue;
    const cat = oscarCat(m[1], 'oscars');
    if (!cat) continue;
    const kind = /winner/i.test(m[2]) ? 'winner' : 'nom';
    const rows = (e.markets ?? []).filter(x => !x.closed && x.groupItemTitle).map(x => {
      let p = null;
      try { p = Number(JSON.parse(x.outcomePrices)[0]); } catch { p = Number(x.lastTradePrice); }
      return { name: x.groupItemTitle.trim(), p: Number.isFinite(p) ? +p.toFixed(3) : null, vol: Math.round(Number(x.volume) || 0) };
    // Placeholder slots ("Film I", "Actor F", "xxxxx") sit at 50% with no trading: leave them out
    }).filter(r => r.p != null && r.p >= 0.005 && r.vol > 0 && !/^(film|movie|actor|actress|song|director|nominee|person|other|option)\s*[a-z0-9]{1,2}$|^x+$/i.test(r.name)).sort((a, b) => b.p - a.p).slice(0, 15);
    if (rows.length) (out[cat] ??= {})[kind] = rows;
  }
  return out;
}

async function kalshi() {
  const out = {};
  for (const [series, [cat, kind]] of Object.entries(KALSHI_SERIES)) {
    try {
      const j = await get(`${KALSHI}/markets?series_ticker=${series}&status=open&limit=200`, { json: true });
      const rows = (j.markets ?? []).map(x => ({ name: (x.custom_strike?.Nominee ?? x.yes_sub_title ?? '').trim(), p: Number(x.last_price_dollars ?? x.last_price / 100) }))
        .filter(r => r.name && Number.isFinite(r.p) && r.p >= 0.005).sort((a, b) => b.p - a.p).slice(0, 15);
      if (rows.length) (out[cat] ??= {})[kind] = rows;
    } catch { /* one series down */ }
  }
  return out;
}

export async function markets(C, prev) {
  // Markets move slowly outside the big nights: once an hour is enough
  if (prev?.updated && Date.now() - Date.parse(prev.updated) < 55 * 60e3 && !process.env.FORCE_MARKETS) return prev;
  const [pm, ks] = await Promise.allSettled([polymarket(C), kalshi()]);
  const out = { updated: new Date().toISOString(), polymarket: pm.status === 'fulfilled' ? pm.value : prev?.polymarket ?? {}, kalshi: ks.status === 'fulfilled' ? ks.value : prev?.kalshi ?? {}, history: prev?.history ?? {} };
  // One reading a day per category (winner markets), for the race charts
  const today = new Date().toISOString().slice(0, 10);
  for (const [src, data] of [['polymarket', out.polymarket], ['kalshi', out.kalshi]]) for (const [cat, o] of Object.entries(data)) {
    if (!o.winner) continue;
    const h = (((out.history[src] ??= {})[cat]) ??= []);
    const point = { d: today, v: Object.fromEntries(o.winner.slice(0, 10).map(r => [r.name, r.p])) };
    if (h.length && h[h.length - 1].d === today) h[h.length - 1] = point; else h.push(point);
  }
  return out;
}
