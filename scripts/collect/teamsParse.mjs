// Season-by-season history from Wikipedia "List of … seasons" pages.
import { infobox } from './lib.mjs';

const stripRefs = s => s.replace(/<ref[^>]*\/>|<ref[\s\S]*?<\/ref>/g, '').replace(/<!--[\s\S]*?-->/g, '');
export const plain = s => stripRefs(s)
  .replace(/\{\{(?:sort|sortname)\|([^|}]+)\|([^|}]+)[^}]*\}\}/gi, '$1 $2')
  .replace(/\{\{(?:tooltip|abbr|nowrap|small)\|([^|}]+)[^}]*\}\}/gi, '$1')
  .replace(/\{\{[^{}]*\}\}/g, '')
  .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1')
  .replace(/<br\s*\/?>|<hr\s*\/?>/gi, ' / ').replace(/<[^>]+>/g, '').replace(/'''?/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * A wikitable as a grid of cells, with rowspan/colspan expanded so that every row has the
 * same columns: [{ text, raw, head, bg }]. Header rows are kept (head = true).
 */
export function grid(table) {
  const rows = table.split(/\n\|-[^\n]*/).slice(1);
  const out = [];
  const pending = []; // column -> { cell, left }
  for (const r of rows) {
    const cells = [];
    for (const part of r.split(/\n(?=[|!])/)) {
      const m = part.match(/^([|!])(?![-}+])([\s\S]*)$/);
      if (!m) continue;
      const head = m[1] === '!';
      for (const c of m[2].split(head ? /\s*!!\s*|\s*\|\|\s*/ : /\s*\|\|\s*/)) {
        // "attrs | content", where attrs never contain [[ or {{
        const am = c.match(/^((?:[^|[{]|\{\{[^}]*\}\})*?=[^|[]*?)\|(?!\|)([\s\S]*)$/);
        const attrs = am && !/\[\[/.test(am[1]) ? am[1] : '';
        const body = am && attrs ? am[2] : c;
        const span = n => Number(attrs.match(new RegExp(`${n}\\s*=\\s*"?(\\d+)`, 'i'))?.[1] ?? 1);
        const bg = attrs.match(/(?:bgcolor|background(?:-color)?)\s*[=:]\s*"?\s*(#?\w+)/i)?.[1] ?? null;
        cells.push({ raw: body, text: plain(body), head, bg, rowspan: span('rowspan'), colspan: span('colspan') });
      }
    }
    if (!cells.length) continue;
    const row = [];
    let col = 0, k = 0;
    while (k < cells.length || pending[col]) {
      if (pending[col]?.left > 0) { row[col] = pending[col].cell; pending[col].left--; col++; continue; }
      const c = cells[k++];
      if (!c) { col++; continue; }
      for (let s = 0; s < c.colspan; s++) {
        row[col] = c;
        if (c.rowspan > 1) pending[col] = { cell: c, left: c.rowspan - 1 };
        col++;
      }
    }
    out.push(row);
  }
  return out;
}

const tables = w => w.split(/\n\{\|/).slice(1).map(t => t.split(/\n\|\}/)[0]);
const num = s => { const m = String(s ?? '').match(/-?\d+/); return m ? Number(m[0]) : null; };
const ordinalNum = s => num(String(s ?? '').replace(/(\d+)(st|nd|rd|th)/, '$1'));

/** AC Milan: one row per season (two for the early years: regional and final rounds; we keep the final one). */
export function milanSeasons(w) {
  const t = tables(w).find(x => /Division/.test(x) && /Pld/.test(x) && /Pts/.test(x));
  if (!t) return [];
  const g = grid(t).filter(r => r[0]?.head && /\d{4}/.test(r[0].text) && !r[1]?.head);
  const bySeason = new Map();
  for (const r of g) {
    const season = r[0].text.match(/\d{4}(?:[–-]\d{2,4})?/)?.[0];
    if (!season) continue;
    const div = r[1]?.text ?? '';
    const rec = {
      season, start: Number(season.slice(0, 4)), division: div,
      pld: num(r[2]?.text), w: num(r[3]?.text), d: num(r[4]?.text), l: num(r[5]?.text), gf: num(r[6]?.text), ga: num(r[7]?.text), pts: num(r[8]?.text),
      pos: ordinalNum(r[9]?.text), champion: /gold/i.test(r[9]?.bg ?? '') || /^1st/.test(r[9]?.text ?? '') && !/Serie B|Reg/.test(div),
      cup: r[10]?.text || null, cupWon: /gold/i.test(r[10]?.bg ?? '') || /^W$/.test(r[10]?.text ?? ''),
      europe: [r[11]?.raw ?? '', r[12]?.raw ?? ''],
      scorer: r[13]?.text || null, goals: num(r[14]?.text),
    };
    // Europe / other: several competitions in one cell, separated by <br> or <hr>, with matching results
    const comps = (r[11]?.raw ?? '').split(/<br\s*\/?>|<hr\s*\/?>/i).map(plain).filter(Boolean);
    const results = (r[12]?.raw ?? '').split(/<br\s*\/?>|<hr\s*\/?>/i).map(plain);
    rec.europe = comps.map((c, i) => ({ comp: c, result: results[i] ?? '' }));
    delete rec.europeRaw;
    // Early seasons: the federal (final) round row replaces the regional one
    const prev = bySeason.get(season);
    if (!prev || /Fed|Final|Serie A|Divisione|Prima|Serie B|Cat/.test(div)) bySeason.set(season, prev && !rec.pld ? { ...prev, ...Object.fromEntries(Object.entries(rec).filter(([, v]) => v != null && v !== '')) } : rec);
  }
  return [...bySeason.values()].sort((a, b) => a.start - b.start);
}

/** NFL team: one row per season (W-L-T, finish, playoff result). */
export function nflSeasons(w) {
  const t = tables(w).find(x => /Finish/.test(x) && /Postseason/.test(x));
  if (!t) return [];
  // The season cell is a template that renders as the year; the team-season link next to it has it too
  const yearOf = r => (/^\d{4}$/.test(r[0]?.text ?? '') ? r[0].text : /^\d{4}$/.test(r[1]?.text ?? '') ? r[1].text : null);
  const g = grid(t).filter(r => r[0]?.head && yearOf(r));
  return g.map(r => {
    const post = r[9]?.text ?? '';
    return {
      season: yearOf(r), start: Number(yearOf(r)), team: r[1]?.text, league: r[2]?.text, conference: r[3]?.text, division: r[4]?.text,
      finish: ordinalNum(r[5]?.text), w: num(r[6]?.text), l: num(r[7]?.text), t: num(r[8]?.text),
      postseason: post || null, awards: r[10]?.text || null, coach: r[11]?.text || null,
      champion: /Won Super Bowl|Won AFL Championship/i.test(post), conferenceChampion: /Won (?:AFC|AFL) Championship|Super Bowl/i.test(post) && !/Lost (?:AFC|AFL) Championship/i.test(post),
      divisionChampion: /^1st/.test(r[5]?.text ?? '') && /D0E7FF|ddffdd|FFCCCC|FFE6BD/i.test(r[5]?.bg ?? r[0]?.bg ?? ''),
      playoffs: Boolean(post && !/^—?$/.test(post)),
    };
  });
}

/** College football: {{CFB Yearly Record Entry}} templates, one per season. */
export function cfbSeasons(w) {
  const out = [];
  let conf = null;
  for (const m of stripRefs(w).matchAll(/\{\{CFB Yearly Record (Subhead|Entry)([\s\S]*?)\n\}\}/g)) {
    const body = m[2];
    const f = k => infobox(body, [k]);
    if (m[1] === 'Subhead') { conf = plain(f('conf') ?? '') || null; continue; }
    const year = num(plain(f('year') ?? ''));
    if (!year) continue;
    const overall = plain(f('overall') ?? '').match(/(\d+)\s*[–-]\s*(\d+)(?:\s*[–-]\s*(\d+))?/);
    const confRec = plain(f('conference') ?? '').match(/(\d+)\s*[–-]\s*(\d+)/);
    const champ = (f('championship') ?? '').toLowerCase();
    out.push({
      season: String(year), start: year, coach: plain(f('name') ?? '') || null, conference: conf,
      w: overall ? Number(overall[1]) : null, l: overall ? Number(overall[2]) : null, t: overall?.[3] ? Number(overall[3]) : 0,
      confW: confRec ? Number(confRec[1]) : null, confL: confRec ? Number(confRec[2]) : null, confStanding: plain(f('confstanding') ?? '') || null,
      bowl: plain(f('bowlname') ?? '') || null, bowlResult: plain(f('bowloutcome') ?? '') || null,
      apRank: num(plain(f('ranking2') ?? '')) ?? num(plain(f('ranking') ?? '')),
      champion: /national/.test(champ), conferenceChampion: /conference|national/.test(champ),
    });
  }
  return out;
}

/** All-time series from a rivalry page's infobox: { wins, losses, draws, text } from our team's side. */
export function rivalrySeries(w, us) {
  const raw = infobox(w, ['all_time_series', 'series', 'alltime_record', 'all-time_series']) ?? '';
  const total = num(plain(infobox(w, ['total_meetings', 'total', 'meetings', 'total_matches']) ?? '').replace(/,/g, ''));
  let txt = raw.replace(/\{\{winning percentage\|(\d+)\|(\d+)(?:\|(\d+))?[^}]*\}\}/gi, (_, a, b, c) => `${a}–${b}${c ? `–${c}` : ''}`);
  txt = plain(txt);
  const usRe = new RegExp(us, 'i');
  // "Inter: 91 / Drawn: 71 / Milan: 84"
  if (/Draw/i.test(txt)) {
    const parts = Object.fromEntries([...txt.matchAll(/([A-Za-z.& ]+?)\s*:\s*(\d+)/g)].map(m => [m[1].trim(), Number(m[2])]));
    const draws = Object.entries(parts).find(([k]) => /draw/i.test(k))?.[1] ?? 0;
    const ours = Object.entries(parts).find(([k]) => usRe.test(k))?.[1];
    const theirs = Object.entries(parts).find(([k]) => !/draw/i.test(k) && !usRe.test(k))?.[1];
    if (ours != null && theirs != null) return { wins: ours, losses: theirs, draws, total: total ?? ours + theirs + draws, text: txt };
  }
  // "Patriots: 81–52–1", "Texas leads, 65–52–5", "Dolphins: 64–57"
  const m = txt.match(/([A-Za-z.&' ]+?)(?:\s+leads)?\s*[:,]\s*(\d+)\s*[–-]\s*(\d+)(?:\s*[–-]\s*(\d+))?/);
  if (m) {
    const leaderIsUs = usRe.test(m[1]);
    const a = Number(m[2]), b = Number(m[3]), c = Number(m[4] ?? 0);
    return leaderIsUs ? { wins: a, losses: b, draws: c, total: total ?? a + b + c, text: txt } : { wins: b, losses: a, draws: c, total: total ?? a + b + c, text: txt };
  }
  // A statistics table: "Competition | Matches | Juventus wins | Draws | Milan wins …", the overall total row
  for (const t of tables(w).filter(x => /Draws/.test(x) && /wins/i.test(x))) {
    const g = grid(t);
    const head = g.find(r => r.some(c => c?.head && /Draws/i.test(c.text)));
    if (!head) continue;
    const iD = head.findIndex(c => /^Draws/i.test(c?.text ?? ''));
    const iUs = head.findIndex(c => usRe.test(c?.text ?? '') && /wins/i.test(c.text));
    const iThem = head.findIndex((c, i) => i !== iUs && /wins/i.test(c?.text ?? ''));
    const totals = g.filter(r => /^Total/i.test(r[0]?.text ?? '') && !/league|unofficial|friendl/i.test(r[0].text));
    if (!totals.length) continue;
    const row = totals.find(r => /official/i.test(r[0].text)) ?? totals[totals.length - 1];
    if (row && iUs >= 0 && iThem >= 0) {
      const v = i => num(row[i]?.text);
      return { wins: v(iUs), losses: v(iThem), draws: v(iD), total: v(1) ?? v(iUs) + v(iThem) + v(iD), text: `${row[0].text}: ${v(1)} matches` };
    }
  }
  return total ? { wins: null, losses: null, draws: null, total, text: txt } : null;
}
