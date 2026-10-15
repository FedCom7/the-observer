import elections from '../data/elections.json';

export const ELEX = elections;

const rHeld = (seat: string) => /\(R\)|R incumbent/.test(seat);

/** Senate if every polling leader wins: current seats plus flips each way. */
export function senateIfPollsHold() {
  const races = elections.senateRaces.filter(r => r.margin !== null);
  const dFlips = races.filter(r => rHeld(r.seat) && r.margin! > 0);
  const rFlips = races.filter(r => !rHeld(r.seat) && r.margin! < 0);
  const D = elections.chambers.senate.current.D + dFlips.length - rFlips.length;
  return { D, R: 100 - D, dFlips, rFlips, closest: [...races].sort((a, b) => Math.abs(a.margin!) - Math.abs(b.margin!))[0] };
}

export function genericBallot() {
  const avgs = elections.genericBallot.averages;
  const mean = avgs.reduce((s, a) => s + a.margin, 0) / avgs.length;
  return { mean, lo: Math.min(...avgs.map(a => a.margin)), hi: Math.max(...avgs.map(a => a.margin)), avgs, asOf: elections.genericBallot.asOf };
}

export const fmtMargin = (m: number) => `${m >= 0 ? 'D' : 'R'}+${Math.abs(Math.round(m * 10) / 10)}`;
