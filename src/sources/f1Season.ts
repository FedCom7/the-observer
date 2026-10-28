// public/data/f1-season.json and the per-session files (scripts/collect/f1Season.mjs).
import { useEffect, useState } from 'react';
import { getJSON } from '../core/fetcher';

export interface F1Driver { n: number; code: string; name: string; first: string; last: string; team: string; colour: string | null; photo: string | null }
export interface F1Result { n: number; pos: number | null; laps: number | null; dnf: boolean; dns: boolean; dsq: boolean; time: number | (number | null)[] | null; gap: number | string | (number | string | null)[] | null; points: number | null }
export interface F1Meeting { key: number; round: number | null; circuit: string; country: string; location: string; start: string; race: string; cancelled: boolean; sprint: boolean; sessions: { key: number; name: string; start: string; done: boolean }[] }
export interface F1Circuit { id: string; name: string; type: 'street' | 'high-speed' | 'power' | 'technical' | 'mixed'; km: number; corners: number }
export interface F1TeamPower { quali: number | null; race: number | null; s1: number | null; s2: number | null; s3: number | null; speed: number | null; deg: Record<string, { slope: number; n: number }>; pit: number | null; pitN: number; start: number | null; gained: number | null; dnf: number; starts: number; byType: Record<string, number>; rounds: Record<string, { quali?: number; race?: number }> }
export interface F1DriverPower { quali: number | null; race: number | null; start: number | null; gained: number | null; h2hQ: [number, number]; h2hR: [number, number]; avgFinish: number | null; avgQuali: number | null; dnf: number }
export interface F1SeasonFile {
  updated: string; year: number; meetings: F1Meeting[]; drivers: Record<string, F1Driver>; teams: Record<string, { name: string; colour: string | null; drivers: number[] }>;
  circuits: Record<string, F1Circuit>;
  results: { key: number; name: string; meeting: number; results: F1Result[] }[];
  champ: { key: number; name: string; meeting: number; drivers: [number, number, number][]; teams: [string, number, number][] }[];
  power: { teams: Record<string, F1TeamPower>; drivers: Record<string, F1DriverPower> };
  history: { champions: { year: number; driver: string; nation: string; team: string | null; points: number; wins: number; constructor: string | null; cPoints: number | null }[]; winners: { year: number; round: number; race: string; circuit: string; driver: string; team: string; grid: number }[] };
}
/** [lap, ms from session start, lap time, sector 1, 2, 3, speed trap, pit-out lap] */
export type F1Lap = [number, number | null, number | null, number | null, number | null, number | null, number | null, number];
export interface F1SessionFile {
  key: number; name: string; type: string; meeting: number; circuit: string; start: string; end: string;
  drivers: F1Driver[]; results: F1Result[]; laps: Record<string, F1Lap[]>;
  stints: [number, number, string, number, number, number][]; pits: [number, number, number | null, number | null][];
  champD: [number, number, number][]; champT: [string, number, number][]; neutral: number[];
}

export function useF1Season(enabled = true) {
  const [d, setD] = useState<F1SeasonFile | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let on = true;
    getJSON<F1SeasonFile>(`${import.meta.env.BASE_URL}data/f1-season.json`, 10 * 60e3).then(x => { if (on) setD(x); }).catch(() => {});
    return () => { on = false; };
  }, [enabled]);
  return d;
}

export function useF1Session(year: number, key: number | null) {
  const [s, setS] = useState<F1SessionFile | null>(null);
  useEffect(() => {
    if (!key) return;
    let on = true;
    setS(null);
    fetch(`${import.meta.env.BASE_URL}data/f1-sessions/${year}/${key}.json`).then(r => r.json()).then(x => { if (on) setS(x); }).catch(() => {});
    return () => { on = false; };
  }, [year, key]);
  return s;
}

export const lapTime = (s: number | null | undefined) => (s == null ? '–' : s >= 60 ? `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}` : s.toFixed(3));
export const raceTime = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${x.toFixed(3).padStart(6, '0')}`; };
