// Road cycling results from the English Wikipedia race pages ("2026 Giro d'Italia", "2026 Milan–San Remo"…):
// podium and jersey winners (infobox), stage list with winners, final classifications, the general
// classification after every stage and who led each classification day by day.
// Used for every race the organisers' own sites do not give official rankings for.
import { parseDate, wikitext } from './lib.mjs';

const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Wikitext without comments and references (also the malformed `<ref name="x" <ref/>`). */
const strip = w => w.replace(/<!--[\s\S]*?-->/g, '').replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '').replace(/<ref[^>]*<ref\/>/g, '');

/** Splits on `sep` outside [[links]] and {{templates}}. */
function splitTop(s, sep = '|') {
  const out = [];
  let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === '{{' || two === '[[') { depth++; cur += two; i++; continue; }
    if ((two === '}}' || two === ']]') && depth > 0) { depth--; cur += two; i++; continue; }
    if (depth === 0 && s.startsWith(sep, i)) { out.push(cur); cur = ''; i += sep.length - 1; continue; }
    cur += s[i];
  }
  out.push(cur);
  return out;
}

/** Every {{name|…}} in the text, as its list of arguments. */
function templates(s, name) {
  const out = [];
  const re = new RegExp(`\\{\\{\\s*${name}\\s*\\|`, 'gi');
  let m;
  while ((m = re.exec(s))) {
    let depth = 1, i = m.index + 2;
    for (; i < s.length && depth; i++) {
      if (s.startsWith('{{', i)) { depth++; i++; } else if (s.startsWith('}}', i)) { depth--; i++; }
    }
    out.push(splitTop(s.slice(m.index + m[0].length, i - 2)).map(a => a.trim()));
  }
  return out;
}

/** Plain text of a wiki fragment: link labels, converted distances, no markup. */
const plain = s => s
  .replace(/\{\{\s*convert\s*\|\s*([\d.,]+)\s*\|\s*km[^}]*\}\}/gi, '$1 km')
  .replace(/\{\{\s*(?:interlanguage link|ill)\s*\|\s*([^|}]+)[^}]*\}\}/gi, '$1')
  .replace(/\{\{[^{}]*\}\}/g, '').replace(/\{\{[^{}]*\}\}/g, '')
  .replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, '')
  .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1').replace(/'''?/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** Rider and nationality from "{{Flagathlete|[[Name]]|SLO}}", "[[Name]]" or plain text. */
function riderOf(cell) {
  const f = cell.match(/\{\{\s*flag ?athlete\s*\|\s*\[\[(?:[^|\]]*\|)?([^\]]+)\]\]\s*\|\s*([A-Z]{3})/i);
  if (f) return { rider: f[1].trim(), nat: f[2] };
  const l = cell.match(/\[\[(?!File:|Image:)(?:[^|\]]*\|)?([^\]]+)\]\]/);
  const n = cell.match(/\{\{\s*flagicon\s*\|\s*([A-Z]{3})/i);
  return l ? { rider: l[1].trim(), nat: n?.[1] ?? null } : null;
}

const teamCodeOf = cell => { const m = cell.match(/\{\{\s*UCI team code\s*\|\s*([^|}]+?)\s*\|\s*([^|}]+?)\s*\}\}/i); return m ? `${m[1]}|${m[2]}` : null; };

