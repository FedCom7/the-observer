import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import curated from '../data/curated.json';
import { cfbRankings, espnNews, liveSummary, nflDivision, scoreboard, soccerTable, teamSchedule } from '../sources/espn';
import { f1Calendar, f1Constructors, f1Drivers, f1LastRace } from '../sources/f1';
import { inOrbit, launches, spaceNews, type InOrbit } from '../sources/space';
import { HOUR, MIN } from './time';
import type { NewsItem, ObsEvent, PassionId, SourceStatus, Standing } from './types';

// ESPN team ids
const MILAN = '103', PATRIOTS = '17', TEXAS = '251';

interface Data {
  events: ObsEvent[];
  standings: Record<string, Standing>;
  news: NewsItem[];
  orbit?: InOrbit;
}

type Patch = Partial<Data> & { events?: ObsEvent[] };

interface Source {
  key: string;
  every: number;
  run: () => Promise<Patch>;
}

const curatedEvents: ObsEvent[] = curated.events.map((e, i) => ({
  id: `cur:${e.passion}:${i}`,
  passion: e.passion as PassionId,
  title: e.title,
  start: Date.parse(e.start),
  state: 'pre',
  weight: e.weight as 1 | 2 | 3,
  tbc: 'tbc' in e ? Boolean(e.tbc) : false,
  place: 'place' in e ? e.place : undefined,
  loc: 'loc' in e ? (e.loc as [number, number]) : undefined,
}));

/** Primetime NFL windows (Thursday, Sunday and Monday night), the games worth showing league-wide. */
const primetime = (e: ObsEvent) => {
  const etHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(e.start));
  return etHour >= 19;
};

const SOURCES: Source[] = [
  { key: 'milan', every: 30 * MIN, run: async () => ({ events: (await teamSchedule('milan', 'soccer', 'all', MILAN)).map(e => ({ ...e, weight: 3 })) }) },
  { key: 'seriea', every: 30 * MIN, run: async () => ({ standings: { seriea: await soccerTable('milan', 'ita.1', MILAN, 'Serie A') } }) },
  { key: 'pats', every: 30 * MIN, run: async () => ({ events: (await teamSchedule('pats', 'football', 'nfl', PATRIOTS)).map(e => ({ ...e, weight: 3 })) }) },
  { key: 'afceast', every: 30 * MIN, run: async () => ({ standings: { afceast: await nflDivision('pats', ['NE', 'BUF', 'MIA', 'NYJ'], 'NE', 'AFC East') } }) },
  { key: 'nfl', every: 10 * MIN, run: async () => ({ events: (await scoreboard('nfl', 'football', 'nfl')).filter(e => primetime(e) || e.state === 'in').map(e => ({ ...e, weight: 2 })) }) },
  { key: 'texas', every: 30 * MIN, run: async () => ({ events: (await teamSchedule('texas', 'football', 'college-football', TEXAS)).map(e => ({ ...e, weight: 3 })) }) },
  { key: 'ap', every: HOUR, run: async () => ({ standings: { ap: await cfbRankings('cfb', TEXAS) } }) },
  { key: 'mlb', every: 10 * MIN, run: async () => ({ events: (await scoreboard('mlb', 'baseball', 'mlb')).map(e => ({ ...e, weight: 2 })) }) },
  { key: 'nba', every: 15 * MIN, run: async () => ({ events: (await scoreboard('nba', 'basketball', 'nba')).map(e => ({ ...e, weight: 1 })) }) },
  { key: 'f1', every: 6 * HOUR, run: async () => ({ events: await f1Calendar() }) },
  { key: 'f1last', every: 30 * MIN, run: async () => { const r = await f1LastRace(); return { events: r ? [r] : [] }; } },
  { key: 'f1std', every: HOUR, run: async () => ({ standings: { f1d: await f1Drivers(), f1c: await f1Constructors() } }) },
  { key: 'space', every: 2 * HOUR, run: async () => ({ events: await launches() }) },
  { key: 'orbit', every: 6 * HOUR, run: async () => ({ orbit: await inOrbit() }) },
  {
    key: 'news', every: 15 * MIN, run: async () => {
      const all = await Promise.allSettled([
        espnNews('pats', `football/nfl/news?team=${PATRIOTS}&limit=8`),
        espnNews('nfl', 'football/nfl/news?limit=6'),
        espnNews('milan', 'soccer/ita.1/news?limit=20', h => /milan|rossoneri|allegri|serie a/i.test(h)),
        espnNews('texas', `football/college-football/news?team=${TEXAS}&limit=6`),
        espnNews('mlb', 'baseball/mlb/news?limit=5'),
        espnNews('f1', 'racing/f1/news?limit=8'),
        spaceNews(),
      ]);
      return { news: all.flatMap(r => (r.status === 'fulfilled' ? r.value : [])) };
    },
  },
];

