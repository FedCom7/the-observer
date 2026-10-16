// Tennis Grand Slams from the WTA's public tournament API.
import { get, iso, zoned } from './lib.mjs';

const DAY = 86400e3;
const now = Date.now();

// ---------- Tennis: Grand Slams from the WTA's public tournament API ----------
const SLAM_PLACE = {
  'AUSTRALIAN OPEN': { title: 'Australian Open', tz: 'Australia/Melbourne', loc: [144.98, -37.82], place: 'Melbourne Park' },
  'ROLAND GARROS': { title: 'Roland Garros', tz: 'Europe/Paris', loc: [2.25, 48.85], place: 'Stade Roland Garros, Paris' },
  'WIMBLEDON': { title: 'Wimbledon', tz: 'Europe/London', loc: [-0.21, 51.43], place: 'All England Club, London' },
  'US OPEN': { title: 'US Open', tz: 'America/New_York', loc: [-73.85, 40.75], place: 'Flushing Meadows, New York' },
};

export async function tennisSlams() {
  const from = new Date(now - 30 * DAY).toISOString().slice(0, 10);
  const to = new Date(now + 450 * DAY).toISOString().slice(0, 10);
  const j = await get(`https://api.wtatennis.com/tennis/tournaments/?page=0&pageSize=200&excludeLevels=ITF&from=${from}&to=${to}`, { browser: true, json: true });
  return (j.content ?? [])
    .filter(t => t.level === 'Grand Slam' || t.tournamentGroup?.level === 'Grand Slam')
    .flatMap(t => {
      const key = Object.keys(SLAM_PLACE).find(k => (t.tournamentGroup?.name ?? t.title).toUpperCase().includes(k));
      if (!key) return [];
      const s = SLAM_PLACE[key];
      const [y, m, d] = t.startDate.split('-').map(Number);
      const [y2, m2, d2] = t.endDate.split('-').map(Number);
      return [
        { id: `wta:${t.year}:${key}`, passion: 'tennis', title: `${s.title} · day 1`, start: iso(zoned(y, m, d, 11, 0, s.tz)), weight: 3, approxTime: true, place: s.place, loc: s.loc, source: 'WTA tournament calendar' },
        { id: `wta:${t.year}:${key}:final`, passion: 'tennis', title: `${s.title} · men's final`, start: iso(zoned(y2, m2, d2, key === 'AUSTRALIAN OPEN' ? 19 : 15, 0, s.tz)), weight: 3, approxTime: true, place: s.place, loc: s.loc, source: 'WTA tournament calendar' },
      ];
    });
}
