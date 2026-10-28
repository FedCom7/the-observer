import type { ReactNode } from 'react';
import { Score } from './common';
import { Crest } from './NextGame';
import { countdown, dayShort, hhmm, isNight } from '../core/time';
import type { ObsEvent, Side } from '../core/types';
import type { Cast, CastBox, CastLead, CastLineup, CastPlay, CastTeam } from '../sources/gamecast';

type Pair<T> = { away: T; home: T };

/** Two columns, away on the left and home on the right, as on a scoreboard. */
function Duo<T>({ pair, teams, render, empty }: { pair: Pair<T>; teams: Pair<CastTeam>; render: (v: T) => ReactNode; empty?: (v: T) => boolean }) {
  if (empty && empty(pair.away) && empty(pair.home)) return null;
  return (
    <div className="lw-duo">
      {(['away', 'home'] as const).map(k => (
        <div key={k}><div className="lw-duo-h">{teams[k].abbr || teams[k].name}</div>{render(pair[k])}</div>
      ))}
    </div>
  );
}

const Sec = ({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) => (
  <section className="lw-sec"><h4>{title}{right ? <span>{right}</span> : null}</h4>{children}</section>
);

/** Win chances as one bar in the two teams' colours. */
export function ChanceBar({ away, home, teams, label }: { away: number; home: number; teams: Pair<CastTeam>; label: string }) {
  const tot = away + home || 100;
  return (
    <div className="lw-chance" title={label}>
      <div className="lw-chance-bar">
        <i style={{ flex: away / tot, background: teams.away.color ?? 'var(--ink-3)' }} />
        <i style={{ flex: home / tot, background: teams.home.color ?? 'var(--ink-2)' }} />
      </div>
      <div className="lw-chance-lab"><span>{teams.away.abbr} {Math.round((away / tot) * 100)}%</span><small>{label}</small><span>{Math.round((home / tot) * 100)}% {teams.home.abbr}</span></div>
    </div>
  );
}

const FORM_CLASS: Record<string, string> = { W: 'w', L: 'l', D: 'd', T: 'd' };
const Form = ({ games }: { games: string[] }) => (
  <div className="lw-form">{games.map((g, i) => <span key={i} className={`lw-f ${FORM_CLASS[g[0]] ?? ''}`} title={g}>{g[0]}</span>)}{!games.length && <em>–</em>}</div>
);

const PLAY_ICON: Record<CastPlay['kind'], string> = { goal: '⚽', pen: '⚽', own: '⚽', yellow: '🟨', red: '🟥', sub: '⇄', td: 'TD', fg: 'FG', safety: 'SF', run: '●', other: '·' };

function Plays({ plays, sport }: { plays: CastPlay[]; sport: string }) {
  return (
    <ol className="lw-plays">
      {plays.map((p, i) => (
        <li key={i} className={`k-${p.kind}`}>
          <time>{p.clock}</time>
          <b className="lw-ic">{PLAY_ICON[p.kind]}</b>
          <div>
            {sport === 'soccer' && p.who ? (
              <p><b>{p.who}</b>{p.kind === 'pen' ? ' (pen)' : p.kind === 'own' ? ' (own goal)' : ''}{p.assist ? <span className="lw-ast"> · assist {p.assist}</span> : null}<span className="lw-team"> {p.team}</span></p>
            ) : <p><span className="lw-team">{p.team} </span>{p.text}</p>}
          </div>
          {p.score && <Score className="lw-ps">{p.score}</Score>}
        </li>
      ))}
    </ol>
  );
}

function Linescore({ c }: { c: Cast }) {
  const ls = c.linescore!;
  return (
    <div className="lw-scroll">
      <table className="lw-ls">
        <thead><tr><th />{ls.labels.map((l, i) => <th key={i} className={/^[RHET]$/.test(l) ? 'tot' : ''}>{l}</th>)}</tr></thead>
        <tbody>
          {(['away', 'home'] as const).map(k => (
            <tr key={k}><th>{c.teams[k].abbr}</th>{ls[k].map((v, i) => <td key={i} className={/^[RHET]$/.test(ls.labels[i]) ? 'tot' : ''}><Score>{v}</Score></td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Team stats as mirrored bars, NYT-style: the larger value in the team's colour. */
function Stats({ c, limit }: { c: Cast; limit?: number }) {
  const num = (v: string) => { const m = v.match(/-?\d+(\.\d+)?/); return m ? Math.abs(Number(m[0])) : 0; };
  return (
    <div className="lw-stats">
      {c.stats.slice(0, limit).map(([l, a, h]) => {
        const na = num(a), nh = num(h), tot = na + nh || 1;
        return (
          <div key={l} className="lw-stat">
            <Score className="v">{a}</Score>
            <div className="lw-stat-mid">
              <small>{l}</small>
              <div className="lw-stat-bar">
                <i style={{ width: `${(na / tot) * 100}%`, background: na >= nh ? c.teams.away.color ?? 'var(--ink-2)' : 'var(--grid)' }} />
                <i style={{ width: `${(nh / tot) * 100}%`, background: nh >= na ? c.teams.home.color ?? 'var(--ink-2)' : 'var(--grid)' }} />
              </div>
            </div>
            <Score className="v r">{h}</Score>
          </div>
        );
      })}
    </div>
  );
}

function Lineup({ l, sport }: { l: CastLineup; sport: string }) {
  if (!l.starters.length) return <em className="lw-dim">Not announced yet</em>;
  return (
    <div className="lw-lineup">
      {l.formation && <div className="lw-dim">{l.formation}</div>}
      <ol>
        {l.starters.map((p, i) => (
          <li key={i} className={p.sub === 'out' ? 'off' : ''}>
            <span className="n">{sport === 'baseball' ? p.order : p.n}</span>{p.name}<small>{p.pos}</small>{p.sub === 'out' && <i title="Substituted">↓</i>}
          </li>
        ))}
      </ol>
      {l.bench.length > 0 && <div className="lw-bench">{l.bench.map(p => <span key={p.name}>↑ {p.name}</span>)}</div>}
    </div>
  );
}

function BoxTables({ boxes }: { boxes: CastBox[] }) {
  return (
    <>
      {boxes.map(b => (
        <div key={b.title} className="lw-scroll">
          <table className="lw-box">
            <thead><tr><th>{b.title}</th>{b.cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{b.rows.map(r => <tr key={r.name}><th>{r.name}</th>{r.vals.map((v, i) => <td key={i}>{v}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ))}
    </>
  );
}

const Leaders = ({ list }: { list: CastLead[] }) => (
  <ul className="lw-leaders">
    {list.map(l => (
      <li key={l.cat + l.name}>
        {l.photo ? <img src={l.photo} alt="" loading="lazy" /> : <span className="lw-ph" />}
        <div><small>{l.cat}</small><b>{l.name}</b><Score as="div" className="lw-dim">{l.value}</Score></div>
      </li>
    ))}
  </ul>
);

/** What is known about a game, before it and while it is played. `compact` for a row opened inside a league block. */
export function CastBody({ c, compact = false }: { c: Cast; compact?: boolean }) {
  const pre = c.state === 'pre';
  const t = c.teams;
  return (
    <div className={`lw-cast${compact ? ' compact' : ''}`}>
      {c.state === 'in' && (c.situation || c.lastPlay) && (
        <div className="lw-sit">{c.situation && <b>{c.situation}</b>}{c.lastPlay && <Score as="div">{c.lastPlay}</Score>}</div>
      )}
      {c.state === 'in' && c.winProb !== undefined && <ChanceBar away={100 - c.winProb} home={c.winProb} teams={t} label="Win probability · ESPN" />}
      {pre && c.predictor && <ChanceBar away={c.predictor.away} home={c.predictor.home} teams={t} label="ESPN Matchup Predictor" />}
      {c.linescore && <Linescore c={c} />}
      {c.decisions && <Score as="div" className="lw-dim lw-dec">{c.decisions}</Score>}

      {c.scoring.length > 0 && (
        <Sec title={c.sport === 'soccer' ? 'Goals' : c.sport === 'baseball' ? 'Runs' : 'Scoring'}>
          <Score as="div"><Plays plays={c.scoring} sport={c.sport} /></Score>
        </Sec>
      )}
      {!pre && c.events.length > 0 && !compact && (
        <Sec title="Cards & changes"><Score as="div"><Plays plays={c.events} sport={c.sport} /></Score></Sec>
      )}

      {pre && c.probables && (c.probables.away || c.probables.home) && (
        <Sec title="Probable pitchers">
          <Duo pair={c.probables} teams={t} render={p => p ? (
            <div className="lw-pitcher">{p.photo && <img src={p.photo} alt="" loading="lazy" />}<div><b>{p.name}</b>{p.hand && <small> {p.hand}HP</small>}<div className="lw-dim">{p.line || 'Postseason debut'}</div></div></div>
          ) : <em className="lw-dim">TBD</em>} />
        </Sec>
      )}

      {!pre && c.stats.length > 0 && <Sec title="Team stats"><Stats c={c} limit={compact ? 6 : undefined} /></Sec>}

      {c.leaders && (c.leaders.away.length > 0 || c.leaders.home.length > 0) && (
        <Sec title={pre ? 'Season leaders' : 'Game leaders'}>
          <Duo pair={{ away: c.leaders.away.slice(0, compact ? 3 : 5), home: c.leaders.home.slice(0, compact ? 3 : 5) }} teams={t} render={l => <Leaders list={l} />} empty={l => !l.length} />
        </Sec>
      )}

      {c.lineups && (!compact || c.sport === 'soccer') && (
        <Sec title={c.sport === 'baseball' ? 'Batting order' : 'Lineups'}>
          <Duo pair={c.lineups} teams={t} render={l => <Lineup l={l} sport={c.sport} />} />
        </Sec>
      )}

      {c.box && !compact && (c.box.away.length > 0 || c.box.home.length > 0) && (
        <details className="lw-more">
          <summary>Box score</summary>
          <Duo pair={c.box} teams={t} render={b => <BoxTables boxes={b} />} />
        </details>
      )}

      {c.form && (
        <Sec title="Last five">
          <Duo pair={c.form} teams={t} render={f => <Form games={f} />} />
        </Sec>
      )}

      {pre && c.injuries && !compact && (c.injuries.away.length > 0 || c.injuries.home.length > 0) && (
        <Sec title="Injury report">
          <Duo pair={c.injuries} teams={t} empty={l => !l.length} render={l => l.length ? (
            <ul className="lw-inj">{l.slice(0, 7).map(i => <li key={i.name}><b className={/out|injured/i.test(i.status) ? 'out' : ''}>{i.status.replace('Injured Reserve', 'IR')}</b> {i.name} <small>{i.pos}{i.detail ? ` · ${i.detail}` : ''}</small></li>)}</ul>
          ) : <em className="lw-dim">No one listed</em>} />
        </Sec>
      )}

      {c.preview && (
        <a className="lw-story" href={c.preview.url} target="_blank" rel="noreferrer">
          <small>{pre ? 'Preview' : c.state === 'post' ? 'Recap' : 'Story'} · ESPN</small>
          {pre ? <b>{c.preview.headline}</b> : <Score as="b">{c.preview.headline}</Score>}
          {!compact && c.preview.text && (pre ? <p>{c.preview.text.replace(/^—\s*/, '')}</p> : <Score as="div" className="lw-p">{c.preview.text.replace(/^—\s*/, '')}</Score>)}
        </a>
      )}

      <div className="lw-foot">
        {[c.series, c.attendance ? `Attendance ${c.attendance.toLocaleString('en-US')}` : null].filter(Boolean).join(' · ')}
      </div>
    </div>
  );
}

const sideOfCast = (s: Side | undefined, t: CastTeam | undefined): Side | undefined => (s ? { ...s, score: t?.score ?? s.score, logo: s.logo ?? t?.logo, logoDark: s.logoDark ?? t?.logoDark } : undefined);

/** The scoreboard at the top of a game block: crests, names, records, score and clock. */
export function CastHead({ e, c, now }: { e: ObsEvent; c?: Cast | null; now: number }) {
  const away = sideOfCast(e.away, c?.teams.away), home = sideOfCast(e.home, c?.teams.home);
  const state = c?.state ?? e.state;
  const clock = c?.clock ?? e.clock;
  if (!away || !home) return null;
  const team = (s: Side, t?: CastTeam) => (
    <div className={`lw-side${s.mine ? ' mine' : ''}${state === 'post' && (t?.winner ?? s.winner) === false ? ' lose' : ''}`}>
      <Crest side={s} size={44} />
      <div><b>{s.rank ? <small className="lw-rank">#{s.rank} </small> : null}{s.name}</b><small>{t?.record ?? ''}</small></div>
    </div>
  );
  return (
    <div className="lw-board">
      {team(away, c?.teams.away)}
      <div className="lw-mid">
        {state === 'pre' ? (
          <>
            <b className="lw-cd">{countdown(e.start - now)}</b>
            <small>{dayShort(e.start)} · {hhmm(e.start)}{isNight(e.start) ? ' · night' : ''}</small>
          </>
        ) : (
          <>
            <Score as="b" className="lw-sc">{away.score ?? '0'}<i>–</i>{home.score ?? '0'}</Score>
            <small className={state === 'in' ? 'live' : ''}>{state === 'in' ? clock ?? 'LIVE' : clock ?? 'Final'}</small>
          </>
        )}
      </div>
      {team(home, c?.teams.home)}
    </div>
  );
}
