import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cfbRankings, espnNews, liveSummary, nflDivision, scoreboard, soccerTable, teamSchedule } from '../sources/espn';
import { f1Data, type F1Data } from '../sources/f1';
import { cfbData, type CfbData } from '../sources/cfb';
import { loadRoyal, royalEvents, type RoyalData } from '../sources/royal';
import { loadWec, wecEvents, type WecData } from '../sources/wec';
import { mlbData, type MlbData } from '../sources/mlb';
import { nbaData, type NbaData } from '../sources/nba';
import { inOrbit, launches, spaceNews, type InOrbit } from '../sources/space';
import type { ElectionData } from './elections';
import { getJSON } from './fetcher';
import { HOUR, MIN } from './time';
import type { NewsItem, ObsEvent, PassionId, SourceStatus, Standing } from './types';

// ESPN team ids
const MILAN = '103', PATRIOTS = '17', TEXAS = '251';

interface Data {
  events: ObsEvent[];
  standings: Record<string, Standing>;
  news: NewsItem[];
  orbit?: InOrbit;
  elections?: ElectionData;
  f1?: F1Data;
  mlb?: MlbData;
  cfb?: CfbData;
  wec?: WecData;
  royal?: RoyalData;
  nba?: NbaData;
}

type Patch = Partial<Data> & { events?: ObsEvent[] };

interface Source {
  key: string;
  every: number;
  run: () => Promise<Patch>;
}

// Files written by the collectors (scripts/collect), refreshed on the server every hour.
interface CollectedEvent { id: string; passion: PassionId; title: string; sub?: string; start: string; weight?: number; approxTime?: boolean; place?: string; loc?: [number, number]; link?: string }
interface CollectedNews { id: string; passion: PassionId; title: string; source: string; time: string; url?: string }

const collected = async <T,>(name: string) => getJSON<T>(`/data/${name}.json`, 5 * MIN);

async function collectedCalendar(): Promise<ObsEvent[]> {
  const j = await collected<{ events: CollectedEvent[] }>('calendar');
  return j.events.map(e => ({ ...e, start: Date.parse(e.start), state: 'pre' as const, weight: (e.weight ?? 1) as 1 | 2 | 3, approx: e.approxTime }));
}

async function collectedNews(): Promise<NewsItem[]> {
  const j = await collected<{ items: CollectedNews[] }>('news');
  return j.items.map(n => ({ ...n, time: Date.parse(n.time) }));
}


/** Primetime NFL windows (Thursday, Sunday and Monday night), the games worth showing league-wide. */
const primetime = (e: ObsEvent) => {
  const etHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(e.start));
  return etHour >= 19;
};

