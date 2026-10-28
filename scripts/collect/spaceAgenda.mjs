// AstronauticAgenda, a public Google Calendar kept by Italian space enthusiasts: the ISS traffic
// plan months ahead (dockings, undockings, reentries), numbered spacewalks, NASA broadcasts and
// deep-space milestones. Launches are left out (Launch Library has them, with more detail).
import { get, zoned } from './lib.mjs';

const ICS = 'https://calendar.google.com/calendar/ical/upsmpeobd4tral5bke7vtadle8%40group.calendar.google.com/public/basic.ics';
const DAY = 86400e3;

/** Italian titles → English: the kind of event and the rest of the title. */
const KINDS = [
  [/^(attracco|docking|arrivo)\s+/i, 'dock', 'Docking'],
  [/^rilascio e rientro\s+/i, 'undock', 'Undocking and reentry'],
  [/^(undocking|distacco|sgancio|rilascio)\s+/i, 'undock', 'Undocking'],
  [/^(splashdown|ammaraggio)\s+/i, 'landing', 'Splashdown'],
  [/^(rientro|atterraggio)\s+/i, 'landing', 'Reentry'],
  [/^eva\b\s*/i, 'eva', 'Spacewalk'],
  [/^(nasa live|astronauticast|diretta)\b:?\s*/i, 'broadcast', ''],
  [/^(flyby|bepicolombo|solar orbiter|arrivo di|europa clipper|lucy|juice|psyche|parker)/i, 'deep', ''],
];
const SKIP = /^(lancio|contatto ariss|fine sessione|inizio sessione|evento di prova)/i;

const unescape = s => s.replace(/\\n/g, '\n').replace(/\\([,;\\])/g, '$1').trim();

/** "20261126" (all day) or "20261023T180000Z" (UTC) or a Rome wall-clock time → epoch ms. */
function when(v) {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})\d{2}(Z)?)?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, z] = m;
  // All-day: midday in Rome, so the day is right in any European view; the page says "time TBC"
  if (!h) return { t: zoned(+y, +mo, +d, 12, 0, 'Europe/Rome'), allDay: true };
  return { t: z ? Date.UTC(+y, +mo - 1, +d, +h, +mi) : zoned(+y, +mo, +d, +h, +mi, 'Europe/Rome'), allDay: false };
}

/** "Progress MS-36 (97P) - Expedition 76" → "Progress MS-36"; "Dragon v2 Crew-13 (USCV-13)" → "Crew-13". */
function vehicle(rest) {
  const v = rest.replace(/\s*-\s*Expedition.*$/i, '').replace(/\s*\([^)]*\)/g, '').replace(/^Dragon v2\s+/i, '').replace(/^CST-100\s+/i, '').trim();
  return v;
}

