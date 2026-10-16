// Formula 1 from ESPN only: every session of the season with its real start time and
// running or final order, cancelled rounds, and both championships with points per
// round. The current weekend is refreshed every minute. ESPN JSON is untyped, read as `any`.
import { getJSON } from '../core/fetcher';
import { MIN } from '../core/time';
import type { ObsEvent } from '../core/types';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/racing/f1';

const SESSION: Record<string, { name: string; weight: 1 | 2 | 3 }> = {
  FP1: { name: 'Practice 1', weight: 1 }, FP2: { name: 'Practice 2', weight: 1 }, FP3: { name: 'Practice 3', weight: 1 },
  SS: { name: 'Sprint Qualifying', weight: 1 }, SR: { name: 'Sprint', weight: 2 }, Qual: { name: 'Qualifying', weight: 2 }, Race: { name: 'Race', weight: 3 },
};

/** Circuit coordinates by ESPN city, for the map. [longitude, latitude] */
const CIRCUIT_LOC: Record<string, [number, number]> = {
  melbourne: [144.97, -37.85], shanghai: [121.22, 31.34], suzuka: [136.54, 34.84], sakhir: [50.51, 26.03], jeddah: [39.1, 21.63],
  florida: [-80.24, 25.96], montreal: [-73.52, 45.5], 'monte carlo': [7.42, 43.73], barcelona: [2.26, 41.57], spielberg: [14.76, 47.22],
  silverstone: [-1.02, 52.07], stavelot: [5.97, 50.44], budapest: [19.25, 47.58], zandvoort: [4.54, 52.39], monza: [9.28, 45.62],
  madrid: [-3.62, 40.46], baku: [49.84, 40.37], 'kuala lumpur': [101.74, 2.76], singapore: [103.86, 1.29], austin: [-97.64, 30.13],
  'mexico city': [-99.09, 19.4], 'sao paulo': [-46.7, -23.7], nevada: [-115.17, 36.11], lusail: [51.45, 25.49], 'abu dhabi': [54.6, 24.47],
};

export interface F1Session { key: string; name: string; start: number; state: 'pre' | 'in' | 'post'; detail: string; order: string[] }
export interface F1Race { id: string; round: number; name: string; short: string; code: string; circuit: string; city: string; country: string; cancelled: boolean; sessions: F1Session[] }
export interface F1Standing { rank: number; name: string; abbr?: string; points: number; perRace: (number | null)[] }
export interface F1Data { season: number; races: F1Race[]; codes: string[]; drivers: F1Standing[]; constructors: F1Standing[] }

// Title sponsors change rarely; strip them so "MSC Cruises United States Grand Prix" reads "United States GP".
const SPONSORS = /^(?:Qatar Airways|Heineken|Aramco|Gulf Air|STC|Crypto\.com|Lenovo|MSC Cruises|Pirelli|Moët & Chandon|Chandon|AWS|Tag Heuer|TAG Heuer|Singapore Airlines|Etihad Airways|Louis Vuitton|Rolex|Formula 1)\s+/i;
const shortGp = (name: string) => name.replace(SPONSORS, '').replace(SPONSORS, '').replace(/ in [A-Z][a-z]+$/, m => m).replace('Grand Prix', 'GP');

function sessionsOf(e: any): F1Session[] {
  return (e.competitions ?? []).map((c: any) => {
    const abbr = c.type?.abbreviation ?? 'Session';
    return {
      key: abbr,
      name: SESSION[abbr]?.name ?? abbr,
      start: Date.parse(c.date),
      state: (c.status?.type?.state ?? 'pre') as F1Session['state'],
      detail: c.status?.type?.shortDetail ?? '',
      order: [...(c.competitors ?? [])].sort((a: any, b: any) => (a.order ?? 99) - (b.order ?? 99)).map((x: any) => x.athlete?.displayName ?? '?'),
    };
  }).sort((a: F1Session, b: F1Session) => a.start - b.start);
}

function standingRows(entries: any[], codes: string[]): F1Standing[] {
  return entries.map((e: any) => {
    const stat = (n: string) => e.stats?.find((s: any) => s.name === n)?.displayValue;
    return {
      rank: Number(stat('rank')) || 0,
      name: e.athlete?.displayName ?? e.team?.displayName ?? '',
      abbr: e.athlete?.abbreviation,
      points: Number(stat('championshipPts') ?? stat('points')) || 0,
      perRace: codes.map(c => { const v = stat(c); return v === undefined || v === '' || v === '-' ? null : Number(v); }),
    };
  }).sort((a, b) => a.rank - b.rank);
}

export async function f1Data(): Promise<{ data: F1Data; events: ObsEvent[] }> {
  const season = new Date().getFullYear();
  const [year, current, st] = await Promise.all([
    getJSON<any>(`${SITE}/scoreboard?dates=${season}`, 10 * MIN),
    getJSON<any>(`${SITE}/scoreboard`, 50e3),
    getJSON<any>('https://site.api.espn.com/apis/v2/sports/racing/f1/standings', 10 * MIN),
  ]);
  // The current weekend comes from the live scoreboard (fresh every minute)
  const live = new Map<string, any>((current.events ?? []).map((e: any) => [String(e.id), e]));
  const races: F1Race[] = (year.events ?? []).map((e0: any, i: number) => {
    const e = live.get(String(e0.id)) ?? e0;
    const v = e.circuit ?? e.competitions?.[0]?.venue ?? {};
    const sessions = sessionsOf(e);
    const cancelled = /cancel/i.test(e.competitions?.[0]?.status?.type?.description ?? e.status?.type?.description ?? '') || /cancel/i.test(e.competitions?.[0]?.status?.type?.shortDetail ?? '');
    return { id: String(e.id), round: i + 1, name: e.name, short: shortGp(e.name), code: '', circuit: v.fullName ?? '', city: v.address?.city ?? '', country: v.address?.country ?? '', cancelled, sessions };
  });
  // Standings columns are three-letter race codes in calendar order (AUS, CHN, ...)
  const driverEntries = st.children?.find((c: any) => /driver/i.test(c.name))?.standings?.entries ?? [];
  const codes: string[] = (driverEntries[0]?.stats ?? []).map((s: any) => s.name).filter((n: string) => /^[A-Z]{3}$/.test(n));
  races.forEach((r, i) => { r.code = codes[i] ?? ''; });
  const drivers = standingRows(driverEntries, codes);
  const constructors = standingRows(st.children?.find((c: any) => /constructor/i.test(c.name))?.standings?.entries ?? [], codes);

  const events: ObsEvent[] = races.filter(r => !r.cancelled).flatMap(r => r.sessions.map(s => ({
    id: `f1:${season}:${r.round}:${s.key}`,
    passion: 'f1' as const,
    title: s.key === 'Race' ? r.short : `${r.short} · ${s.name}`,
    sub: s.order.length && s.state !== 'pre' ? `P1 ${s.order[0]}${s.order[1] ? ' · P2 ' + s.order[1] : ''}${s.order[2] ? ' · P3 ' + s.order[2] : ''}` : `F1 · Round ${r.round}`,
    start: s.start,
    state: s.state,
    clock: s.state === 'in' ? s.detail || 'LIVE' : undefined,
    weight: SESSION[s.key]?.weight ?? 1,
    place: `${r.circuit}, ${r.city}`,
    loc: CIRCUIT_LOC[r.city.toLowerCase()],
    f1Live: true,
  })));
  return { data: { season, races, codes, drivers, constructors }, events };
}
