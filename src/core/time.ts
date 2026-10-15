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