/** "83h 22' 51"", "+ 5' 22"", "+ 0"", "s.t." -> seconds (gaps start with +) */
function secs(t) {
  if (!t || /s\.?\s*t\.?/i.test(t)) return 0;
  const m = t.replace(/^[\s+]+/, '').replace(/[″"]/g, '"').replace(/[′’]/g, "'").match(/(?:(\d+)\s*h)?\s*(?:(\d+)\s*')?\s*(?:(\d+)\s*")?/);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** A wikitable as rows of cells, with rowspan and colspan expanded. */
function wikitable(src) {
  const rows = [];
  const pending = []; // per column: { left, cell }
  for (const raw of src.split(/\n\|-[^\n]*/)) {
    const cells = [];
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('|}') || t.startsWith('|+') || t.startsWith('{|')) continue;
      if (!/^[|!]/.test(t)) { if (cells.length) cells[cells.length - 1].text += '\n' + t; continue; }
      const head = t[0] === '!';
      for (const part of splitTop(t.slice(1), head ? '!!' : '||').flatMap(p => (head ? splitTop(p, '||') : [p]))) {
        const bits = splitTop(part);
        const hasAttrs = bits.length > 1 && /^\s*(?:[a-z-]+\s*=\s*("[^"]*"|\S+)\s*)+$/i.test(bits[0]);
        const attrs = hasAttrs ? bits[0] : '';
        cells.push({ head, text: (hasAttrs ? bits.slice(1).join('|') : part).trim(), rowspan: Number(attrs.match(/rowspan\s*=\s*"?(\d+)/i)?.[1] ?? 1), colspan: Number(attrs.match(/colspan\s*=\s*"?(\d+)/i)?.[1] ?? 1) });
      }
    }
    if (!cells.length) continue;
    const row = [];
    let col = 0;
    const take = () => { while (pending[col]?.left > 0) { row[col] = pending[col].cell; pending[col].left--; col++; } };
    for (const c of cells) {
      take();
      for (let k = 0; k < c.colspan; k++) {
        row[col] = c;
        pending[col] = { left: c.rowspan - 1, cell: c };
        col++;
      }
    }
    take();
    rows.push(row);
  }
  return rows;
}

/** The wikitables of a page with their caption. */
function tables(w) {
  const out = [];
  const re = /\{\|[^\n]*\n/g;
  let m;
  while ((m = re.exec(w))) {
    let depth = 1, i = m.index + m[0].length;
    for (; i < w.length && depth; i++) {
      if (w.startsWith('{|', i)) depth++;
      else if (w.startsWith('|}', i)) depth--;
    }
    const src = w.slice(m.index, i + 1);
    out.push({ caption: src.match(/\n\|\+([^\n]*)/)?.[1] ?? '', src });
  }
  return out;
}

const infoboxField = (w, k) => w.match(new RegExp(`\\n[ \\t]*\\|[ \\t]*${k}[ \\t]*=[ \\t]*([^\\n]*)`))?.[1]?.trim() || null;

/** One classification row from {{cyclingresult|pos|[[rider]]|NAT|{{team}}|time or points|jerseys}}. */
function resultRows(block, points = false) {
  return templates(block, 'cyclingresult').map(a => {
    const r = riderOf(`{{flagathlete|${a[1]}|${a[2]}}}`) ?? riderOf(a[1]);
    const val = plain(a[4] ?? '');
    return { pos: Number(a[0]) || null, rider: r?.rider ?? plain(a[1]), nat: a[2] || null, team: teamCodeOf(a[3] ?? ''), time: points ? null : val || null, points: points ? Number(val.replace(/\D/g, '')) || null : null };
  }).filter(x => x.pos);
}

/** Classification rows of a wikitable: rank, rider (with jerseys), team, time or points. */
function tableRows(src, points = false) {
  return wikitable(src).filter(r => /^\d+$/.test(plain(r[0]?.text ?? ''))).map(r => {
    const who = riderOf(r[1]?.text ?? '');
    const val = plain(r[3]?.text ?? '');
    return { pos: Number(plain(r[0].text)), rider: who?.rider ?? plain(r[1]?.text ?? ''), nat: who?.nat ?? null, team: teamCodeOf(r[2]?.text ?? ''), time: points ? null : val || null, points: points ? Number(val.replace(/\D/g, '')) || null : null };
  });
}

/** Final classification under a heading such as "=== Points classification ===". */
function classification(w, re, points) {
  const h = w.match(new RegExp(`\\n(=+)\\s*(?:Final\\s+)?${re}[^=\\n]*=+\\s*\\n`, 'i'));
  if (!h) return [];
  const from = h.index + h[0].length;
  const next = w.slice(from).search(new RegExp(`\\n={1,${h[1].length}}[^=]`));
  const sec = w.slice(from, next < 0 ? undefined : from + next);
  if (/cyclingresult\s*\|/i.test(sec)) return resultRows(sec, points).slice(0, 10);
  const t = tables(sec)[0];
  return t ? tableRows(t.src, points).slice(0, 10) : [];
}

/** Stage list: number, date, from, to, km, terrain, winner. */
function stageList(w, year) {
  const t = tables(w).find(x => /stage characteristics|stages/i.test(x.caption)) ?? tables(w).find(x => /Course/.test(x.src) && /Distance/.test(x.src));
  if (!t) return [];
  const rows = wikitable(t.src);
  const head = rows.find(r => r.every(c => c.head))?.map(c => plain(c.text)) ?? [];
  const at = re => head.findIndex(h => re.test(h));
  const iDate = at(/^Date/i), iCourse = at(/Course|Route/i), iKm = at(/Distance/i), iWin = at(/winner/i);
  const iType = head.length - 1 - [...head].reverse().findIndex(h => /Type/.test(h));
  const out = [];
  for (const r of rows) {
    if (r.every(c => c.head)) continue;
    const label = plain(r[0]?.text ?? '');
    const date = parseDate(plain(r[iDate]?.text ?? ''), year);
    if (!date) continue;
    const course = plain(r[iCourse]?.text ?? '');
    if (/rest day/i.test(course)) { out.push({ num: null, type: 'Rest day', rest: true, date: ymd(date.y, date.m, date.d), from: '', to: '', km: null }); continue; }
    // "Nesebar (Bulgaria) to Burgas (Bulgaria)": the country in brackets helps to place the town
    const ends = course.split(/\s+(?:to|–|-)\s+/);
    const [from, to] = ends.map(x => x.replace(/\s*\([^)]*\)/g, '').trim());
    const [fromCountry, toCountry] = ends.map(x => x.match(/\(([^)]+)\)/)?.[1]?.trim() ?? null);
    const winCell = r[iWin]?.text ?? '';
    const who = riderOf(winCell);
    out.push({
      num: /^p/i.test(label) ? 0 : Number(label) || null, type: plain(r[iType]?.text ?? '').replace(/\s*stage$/i, ''), rest: false, date: ymd(date.y, date.m, date.d),
      from: from ?? '', to: to || from || '', fromCountry, toCountry: toCountry ?? (to ? null : fromCountry), km: Number(plain(r[iKm]?.text ?? '').match(/[\d.]+/)?.[0]) || null,
      winner: who && !/UCI team code/i.test(winCell) ? who.rider : null, winnerNat: who?.nat ?? null, winnerTeam: teamCodeOf(winCell),
    });
  }
  return out;
}