interface Ctx extends Data {
  status: Record<string, SourceStatus>;
  now: number;
}

const DataCtx = createContext<Ctx | null>(null);

/** How long an event without a live feed is considered "in progress". */
function duration(e: ObsEvent) {
  if (e.passion === 'space') return 15 * MIN;
  if (e.passion === 'f1') return e.weight === 3 ? 2 * HOUR : HOUR;
  if (e.passion === 'elez') return 10 * HOUR;
  return 3 * HOUR;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [bySource, setBySource] = useState<Record<string, Patch>>({});
  const [status, setStatus] = useState<Record<string, SourceStatus>>({});
  const [live, setLive] = useState<Record<string, Partial<ObsEvent>>>({});
  const [now, setNow] = useState(Date.now());

  // Clock for countdowns and time-derived state.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Each source refreshes on its own schedule.
  useEffect(() => {
    const timers: number[] = [];
    SOURCES.forEach(src => {
      const tick = async () => {
        try {
          const patch = await src.run();
          setBySource(s => ({ ...s, [src.key]: patch }));
          setStatus(s => ({ ...s, [src.key]: { ok: true, updated: Date.now() } }));
        } catch (err) {
          setStatus(s => ({ ...s, [src.key]: { ok: false, updated: s[src.key]?.updated, error: String(err) } }));
        }
      };
      tick();
      timers.push(window.setInterval(tick, src.every));
    });
    return () => timers.forEach(clearInterval);
  }, []);

  const merged = useMemo<Data>(() => {
    const events = new Map<string, ObsEvent>();
    curatedEvents.forEach(e => events.set(e.id, e));
    const standings: Record<string, Standing> = {};
    const news: NewsItem[] = [];
    let orbit: InOrbit | undefined;
    Object.values(bySource).forEach(p => {
      p.events?.forEach(e => {
        const prev = events.get(e.id);
        // The same game can arrive from a team schedule and a scoreboard: keep the richer one.
        events.set(e.id, prev ? { ...prev, ...e, weight: Math.max(prev.weight ?? 1, e.weight ?? 1) as 1 | 2 | 3 } : e);
      });
      Object.assign(standings, p.standings);
      if (p.news) news.push(...p.news);
      if (p.orbit) orbit = p.orbit;
    });
    Object.entries(live).forEach(([id, patch]) => {
      const e = events.get(id);
      if (e) events.set(id, { ...e, ...patch });
    });
    const seenNews = new Set<string>();
    return {
      events: [...events.values()].sort((a, b) => a.start - b.start),
      standings,
      news: news.filter(n => (seenNews.has(n.title) ? false : (seenNews.add(n.title), true))).sort((a, b) => b.time - a.time),
      orbit,
    };
  }, [bySource, live]);

  // Fast lane: every 20 s, refresh games that are live or about to start.
  const eventsRef = useRef(merged.events);
  eventsRef.current = merged.events;
  useEffect(() => {
    const tick = async () => {
      const t = Date.now();
      const hot = eventsRef.current.filter(e => e.espn && e.state !== 'post' && e.start - 10 * MIN < t && t < e.start + 5 * HOUR);
      const updates = await Promise.allSettled(hot.map(async e => [e.id, await liveSummary(e)] as const));
      const patch: Record<string, Partial<ObsEvent>> = {};
      updates.forEach(u => { if (u.status === 'fulfilled' && u.value[1]) patch[u.value[0]] = u.value[1]; });
      if (Object.keys(patch).length) setLive(l => ({ ...l, ...patch }));
    };
    const timer = window.setInterval(tick, 20e3);
    tick();
    return () => clearInterval(timer);
  }, []);

  // Events without a live feed get their state from the clock.
  const bucket = Math.floor(now / 30e3);
  const events = useMemo(() => merged.events.map(e => {
    if (e.espn || e.state === 'post') return e;
    const t = bucket * 30e3;
    if (t < e.start) return e;
    return { ...e, state: t < e.start + duration(e) ? 'in' as const : 'post' as const };
    // bucket re-evaluates the time-derived state every 30 s
  }), [merged.events, bucket]);

  const value = useMemo<Ctx>(() => ({ ...merged, events, status, now }), [merged, events, status, now]);
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData(): Ctx {
  const ctx = useContext(DataCtx);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
