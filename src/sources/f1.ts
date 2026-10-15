// Jolpica serves the Ergast F1 API. Its JSON is untyped, so we read it as `any`.
import { getJSON } from '../core/fetcher';
import { HOUR, MIN } from '../core/time';
import type { ObsEvent, Standing } from '../core/types';

const API = 'https://api.jolpi.ca/ergast/f1/current';

const SESSIONS: [key: string, label: string, weight: 1 | 2 | 3][] = [
  ['FirstPractice', 'Practice 1', 1],
  ['SecondPractice', 'Practice 2', 1],
  ['ThirdPractice', 'Practice 3', 1],
  ['SprintQualifying', 'Sprint Qualifying', 1],
  ['SprintShootout', 'Sprint Shootout', 1],
  ['Sprint', 'Sprint', 2],
  ['Qualifying', 'Qualifying', 2],
];

const at = (s: any) => Date.parse(`${s.date}T${s.time ?? '12:00:00Z'}`);

export async function f1Calendar(): Promise<ObsEvent[]> {
  const j = await getJSON<any>(`${API}.json`, 6 * HOUR);
  const races: any[] = j.MRData?.RaceTable?.Races ?? [];
  return races.flatMap(r => {
    const gp = r.raceName.replace('Grand Prix', 'GP');
    const loc: [number, number] = [Number(r.Circuit.Location.long), Number(r.Circuit.Location.lat)];
    const place = `${r.Circuit.circuitName}, ${r.Circuit.Location.locality}`;
    const base = { passion: 'f1' as const, place, loc, sub: `F1 · Round ${r.round}`, state: 'pre' as const };
    const sessions = SESSIONS.filter(([k]) => r[k]).map(([k, label, weight]) => ({
      ...base, id: `f1:${r.season}:${r.round}:${k}`, title: `${gp} · ${label}`, start: at(r[k]), weight,
    }));
    return [...sessions, { ...base, id: `f1:${r.season}:${r.round}:race`, title: gp, start: at(r), weight: 3 as const }];
  });
}

export async function f1Drivers(): Promise<Standing> {
  const j = await getJSON<any>(`${API}/driverStandings.json`, HOUR);
  const list = j.MRData?.StandingsTable?.StandingsLists?.[0];
  const rows = (list?.DriverStandings ?? []).map((d: any) => ({
    rank: Number(d.position), name: d.Driver.familyName, values: [d.Constructors?.[0]?.name ?? '', d.wins, d.points],
  }));
  return { passion: 'f1', title: 'F1 drivers', meta: list ? `After round ${list.round}` : '', cols: ['#', 'Driver', 'Team', 'Wins', 'Pts'], rows, updated: Date.now() };
}

export async function f1Constructors(): Promise<Standing> {
  const j = await getJSON<any>(`${API}/constructorStandings.json`, HOUR);
  const list = j.MRData?.StandingsTable?.StandingsLists?.[0];
  const rows = (list?.ConstructorStandings ?? []).map((c: any) => ({ rank: Number(c.position), name: c.Constructor.name, values: [c.wins, c.points] }));
  return { passion: 'f1', title: 'F1 constructors', meta: list ? `After round ${list.round}` : '', cols: ['#', 'Team', 'Wins', 'Pts'], rows, updated: Date.now() };
}

/** Podium of the most recent race, shown as the "latest" result. */
export async function f1LastRace(): Promise<ObsEvent | null> {
  const j = await getJSON<any>(`${API}/last/results.json`, 30 * MIN);
  const r = j.MRData?.RaceTable?.Races?.[0];
  if (!r) return null;
  const podium = (r.Results ?? []).slice(0, 3).map((x: any) => `${x.position}. ${x.Driver.familyName}`).join('  ');
  return {
    id: `f1:${r.season}:${r.round}:race`, passion: 'f1', title: r.raceName.replace('Grand Prix', 'GP'),
    sub: podium, start: at(r), state: 'post', weight: 3,
    loc: [Number(r.Circuit.Location.long), Number(r.Circuit.Location.lat)], place: r.Circuit.circuitName,
  };
}
