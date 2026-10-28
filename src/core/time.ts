export const ROME = 'Europe/Rome';

export function fmt(ms: number, opts: Intl.DateTimeFormatOptions, tz = ROME): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...opts }).format(ms);
}

export const hhmm = (ms: number, tz = ROME) => fmt(ms, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, tz);
export const hhmmss = (ms: number, tz = ROME) =>
  fmt(ms, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }, tz);
export const dayShort = (ms: number) => fmt(ms, { weekday: 'short', day: 'numeric', month: 'short' });
export const dayLong = (ms: number) => fmt(ms, { weekday: 'long', day: 'numeric', month: 'long' });

/** Events between midnight and 07:00 Rome time are flagged as night viewing. */
export const isNight = (ms: number) => Number(fmt(ms, { hour: 'numeric', hourCycle: 'h23' })) < 7;

const pad = (n: number) => String(n).padStart(2, '0');

/** "4d 23:17" beyond a day, "04:55:55" within a day. */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60;
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}` : `${pad(h)}:${pad(m)}:${pad(s % 60)}`;
}

export const MIN = 60e3;
export const HOUR = 3600e3;
export const DAY = 86400e3;

/** Epoch ms of a wall-clock time in Rome (DST-aware). */
export function romeAt(y: number, m: number, d: number, h = 0): number {
  const guess = Date.UTC(y, m - 1, d, h);
  const p = new Intl.DateTimeFormat('en-US', { timeZone: ROME, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(guess);
  const v = (t: string) => Number(p.find(x => x.type === t)?.value);
  const offset = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute')) - guess;
  return guess - offset;
}

/**
 * Start of the "sports day" in Rome: 07:00. A game at 02:00 belongs to the evening before,
 * as night viewing (see isNight), so the day runs from 07:00 to 07:00.
 */
export function sportsDay(now: number): number {
  const [y, m, d] = fmt(now, { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().map(Number);
  const start = romeAt(y, m, d, 7);
  if (now >= start) return start;
  const prev = new Date(Date.UTC(y, m - 1, d) - DAY);
  return romeAt(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate(), 7);
}