export async function collectAgenda() {
  const text = (await get(ICS)).replace(/\r?\n[ \t]/g, '');
  const now = Date.now();
  const items = [];
  for (const block of text.split('BEGIN:VEVENT').slice(1)) {
    const field = name => block.match(new RegExp(`^${name}((?:;[^:\\n]*)?):(.*)$`, 'm'));
    const start = field('DTSTART');
    const summary = unescape(field('SUMMARY')?.[2] ?? '');
    if (!start || !summary || SKIP.test(summary)) continue;
    const w = when(start[2].trim());
    if (!w || w.t < now - 30 * DAY || w.t > now + 600 * DAY) continue;
    const kind = KINDS.find(([re]) => re.test(summary));
    if (!kind) continue;
    const rest = summary.replace(kind[0], '').trim();
    const v = ['dock', 'undock', 'landing'].includes(kind[1]) ? vehicle(rest) : null;
    // Starship test flights also "re-enter": they belong to no station
    const station = /\bship \d|starship|flight \d/i.test(summary) ? null : /shenzhou|tianzhou|tiangong/i.test(summary) ? 'Tiangong' : ['dock', 'undock', 'landing', 'eva'].includes(kind[1]) ? 'ISS' : null;
    const eva = kind[1] === 'eva' ? rest.match(/#?\s*(\d+)/)?.[1] : null;
    items.push({
      id: `agenda:${(field('UID')?.[2] ?? summary).trim()}`,
      kind: kind[1],
      name: kind[1] === 'eva' ? `${/russ|rs\b/i.test(rest) ? 'Russian' : 'US'} spacewalk${eva ? ` #${eva}` : ''}` : kind[2] ? `${kind[2]} · ${v ?? rest}` : summary,
      vehicle: v, station, eva: eva ? Number(eva) : null,
      // "Starliner-1 (senza equipaggio)": the title says when a crew vehicle flies empty
      crewed: v ? /soyuz ms|crew-|shenzhou|starliner|axiom|ax-\d/i.test(v) && !/senza equipaggio|uncrewed/i.test(summary) : null,
      date: new Date(w.t).toISOString(), allDay: w.allDay,
      description: unescape(field('DESCRIPTION')?.[2] ?? '').slice(0, 400),
      location: unescape(field('LOCATION')?.[2] ?? ''),
    });
  }
  items.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  return { at: new Date().toISOString(), items };
}

const TYPE = { dock: 'Docking', undock: 'Undocking', landing: 'Landing', eva: 'EVA', broadcast: 'NASA broadcast' };
const key = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Launch Library's upcoming events plus the agenda's, without doubles: spacewalks by number,
 * dockings and undockings by vehicle (the agenda wins, unless Launch Library has the same day
 * with a time), broadcasts by time.
 */
export function mergeEvents(ll, agenda, now = Date.now()) {
  const out = [...(ll ?? [])];
  for (const a of agenda?.items ?? []) {
    if (!(a.kind in TYPE) || Date.parse(a.date) < now - 3 * 3600e3 || (a.kind !== 'broadcast' && !a.station)) continue;
    const t = Date.parse(a.date);
    let clash = -1;
    if (a.kind === 'eva' && a.eva) clash = out.findIndex(e => new RegExp(`eva[- #]*${a.eva}\\b`, 'i').test(e.name));
    else if (a.vehicle) {
      // "Docking" also sits inside "Undocking": test the undock words first
      const kindOf = e => (/undock|unberth|depart|release/i.test(`${e.type} ${e.name}`) ? 'undock' : /dock|berth|arriv/i.test(`${e.type} ${e.name}`) ? 'dock' : /landing|splash|reentry/i.test(`${e.type} ${e.name}`) ? 'landing' : '');
      clash = out.findIndex(e => key(e.name).includes(key(a.vehicle)) && kindOf(e) === a.kind);
    } else if (a.kind === 'broadcast') clash = out.findIndex(e => /press|briefing|conference|broadcast/i.test(`${e.type} ${e.name}`) && Math.abs(Date.parse(e.date) - t) < 3 * 3600e3);
    const ev = { id: a.id, name: a.name, type: TYPE[a.kind], date: a.date, description: a.description, location: a.station ?? a.location, webcast: a.kind === 'broadcast', allDay: a.allDay, source: 'AstronauticAgenda' };
    if (clash < 0) { out.push(ev); continue; }
    if (a.kind === 'broadcast') continue;
    const sameDayWithTime = a.allDay && Math.abs(Date.parse(out[clash].date) - t) < 1.5 * DAY;
    if (sameDayWithTime) continue;
    out[clash] = ev;
    // A docking moved later leaves Launch Library's undocking and landing for that vehicle stranded before it
    if (a.kind === 'dock') for (let i = out.length - 1; i >= 0; i--) if (!out[i].source && key(out[i].name).includes(key(a.vehicle)) && Date.parse(out[i].date) < t) out.splice(i, 1);
  }
  return out.sort((x, y) => Date.parse(x.date) - Date.parse(y.date));
}
