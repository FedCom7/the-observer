// Shape of public/data/elections.json, written by scripts/collect/elections.mjs.
export interface Race {
  state: string;
  special: boolean;
  incumbent: string | null;
  incumbentParty: 'D' | 'R' | 'I';
  open: boolean;
  cook: string | null;
  consensus: number;
  consensusLabel: string;
  raters: Record<string, { label: string; score: number }>;
  dem?: string | null;
  rep?: string | null;
  demPct?: number | null;
  repPct?: number | null;
  margin?: number | null;
  pollsAsOf?: string | null;
  pollsUrl?: string;
  results?: RaceResults | null;
}

export interface RaceResults {
  sides: { name: string | null; party: 'D' | 'R' | 'I'; votes: number | null; pct: number | null }[];
  winner: string | null;
  reporting: number | null;
  url: string;
}

export interface ElectionData {
  cycle: number;
  updated: string;
  ratingsSource: { name: string; asOf: string | null; url: string };
  pollsSource: { name: string; url: string };
  senate: { current: { D: number; R: number }; majority: number };
  generic: { dem: number; rep: number; margin: number; asOf: string | null; source: string; url: string } | null;
  races: Race[];
  battlegrounds: Race[];
}

/** Fixed facts of election night: poll closing times in Eastern Time on 3 November 2026. */
export const CLOSINGS = [
  { et: '18:00', states: 'Indiana, Kentucky (most)', note: 'First results' },
  { et: '19:00', states: 'Georgia, Virginia, South Carolina, Vermont, Florida (most)', note: 'Georgia, South Carolina and Florida Senate' },
  { et: '19:30', states: 'North Carolina, Ohio, West Virginia', note: 'North Carolina and Ohio Senate' },
  { et: '20:00', states: 'Maine, Michigan (most), Pennsylvania, New Hampshire, Texas (most), Illinois, Massachusetts', note: 'Maine, Michigan, New Hampshire and Texas Senate' },
  { et: '21:00', states: 'Arizona, New York, Colorado, Minnesota, Wisconsin, Iowa, Kansas (most), Nebraska', note: 'Iowa, Kansas, Minnesota and Nebraska Senate' },
  { et: '22:00', states: 'Nevada, Utah, Montana', note: '' },
  { et: '23:00', states: 'California, Oregon, Washington', note: 'House control often clear around here' },
  { et: '01:00', states: 'Alaska', note: 'Alaska Senate · last polls close', nextDay: true },
];
export const FIRST_CLOSE = Date.parse('2026-11-04T00:00:00+01:00');
export const SENATE_UP = 35, HOUSE_SEATS = 435, HOUSE_MAJORITY = 218, GOVERNORS_UP = 36;

/** Senate if every polling leader wins (races without polls keep the incumbent party). */
export function senateIfPollsHold(e: ElectionData) {
  const polled = e.battlegrounds.filter(r => r.margin != null && r.dem && r.rep);
  const dFlips = polled.filter(r => r.incumbentParty === 'R' && r.margin! > 0);
  const rFlips = polled.filter(r => r.incumbentParty !== 'R' && r.margin! < 0);
  const D = e.senate.current.D + dFlips.length - rFlips.length;
  const closest = [...polled].sort((a, b) => Math.abs(a.margin!) - Math.abs(b.margin!))[0];
  return { D, R: 100 - D, dFlips, rFlips, closest, need: e.senate.majority - e.senate.current.D };
}

export const fmtMargin = (m: number) => (Math.abs(m) < 0.05 ? 'Even' : `${m >= 0 ? 'D' : 'R'}+${Math.abs(Math.round(m * 10) / 10)}`);

/** When the last polls close in each Senate battleground, Eastern Time on election night. */
const CLOSE_ET: Record<string, string> = {
  Georgia: '19:00', 'South Carolina': '19:00', Florida: '20:00', 'North Carolina': '19:30', Ohio: '19:30', 'West Virginia': '19:30',
  Maine: '20:00', Michigan: '21:00', 'New Hampshire': '20:00', Texas: '21:00', Illinois: '20:00', Massachusetts: '20:00', Pennsylvania: '20:00',
  Minnesota: '21:00', Iowa: '21:00', Kansas: '21:00', Nebraska: '21:00', Arizona: '21:00', Colorado: '21:00', Wisconsin: '21:00', 'New York': '21:00',
  Montana: '22:00', Nevada: '22:00', Utah: '22:00', California: '23:00', Oregon: '23:00', Washington: '23:00', Alaska: '01:00',
};

/** Epoch ms when all polls in a state have closed (Alaska closes after midnight Eastern). */
export function pollsClose(state: string): number | null {
  const et = CLOSE_ET[state];
  if (!et) return null;
  const nextDay = et === '01:00';
  return Date.parse(`2026-11-0${nextDay ? 4 : 3}T${et}:00-05:00`);
}

export const ELECTION_NIGHT = { from: Date.parse('2026-11-03T12:00:00+01:00'), to: Date.parse('2026-11-05T12:00:00+01:00') };
