// public/data/ski-season.json and ski-races/<season>/<raceid>.json (scripts/collect/skiSeason.mjs).
import { useEffect, useState } from 'react';
import { getJSON } from '../core/fetcher';

export interface CupLine { rank: number | null; points: number | null }
export interface CupRow { name: string; nation: string; ALL?: CupLine | null; DH?: CupLine | null; SG?: CupLine | null; GS?: CupLine | null; SL?: CupLine | null; AC?: CupLine | null }
export interface SkiRaceSummary { raceid: string; place: string; country: string; discipline: string; gender: 'men' | 'women' | 'mixed'; start: string; category: string; podium: { rank: number; name: string; nation: string; skis: string | null }[]; finishers: number; points: [string, string, number, string | null][] }
export interface SkiRow { rank: number | null; bib: number | null; name: string; skis: string | null; year: number | null; nation: string; run1: string | null; run2: string | null; time: string | null; gap: string | null; points: number | null; status: string | null }
export interface SkiRaceFile extends SkiRaceSummary { rows: SkiRow[] }
type Globe = { name: string; nation: string | null };
export interface SkiSeasonFile {
  updated: string; season: number; races: SkiRaceSummary[];
  standings: Record<string, { men: CupRow[]; women: CupRow[]; nations: CupRow[]; nationsMen: CupRow[]; nationsWomen: CupRow[] }>;
  history: { men: ({ year: number } & Partial<Record<'ALL' | 'DH' | 'SG' | 'GS' | 'SL' | 'AC' | 'PAR', Globe>>)[]; women: ({ year: number } & Partial<Record<'ALL' | 'DH' | 'SG' | 'GS' | 'SL' | 'AC' | 'PAR', Globe>>)[] };
}

export function useSkiSeason(enabled = true) {
  const [d, setD] = useState<SkiSeasonFile | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let on = true;
    getJSON<SkiSeasonFile>(`${import.meta.env.BASE_URL}data/ski-season.json`, 10 * 60e3).then(x => { if (on) setD(x); }).catch(() => {});
    return () => { on = false; };
  }, [enabled]);
  return d;
}

export function useSkiRace(season: number, id: string | null) {
  const [r, setR] = useState<SkiRaceFile | null>(null);
  useEffect(() => {
    if (!id) return;
    let on = true;
    setR(null);
    fetch(`${import.meta.env.BASE_URL}data/ski-races/${season}/${id}.json`).then(x => x.json()).then(x => { if (on) setR(x); }).catch(() => {});
    return () => { on = false; };
  }, [season, id]);
  return r;
}

/** "ODERMATT Marco" → "Marco Odermatt" */
export function fisName(n: string): string {
  const parts = n.split(' ');
  // Surname words are in capitals; single letters are initials of the first name (HURT A J)
  const last = parts.filter(p => p.length > 1 && p === p.toUpperCase() && /[A-ZÀ-Þ]/.test(p));
  const first = parts.filter(p => !last.includes(p));
  const cap = (s: string) => s.toLowerCase().replace(/(^|[-' ])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
  return [...first, ...last.map(cap)].join(' ');
}