/** Who led each classification after every stage, and the jersey colours from the table header. */
function leadership(w) {
  const t = tables(w).find(x => /leadership/i.test(x.caption) || /leadership/i.test(x.src.slice(0, 300)));
  if (!t) return { leaders: [], colors: {} };
  const rows = wikitable(t.src);
  const head = rows.find(r => r.length > 3 && r.every(c => c.head));
  if (!head) return { leaders: [], colors: {} };
  const keys = { gc: /General/i, points: /Points/i, mountains: /Mountain|King/i, youth: /Young|Youth/i };
  const idx = {}, colors = {};
  for (const [k, re] of Object.entries(keys)) {
    const i = head.findIndex(c => re.test(plain(c.text)));
    if (i >= 0) { idx[k] = i; const c = head[i].text.match(/cjersey\s*\|\s*([^|}]+)/i); if (c) colors[k] = c[1].trim(); }
  }
  const leaders = [];
  for (const r of rows) {
    if (r === head || r.every(c => c.head && r.length > 3 && r === head)) continue;
    const label = plain(r[0]?.text ?? '');
    if (!/^(\d+|P|Prologue)$/i.test(label)) continue;
    const row = { stage: /^p/i.test(label) ? 0 : Number(label) };
    for (const [k, i] of Object.entries(idx)) row[k] = riderOf(r[i]?.text ?? '')?.rider ?? null;
    leaders.push(row);
  }
  return { leaders, colors };
}

