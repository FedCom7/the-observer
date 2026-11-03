// Live results on election night, read straight from the browser (both APIs allow it):
// - civicAPI: every Senate, governor and House race and the statewide ballot measures,
//   with votes, share reporting and the race calls.
// - Open America: the states' own official counts (22 states publish a readable feed),
//   shown next to civicAPI's numbers; it never calls races.
import { RESULTS_WINDOW, STATE_NAME } from '../core/elections';

const CIVIC = 'https://civicapi.org/api/v2';
const OA = 'https://openamerica.io/elections/results.json';

export type Side = 'D' | 'R' | 'I' | 'O';
export interface LiveCand { name: string; party: Side; votes: number; pct: number; winner: boolean; inc: boolean }
export interface LiveRace { id: number; office: 'senate' | 'governor' | 'house' | 'measure' | 'other'; kind?: string; st: string; district: number | null; name: string; reporting: number; cands: LiveCand[]; winner: Side | null; winnerName: string | null }
export interface OfficialRace { leader: string; pctIn: number; total: number; cands: { n: string; p: string; v: number; pct: number }[] }
export interface LiveData {
  fetched: number;
  senate: LiveRace[]; governor: LiveRace[]; house: LiveRace[]; measures: LiveRace[];
  official: { senate: Record<string, OfficialRace>; house: Record<string, OfficialRace>; governor: Record<string, OfficialRace>; asOf: string | null; live: boolean };
}

const sideOf = (party: string): Side => (/Democrat|DFL/i.test(party) ? 'D' : /Republican|GOP/i.test(party) ? 'R' : /Independent/i.test(party) ? 'I' : 'O');

interface CivicRace { id: number; type: string; province: string; district?: string | null; election_name: string; election_type: string; percent_reporting: number; candidates?: { name: string; party: string; votes: number; percent: number; winner: boolean; incumbent?: boolean }[] }

function toLive(r: CivicRace, office: LiveRace['office']): LiveRace {
  const cands = (r.candidates ?? []).map(c => ({ name: c.name, party: office === 'measure' ? (/^yes/i.test(c.name) ? 'D' : 'R') as Side : sideOf(c.party), votes: c.votes, pct: c.percent, winner: c.winner, inc: !!c.incumbent }))
    .sort((a, b) => b.votes - a.votes);
  const w = cands.find(c => c.winner);
  const district = office === 'house' ? Number(r.election_name.match(/US House (\d+)/)?.[1] ?? 0) || 0 : null;
  return { id: r.id, office, kind: r.type, st: r.province, district, name: r.election_name, reporting: r.percent_reporting ?? 0, cands, winner: w ? w.party : null, winnerName: w?.name ?? null };
}

async function search(query: string, date: string, offset = 0, limit = 500, by: 'query' | 'type' | 'province' = 'query'): Promise<CivicRace[]> {
  const q = new URLSearchParams({ startDate: date, endDate: date, country: 'US', [by]: query, limit: String(limit), offset: String(offset) });
  const res = await fetch(`${CIVIC}/race/search?${q}`);
  if (!res.ok) throw new Error(`civicAPI ${res.status}`);
  return (await res.json()).races ?? [];
}

async function official_(office: 'Senate' | 'House' | 'Governor') {
  const res = await fetch(`${OA}?year=${replay2024() ? 2024 : 2026}&office=${office}`);
  if (!res.ok) throw new Error(`Open America ${res.status}`);
  const j = await res.json();
  const races: Record<string, OfficialRace> = {};
  for (const [k, r] of Object.entries<{ leader: string; pct_in: number; total: number; cands: OfficialRace['cands'] }>(j.races ?? {})) races[k] = { leader: r.leader, pctIn: r.pct_in, total: r.total, cands: r.cands };
  return { races, asOf: j.as_of as string | null, live: Boolean(j.live) };
}

/** "?live=1" in the address turns the live layer on outside election night, to test it. */
export const liveForced = () => typeof location !== 'undefined' && /[?&]live=(1|2024)\b/.test(location.search);
/** "?live=2024" replays the 2024 general election from the same sources, to see the page with real results. */
const replay2024 = () => typeof location !== 'undefined' && /[?&]live=2024\b/.test(location.search);