const SOURCES: Source[] = [
  { key: 'calendar', every: 10 * MIN, run: async () => ({ events: await collectedCalendar() }) },
  { key: 'feeds', every: 10 * MIN, run: async () => ({ news: await collectedNews() }) },
  { key: 'elections', every: 2 * MIN, run: async () => ({ elections: await getJSON<ElectionData>('/data/elections.json', 2 * MIN) }) },
  { key: 'milan', every: 30 * MIN, run: async () => ({ events: (await teamSchedule('milan', 'soccer', 'all', MILAN)).map(e => ({ ...e, weight: 3 })) }) },
  { key: 'seriea', every: 30 * MIN, run: async () => ({ standings: { seriea: await soccerTable('milan', 'ita.1', MILAN, 'Serie A') } }) },
  { key: 'pats', every: 30 * MIN, run: async () => ({ events: (await teamSchedule('pats', 'football', 'nfl', PATRIOTS)).map(e => ({ ...e, weight: 3 })) }) },
  { key: 'afceast', every: 30 * MIN, run: async () => ({ standings: { afceast: await nflDivision('pats', ['NE', 'BUF', 'MIA', 'NYJ'], 'NE', 'AFC East') } }) },
  { key: 'nfl', every: 10 * MIN, run: async () => ({ events: (await scoreboard('nfl', 'football', 'nfl')).filter(e => primetime(e) || e.state === 'in').map(e => ({ ...e, weight: 2 })) }) },
  { key: 'texas', every: 30 * MIN, run: async () => ({ events: (await teamSchedule('texas', 'football', 'college-football', TEXAS)).map(e => ({ ...e, weight: 3 })) }) },
  { key: 'ap', every: HOUR, run: async () => ({ standings: { ap: await cfbRankings('cfb', TEXAS) } }) },
  { key: 'royal', every: 10 * MIN, run: async () => { const r = await loadRoyal(); return { royal: r, events: royalEvents(r) }; } },
  { key: 'wec', every: 2 * MIN, run: async () => { const w = await loadWec(); return { wec: w, events: wecEvents(w) }; } },
  { key: 'cfbdata', every: 10 * MIN, run: async () => { const c = await cfbData(); return { cfb: c.data, events: c.events }; } },
  { key: 'mlb', every: 10 * MIN, run: async () => ({ events: (await scoreboard('mlb', 'baseball', 'mlb')).map(e => ({ ...e, weight: 2 })) }) },
  { key: 'mlbdata', every: 10 * MIN, run: async () => { const m = await mlbData(); return { mlb: m, events: m.postseasonEvents }; } },
  { key: 'dodgers', every: 30 * MIN, run: async () => ({ events: (await teamSchedule('mlb', 'baseball', 'mlb', '19')).map(e => ({ ...e, weight: 3 as const })) }) },
  { key: 'nba', every: 15 * MIN, run: async () => ({ events: (await scoreboard('nba', 'basketball', 'nba')).map(e => ({ ...e, weight: 1 })) }) },
  { key: 'nbadata', every: 10 * MIN, run: async () => { const n = await nbaData(); return { nba: n, events: n.events }; } },
  {
    key: 'f1', every: 60e3, run: async () => {
      const { data, events } = await f1Data();
      const f1d = { passion: 'f1' as const, title: 'F1 drivers', meta: `${data.season}`, cols: ['#', 'Driver', 'Pts'], rows: data.drivers.map(d => ({ rank: d.rank, name: d.name.split(' ').slice(-1)[0], values: [d.points] })) };
      return { f1: data, events, standings: { f1d } };
    },
  },
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
        espnNews('mlb', 'baseball/mlb/news?team=19&limit=5'),
        espnNews('nba', 'basketball/nba/news?limit=5'),
        espnNews('nba', 'basketball/nba/news?team=13&limit=6'),
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
  if (e.passion === 'wec') return e.weight === 3 ? (/24 Hours/.test(e.title) ? 24 : /8 Hours/.test(e.title) ? 8 : /1812/.test(e.title) ? 10 : 6) * HOUR : HOUR;
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
    const standings: Record<string, Standing> = {};
    const news: NewsItem[] = [];
    let orbit: InOrbit | undefined;
    let elections: ElectionData | undefined;
    let f1: F1Data | undefined;
    let mlb: MlbData | undefined;
    let cfb: CfbData | undefined;
    let wec: WecData | undefined;
    let royal: RoyalData | undefined;
    let nba: NbaData | undefined;
    Object.values(bySource).forEach(p => {
      p.events?.forEach(e => {
        const prev = events.get(e.id);
        // The same game can arrive from a team schedule and a scoreboard: keep the richer one.
        events.set(e.id, prev ? { ...prev, ...e, weight: Math.max(prev.weight ?? 1, e.weight ?? 1) as 1 | 2 | 3 } : e);
      });
      Object.assign(standings, p.standings);
      if (p.news) news.push(...p.news);
      if (p.orbit) orbit = p.orbit;
      if (p.elections) elections = p.elections;
      if (p.f1) f1 = p.f1;
      if (p.mlb) mlb = p.mlb;
      if (p.cfb) cfb = p.cfb;
      if (p.wec) wec = p.wec;
      if (p.royal) royal = p.royal;
      if (p.nba) nba = p.nba;
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
      elections,
      f1,
      mlb,
      cfb,
      wec,
      royal,
      nba,
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
    if (e.espn || e.f1Live || e.state === 'post') return e;
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
