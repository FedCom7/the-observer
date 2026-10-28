// Men's World Cup and Euros: public/data/football.json (scripts/collect/football.mjs) for the
// tournaments, plus ESPN live from the browser for Italy's matches and the Nations League,
// which seeds the Euro qualifying draw. ESPN JSON is untyped, read as `any`.
import { getJSON } from '../core/fetcher';
import { HOUR, MIN, romeAt } from '../core/time';
import type { ObsEvent } from '../core/types';
import { toEvent } from './espn';

export const ITALY = '162';
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

export interface WcSide { abbr: string; name: string; logo: string | null; score: number | null; pens: number | null; winner: boolean }
export interface WcMatch { id: string; date: string; stage: string; round: string; group: string | null; state: 'pre' | 'in' | 'post'; detail: string; home: WcSide | null; away: WcSide | null; venue: string; city: string; country: string }
export interface GroupRow { rank: number; abbr: string; name: string; logo: string | null; p: number; w: number; d: number; l: number; gd: string; pts: number }
export interface WorldCup { year: number; champion: WcSide | null; runnerUp: WcSide | null; third: WcSide | null; goals: number; matches: WcMatch[]; groups: { name: string; rows: GroupRow[] }[] }
export interface QualTeam { code: string | null; w: number; d: number; l: number; gf: number; ga: number; p: number; pts: number }
export interface Euro {
  year: number; from: string | null; to: string | null; hosts: string[]; venues: { city: string; stadium: string; loc: [number, number] }[];
  opening: { venue: string; date: string | null } | null; holder: string;
  qualifying: {
    draw: { date: string; approxTime: boolean; place: string; done: boolean } | null;
    schedule: { stage: string; label: string; from: string; to: string }[];
    groups: { name: string; teams: QualTeam[] }[];
    pots: { pot: string; teams: { code: string; note: string | null }[] }[];
  } | null;
}
export interface NextWorldCup { year: number; from: string | null; to: string | null; hosts: string[]; centenary: string[]; qualified: { code: string; note: string | null }[]; formats: { conf: string; text: string }[] }
export interface NationsGroup { name: string; rows: { rank: number; name: string; abbr: string; logo?: string; p: number; w: number; d: number; l: number; gd: string; pts: number; mine: boolean }[] }

export interface FootballData {
  updated: string; worldCup: WorldCup | null; euro: Euro | null; nextWorldCup: NextWorldCup | null;
  /** Italy, results and fixtures (ESPN, live) */
  italy: ObsEvent[];
  /** Nations League groups (ESPN) */
  nations: NationsGroup[];
}

const stat = (e: any, n: string) => e.stats?.find((s: any) => s.name === n)?.displayValue ?? '';

async function italy(): Promise<ObsEvent[]> {
  const y = new Date().getFullYear();
  const pages = await Promise.allSettled([`${SITE}/all/teams/${ITALY}/schedule?season=${y}`, `${SITE}/all/teams/${ITALY}/schedule?fixture=true`].map(u => getJSON<any>(u, 30 * MIN)));
  const seen = new Set<string>();
  return pages.flatMap(p => (p.status === 'fulfilled' ? p.value.events ?? [] : []))
    .map((e: any) => {
      const ev = toEvent(e, 'wc', 'soccer', e.league?.slug ?? 'all', ITALY);
      const friendly = /friendly/i.test(e.league?.slug ?? '');
      return { ...ev, sub: e.league?.name ?? ev.sub, weight: (friendly ? 1 : 2) as 1 | 2 };
    })
    .filter(ev => (seen.has(ev.id) ? false : (seen.add(ev.id), true)))
    .sort((a, b) => a.start - b.start);
}

async function nations(): Promise<NationsGroup[]> {
  const j = await getJSON<any>('https://site.api.espn.com/apis/v2/sports/soccer/uefa.nations/standings', HOUR);
  return (j.children ?? []).map((g: any) => ({
    name: g.name,
    rows: (g.standings?.entries ?? []).map((e: any) => ({
      rank: Number(stat(e, 'rank')) || 0, name: e.team?.shortDisplayName ?? e.team?.displayName ?? '', abbr: e.team?.abbreviation ?? '', logo: e.team?.logos?.[0]?.href,
      p: Number(stat(e, 'gamesPlayed')) || 0, w: Number(stat(e, 'wins')) || 0, d: Number(stat(e, 'ties')) || 0, l: Number(stat(e, 'losses')) || 0,
      gd: stat(e, 'pointDifferential'), pts: Number(stat(e, 'points')) || 0, mine: String(e.team?.id) === ITALY,
    })).sort((a: any, b: any) => a.rank - b.rank),
  }));
}

export async function loadFootball(): Promise<FootballData> {
  const [file, it, nl] = await Promise.allSettled([getJSON<Omit<FootballData, 'italy' | 'nations'>>(`${import.meta.env.BASE_URL}data/football.json`, 10 * MIN), italy(), nations()]);
  if (file.status === 'rejected') throw file.reason;
  return { ...file.value, italy: it.status === 'fulfilled' ? it.value : [], nations: nl.status === 'fulfilled' ? nl.value : [] };
}