// Each part has its own pace; a failed request keeps the last good copy (civicAPI answers 503 to bursts)
const PACE = { senate: 60e3, governor: 60e3, house: 120e3, measures: 300e3, official: 60e3 };
const cache: { [K in keyof typeof PACE]?: { at: number; v: K extends 'official' ? LiveData['official'] : LiveRace[] } } = {};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function part<K extends keyof typeof PACE>(k: K, now: number, fn: () => Promise<NonNullable<(typeof cache)[K]>['v']>) {
  const c = cache[k];
  if (c && now - c.at < PACE[k] - 5e3) return c.v;
  try {
    const v = await fn();
    (cache as Record<string, unknown>)[k] = { at: now, v };
    await sleep(400);
    return v;
  } catch {
    return c?.v ?? null;
  }
}

/** Everything counted so far. Outside the results window it returns null without any request. */
export async function loadLive(now = Date.now()): Promise<LiveData | null> {
  if ((now < RESULTS_WINDOW.from || now > RESULTS_WINDOW.to) && !liveForced()) return null;
  const day = replay2024() ? '2024-11-05' : '2026-11-03';
  // By race type: on election night civicAPI's text search times out or misses races ("US Senate" found 2 of 35)
  const senate = await part('senate', now, async () => (await search('US Senate', day, 0, 100, 'type')).filter(r => r.election_type === 'General' && r.province !== 'US').map(r => toLive(r, 'senate')));
  const governor = await part('governor', now, async () => (await search('Governor', day, 0, 200, 'type')).filter(r => r.province !== 'US' && STATE_NAME[r.province]).map(r => toLive(r, 'governor')));
  const house = await part('house', now, async () => (await search('House of Representatives', day, 0, 500, 'type')).filter(r => STATE_NAME[r.province]).map(r => toLive(r, 'house')));
  const measures = await part('measures', now, async () => {
    const seen = new Map<number, LiveRace>();
    for (const off of [0, 500]) {
      const page = await search('Referendum', day, off, 500, 'type');
      for (const r of page) if (r.election_type === 'Statewide') seen.set(r.id, toLive(r, 'measure'));
      if (page.length < 500) break;
      await sleep(400);
    }
    return [...seen.values()].sort((a, b) => a.st.localeCompare(b.st) || a.name.localeCompare(b.name, 'en', { numeric: true }));
  });
  const official = await part('official', now, async () => {
    const [sen, hou, gov] = [await official_('Senate').catch(() => null), await official_('House').catch(() => null), await official_('Governor').catch(() => null)];
    return { senate: sen?.races ?? {}, house: hou?.races ?? {}, governor: gov?.races ?? {}, asOf: hou?.asOf ?? sen?.asOf ?? null, live: Boolean(sen?.live || hou?.live) };
  });
  if (!senate && !house) throw new Error('civicAPI unavailable');
  const out: LiveData = { fetched: now, senate: senate ?? [], governor: governor ?? [], house: house ?? [], measures: measures ?? [], official: official ?? { senate: {}, house: {}, governor: {}, asOf: null, live: false } };
  if (!replay2024()) recordNight(out);
  return out;
}

export interface CountyResult { name: string; fips: string | null; reporting: number; cands: LiveCand[] }

/** Race detail with results by county, for the state map (on demand). */
export async function raceCounties(id: number): Promise<Record<string, CountyResult>> {
  return (await raceDetail(id)).counties;
}

/** One race in full: candidates with incumbents, county results, when the count last moved. */
export async function raceDetail(id: number): Promise<{ updated: string | null; pollsClose: string | null; counties: Record<string, CountyResult> }> {
  const res = await fetch(`${CIVIC}/race/${id}`);
  if (!res.ok) throw new Error(`civicAPI ${res.status}`);
  const j = await res.json();
  const counties: Record<string, CountyResult> = {};
  for (const [k, v] of Object.entries<{ name: string; fips?: string; percent_reporting: number; candidates: { name: string; party: string; votes: number; percent: number; winner: boolean }[] }>(j.region_results ?? {})) {
    counties[k] = { name: v.name, fips: v.fips ?? null, reporting: v.percent_reporting, cands: v.candidates.map(c => ({ name: c.name, party: sideOf(c.party), votes: c.votes, pct: c.percent, winner: c.winner, inc: false })) };
  }
  return { updated: j.last_updated ?? null, pollsClose: j.polls_close ?? null, counties };
}

