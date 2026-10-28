// Shape of public/data/olympics.json (scripts/collect/olympics.mjs) and its calendar events.
import { getJSON } from '../core/fetcher';
import { MIN } from '../core/time';
import type { ObsEvent } from '../core/types';

export type Season = 'Summer' | 'Winter';
export interface Calendar { days: string[]; sports: { name: string; marks: (number | null)[]; golds: number }[] }
export interface Games { year: number; season: Season; host: string | null; opening: string | null; closing: string | null; openingTime?: string | null; events: string; calendar: Calendar | null }
export interface MedalRow { code: string; gold: number; silver: number; bronze: number; total: number; rank: number }
export interface Medalist { medal: 'gold' | 'silver' | 'bronze'; name: string; sport: string; event: string; date: string | null }
export interface ItalyAt { year: number; season: Season; competitors: { sport: string; men: number; women: number; total: number }[]; how: Record<string, string>; medalists: Medalist[]; total: number }
export interface Qualification { sport: string; page: boolean; nations?: number; places?: number; italy?: number; timeline?: { discipline: string | null; event: string; dates: string; start: string; place: string }[] }
export interface Edition {
  next: Games;
  italy: ItalyAt | null;
  qualification: Qualification[];
  last: (Games & { medals: { year: number; host: string; nations: number; rows: MedalRow[] } | null; italy: { medalists: Medalist[]; total: number } | null }) | null;
}
export interface OlympicsData { updated: string; summer: Edition; winter: Edition }

export const loadOlympics = () => getJSON<OlympicsData>(`${import.meta.env.BASE_URL}data/olympics.json`, 10 * MIN);

const name = (g: Games) => `${g.host?.split(',')[0] ?? ''} ${g.year}`.trim();

/** Calendar: opening and closing ceremonies, and the start of the qualifiers that hand out places. */
export function olympicsEvents(d: OlympicsData): ObsEvent[] {
  const out: ObsEvent[] = [];
  for (const e of [d.summer, d.winter]) {
    const g = e.next;
    if (g.openingTime) out.push({ id: `oly:${g.year}:${g.season}:open`, passion: 'oly', title: `${name(g)} · Opening ceremony`, sub: `${g.season} Olympics`, start: Date.parse(g.openingTime), state: 'pre', weight: 3, approx: true, place: g.host ?? undefined });
    if (g.closing) out.push({ id: `oly:${g.year}:${g.season}:close`, passion: 'oly', title: `${name(g)} · Closing ceremony`, sub: `${g.season} Olympics`, start: Date.parse(g.closing) + 18 * 3600e3, state: 'pre', weight: 2, approx: true, place: g.host ?? undefined });
    const seen = new Set<string>();
    e.qualification.forEach(q => q.timeline?.forEach(t => {
      if (seen.has(t.event)) return;
      seen.add(t.event);
      out.push({ id: `oly:q:${g.year}:${t.event}`, passion: 'oly', title: `${t.event}`, sub: `${q.sport} · Olympic qualifier for ${name(g)}`, start: Date.parse(t.start) + 9 * 3600e3, state: 'pre', weight: 1, approx: true, place: t.place });
    }));
  }
  return out;
}

/** IOC country codes → names, for the medal tables. */
export const NOC: Record<string, string> = {
  USA: 'United States', CHN: 'China', JPN: 'Japan', AUS: 'Australia', FRA: 'France', NED: 'Netherlands', GBR: 'Great Britain', KOR: 'South Korea', ITA: 'Italy', GER: 'Germany',
  NZL: 'New Zealand', CAN: 'Canada', UZB: 'Uzbekistan', HUN: 'Hungary', ESP: 'Spain', SWE: 'Sweden', KEN: 'Kenya', NOR: 'Norway', IRL: 'Ireland', BRA: 'Brazil', IRI: 'Iran',
  UKR: 'Ukraine', ROU: 'Romania', GEO: 'Georgia', BEL: 'Belgium', BUL: 'Bulgaria', SRB: 'Serbia', CZE: 'Czechia', DEN: 'Denmark', AZE: 'Azerbaijan', CRO: 'Croatia', CUB: 'Cuba',
  BRN: 'Bahrain', SLO: 'Slovenia', TPE: 'Chinese Taipei', AUT: 'Austria', HKG: 'Hong Kong', PHI: 'Philippines', ALG: 'Algeria', INA: 'Indonesia', ISR: 'Israel', POL: 'Poland',
  KAZ: 'Kazakhstan', JAM: 'Jamaica', RSA: 'South Africa', THA: 'Thailand', ETH: 'Ethiopia', SUI: 'Switzerland', ECU: 'Ecuador', POR: 'Portugal', GRE: 'Greece', ARG: 'Argentina',
  EGY: 'Egypt', TUN: 'Tunisia', FIN: 'Finland', EST: 'Estonia', LAT: 'Latvia', SVK: 'Slovakia', AIN: 'Individual Neutral Athletes', MEX: 'Mexico', TUR: 'Türkiye', IND: 'India',
};
