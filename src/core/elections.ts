// US elections: the shape of public/data/elections.json (scripts/collect/elections.mjs)
// and the fixed facts of election night.

export interface Chamber { total: number; dem: number; demSeats: number; gopSeats: number; p10: number; p90: number; median: number; hist: [number, number][]; trend: { dem: number; seats: number }[]; notUp?: { D: number; R: number } }
export interface ModelRace {
  id: string; office: 'senate' | 'house' | 'governor'; st: string; state: string; district: number | null; name: string;
  dem: string; gop: string; incParty: 'D' | 'R' | null; open: boolean; marquee: boolean;
  /** Democratic lead in points (negative = Republican) and the 80% range */
  margin: number; lo: number; hi: number; pDem: number; poll: number | null; polls: number; trend: number[];
}
export interface PollAverage {
  title: string; a: { label: string; value: number }; b: { label: string; value: number }; margin: number; marginText: string; marginDefinition: string;
  updated: string; n: number; url: string; series: { d: string; a: number; b: number }[];
  latest: { pollster: string; date: string; n: number; type: string; a: number; b: number; margin: number }[];
}
export interface SilverSeries { series: { d: string; a: number; b: number }[]; updated: string | null }
export interface ElectionData {
  cycle: number; electionDay: string; updated: string; status: Record<string, string>;
  senate: { current: { D: number; R: number }; majority: number };
  house: { majority: number };
  model: { updated: string; sims: number; chambers: Record<'senate' | 'house' | 'governor', Chamber>; races: ModelRace[]; safeHouse: { D: number; R: number }; url: string } | null;
  polls: Partial<Record<'approval' | 'generic' | 'track' | 'vance' | 'y2028', PollAverage>> | null;
  silver: { approval?: SilverSeries; generic?: SilverSeries; issues?: { date: string; net: Record<string, number> }; url: string } | null;
  ratings: { names: Record<string, string>; senate: Record<string, Record<string, string>>; governor: Record<string, Record<string, string>>; totals: Record<string, Record<string, { democrat: number; republican: number; tossup: number }>>; asOf: string | null } | null;
  calendar: { date: string; title: string; kind: string; civicId?: number }[] | null;
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
export const ELECTION_NIGHT = { from: Date.parse('2026-11-03T12:00:00+01:00'), to: Date.parse('2026-11-05T12:00:00+01:00') };
/** Results stay on the page for a month after the vote, while the last races are counted. */
export const RESULTS_WINDOW = { from: ELECTION_NIGHT.from, to: Date.parse('2026-12-05T00:00:00+01:00') };

export const fmtMargin = (m: number) => (Math.abs(m) < 0.05 ? 'Even' : `${m >= 0 ? 'D' : 'R'}+${Math.abs(Math.round(m * 10) / 10)}`);
export const pct = (p: number) => `${Math.round(p * 100)}%`;

/** When the last polls close in each state, Eastern Time on election night. */
const CLOSE_ET: Record<string, string> = {
  IN: '19:00', KY: '19:00', GA: '19:00', VA: '19:00', SC: '19:00', VT: '19:00', FL: '20:00', NC: '19:30', OH: '19:30', WV: '19:30',
  ME: '20:00', MI: '21:00', PA: '20:00', NH: '20:00', TX: '21:00', IL: '20:00', MA: '20:00', AL: '20:00', CT: '20:00', DE: '20:00', DC: '20:00', MD: '20:00',
  MS: '20:00', MO: '20:00', NJ: '20:00', OK: '20:00', RI: '20:00', TN: '20:00', AR: '20:30',
  AZ: '21:00', NY: '21:00', CO: '21:00', MN: '21:00', WI: '21:00', IA: '21:00', KS: '21:00', NE: '21:00', LA: '21:00', NM: '21:00', SD: '21:00', ND: '21:00', WY: '21:00',
  MT: '22:00', NV: '22:00', UT: '22:00', ID: '23:00', CA: '23:00', OR: '23:00', WA: '23:00', HI: '00:00', AK: '01:00',
};

/** Epoch ms when all polls in a state (two-letter code) have closed. */
export function pollsClose(st: string): number | null {
  const et = CLOSE_ET[st];
  if (!et) return null;
  const nextDay = et === '00:00' || et === '01:00';
  return Date.parse(`2026-11-0${nextDay ? 4 : 3}T${et}:00-05:00`);
}

export const STATE_NAME: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts',
  MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

/** The model's rating bands: under 2 points toss-up, 2–6 lean, 6–12 likely, 12+ safe. */
export function ratingOf(margin: number): { label: string; score: number } {
  const a = Math.abs(margin), side = margin >= 0 ? 'D' : 'R', sign = margin >= 0 ? 1 : -1;
  if (a < 2) return { label: 'Toss-up', score: 0 };
  if (a < 6) return { label: `Lean ${side}`, score: sign };
  if (a < 12) return { label: `Likely ${side}`, score: 2 * sign };
  return { label: `Safe ${side}`, score: 3 * sign };
}

/** A forecaster's label ("Lean D", "Tossup", "59% D") as a score from -3 to 3. */
export function scoreOf(label: string | undefined): number | null {
  if (!label) return null;
  const m = label.match(/^(\d+)% D$/);
  if (m) { const p = Number(m[1]); return p >= 85 ? 3 : p >= 65 ? 2 : p >= 55 ? 1 : p > 45 ? 0 : p > 35 ? -1 : p > 15 ? -2 : -3; }
  const l = label.toLowerCase();
  const side = /\bd\b|dem/.test(l) ? 1 : /\br\b|rep|gop/.test(l) ? -1 : 0;
  const lvl = /safe|solid/.test(l) ? 3 : /likely/.test(l) ? 2 : /lean/.test(l) ? 1 : /tilt/.test(l) ? 0.5 : 0;
  return side * lvl;
}