const officeOf = (r: CivicRace): LiveRace['office'] =>
  /US Senate/.test(r.election_name) ? 'senate' : r.type === 'Governor' ? 'governor' : r.type === 'House of Representatives' ? 'house' : r.type === 'Referendum' ? 'measure' : 'other';

const stateCache: Record<string, { at: number; v: LiveRace[] }> = {};
/** Every statewide and federal race of one state (no local races), for the States screen; kept a minute. */
export async function stateRaces(st: string, now = Date.now()): Promise<LiveRace[]> {
  const c = stateCache[st];
  if (c && now - c.at < 55e3) return c.v;
  const day = replay2024() ? '2024-11-05' : '2026-11-03';
  const all: CivicRace[] = [];
  for (let off = 0; off < 2000; off += 500) {
    const page = await search(st, day, off, 500, 'province');
    all.push(...page);
    if (page.length < 500) break;
    await sleep(400);
  }
  const v = all.filter(r => r.province === st && (r.election_type === 'Statewide' || r.election_type === 'General'))
    .map(r => toLive(r, officeOf(r)));
  stateCache[st] = { at: now, v };
  return v;
}

// ---------- the night, remembered in this browser ----------
// civicAPI gives the calls but not when they came, so the app notes them as it sees them,
// with the seat count after each update and every Senate and governor race's margin.

export interface NightCall { t: number; id: number; office: LiveRace['office']; st: string; district: number | null; winner: Side; name: string }
export interface NightLog { calls: NightCall[]; seats: { t: number; s: [number, number]; h: [number, number]; g: [number, number] }[]; races: Record<number, [number, number, number][]> }
const NIGHT_KEY = 'obs-elez-night-2026';

export function nightLog(): NightLog {
  try { const j = JSON.parse(localStorage.getItem(NIGHT_KEY) ?? 'null'); if (j?.calls) return j; } catch { /* no storage */ }
  return { calls: [], seats: [], races: {} };
}

/** Democratic lead in points among the two front-runners (independents on the Democratic side). */
export function demLead(r: { cands: LiveCand[] }): number | null {
  const d = r.cands.find(c => c.party === 'D') ?? r.cands.find(c => c.party === 'I'), g = r.cands.find(c => c.party === 'R');
  if (!d && !g) return null;
  return (d?.pct ?? 0) - (g?.pct ?? 0);
}

export function recordNight(l: LiveData) {
  if (typeof localStorage === 'undefined') return;
  const log = nightLog();
  const known = new Set(log.calls.map(c => c.id));
  for (const r of [...l.senate, ...l.governor, ...l.house]) {
    if (r.winner && r.winnerName && !known.has(r.id)) log.calls.push({ t: l.fetched, id: r.id, office: r.office, st: r.st, district: r.district, winner: r.winner, name: r.winnerName });
  }
  const t = (x: LiveRace[]) => { const k = tally(x); return [k.D + k.I, k.R] as [number, number]; };
  const snap = { t: l.fetched, s: t(l.senate), h: t(l.house), g: t(l.governor) };
  const last = log.seats[log.seats.length - 1];
  if (!last || JSON.stringify([last.s, last.h, last.g]) !== JSON.stringify([snap.s, snap.h, snap.g])) log.seats.push(snap);
  for (const r of [...l.senate, ...l.governor]) {
    const m = demLead(r);
    if (m == null || r.reporting <= 0) continue;
    const h = (log.races[r.id] ??= []), p = h[h.length - 1];
    if (!p || p[2] !== r.reporting || Math.abs(p[1] - m) >= 0.05) h.push([l.fetched, Math.round(m * 10) / 10, r.reporting]);
  }
  try { localStorage.setItem(NIGHT_KEY, JSON.stringify(log)); } catch { /* full or blocked: the screens just show less */ }
}

/** Seats won so far by each side (called races only). */
export function tally(races: LiveRace[]) {
  const t = { D: 0, R: 0, I: 0, O: 0, open: 0 };
  for (const r of races) if (r.winner) t[r.winner]++; else t.open++;
  return t;
}
