import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CastBody, CastHead } from '../components/GameCast';
import { Score } from '../components/common';
import { Crest } from '../components/NextGame';
import { PASSION } from '../core/passions';
import { useData } from '../core/store';
import { DAY, MIN, dayLong, dayShort, hhmm, isNight, sportsDay } from '../core/time';
import type { ObsEvent, PassionId } from '../core/types';
import { loadCast, type Cast } from '../sources/gamecast';
import { LEAGUES, leagueDay, type League, type LeagueGame } from '../sources/leagueDay';
import { Block, passionBlocks, type BlockDef, type Win } from './LiveBlocks';

type Filter = 'all' | 'live' | 'today' | 'tomorrow';

/** Games that get a block of their own: my teams, and the games that decide a title. */
const BIG = /World Series|Super Bowl|NBA Finals|National Championship|Conference Championship|Champions League Final|Coppa Italia Final|Supercoppa/i;
const featured = (e: ObsEvent) => Boolean(e.espn) && (((e.home?.mine || e.away?.mine) && (e.weight ?? 1) >= 3) || BIG.test(`${e.sub ?? ''} ${e.title}`));

/** Refresh a game summary at the pace of the game: every 20 s while it is on. */
function useCast(e: ObsEvent | null, now: number): Cast | null | undefined {
  const [cast, setCast] = useState<{ id: string; c: Cast | null }>();
  const hot = e ? e.state === 'in' || (e.state === 'pre' && e.start - now < 15 * MIN) || (e.state === 'post' && now - e.start < 4 * 3600e3 && cast?.c?.state !== 'post') : false;
  const every = hot ? 20e3 : e?.state === 'post' ? 10 * MIN : 5 * MIN;
  const id = e?.id ?? null, state = e?.state;
  const ref = useRef(e);
  ref.current = e;
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const tick = () => { const x = ref.current; if (x) loadCast(x).then(c => alive && setCast({ id, c })).catch(() => {}); };
    tick();
    const t = window.setInterval(tick, every);
    return () => { alive = false; clearInterval(t); };
  }, [id, state, every]);
  return cast?.id === id ? cast.c : undefined;
}

/** Every league's games over the two days; leagues with a game on refresh every 30 s. */
function useLeagues(from: number, to: number): Record<string, LeagueGame[]> {
  const [data, setData] = useState<Record<string, LeagueGame[]>>({});
  const ref = useRef(data);
  ref.current = data;
  useEffect(() => {
    let alive = true;
    const last: Record<string, number> = {};
    setData({});
    const tick = () => {
      const t = Date.now();
      LEAGUES.forEach(l => {
        const hot = (ref.current[l.key] ?? []).some(g => g.state === 'in' || (g.state === 'pre' && Math.abs(g.start - t) < 15 * MIN));
        if (last[l.key] && t - last[l.key] < (hot ? 30e3 : 5 * MIN)) return;
        last[l.key] = t;
        leagueDay(l, from, to, hot).then(g => alive && setData(d => ({ ...d, [l.key]: g }))).catch(() => { delete last[l.key]; });
      });
    };
    tick();
    const iv = window.setInterval(tick, 10e3);
    return () => { alive = false; clearInterval(iv); };
  }, [from, to]);
  return data;
}

// ---------- A game of my team (or a final): its own block ----------
function GameBlock({ e, now, open }: { e: ObsEvent; now: number; open: (p: PassionId) => void }) {
  const c = useCast(e, now);
  const state = c?.state ?? e.state;
  const meta = [c?.note ?? e.sub, c?.tv ?? e.tv].filter(Boolean).join(' · ');
  return (
    <Block p={e.passion} wide live={state === 'in'} open={open}
      title={<>{PASSION[e.passion].name}{state === 'in' ? <span className="lw-live"> · {c?.clock ?? e.clock ?? 'LIVE'}</span> : null}</>} meta={meta}>
      <CastHead e={e} c={c} now={now} />
      <div className="lw-where">
        {dayLong(e.start)} · {hhmm(e.start)} Rome{isNight(e.start) ? ' · night viewing' : ''}
        {(c?.venue ?? e.place) && <> · {c?.venue ?? e.place}</>}
        {c?.weather && <> · {c.weather}</>}
        {c?.odds && state === 'pre' && <> · {c.odds}</>}
      </div>
      {c ? <CastBody c={c} /> : c === null ? <p className="lw-p">No game summary from ESPN.</p> : <div className="empty">Loading the game…</div>}
    </Block>
  );
}

