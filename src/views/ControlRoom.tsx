import { useEffect, useLayoutEffect, useRef } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';
import { PassionTerminal } from './PassionTerminal';
import { Score, Tag, Tbc, useSpoiler } from '../components/common';
import { Theatre } from '../components/Theatre';
import { CATS, PASSION, PASSIONS, catColor, passionColor } from '../core/passions';
import { useData } from '../core/store';
import { DAY, HOUR, countdown, dayShort, hhmm, hhmmss } from '../core/time';
import type { CatId, ObsEvent, PassionId, Standing } from '../core/types';
import { MarginDots } from '../components/charts';
import { ElectionNight, hasResults, isElectionNight, joinLive } from '../components/ElectionNight';
import { tally } from '../sources/electionsLive';
import { FIRST_CLOSE, STATE_NAME } from '../core/elections';

const CLOCKS: [string, string, boolean?][] = [
  ['ROME', 'Europe/Rome', true], ['LONDON', 'Europe/London'], ['NEW YORK', 'America/New_York'],
  ['AUSTIN', 'America/Chicago'], ['LOS ANGELES', 'America/Los_Angeles'], ['UTC', 'UTC'],
];

const isMineGame = (e: ObsEvent) => Boolean(e.home?.mine || e.away?.mine);

/**
 * Map and Live & latest together fill the screen: Live & latest takes the height of its two
 * rows of games, the theatre gets everything left down to the bottom of the window.
 */
function useRoomFit(dep?: string) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const map = el.querySelector<HTMLElement>('.map'), head = el.querySelector<HTMLElement>('.live .ph'), games = el.querySelector<HTMLElement>('.live .games');
      if (!map || !head || !games) return;
      // Wide layout only: on narrow screens the panels stack and keep their natural heights
      if (getComputedStyle(el).gridTemplateColumns.split(' ').length < 3) { el.style.removeProperty('--theatre-h'); el.style.removeProperty('--live-h'); return; }
      const liveH = head.offsetHeight + games.scrollHeight + 2;
      const top = map.getBoundingClientRect().top + window.scrollY;
      const theatre = Math.max(340, window.innerHeight - top - 8 - liveH - 10);
      el.style.setProperty('--live-h', `${liveH}px`);
      el.style.setProperty('--theatre-h', `${theatre}px`);
    };
    fit();
    const ro = new ResizeObserver(fit);
    const games = el.querySelector('.live .games');
    if (games) ro.observe(games);
    window.addEventListener('resize', fit);
    return () => { ro.disconnect(); window.removeEventListener('resize', fit); };
  }, [dep]);
  return ref;
}

export function ControlRoom() {
  const { events, now } = useData();
  const nav = useNavigate();
  // The passion shown in the terminal, if any; choosing the same one again goes back to the overview
  const selected = useMatch('/p/:id')?.params.id as PassionId | undefined;
  const current = selected && selected in PASSION ? selected : undefined;
  const open = (p: PassionId) => nav(p === current ? '/' : `/p/${p}`);
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && nav('/');
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, nav]);
  const live = events.filter(e => e.state === 'in');
  const next72 = events.filter(e => e.state === 'pre' && e.start > now && e.start - now < 72 * HOUR);

  const room = useRoomFit(current);

  if (current) {
    return (
      <div className="room room-term" id="room">
        <TopBar liveCount={live.length} next72={next72} />
        <Rail live={live} open={open} active={current} />
        <PassionTerminal id={current} open={open} />
      </div>
    );
  }

  return (
    <>
      <div className="room" id="room" ref={room}>
        <TopBar liveCount={live.length} next72={next72} />
        <Rail live={live} open={open} />
        <Wire open={open} />
        <section className="panel map">
          <Theatre open={open} />
        </section>
        <TMinus open={open} />
        <LiveBoard open={open} />
        <Elections open={open} />
        <StandingsStrip open={open} />
        <Ticker />
      </div>
    </>
  );
}

