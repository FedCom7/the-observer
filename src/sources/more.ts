// Shape of public/data/more.json (scripts/collect/more.mjs) and its calendar events:
// MotoGP, Formula 2 and 3, WRC, the Indianapolis and Daytona 500, the Vendée Globe.
import { getJSON } from '../core/fetcher';
import { MIN } from '../core/time';
import type { ObsEvent } from '../core/types';

export interface MgpSession { cls: 'MotoGP' | 'Moto2' | 'Moto3'; key: string; name: string; start: string }
export interface MgpPodium { pos: number; name: string; nation: string; team: string }
export interface MgpRound { id: string; round: number; name: string; sponsor: string; circuit: string; city: string; country: string; loc: [number, number] | null; start: string; end: string; status: string; sessions: MgpSession[]; results: { race: MgpPodium[]; sprint: MgpPodium[] } | null }
export interface MgpRider { pos: number; name: string; number: number | null; nation: string; team: string; constructor: string; points: number; wins: number; podiums: number; sprintWins: number }
export interface MotoGP { season: number; rounds: MgpRound[]; riders: MgpRider[]; moto2: MgpRider[]; moto3: MgpRider[] }

export interface FeederRound { round: number; name: string; city: string; slug: string | null; start: string | null; end: string | null; sessions: { name: string; start: string }[]; url: string }
export interface Feeder { series: 'F2' | 'F3'; season: number; races: ('SR' | 'FR')[]; rounds: FeederRound[]; drivers: { pos: number; name: string; points: number; perRace: (number | null)[] }[] }

export interface WrcRound { round: number; name: string; country: string; hq: string; surface: string; start: string; end: string; winner: { driver: string; nation: string; codriver: string; team: string } | null }
export interface Wrc { season: number; rounds: WrcRound[]; drivers: { pos: number; name: string; nation: string; points: number }[] }

export interface Next { year: number; start: string; tbc: boolean; approxTime: boolean }
export interface Classic { id: 'indy500' | 'daytona500'; name: string; place: string; loc: [number, number]; next: Next; past: { year: number; date: string; podium: { name: string; nation: string }[] }[] }
export interface Vendee { id: 'vendee'; name: string; place: string; loc: [number, number]; next: Next; winners: { year: number; edition: string; winner: string; nation: string; boat: string; days: number | null }[] }

export interface MoreData { updated: string; motogp: MotoGP | null; f2: Feeder | null; f3: Feeder | null; wrc: Wrc | null; classics: Classic[]; vendee: Vendee | null }

export const loadMore = () => getJSON<MoreData>(`${import.meta.env.BASE_URL}data/more.json`, 10 * MIN);

const FEEDER_LOC: Record<string, [number, number]> = {
  Melbourne: [144.97, -37.85], 'Miami Gardens': [-80.24, 25.96], 'Montréal': [-73.52, 45.5], 'Monte Carlo': [7.42, 43.73], Barcelona: [2.26, 41.57],
  Spielberg: [14.76, 47.22], Silverstone: [-1.02, 52.07], 'Spa-Francorchamps': [5.97, 50.44], Budapest: [19.25, 47.58], Monza: [9.28, 45.62],
  Madrid: [-3.62, 40.46], Baku: [49.84, 40.37], Lusail: [51.45, 25.49], 'Yas Marina': [54.6, 24.47], Sakhir: [50.51, 26.03], Jeddah: [39.1, 21.63], Imola: [11.71, 44.34],
};

/** Calendar: the races of each series and the big days; practice stays on the page. */
export function moreEvents(d: MoreData): ObsEvent[] {
  const out: ObsEvent[] = [];
  const g = d.motogp;
  g?.rounds.forEach(r => r.sessions.filter(s => s.key === 'RAC' || (s.cls === 'MotoGP' && (s.key === 'SPR' || s.key === 'Q2'))).forEach(s => {
    const big = s.cls === 'MotoGP' && s.key === 'RAC';
    const win = big ? r.results?.race?.[0] : s.key === 'SPR' ? r.results?.sprint?.[0] : undefined;
    out.push({
      id: `more:mgp:${g.season}:${r.round}:${s.cls}:${s.key}`, passion: 'more',
      title: `${s.cls === 'MotoGP' ? 'MotoGP' : s.cls} · ${r.name}${s.key === 'RAC' ? '' : ` · ${s.name}`}`,
      sub: win ? `Won by ${win.name}` : `Round ${r.round} · ${r.circuit}`,
      start: Date.parse(s.start), state: 'pre', weight: big ? 2 : 1, place: r.circuit, loc: r.loc ?? undefined, link: 'https://www.motogp.com/en/calendar',
    });
  }));
  for (const f of [d.f2, d.f3]) f?.rounds.forEach(r => r.sessions.filter(s => /race/i.test(s.name)).forEach(s => out.push({
    id: `more:${f.series.toLowerCase()}:${f.season}:${r.round}:${s.name}`, passion: 'more', title: `${f.series} · ${r.name} · ${s.name}`, sub: `Round ${r.round} · ${r.city}`,
    start: Date.parse(s.start), state: 'pre', weight: 1, place: r.city, loc: FEEDER_LOC[r.city], link: r.url,
  })));
  d.wrc?.rounds.forEach(r => out.push({
    id: `more:wrc:${d.wrc!.season}:${r.round}`, passion: 'more', title: `WRC · ${r.name}`, sub: r.winner ? `Won by ${r.winner.driver}` : `Round ${r.round} · ${r.surface} · ${r.hq}`,
    start: Date.parse(r.start), state: 'pre', weight: 1, approx: true, place: r.hq,
  }));
  d.classics.forEach(c => out.push({
    id: `more:${c.id}:${c.next.year}`, passion: 'more', title: `${c.next.year} ${c.name}`, sub: c.past[0] ? `${c.past[0].year} winner: ${c.past[0].podium[0]?.name}` : undefined,
    start: Date.parse(c.next.start), state: 'pre', weight: 3, approx: c.next.approxTime, tbc: c.next.tbc, place: c.place, loc: c.loc,
  }));
  const v = d.vendee;
  if (v) out.push({
    id: `more:vendee:${v.next.year}`, passion: 'more', title: `Vendée Globe ${v.next.year}–${String(v.next.year + 1).slice(2)} · start`, sub: v.winners[0] ? `Last winner: ${v.winners[0].winner}` : undefined,
    start: Date.parse(v.next.start), state: 'pre', weight: 3, approx: true, tbc: v.next.tbc, place: v.place, loc: v.loc, link: 'https://www.vendeeglobe.org/en',
  });
  return out;
}
