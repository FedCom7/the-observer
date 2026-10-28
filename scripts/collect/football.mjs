// Men's World Cup and European Championship.
// - ESPN: the last World Cup in full (every match, group tables), for the archive
// - Wikipedia: the next Euro (dates, host stadiums), its qualifying campaign (draw,
//   matchday windows, groups once drawn) and the next World Cup (dates, hosts, how
//   each confederation qualifies). Italy's matches and the Nations League are read live
//   by the page from ESPN.
import { get, iso, parseDate, wikitext, zoned } from './lib.mjs';

const Y = new Date().getUTCFullYear();
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

const unwiki = s => (s ?? '').replace(/<ref[\s\S]*?(?:<\/ref>|\/>)/g, '').replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1').replace(/\{\{(?:fb|flag|flagcountry)\|([A-Z]{3})[^}]*\}\}/g, '$1')
  .replace(/\{\{[^{}]*\}\}/g, '').replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/''+|&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- Last World Cup (ESPN) ----------
const ROUND = { 'group-stage': 'Group stage', 'round-of-32': 'Round of 32', 'round-of-16': 'Round of 16', quarterfinals: 'Quarter-finals', semifinals: 'Semi-finals', '3rd-place-match': 'Third place', final: 'Final' };

function side(c) {
  return { abbr: c.team?.abbreviation ?? '', name: c.team?.shortDisplayName ?? c.team?.displayName ?? '', logo: c.team?.logo ?? null, score: c.score != null ? Number(c.score) : null, pens: c.shootoutScore ?? null, winner: Boolean(c.winner) };
}

async function worldCup(year) {
  const [sb, st] = await Promise.all([
    get(`${ESPN}/fifa.world/scoreboard?dates=${year}&limit=300`, { json: true }),
    get(`https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings?season=${year}`, { json: true }).catch(() => null),
  ]);
  const matches = (sb.events ?? []).map(e => {
    const c = e.competitions?.[0] ?? {};
    const h = c.competitors?.find(x => x.homeAway === 'home'), a = c.competitors?.find(x => x.homeAway === 'away');
    return {
      id: String(e.id), date: e.date, stage: e.season?.slug ?? '', round: ROUND[e.season?.slug] ?? e.season?.slug ?? '', group: c.group?.name ?? null,
      state: c.status?.type?.state ?? 'pre', detail: c.status?.type?.shortDetail ?? '', home: h ? side(h) : null, away: a ? side(a) : null,
      venue: c.venue?.fullName ?? '', city: c.venue?.address?.city ?? '', country: c.venue?.address?.country ?? '',
    };
  }).sort((x, y) => Date.parse(x.date) - Date.parse(y.date));
  if (!matches.length) return null;
  const stat = (e, n) => e.stats?.find(s => s.name === n)?.displayValue ?? '';
  const groups = (st?.children ?? []).map(g => ({
    name: g.name, rows: (g.standings?.entries ?? []).map(e => ({ rank: Number(stat(e, 'rank')) || 0, abbr: e.team?.abbreviation ?? '', name: e.team?.shortDisplayName ?? e.team?.displayName ?? '', logo: e.team?.logos?.[0]?.href ?? null, p: Number(stat(e, 'gamesPlayed')) || 0, w: Number(stat(e, 'wins')) || 0, d: Number(stat(e, 'ties')) || 0, l: Number(stat(e, 'losses')) || 0, gd: stat(e, 'pointDifferential'), pts: Number(stat(e, 'points')) || 0 })).sort((a, b) => a.rank - b.rank),
  }));
  const final = matches.find(m => m.stage === 'final');
  const winnerOf = m => (m?.state === 'post' ? [m.home, m.away].find(s => s?.winner) ?? null : null);
  const champion = winnerOf(final);
  const runnerUp = champion && final ? [final.home, final.away].find(s => s && s !== champion) : null;
  const goals = matches.filter(m => m.state === 'post').reduce((n, m) => n + (m.home?.score ?? 0) + (m.away?.score ?? 0), 0);
  return { year, champion, runnerUp, third: winnerOf(matches.find(m => m.stage === '3rd-place-match')), goals, matches, groups };
}

