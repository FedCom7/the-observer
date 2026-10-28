import { Score, Tbc } from './common';
import { countdown, dayLong, hhmm, isNight } from '../core/time';
import type { ObsEvent, Side } from '../core/types';
import type { Rival } from '../sources/teams';

/** A crest, in the version that suits the background (the terminal is dark). */
export function Crest({ side, size = 56 }: { side: Side; size?: number }) {
  const box = { width: size, height: size, flex: 'none' } as const;
  if (!side.logo) return <span className="ng-crest ng-fallback" style={{ ...box, fontSize: size / 3.2 }}>{side.abbr}</span>;
  return (
    <>
      <img className="ng-crest lg-light" src={side.logo} alt={side.name} style={box} loading="lazy" />
      <img className="ng-crest lg-dark" src={side.logoDark ?? side.logo} alt={side.name} style={box} loading="lazy" />
    </>
  );
}

const ofSide = (s: Side) => (
  <div className={`ng-side${s.mine ? ' mine' : ''}`}>
    <Crest side={s} />
    <b>{s.rank ? <small className="ng-rank">#{s.rank}</small> : null}{s.name}</b>
  </div>
);

/**
 * The next game of a team I follow: both crests, competition, venue, start time,
 * TV and, when the opponent is one of the tracked rivals, how the two have fared.
 */
export function NextGame({ e, now, rival, label = 'Next up' }: { e: ObsEvent; now: number; rival?: Rival | null; label?: string }) {
  const { home, away } = e;
  const mineHome = home?.mine;
  const a = rival?.allTime;
  const s = rival?.since2001;
  const soccer = e.espn?.sport === 'soccer';
  return (
    <div className="ocard s-next ng">
      <div className="lab">{e.state === 'in' ? <span style={{ color: '#ff453a' }}>● Live · {e.clock}</span> : label}{e.sub ? ` · ${e.sub}` : ''}</div>
      {home && away ? (
        <div className="ng-vs">
          {ofSide(away)}
          <span className="ng-at">{soccer ? 'v' : '@'}</span>
          {ofSide(home)}
        </div>
      ) : <h3>{e.title}<Tbc e={e} /></h3>}
      <div className="when">{dayLong(e.start)} · {e.approx ? '≈ ' : ''}{hhmm(e.start)} Rome{e.tv ? ` · ${e.tv}` : ''}{e.tbc ? ' · date to be confirmed' : ''}</div>
      <dl className="ng-facts">
        {e.place && <><dt>Venue</dt><dd>{e.place}</dd></>}
        {home && away && <><dt>Game</dt><dd>{mineHome ? 'At home' : 'Away'}</dd></>}
        {rival && s && s.w + s.d + s.l > 0 && <><dt>Since 2001</dt><dd><Score>{s.w}{soccer ? `-${s.d}` : ''}-{s.l}</Score></dd></>}
        {rival && a?.wins != null && <><dt>All time</dt><dd><Score>{a.wins}-{soccer ? `${a.draws}-` : ''}{a.losses}</Score></dd></>}
        {rival && rival.recent.length > 0 && <><dt>Last meetings</dt><dd className="ng-recent">{rival.recent.slice(0, 4).map(g => <span key={g.date} title={`${g.date} · ${g.home ? 'home' : 'away'}`} className={`r-${g.result}`}><Score>{g.us}–{g.them}</Score></span>)}</dd></>}
      </dl>
      {e.state === 'in' && home && away
        ? <Score as="div" className="s-cd">{away.abbr} {away.score ?? 0} – {home.score ?? 0} {home.abbr}</Score>
        : <div className="s-cd">{countdown(e.start - now)}<small>T-minus{isNight(e.start) ? ' · night viewing' : ''}</small></div>}
    </div>
  );
}