/** Calendar: Italy's matches, the qualifying draw, the opening matches of the tournaments. */
export function footballEvents(d: FootballData): ObsEvent[] {
  const out: ObsEvent[] = [...d.italy];
  const q = d.euro?.qualifying;
  if (q?.draw) out.push({ id: `wc:euroq-draw:${d.euro!.year}`, passion: 'wc', title: `Euro ${d.euro!.year} qualifying draw`, sub: `${q.draw.place} · Italy in ${q.pots.find(p => p.teams.some(t => t.code === 'ITA'))?.pot ?? 'the draw'}`, start: Date.parse(q.draw.date), state: 'pre', weight: 3, approx: q.draw.approxTime, place: q.draw.place });
  const e = d.euro;
  if (e?.opening?.date) out.push({ id: `wc:euro-open:${e.year}`, passion: 'wc', title: `Euro ${e.year} opening match`, sub: e.opening.venue, start: Date.parse(e.opening.date), state: 'pre', weight: 3, approx: true, place: e.opening.venue });
  const n = d.nextWorldCup;
  if (n?.from) {
    const [y, m, dd] = n.from.slice(0, 10).split('-').map(Number);
    out.push({ id: `wc:wc-open:${n.year}`, passion: 'wc', title: `${n.year} World Cup opening match`, sub: n.hosts.join(', '), start: romeAt(y, m, dd, 21), state: 'pre', weight: 3, approx: true, tbc: true });
  }
  return out;
}

/** World Cup and Euro winners up to the last edition before the data (the collector adds the latest). */
export const WC_WINNERS: [number, string][] = [
  [1930, 'URU'], [1934, 'ITA'], [1938, 'ITA'], [1950, 'URU'], [1954, 'FRG'], [1958, 'BRA'], [1962, 'BRA'], [1966, 'ENG'], [1970, 'BRA'], [1974, 'FRG'], [1978, 'ARG'],
  [1982, 'ITA'], [1986, 'ARG'], [1990, 'FRG'], [1994, 'BRA'], [1998, 'FRA'], [2002, 'BRA'], [2006, 'ITA'], [2010, 'ESP'], [2014, 'GER'], [2018, 'FRA'], [2022, 'ARG'],
];
export const EURO_WINNERS: [number, string][] = [
  [1960, 'URS'], [1964, 'ESP'], [1968, 'ITA'], [1972, 'FRG'], [1976, 'TCH'], [1980, 'FRG'], [1984, 'FRA'], [1988, 'NED'], [1992, 'DEN'], [1996, 'GER'], [2000, 'FRA'],
  [2004, 'GRE'], [2008, 'ESP'], [2012, 'ESP'], [2016, 'POR'], [2020, 'ITA'], [2024, 'ESP'],
];

/** Country names for FIFA codes used in Wikipedia and the history tables. */
export const COUNTRY: Record<string, string> = {
  URU: 'Uruguay', ITA: 'Italy', FRG: 'West Germany', GER: 'Germany', BRA: 'Brazil', ENG: 'England', ARG: 'Argentina', FRA: 'France', ESP: 'Spain', URS: 'Soviet Union',
  TCH: 'Czechoslovakia', NED: 'Netherlands', DEN: 'Denmark', GRE: 'Greece', POR: 'Portugal', BEL: 'Belgium', CRO: 'Croatia', CZE: 'Czechia', NOR: 'Norway', SER: 'Serbia',
  SRB: 'Serbia', TUR: 'Türkiye', WAL: 'Wales', SUI: 'Switzerland', AUT: 'Austria', BIH: 'Bosnia and Herzegovina', GEO: 'Georgia', HUN: 'Hungary', ISR: 'Israel', KVX: 'Kosovo',
  NIR: 'Northern Ireland', POL: 'Poland', IRL: 'Republic of Ireland', SCO: 'Scotland', SVN: 'Slovenia', SWE: 'Sweden', UKR: 'Ukraine', MKD: 'North Macedonia', ROU: 'Romania',
  SVK: 'Slovakia', ALB: 'Albania', ISL: 'Iceland', FIN: 'Finland', MNE: 'Montenegro', BUL: 'Bulgaria', ARM: 'Armenia', AZE: 'Azerbaijan', BLR: 'Belarus', CYP: 'Cyprus',
  EST: 'Estonia', FRO: 'Faroe Islands', KAZ: 'Kazakhstan', LVA: 'Latvia', LTU: 'Lithuania', LUX: 'Luxembourg', MLT: 'Malta', MDA: 'Moldova', AND: 'Andorra', LIE: 'Liechtenstein',
  SMR: 'San Marino', GIB: 'Gibraltar', MAR: 'Morocco', PAR: 'Paraguay', RUS: 'Russia',
};
