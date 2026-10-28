// Apple history from Wikipedia: every media event since 1984 ("List of Apple Inc. media events")
// and every product with its release date ("List of Apple products"), from which the product
// clock measures how long each line has gone without an update.
import { wikitext } from './lib.mjs';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_RE = MONTHS.join('|');

/** Plain text of a wiki fragment: link labels, no references, templates or markup. */
const plain = s => s
  .replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, '')
  .replace(/\{\{\s*(?:nbsp|snd|spaced ndash)\s*\}\}/gi, ' ')
  .replace(/\{\{[^{}]*\}\}/g, '').replace(/\{\{[^{}]*\}\}/g, '')
  .replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, '')
  .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1').replace(/\[https?:\S+\s([^\]]+)\]/g, '$1')
  .replace(/'''?/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** "June 9–13, 2025" / "January 24, 1984" / "May 1990" -> { y, m, d|null }. */
function dateIn(text, year) {
  let m = text.match(new RegExp(`\\b(${MONTH_RE})\\s+(\\d{1,2})(?!\\d)(?:\\s*[–-]\\s*\\d{1,2})?(?:,\\s*(\\d{4}))?`, 'i'));
  if (m) return { y: m[3] ? +m[3] : year, m: MONTHS.indexOf(m[1].toLowerCase()) + 1, d: +m[2] };
  m = text.match(new RegExp(`\\b(${MONTH_RE})\\s+(\\d{4})`, 'i'));
  if (m) return { y: +m[2], m: MONTHS.indexOf(m[1].toLowerCase()) + 1, d: null };
  return null;
}

function kindOf(title) {
  if (/WWDC|Worldwide Developers/i.test(title)) return 'wwdc';
  if (/Macworld|Seybold|Expo|Boston Computer Society/i.test(title)) return 'expo';
  return 'event';
}

/** Every event of "List of Apple Inc. media events": title, date, tagline and what it introduced. */
export async function mediaEvents() {
  const w = await wikitext('List of Apple Inc. media events');
  if (!w) return [];
  const out = [];
  let year = null;
  for (const block of w.split(/\n(?===)/)) {
    const h2 = block.match(/^==\s*(\d{4})\s*==/);
    if (h2) { year = +h2[1]; continue; }
    const h3 = block.match(/^===\s*(.+?)\s*===\s*\n?([\s\S]*)$/);
    if (!h3 || !year) continue;
    const head = plain(h3[1]);
    const body = plain(h3[2]);
    const d = dateIn(head, year) ?? dateIn(body, year) ?? { y: year, m: null, d: null };
    const title = head.replace(new RegExp(`\\s*\\((?:[^()]*\\d{4}[^()]*|[^()]*(?:${MONTH_RE})[^()]*)\\)\\s*$`, 'i'), '').trim() || head;
    const tagline = body.match(/tagline[s]?\s*(?:was|of|,)?\s*[“"]([^”"]{2,60})[”"]/i)?.[1] ?? null;
    out.push({
      title, kind: kindOf(head), y: d.y, m: d.m, d: d.d,
      date: d.m ? `${d.y}-${String(d.m).padStart(2, '0')}${d.d ? `-${String(d.d).padStart(2, '0')}` : ''}` : String(d.y),
      tagline, summary: body.slice(0, 700),
    });
  }
  return out;
}

/** Rows of a wikitable with rowspans expanded: arrays of raw cell texts. */
function tableRows(table) {
  const rows = [];
  const spans = []; // per column: { left, text }
  for (const raw of table.split(/\n\|-[^\n]*/).slice(1)) {
    const cells = [];
    for (const line of raw.split('\n')) {
      if (!line.startsWith('|') || line.startsWith('|}') || line.startsWith('|+')) continue;
      for (const c of line.slice(1).split('||')) cells.push(c);
    }
    const row = [];
    let ci = 0;
    for (let col = 0; col < 8 && (ci < cells.length || spans[col]?.left > 0); col++) {
      if (spans[col]?.left > 0) { row.push(spans[col].text); spans[col].left--; continue; }
      if (ci >= cells.length) break;
      let c = cells[ci++];
      // "attrs | content" (attributes before a single pipe that is not inside a link)
      const attr = c.match(/^([^[|]*?=[^[|]*?)\|(?!\|)([\s\S]*)$/);
      const rs = attr?.[1].match(/rowspan\s*=\s*"?(\d+)/i);
      if (attr) c = attr[2];
      if (rs && +rs[1] > 1) spans[col] = { left: +rs[1] - 1, text: c };
      row.push(c);
    }
    if (row.length) rows.push(row);
  }
  return rows;
}

// The lines the product clock follows: name, and a test on "family · model".
const LINES = [
  ['iPhone', /^iPhone · iPhone (?:\d+|X|XS|XR|Air|Duo)\b(?!.*\b(?:Pro|mini)\b)/],
  ['iPhone Pro', /^iPhone · iPhone \d+ Pro/],
  ['iPhone SE / e', /^iPhone · iPhone (?:SE|\d+e)\b/],
  ['iPad', /^iPad · iPad(?: \(\d+\w* generation\)| \d+\w* gen|$| \(A\d+\))/],
  ['iPad Air', /^iPad Air · /],
  ['iPad mini', /^iPad mini · /],
  ['iPad Pro', /^iPad Pro · /],
  ['MacBook Air', /^MacBook Air · /],
  ['MacBook Pro', /^MacBook Pro · /],
  ['MacBook Neo', /^MacBook Neo · /],
  ['iMac', /^iMac · iMac(?! Pro)/],
  ['Mac mini', /^Mac mini · /],
  ['Mac Studio', /^Mac Studio · /],
  ['Mac Pro', /^Mac Pro · /],
  ['Apple Watch', /^Apple Watch · Apple Watch Series/],
  ['Watch Ultra', /^Apple Watch · Apple Watch Ultra/],
  ['Watch SE', /^Apple Watch · Apple Watch SE\b/],
  ['AirPods', /^(?:Apple )?[Hh]eadphones · AirPods(?! Pro| Max)|^AirPods · AirPods(?! Pro| Max)/],
  ['AirPods Pro', /AirPods Pro/],
  ['AirPods Max', /AirPods Max/],
  ['Apple TV', /^Apple TV · Apple TV/],
  ['HomePod', /HomePod(?! mini)/],
  ['HomePod mini', /HomePod mini/],
  ['Vision Pro', /Vision Pro/],
  ['Studio Display', /Studio Display/],
  ['AirTag', /AirTag/],
];

/** Every product of "List of Apple products" since 2007, and for each followed line its release dates. */
export async function productLines() {
  const w = await wikitext('List of Apple products');
  if (!w) return [];
  const rows = [];
  for (const sec of w.split(/\n(?=====\s*\d{4}\s*====)/)) {
    const y = sec.match(/^====\s*(\d{4})\s*====/)?.[1];
    if (!y || +y < 2007) continue;
    for (const t of sec.split('\n{|').slice(1)) {
      for (const r of tableRows(t.split('\n|}')[0])) {
        if (r.length < 3) continue;
        const d = dateIn(plain(r[0]), +y);
        if (!d?.d) continue;
        rows.push({ date: `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`, model: plain(r[1]), family: plain(r[2]) });
      }
    }
  }
  return LINES.map(([name, re]) => {
    // Same model in a new colour is not an update
    const hits = rows.filter(r => new RegExp(re.source, 'i').test(`${r.family} · ${r.model}`) && !/\((?:[a-z]+ ?){1,2}\)$/.test(r.model));
    // One update per release date (two sizes launched together count once)
    const byDate = new Map();
    for (const h of hits) byDate.set(h.date, [...(byDate.get(h.date) ?? []), h.model]);
    const releases = [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, models]) => ({ date, models: [...new Set(models)] }));
    return { name, releases };
  }).filter(l => l.releases.length);
}