// ---------- Wikipedia helpers ----------
/** Teams of a {{#invoke:Sports table}} block: order, names and W/D/L/GF/GA. */
function sportsTable(block) {
  const field = k => block.match(new RegExp(`\\|\\s*${k}\\s*=([^|\\n]*)`))?.[1]?.trim() ?? '';
  const order = field('team_order').split(',').map(s => s.trim()).filter(Boolean);
  return order.map(id => {
    const raw = block.match(new RegExp(`\\|\\s*name_${id}\\s*=([^\\n|]*(?:\\{\\{[^}]*\\}\\})?)`))?.[1] ?? '';
    const code = raw.replace(/<!--[\s\S]*?-->/g, '').match(/\{\{fb\|([A-Z]{3})/)?.[1] ?? null;
    const n = k => Number(field(`${k}_${id}`)) || 0;
    const w = n('win'), d = n('draw'), l = n('loss');
    return { code, w, d, l, gf: n('gf'), ga: n('ga'), p: w + d + l, pts: 3 * w + d };
  });
}

/** Rows of a wikitable starting after `from`, as cell strings (rowspans are carried over by the reader). */
function tableRows(w, from) {
  const i = w.indexOf(from);
  if (i < 0) return [];
  const start = w.indexOf('{|', i), end = w.indexOf('\n|}', start);
  return w.slice(start, end).split(/\n\|-[^\n]*/).slice(1).map(r => r.split('\n').filter(l => /^[|!]/.test(l))
    .flatMap(l => l.replace(/^[|!]/, '').split(/\s*(?:\|\||!!)\s*/))
    .map(c => c.replace(/^\s*(?:style|align|rowspan|colspan|class)[^|[{]*\|(?!\|)/i, '').trim()));
}

/** "26–27 March 2027", "29 September – 2 October 2027", "8 June {{snd}} 21 July" → first and last day. */
function span(text, year) {
  const t = unwiki(text.replace(/\{\{(?:snd|ndash|endash|spaced ndash|–)\}\}/g, ' – '));
  const y = Number(t.match(/\b(20\d\d)\b/)?.[1]) || year;
  const [left, right] = t.replace(/\b20\d\d\b/g, '').split(/\s*[–-]\s*/).map(s => s.trim());
  const last = parseDate(`${right || left} ${y}`, y);
  if (!last) return null;
  const month = (right || left).match(/[A-Z][a-z]+/)?.[0] ?? '';
  const first = right ? parseDate(/[A-Z][a-z]+/.test(left) ? `${left} ${y}` : `${left} ${month} ${y}`, y) : last;
  return first ? { from: iso(Date.UTC(first.y, first.m - 1, first.d)), to: iso(Date.UTC(last.y, last.m - 1, last.d)) } : null;
}

// ---------- Next Euro and its qualifiers ----------
async function euro() {
  // The next edition: the first Euro page from this year on (every four years from 2028)
  const year = 2028 + Math.max(0, Math.ceil((Y - 2028) / 4)) * 4;
  const [w, q] = await Promise.all([wikitext(`UEFA Euro ${year}`), wikitext(`UEFA Euro ${year} qualifying`)]);
  if (!w) return null;
  const box = k => w.match(new RegExp(`\\|\\s*${k}\\s*=([^\\n]*)`))?.[1] ?? '';
  const dates = span(`${box('dates')} ${year}`, year);
  const hosts = ['country', 'country2', 'country3', 'country4', 'country5'].map(k => unwiki(box(k))).filter(Boolean);
  // Host stadiums from the location map: label, coordinates, stadium
  const map = w.match(/\{\{OSM Location map[\s\S]*?\}\}\}\}/)?.[0] ?? w.match(/\{\{OSM Location map[\s\S]*?\n/)?.[0] ?? '';
  const venues = [...map.matchAll(/label(\d+)='''\[\[(?:[^\]|]+\|)?([^\]]+)\]\]'''\|mark-coord\1=\{\{coord\|([-\d.]+)\|([-\d.]+)\}\}/g)].map(m => {
    const stadium = map.match(new RegExp(`mark-description${m[1]}=\\[\\[(?:[^\\]|]+\\|)?([^\\]]+)\\]\\]`))?.[1] ?? '';
    return { city: m[2], stadium, loc: [Number(m[4]), Number(m[3])] };
  });
  const opening = w.match(/opening match[^.]*?at \[\[([^\]|]+)[^.]*?on (\d{1,2} \w+ \d{4})/);
  const finalM = w.match(/final (?:will be|is set to be|is scheduled to be) (?:played|held) at \[\[([^\]|]+)(?:\|[^\]]+)?\]\][^.]*?(?:on (\d{1,2} \w+ \d{4}))?/i);

  let qualifying = null;
  if (q) {
    const rows = tableRows(q, '==Schedule==');
    let stage = '';
    const schedule = rows.map(r => {
      const cells = r.map(unwiki).filter(Boolean);
      if (/qualifying group stage|play-offs/i.test(r.join(' '))) stage = /play/i.test(r.join(' ')) ? 'Play-offs' : 'Group stage';
      const dateCell = cells[cells.length - 1];
      const label = cells.find(c => /matchday|semi|final/i.test(c) && c !== dateCell) ?? '';
      const s = span(dateCell, year - 1);
      return s ? { stage, label, ...s } : null;
    }).filter(Boolean);
    const drawM = q.match(/draw will take place on (\d{1,2} \w+ \d{4}) in \[\[([^\]|]+)/) ?? q.match(/draw (?:took|was held) place on (\d{1,2} \w+ \d{4}) in \[\[([^\]|]+)/);
    const draw = drawM ? (() => { const d = parseDate(drawM[1], year - 2); return d ? { date: iso(zoned(d.y, d.m, d.d, 18, 0, 'Europe/Rome')), approxTime: true, place: drawM[2], done: /took|was held/.test(drawM[0]) } : null; })() : null;
    const groupsSec = q.slice(q.indexOf('==Groups=='), q.indexOf('==Play-offs=='));
    const groups = [...groupsSec.matchAll(/===\s*Group ([A-Z])\s*===\s*\n(\{\{#invoke:Sports table[\s\S]*?\n\}\})/g)].map(m => ({ name: `Group ${m[1]}`, teams: sportsTable(m[2]) }));
    const pots = [...q.slice(q.indexOf('==Draw=='), q.indexOf('==Groups==')).matchAll(/===\s*(Pot [^=]+?)\s*===\s*\n([\s\S]*?)(?=\n\||\n===|\n\{\||$)/g)]
      .map(m => ({ pot: m[1], teams: [...m[2].matchAll(/\{\{fb\|([A-Z]{3})\}\}\s*(\([^)]*\))?/g)].map(t => ({ code: t[1], note: t[2]?.replace(/[()]/g, '') ?? null })) })).filter(p => p.teams.length);
    qualifying = { draw, schedule, groups: groups.filter(g => g.teams.some(t => t.code)), pots };
  }
  return {
    year, from: dates?.from ?? null, to: dates?.to ?? null, hosts, venues,
    opening: opening ? { venue: opening[1], date: (() => { const d = parseDate(opening[2], year); return d ? iso(zoned(d.y, d.m, d.d, 21, 0, 'Europe/Rome')) : null; })() } : null,
    final: finalM ? { venue: finalM[1] } : null,
    holder: unwiki(w.match(/\[\[([^\]|]+?) national football team\|[^\]]+\]\] are the defending champions/)?.[1] ?? ''),
    qualifying,
  };
}

// ---------- Next World Cup ----------
async function nextWorldCup() {
  const year = 2030 + Math.max(0, Math.ceil((Y - 2030) / 4)) * 4;
  const w = await wikitext(`${year} FIFA World Cup`);
  if (!w) return null;
  const box = k => w.match(new RegExp(`\\|\\s*${k}\\s*=([^\\n]*)`))?.[1] ?? '';
  const dates = span(`${box('dates')} ${year}`, year);
  const hosts = ['country', 'country2', 'country3', 'country4'].map(k => unwiki(box(k))).filter(Boolean);
  const centenary = [...(w.match(/centenary match co-host[\s\S]{0,0}/) ? w.matchAll(/\{\{fb\|([A-Z]{3})\}\} \(centenary match co-host\)/g) : [])].map(m => m[1]);
  // How each confederation qualifies, once announced: the first paragraph of each "===== X =====" section
  const formats = [...w.matchAll(/=====\s*([A-Z]+)\s*=====\s*\n([\s\S]*?)(?=\n=====|\n====[^=]|\n===[^=])/g)].map(m => ({
    conf: m[1], text: unwiki(m[2].split('\n').filter(l => l.trim() && !l.startsWith('<!--')).join(' ')).replace(/^(.{0,1100}\.)\s.*$/s, '$1'),
  })).filter(f => f.text);
  const qualified = [...w.slice(w.indexOf('===Qualification==='), w.indexOf('====Format changes====')).replace(/<!--[\s\S]*?-->/g, '').matchAll(/\{\{fb\|([A-Z]{3})\}\}\s*(\([^)]*\))?/g)].map(m => ({ code: m[1], note: m[2]?.replace(/[()]/g, '') ?? null }));
  return { year, from: dates?.from ?? null, to: dates?.to ?? null, hosts, centenary, qualified, formats };
}

export async function collectFootball() {
  const lastWc = 2026 + Math.floor((Y - 2026) / 4) * 4;
  const [wc, eu, next] = await Promise.all([worldCup(lastWc), euro(), nextWorldCup()]);
  return { updated: new Date().toISOString(), worldCup: wc, euro: eu, nextWorldCup: next };
}