function TopBar({ liveCount, next72 }: { liveCount: number; next72: ObsEvent[] }) {
  const { now, status } = useData();
  const spoiler = useSpoiler();
  const tempo = Object.keys(CATS).map(c => [c, next72.filter(e => PASSION[e.passion].cat === c).length] as [CatId, number]);
  const failing = Object.entries(status).filter(([, s]) => !s.ok);
  return (
    <header className="top">
      <div className="brand"><b>OBSERVER</b><span>CONTROL ROOM</span></div>
      <div className="clocks">
        {CLOCKS.map(([l, tz, home]) => (
          <div key={l} className={`clock${home ? ' home' : ''}`}><small>{l}</small><b>{hhmmss(now, tz)}</b></div>
        ))}
      </div>
      <div className="spacer" />
      <div className="stat"><small>LIVE NOW</small><b style={{ color: 'var(--signal)' }}>{liveCount}</b></div>
      <div className="stat"><small>NEXT 72H</small><b>{next72.length}</b></div>
      <div className="stat" title="Events in the next 72 hours, by category">
        <small>TEMPO 72H</small>
        <div className="tempo">{tempo.map(([c, v]) => <div key={c} title={`${CATS[c]}: ${v}`} style={{ height: 4 + Math.min(v, 9) * 2.4, background: catColor(c) }} />)}</div>
      </div>
      <button className="btn" aria-pressed={spoiler.on} onClick={spoiler.toggle}>Spoiler shield</button>
      <span className="sim" title={failing.map(([k, s]) => `${k}: ${s.error}`).join('\n') || 'All sources responding'}>
        {failing.length ? `${failing.length} source${failing.length > 1 ? 's' : ''} offline` : 'All feeds live'}
      </span>
    </header>
  );
}

function Rail({ live, open, active }: { live: ObsEvent[]; open: (p: PassionId) => void; active?: PassionId }) {
  const liveP = new Set(live.map(e => e.passion));
  return (
    <nav className="rail" aria-label="Show a passion">
      <span className="rail-lab">{active ? 'SHOWING' : 'OPEN'}</span>
      {PASSIONS.map(p => (
        <button key={p.id} className="pchip" aria-pressed={p.id === active} title={p.id === active ? 'Back to the overview' : `Show ${p.name}`} onClick={() => open(p.id)}>
          {liveP.has(p.id) ? <span className="live-dot" /> : <i style={{ background: catColor(p.cat) }} />}
          {p.name}
        </button>
      ))}
    </nav>
  );
}