// ---------- A whole league in one block ----------
function GameRow({ g, sport, now }: { g: LeagueGame; sport: string; now: number }) {
  const [openRow, setOpen] = useState(false);
  const soccer = sport === 'soccer';
  const sides = g.home && g.away ? (soccer ? [['home', g.home], ['away', g.away]] as const : [['away', g.away], ['home', g.home]] as const) : [];
  const L = g.line;
  const detail: ReactNode[] = [];
  if (g.state === 'in' && L.situation) detail.push(<b key="s">{L.situation}</b>);
  if (g.state === 'in' && L.lastPlay) detail.push(<Score key="lp">{L.lastPlay}</Score>);
  if (g.state === 'pre' && L.probables) detail.push(<span key="p">SP {L.probables}</span>);
  if (g.state === 'pre' && g.tv) detail.push(<span key="tv">{g.tv}</span>);
  if (g.state === 'pre' && L.odds) detail.push(<span key="o">{L.odds}</span>);
  if (g.state !== 'pre' && L.leaders) detail.push(<Score key="l">{L.leaders}</Score>);
  if (g.state === 'post' && L.headline) detail.push(<Score key="h">{L.headline}</Score>);
  if (L.series && g.state === 'pre') detail.push(<span key="se">{L.series}</span>);
  const mine = g.home?.mine || g.away?.mine;
  return (
    <>
      <div className={`lw-game${g.state === 'in' ? ' live' : ''}${mine ? ' mine' : ''}${openRow ? ' open' : ''}`} tabIndex={0} role="button" aria-expanded={openRow}
        onClick={() => setOpen(o => !o)} onKeyDown={k => (k.key === 'Enter' || k.key === ' ') && (k.preventDefault(), setOpen(o => !o))}>
        <div className="lw-gw">{g.state === 'in' ? <span className="lw-live">{g.clock ?? 'LIVE'}</span> : g.state === 'post' ? <span className="lw-dim">{g.clock ?? 'Final'}</span> : <>{hhmm(g.start)}{isNight(g.start) ? <small> ☾</small> : null}</>}</div>
        <div className="lw-gt">
          {sides.map(([k, s]) => (
            <div key={k} className={`lw-t${g.state === 'post' && s.winner === false ? ' lose' : ''}${L.possession === k ? ' pos' : ''}`}>
              <Crest side={s} size={18} />
              <span>{s.rank ? <small>{s.rank} </small> : null}{s.name}</span>
              {L.scorers?.[k].length ? <Score className="lw-scorers">{L.scorers[k].join(', ')}</Score> : null}
              {g.state !== 'pre' && <Score as="b">{s.score ?? ''}</Score>}
            </div>
          ))}
        </div>
        {detail.length > 0 && <div className="lw-gd">{detail.reduce<ReactNode[]>((a, d, i) => (i ? [...a, <i key={`d${i}`}> · </i>, d] : [d]), [])}</div>}
      </div>
      {openRow && <RowCast g={g} now={now} />}
    </>
  );
}

function RowCast({ g, now }: { g: LeagueGame; now: number }) {
  const c = useCast(g, now);
  return <div className="lw-rowcast">{c ? <CastBody c={c} compact /> : c === null ? <p className="lw-p">No summary.</p> : <div className="empty">Loading…</div>}</div>;
}

function LeagueBlock({ l, games, w, now, open }: { l: League; games: LeagueGame[]; w: Win; now: number; open: (p: PassionId) => void }) {
  const live = games.filter(g => g.state === 'in').length;
  const days = [w.from, w.from + DAY].map(d => ({ d, games: games.filter(g => g.start >= d && g.start < d + DAY && !(g.state === 'in' && g.start < w.from)) }));
  const earlier = games.filter(g => g.start < w.from);
  return (
    <Block p={l.passion} title={l.name} live={live > 0} open={open}
      meta={`${live ? `${live} live · ` : ''}${games.length} game${games.length === 1 ? '' : 's'}`}>
      {earlier.length > 0 && <div className="lw-day">Still going</div>}
      {earlier.map(g => <GameRow key={g.id} g={g} sport={l.sport} now={now} />)}
      {days.filter(x => x.games.length).map(({ d, games: gs }) => (
        <div key={d}>
          <div className="lw-day">{d === w.from ? 'Today' : 'Tomorrow'} · {dayShort(d)}</div>
          {gs.map(g => <GameRow key={g.id} g={g} sport={l.sport} now={now} />)}
        </div>
      ))}
    </Block>
  );
}