/** "General classification after stage N" blocks (on the race page or its stage pages). */
function gcAfter(w) {
  const out = [];
  for (const m of w.matchAll(/\{\{\s*cyclingresult start\s*\|[^\n]*?General classification after\s+(?:stage\s*)?(\w+)[^\n]*\n([\s\S]*?)\{\{\s*cyclingresult end/gi)) {
    const stage = /^p/i.test(m[1]) ? 0 : Number(m[1]);
    if (Number.isFinite(stage)) out.push({ stage, gc: resultRows(m[2]) });
  }
  return out;
}

/** Everything a race page gives, with team codes still to be resolved ("TVL men|2026"). */
export async function raceWiki(title, year) {
  const raw = await wikitext(title);
  if (!raw) return null;
  const w = strip(raw);
  const who = k => { const r = infoboxField(w, k); return r ? { rider: plain(r), nat: infoboxField(w, `${k}_nat`), team: teamCodeOf(infoboxField(w, `${k}_team`) ?? '') } : null; };
  const podium = ['first', 'second', 'third'].map((k, i) => { const x = who(k); return x?.rider ? { pos: i + 1, ...x } : null; }).filter(Boolean);
  const JERSEYS = [['points', 'Points'], ['mountains', 'Mountains'], ['youth', 'Young rider'], ['sprints', 'Sprints'], ['combativity', 'Most combative']];
  const jerseys = JERSEYS.map(([k, label]) => { const x = who(k); return x?.rider ? { key: k, label, ...x, color: infoboxField(w, `${k}_color`) } : null; }).filter(Boolean);
  const teamWin = infoboxField(w, 'team');
  if (teamWin) jerseys.push({ key: 'team', label: 'Team', rider: null, nat: infoboxField(w, 'team_nat'), team: teamCodeOf(teamWin), color: infoboxField(w, 'team_color') });
  const gcColor = infoboxField(w, 'first_color');

  const stages = stageList(w, year);
  const { leaders, colors } = leadership(w);
  let history = gcAfter(w);
  // Grand Tours keep the stage reports on their own pages ("2026 Giro d'Italia, Stage 1 to Stage 11")
  if (!history.length) {
    for (const t of [...new Set([...w.matchAll(/\{\{\s*Main\s*\|([^}]+)\}\}/gi)].flatMap(m => m[1].split('|')).map(s => s.trim()).filter(s => /Stage \d+ to Stage \d+/i.test(s)))]) {
      const sub = await wikitext(t);
      if (sub) history.push(...gcAfter(strip(sub)));
    }
  }
  history = history.sort((a, b) => a.stage - b.stage);

  // One-day races: "Result"; stage races: the final general classification
  const resultSec = w.match(/\n==+\s*(?:Final\s+)?Results?\s*==+\s*\n([\s\S]*?)(?=\n==[^=]|$)/i)?.[1] ?? '';
  const result = /cyclingresult\s*\|/i.test(resultSec) ? resultRows(resultSec).slice(0, 10) : [];
  const gc = classification(w, 'General classification', false);
  return {
    title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    podium, jerseys, gcColor, colors: { gc: gcColor, ...Object.fromEntries(jerseys.map(j => [j.key, j.color]).filter(([, c]) => c)), ...colors },
    result: result.length ? result : gc,
    classes: { points: classification(w, 'Points classification', true), mountains: classification(w, '(?:Mountains|King of the Mountains) classification', true), youth: classification(w, '(?:Young rider|Youth) classification', false) },
    stages, leaders, history,
  };
}

/** Team name of a code for a year, from Wikipedia's "Template:Cycling data CODE". */
export async function teamName(key, cache) {
  if (key in cache) return cache[key];
  const [code, yk] = key.split('|');
  const w = await wikitext(`Template:Cycling data ${code}`);
  const field = k => w?.match(new RegExp(`\\|\\s*${k}\\s*=\\s*([^\\n|]+)`))?.[1]?.trim();
  const year = yk.match(/\d{4}/)?.[0];
  cache[key] = (field(`team name-${yk}`) ?? field(`team name-${year}`) ?? field(`team name-${year}a`) ?? field('team name') ?? code.replace(/ men$/, '')).replace(/\s*\(.*\)$/, '');
  return cache[key];
}

/** National road race and time trial champions of the year, by country (IOC code). */
export async function nationalChampions(year) {
  const raw = await wikitext(`${year} national road cycling championships`);
  if (!raw) return null;
  const w = strip(raw);
  const sec = w.split(/\n===\s*Men's Elite\s*===/i)[1];
  const t = sec && tables(sec)[0];
  if (!t) return null;
  const rows = [];
  for (const r of wikitable(t.src)) {
    const nat = r[0]?.text.match(/\{\{\s*([A-Z]{3})\s*\}\}/)?.[1];
    if (!nat || r.every(c => c.head)) continue;
    const rr = riderOf(r[1]?.text ?? ''), itt = riderOf(r[3]?.text ?? '');
    rows.push({ nat, rr: rr?.rider ?? (plain(r[1]?.text ?? '') || null), rrTeam: teamCodeOf(r[2]?.text ?? ''), itt: itt?.rider ?? (plain(r[3]?.text ?? '') || null), ittTeam: teamCodeOf(r[4]?.text ?? '') });
  }
  return { year, rows };
}