function Wire({ open }: { open: (p: PassionId) => void }) {
  const { news, now } = useData();
  const items = news.slice(0, 40);
  return (
    <section className="panel feed">
      <div className="ph"><span className="live-dot" />Wire<span className="meta">{items.length} stories</span></div>
      <div className="feed-list">
        {items.length === 0 && <div className="empty">Loading the wire…</div>}
        {items.map((n, i) => (
          <div key={n.id} className={`item${now - n.time < 2 * HOUR && i < 3 ? ' new' : ''}`} data-p={n.passion} tabIndex={0}
            onClick={() => open(n.passion)} onKeyDown={e => e.key === 'Enter' && open(n.passion)}>
            <div className="h"><time>{now - n.time < DAY ? hhmm(n.time) : dayShort(n.time)}</time><Tag passion={n.passion} /></div>
            <p>{n.title}</p>
            <div className="src">{n.source}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TMinus({ open }: { open: (p: PassionId) => void }) {
  const { events, now } = useData();
  // Headline and notable events first; minor ones only if they are close.
  const list = events.filter(e => e.state === 'pre' && e.start > now && ((e.weight ?? 1) >= 2 || e.start - now < 12 * HOUR)).slice(0, 12);
  return (
    <section className="panel tminus">
      <div className="ph">T-minus<span className="meta">Rome time</span></div>
      <div>
        {list.length === 0 && <div className="empty">Loading schedules…</div>}
        {list.map(e => (
          <div key={e.id} className={`tm-row${e.start - now < 12 * HOUR ? ' soon' : ''}`} data-p={e.passion} tabIndex={0}
            onClick={() => open(e.passion)} onKeyDown={k => k.key === 'Enter' && open(e.passion)}>
            <i style={{ background: passionColor(e.passion) }} />
            <div className="t"><b>{e.title}<Tbc e={e} /></b><small>{dayShort(e.start)} {e.approx ? '≈' : ''}{hhmm(e.start)} · {PASSION[e.passion].name}{e.tv ? ` · ${e.tv}` : ''}</small></div>
            <div className="cd">{countdown(e.start - now)}<small>T-MINUS</small></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function GameCard({ e, open }: { e: ObsEvent; open: (p: PassionId) => void }) {
  const fin = e.state === 'post';
  const teams = e.home && e.away ? [e.away, e.home] : null;
  return (
    <div className="game" data-p={e.passion} tabIndex={0} onClick={() => open(e.passion)} onKeyDown={k => k.key === 'Enter' && open(e.passion)}
      style={isMineGame(e) ? { boxShadow: 'inset 2px 0 0 var(--now)' } : undefined}>
      <div className="gh"><Tag passion={e.passion} /><span className={`st${fin ? ' fin' : ''}`}>{fin ? `FINAL · ${dayShort(e.start)}` : e.clock ?? 'LIVE'}</span></div>
      {teams ? teams.map(t => (
        <div key={t.abbr + t.name} className={`team${fin && t.winner === false ? ' lose' : ''}`}>
          <span>{t.name}</span><Score as="b">{t.score ?? '–'}</Score>
        </div>
      )) : (
        <>
          <div className="team"><span>{e.title}</span></div>
          {e.sub && <Score className="note">{e.sub}</Score>}
        </>
      )}
      {teams && e.sub && <div className="note">{e.sub}</div>}
    </div>
  );
}

function LiveBoard({ open }: { open: (p: PassionId) => void }) {
  const { events, now } = useData();
  const live = events.filter(e => e.state === 'in');
  const recent = events
    .filter(e => e.state === 'post' && now - e.start < 4 * DAY && (isMineGame(e) || (e.weight ?? 1) >= 2))
    .sort((a, b) => b.start - a.start)
    .slice(0, Math.max(0, 6 - live.length));
  return (
    <section className="panel live">
      <div className="ph"><span className="live-dot" />Live &amp; latest<span className="meta">{live.length} live · {recent.length} final</span></div>
      <div className="games">
        {[...live, ...recent].map(e => <GameCard key={e.id} e={e} open={open} />)}
        {live.length + recent.length === 0 && <div className="empty">Nothing live right now.</div>}
      </div>
    </section>
  );
}

const ROOM_TOKENS = { ink: 'var(--ink)', ink2: 'var(--ink-2)', ink3: 'var(--ink-3)', grid: 'var(--grid)', dem: 'var(--dem)', rep: 'var(--rep)', surface: 'var(--panel)' };

function Elections({ open }: { open: (p: PassionId) => void }) {
  const { now, elections: e, live } = useData();
  const c = e?.model?.chambers;
  const gb = e?.polls?.generic, ap = e?.polls?.approval;
  const night = isElectionNight(now) || hasResults(live);
  const senate = (e?.model?.races ?? []).filter(r => r.office === 'senate');
  const close = senate.filter(r => Math.abs(r.margin) < 8).sort((a, b) => b.margin - a.margin);
  const called = live ? { D: (c?.senate.notUp?.D ?? 34) + tally(live.senate).D + tally(live.senate).I, R: (c?.senate.notUp?.R ?? 31) + tally(live.senate).R } : null;
  return (
    <section className="panel elex" data-p="elez" onClick={() => open('elez')}>
      <div className="ph"><i style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--c-pol)' }} />Midterms 2026<span className="meta">{e ? `auto ${hhmm(Date.parse(e.updated))} · ` : ''}open ›</span></div>
      <div className="elex-body">
        <div className="big-row">
          <div><div className="k">First polls close</div><div className="v">{now < FIRST_CLOSE ? `T-${countdown(FIRST_CLOSE - now)}` : 'Results night'}</div></div>
          <div style={{ textAlign: 'right' }}><div className="k">Generic ballot · approval</div><div className="v"><span style={{ color: (gb?.margin ?? 0) >= 0 ? 'var(--dem)' : 'var(--rep)' }}>{gb?.marginText ?? '–'}</span> <span style={{ color: 'var(--ink-3)', fontSize: '0.7em' }}>{ap ? `Trump ${ap.marginText}` : ''}</span></div></div>
        </div>
        {night && called ? (
          <div>
            <div className="big-row"><div className="k" style={{ color: 'var(--signal)' }}>● Senate seats called</div><div className="k">51 for control</div></div>
            <div className="prob" style={{ marginTop: 6 }}><div style={{ flex: called.D, background: 'var(--dem)' }} /><div style={{ flex: Math.max(0, 100 - called.D - called.R), background: 'var(--grid)' }} /><div style={{ flex: called.R, background: 'var(--rep)' }} /></div>
            <div className="prob-lab"><span>DEM {called.D}</span><span>{100 - called.D - called.R} open</span><span>REP {called.R}</span></div>
          </div>
        ) : c && (
          <div>
            <div className="big-row"><div className="k">Chance of control · On Point</div><div className="k">D / R</div></div>
            {(['senate', 'house'] as const).map(k => (
              <div key={k} style={{ marginTop: 6 }}>
                <div className="prob"><div style={{ flex: c[k].dem, background: 'var(--dem)' }} /><div style={{ flex: 1 - c[k].dem, background: 'var(--rep)' }} /></div>
                <div className="prob-lab"><span>{k.toUpperCase()} D {Math.round(c[k].dem * 100)}%</span><span>avg {Math.round(c[k].demSeats)}–{Math.round(c[k].total - c[k].demSeats)}</span><span>R {Math.round((1 - c[k].dem) * 100)}%</span></div>
              </div>
            ))}
          </div>
        )}
        {night ? (
          <div className="races"><div className="big-row"><div className="k" style={{ color: 'var(--signal)' }}>● Results · closest Senate races</div></div>
            <ElectionNight rows={joinLive(close, live?.senate)} now={now} variant="room" />
          </div>
        ) : <div className="races"><div className="big-row"><div className="k">Closest Senate races · projected margin</div></div>
          {close.length ? <MarginDots races={close.map(r => ({ state: STATE_NAME[r.st], seat: r.incParty ?? 'open', margin: r.margin, dem: r.dem, rep: r.gop, rating: `${Math.round(r.pDem * 100)}% D` }))} tokens={ROOM_TOKENS} compact /> : <div className="foot" style={{ padding: 0 }}>Loading…</div>}
        </div>}
      </div>
    </section>
  );
}

function StandingTable({ s, open, limit = 6 }: { s?: Standing; open: (p: PassionId) => void; limit?: number }) {
  if (!s) return <section className="panel"><div className="empty">Loading…</div></section>;
  const mineIdx = s.rows.findIndex(r => r.mine);
  // Always show my team, even when it sits below the cut.
  const rows = mineIdx >= limit ? [...s.rows.slice(0, limit - 1), s.rows[mineIdx]] : s.rows.slice(0, limit);
  return (
    <section className="panel" data-p={s.passion} tabIndex={0} onClick={() => open(s.passion)} onKeyDown={k => k.key === 'Enter' && open(s.passion)}>
      <div className="ph"><i style={{ width: 8, height: 8, borderRadius: 2, background: passionColor(s.passion) }} />{s.title}<span className="meta">{s.meta ? `${s.meta} · ` : ''}open ›</span></div>
      <table>
        <tbody>
          {rows.map(r => (
            <tr key={String(r.rank) + r.name} className={r.mine ? 'me' : ''}>
              <td className="r">{r.rank}</td>
              <td>{r.name} {r.move ? <span className={`mv ${r.move > 0 ? 'up' : 'dn'}`}>{r.move > 0 ? '▲' : '▼'}{Math.abs(r.move)}</span> : null}</td>
              <td className="n"><Score>{r.values[r.values.length - 1]}</Score></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function StandingsStrip({ open }: { open: (p: PassionId) => void }) {
  const { standings, orbit } = useData();
  return (
    <section className="stand">
      <StandingTable s={standings.seriea} open={open} />
      <StandingTable s={standings.f1d} open={open} />
      <StandingTable s={standings.afceast} open={open} />
      <StandingTable s={standings.ap} open={open} />
      <section className="panel" data-p="space" tabIndex={0} onClick={() => open('space')}>
        <div className="ph"><i style={{ width: 8, height: 8, borderRadius: 2, background: catColor('spa') }} />In orbit now<span className="meta">open ›</span></div>
        <div className="orbit-big">{orbit?.total ?? '–'}</div>
        <div className="orbit-list">{orbit?.byAgency.map(([a, n]) => <span key={a}>{a} · {n}</span>) ?? 'Loading…'}</div>
      </section>
    </section>
  );
}

function Ticker() {
  const { events, now } = useData();
  const finals = events.filter(e => e.state === 'post' && now - e.start < 3 * DAY && (e.weight ?? 1) >= 2).slice(-8);
  const next = events.filter(e => e.state === 'pre' && e.start > now && (e.weight ?? 1) >= 3).slice(0, 8);
  const { on } = useSpoiler();
  const items = [
    ...finals.map(e => <span key={e.id}><b>{PASSION[e.passion].name.toUpperCase()}</b> {on ? e.title : e.home ? `${e.away?.name} ${e.away?.score} – ${e.home.name} ${e.home.score}` : `${e.title} ${e.sub ?? ''}`}</span>),
    ...next.map(e => <span key={e.id}><b>{PASSION[e.passion].name.toUpperCase()}</b> {e.title} · {dayShort(e.start)} {hhmm(e.start)}</span>),
  ];
  if (!items.length) return <div className="tick" />;
  return <div className="tick" aria-label="Headline ticker"><div className="tick-in">{items}{items.map(it => <span key={'2' + it.key}>{it.props.children}</span>)}</div></div>;
}