/**
 * Mosaic: the grid has 4 px rows and each block spans as many as its height needs, so tall
 * blocks do not leave holes next to them (as in the passion terminal).
 */
function useMasonry() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = (x: HTMLElement) => { x.style.gridRowEnd = `span ${Math.ceil((x.getBoundingClientRect().height + 8) / 4)}`; };
    const ro = new ResizeObserver(entries => entries.forEach(en => fit(en.target as HTMLElement)));
    const watch = () => el.querySelectorAll<HTMLElement>(':scope > .lw-block').forEach(x => { fit(x); ro.observe(x); });
    watch();
    const mo = new MutationObserver(watch);
    mo.observe(el, { childList: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, []);
  return ref;
}

export function LiveWall({ open }: { open: (p: PassionId) => void }) {
  const data = useData();
  const { events, now } = data;
  const [params, setParams] = useSearchParams();
  // ?at=2026-10-28T16:00Z previews the wall of another day (the data stay live)
  const at = params.get('at');
  const base = at && !Number.isNaN(Date.parse(at)) ? Date.parse(at) : now;
  const day0 = sportsDay(base);
  const [filter, setFilter] = useState<Filter>(() => { try { return (localStorage.getItem('obs:wall') as Filter) || 'all'; } catch { return 'all'; } });
  const pick = (f: Filter) => { setFilter(f); try { localStorage.setItem('obs:wall', f); } catch { /* storage blocked */ } };
  const w: Win = filter === 'today' ? { from: day0, to: day0 + DAY, liveOnly: false } : filter === 'tomorrow' ? { from: day0 + DAY, to: day0 + 2 * DAY, liveOnly: false } : { from: day0, to: day0 + 2 * DAY, liveOnly: filter === 'live' };
  const leagues = useLeagues(day0, day0 + 2 * DAY);
  const grid = useMasonry();
  const inW = (e: ObsEvent) => e.state === 'in' || (!w.liveOnly && e.start >= w.from && e.start < w.to);

  const blocks: BlockDef[] = [];
  for (const e of events.filter(x => featured(x) && inW(x))) {
    blocks.push({ key: e.id, live: e.state === 'in', start: e.start, done: e.state === 'post', node: <GameBlock e={e} now={now} open={open} /> });
  }
  for (const l of LEAGUES) {
    const games = (leagues[l.key] ?? []).filter(inW);
    if (!games.length) continue;
    blocks.push({ key: l.key, live: games.some(g => g.state === 'in'), start: Math.min(...games.filter(g => g.state !== 'post').map(g => g.start), Infinity), done: games.every(g => g.state === 'post'), node: <LeagueBlock l={l} games={games} w={w} now={now} open={open} /> });
  }
  blocks.push(...passionBlocks(events, w, now, open, data));
  // Live first, then what starts soonest; what is over goes last
  const rank = (b: BlockDef) => (b.live ? 0 : b.done ? 2 : 1) * 1e15 + (Number.isFinite(b.start) ? b.start : 9e14);
  blocks.sort((a, b) => rank(a) - rank(b));

  const liveN = events.filter(e => e.state === 'in').length + Object.values(leagues).flat().filter(g => g.state === 'in' && !events.some(e => e.id === g.id)).length;
  const loading = Object.keys(leagues).length < LEAGUES.length;

  return (
    <div className="lw">
      <div className="lw-head">
        <div>
          <h1>Live wall</h1>
          <p>{dayLong(day0)} and {dayLong(day0 + DAY)} · Rome time · the night up to 07:00 counts with the evening before{at ? <> · <button className="lw-link" onClick={() => { params.delete('at'); setParams(params); }}>preview of {dayShort(base)} — back to now</button></> : null}</p>
        </div>
        <div className="lw-filters" role="tablist" aria-label="Show">
          {([['all', 'Today & tomorrow'], ['live', `Live now${liveN ? ` · ${liveN}` : ''}`], ['today', 'Today'], ['tomorrow', 'Tomorrow']] as [Filter, string][]).map(([k, label]) => (
            <button key={k} role="tab" className="btn" aria-pressed={filter === k} aria-selected={filter === k} onClick={() => pick(k)}>{label}</button>
          ))}
        </div>
      </div>
      {blocks.length === 0 && <div className="panel"><div className="empty">{loading ? 'Loading the schedules…' : filter === 'live' ? 'Nothing is live right now.' : 'Nothing on the calendar for these days.'}</div></div>}
      <div className="lw-grid" ref={grid}>
        {blocks.map(b => <Fragment key={b.key}>{b.node}</Fragment>)}
      </div>
    </div>
  );
}
