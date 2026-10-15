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
