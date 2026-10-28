import { useEffect, useState } from 'react';
import { Score } from '../components/common';
import { LeagueGameGrid, useLeagueGames } from '../components/LeagueGames';
import { Hero, Row } from '../components/sheet';
import { ScreenTabs, useTab } from '../components/tabs';
import { useData } from '../core/store';
import { countdown, dayLong, dayShort, hhmm } from '../core/time';
import { nbaLeaders, type Conference, type NbaLeader, type Series } from '../sources/nba';
import { useNbaSeason } from '../sources/nbaSeason';
import { AwardsScreen, HistoryScreen, HowScreen, NBA_TABS, PlayersScreen, PowerScreen, SeasonScreen, TeamsScreen } from './NbaScreens';

const ROUNDS = ['Play-In', 'First Round', 'Conference Semifinals', 'Conference Finals', 'NBA Finals'];
const seasonLabel = (y: number) => `${y - 1}–${String(y).slice(2)}`;
const pct = (r: { w: number; l: number }) => r.w / Math.max(1, r.w + r.l);

/** Per-game leaders, refreshed every 15 minutes. */
function useLeaders() {
  const [leaders, setLeaders] = useState<NbaLeader[] | null>(null);
  useEffect(() => {
    const load = () => nbaLeaders().then(setLeaders).catch(() => {});
    load();
    const t = setInterval(load, 15 * 60e3);
    return () => clearInterval(t);
  }, []);
  return leaders;
}

/** The NBA, the whole league: tonight's games, the conference races, the leaders; playoffs and Finals when they come. */
export function NbaPage() {
  const { nba, events, news, now } = useData();
  const day = useLeagueGames('nba', now);
  const leaders = useLeaders();
  const [tab, setTab] = useTab(NBA_TABS);
  const season = useNbaSeason(tab !== 'now');
  if (!nba) return <Hero id="nba" dek="Loading the NBA…" />;
  const inPlayoffs = nba.series.length > 0;
  const bracketSeries = inPlayoffs ? nba.series : nba.last?.series ?? [];
  const bracketSeason = inPlayoffs ? nba.season : nba.last?.season ?? nba.season;
  const standings = nba.started ? nba.conferences : nba.last?.conferences ?? nba.conferences;
  const standingsSeason = nba.started ? nba.season : nba.last?.season ?? nba.season;
  const finals = bracketSeries.find(s => s.round === 'NBA Finals');
  const champ = finals?.done ? finals.teams.find(t => t.id === finals.winner) : null;
  const nameOf = (id?: string | null) => [...(nba.last?.conferences ?? []), ...nba.conferences].flatMap(c => c.rows).find(r => r.id === id)?.name ?? id ?? '';
  const live = day?.today.filter(g => g.state === 'in') ?? [];
  const next = day?.today.find(g => g.state === 'pre');
  const teams = nba.conferences.flatMap(c => c.rows.map(r => ({ ...r, conf: c.name })));
  const best = nba.started ? [...teams].sort((a, b) => pct(b) - pct(a) || b.diff - a.diff)[0] : null;
  const unbeaten = nba.started ? teams.filter(r => r.l === 0 && r.w > 0).map(r => r.abbr) : [];
  const winless = nba.started ? teams.filter(r => r.w === 0 && r.l > 0).map(r => r.abbr) : [];
  const playoffGames = events.filter(e => e.passion === 'nba' && e.state !== 'post').slice(0, 8);
  const myNews = news.filter(n => n.passion === 'nba').slice(0, 8);
  const spotlight = inPlayoffs ? [...nba.series].reverse().find(s => !s.done) ?? nba.series[nba.series.length - 1] : null;

  const dek = nba.phase === 'pre'
    ? `The ${seasonLabel(nba.season)} season opens ${nba.regStart ? dayLong(nba.regStart) : 'soon'}.${champ ? ` The ${nameOf(champ.id)} are the champions, ${finals!.teams.map(t => t.wins).sort((a, b) => b - a).join('–')} in the Finals.` : ''}`
    : nba.phase === 'off' && champ ? `The ${nameOf(champ.id)} won the ${seasonLabel(nba.season)} title, ${finals!.teams.map(t => t.wins).sort((a, b) => b - a).join('–')} in the Finals.`
    : spotlight ? seriesSentence(spotlight, nameOf)
    : <>Week {nba.week ?? '–'} of the {seasonLabel(nba.season)} regular season.{day ? ` ${day.today.length} games tonight.` : ''}{unbeaten.length ? ` Still unbeaten: ${unbeaten.join(', ')}.` : ''}{winless.length ? ` Still winless: ${winless.join(', ')}.` : ''}</>;

  return (
    <>
      <Hero id="nba" dek={dek} />
      <ScreenTabs tabs={NBA_TABS} tab={tab} set={setTab} label="NBA screens" />
      {tab !== 'now' ? (!season ? <section className="ocard"><p className="dek">Loading the season…</p></section>
        : tab === 'season' ? <SeasonScreen d={season} now={now} />
        : tab === 'power' ? <PowerScreen d={season} />
        : tab === 'teams' ? <TeamsScreen d={season} />
        : tab === 'players' ? <PlayersScreen d={season} />
        : tab === 'awards' ? <AwardsScreen d={season} />
        : tab === 'history' ? <HistoryScreen d={season} />
        : <HowScreen d={season} />) : <>
      <section className="s-top">
        <div className="ocard s-next">
          <div className="lab">{live.length ? <span style={{ color: '#ff453a' }}>● Live now · {live.length}</span> : 'Next tip-off'}</div>
          {live[0] ? <>
            <Score as="div" className="s-cd">{live[0].away?.abbr} {live[0].away?.score} – {live[0].home?.score} {live[0].home?.abbr}</Score>
            <div className="when" style={{ marginTop: 8 }}>{live[0].clock}{live[0].line.leaders ? ` · ${live[0].line.leaders}` : ''}</div>
          </> : next ? <>
            <h3>{next.title}</h3>
            <div className="when">{dayLong(next.start)} · {hhmm(next.start)} Rome{next.tv ? ` · ${next.tv}` : ''}</div>
            <div className="s-cd">{countdown(next.start - now)}<small>T-minus{new Date(next.start).getUTCHours() < 6 ? ' · night viewing' : ''}</small></div>
          </> : <div>No game tonight.</div>}
        </div>
        <div className="ocard">
          <div className="lab">{inPlayoffs ? 'Playoffs' : 'The season'}</div>
          {spotlight ? <SeriesBox s={spotlight} big /> : (
            <div className="kpis">
              <div className="kpi"><b>{nba.week ?? '–'}</b><span>Week</span></div>
              <div className="kpi"><b>{day?.today.length ?? '–'}</b><span>Games tonight</span></div>
              <div className="kpi"><b>{teams.reduce((a, r) => a + r.w, 0)}</b><span>Games played</span></div>
            </div>
          )}
        </div>
        <div className="ocard">
          <div className="lab">{best ? 'The best record' : champ ? `${seasonLabel(bracketSeason)} champions` : 'Title race'}</div>
          {best ? <><h3 style={{ margin: 0 }}>{best.name}</h3><div className="kpis" style={{ marginTop: 8 }}>
            <div className="kpi"><Score as="b">{best.w}–{best.l}</Score><span>{best.conf}</span></div>
            <div className="kpi"><Score as="b">{best.diff > 0 ? '+' : ''}{best.diff}</Score><span>Point diff. per game</span></div>
            <div className="kpi"><Score as="b">{best.streak || '–'}</Score><span>Streak</span></div>
          </div></> : champ ? <>
            <h3 style={{ margin: 0, fontSize: 28 }}><Score>{nameOf(champ.id)}</Score></h3>
            {finals && <div className="when">Finals vs {nameOf(finals.teams.find(t => t.id !== champ.id)?.id)}, <Score>{finals.teams.map(t => t.wins).sort((a, b) => b - a).join('–')}</Score></div>}
          </> : null}
        </div>
      </section>

      {inPlayoffs && (
        <section className="ocard">
          <h2>The road to the Finals</h2>
          <p className="dek">Play-in, four best-of-seven rounds, the Finals. Seeds on the left, wins as filled dots.</p>
          <Bracket series={bracketSeries} />
        </section>
      )}

      {playoffGames.length > 0 && (
        <section className="ocard">
          <div className="lab">Playoff schedule · Rome time</div>
          <div className="olist">{playoffGames.map(e => <Row key={e.id} e={e} right={e.state === 'in' ? <Score>{e.away?.abbr} {e.away?.score} – {e.home?.score} {e.home?.abbr}</Score> : `in ${countdown(e.start - now)}`} />)}</div>
        </section>
      )}

      {day && day.today.length > 0 && (
        <section className="ocard">
          <h2>Tonight's games</h2>
          <p className="dek">Tip-off in Rome time; the night up to 07:00 counts with the evening before. Live games refresh every 30 seconds with the top scorer of each side.</p>
          <LeagueGameGrid games={day.today} />
          <div className="osrc">Source: ESPN</div>
        </section>
      )}

      <section className="ocard">
        <h2>{nba.started ? 'Conference standings' : `Final standings, ${seasonLabel(standingsSeason)}`}</h2>
        <p className="dek">Seeds 1–6 go straight to the playoffs, 7–10 play in the play-in tournament.</p>
        <div className="s-two" style={{ gap: 24 }}>
          {standings.map(c => <ConfTable key={c.name} c={c} />)}
        </div>
      </section>

      {leaders && leaders.length > 0 && nba.started && (
        <section className="ocard">
          <h2>Statistical leaders</h2>
          <p className="dek">Per game, regular season.{nba.week && nba.week <= 3 ? ' Early in the season a single big night tops the list.' : ''}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
            {leaders.map(c => (
              <div key={c.cat}>
                <div className="lab">{c.label}</div>
                {c.rows.map((r, i) => <div key={r.name + i} style={{ display: 'grid', gridTemplateColumns: '14px 1fr auto', gap: 6, fontSize: 12.5, padding: '2px 0' }}><span style={{ color: 'var(--o-ink3)' }}>{i + 1}</span><span>{r.name} <small style={{ color: 'var(--o-ink3)' }}>{r.team}</small></span><Score><b>{r.value}</b></Score></div>)}
              </div>
            ))}
          </div>
          <div className="osrc">Source: ESPN</div>
        </section>
      )}

      <section className="s-two">
        {day && day.yesterday.length > 0 && (
          <div className="ocard">
            <div className="lab">Last night's results</div>
            <LeagueGameGrid games={day.yesterday} />
          </div>
        )}
        <div className="ocard">
          <div className="lab">From the wire</div>
          <div className="onews">{myNews.map(n => <a key={n.id} className="r" href={n.url} target="_blank" rel="noreferrer"><time>{dayShort(n.time)} · {n.source}</time><p>{n.title}</p></a>)}</div>
        </div>
      </section>

      {!inPlayoffs && bracketSeries.length > 0 && (
        <section className="ocard">
          <h2>How the {seasonLabel(bracketSeason)} playoffs went</h2>
          <p className="dek">Play-in, four best-of-seven rounds, the Finals. Seeds on the left, wins as filled dots. This season's bracket appears in April.</p>
          <Bracket series={bracketSeries} />
        </section>
      )}
      </>}
    </>
  );
}

function seriesSentence(s: Series, nameOf: (id?: string | null) => string) {
  const [a, b] = s.teams;
  if (!a || !b) return '';
  const round = `${s.conf === 'NBA' ? 'NBA Finals' : `${s.conf} ${s.round}`}`;
  const lead = a.wins >= b.wins ? a : b, other = lead === a ? b : a;
  if (s.done) return `The ${nameOf(s.winner)} won the ${round} ${lead.wins}–${other.wins}.`;
  const state = a.wins === b.wins ? `The ${nameOf(a.id)} and the ${nameOf(b.id)} are tied ${a.wins}–${b.wins} in the ${round}.` : `The ${nameOf(lead.id)} lead the ${nameOf(other.id)} ${lead.wins}–${other.wins} in the ${round}.`;
  return `${state}${s.next ? ` Next game ${dayLong(s.next)} at ${hhmm(s.next)} Rome time.` : ''}`;
}

function Dots({ n, of }: { n: number; of: number }) {
  return <span style={{ display: 'inline-flex', gap: 3 }}>{Array.from({ length: of }, (_, i) => <i key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: i < n ? 'var(--o-ink2)' : 'transparent', boxShadow: i < n ? 'none' : 'inset 0 0 0 1.5px var(--o-line)' }} />)}</span>;
}

function SeriesBox({ s, big }: { s: Series; big?: boolean }) {
  const need = Math.ceil(s.bestOf / 2);
  return (
    <div style={{ border: big ? 'none' : '1px solid var(--o-line)', borderRadius: 10, padding: big ? 0 : '7px 10px', display: 'grid', gap: 4, fontFamily: 'var(--f-chart)' }}>
      {big && <div style={{ fontSize: 13, color: 'var(--o-ink2)' }}>{s.conf !== 'NBA' ? `${s.conf} · ` : ''}{s.round}</div>}
      {s.round.startsWith('Play-In') && !big && <div style={{ fontSize: 10.5, color: 'var(--o-ink3)' }}>{s.round.replace('Play-In · ', '')}</div>}
      {s.teams.map(t => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: big ? 18 : 13, opacity: s.done && s.winner !== t.id ? 0.45 : 1 }}>
          <span style={{ width: 16, color: 'var(--o-ink3)', fontSize: 11 }}>{t.seed ?? ''}</span>
          <b style={{ width: big ? 60 : 44 }}>{t.abbr}</b>
          <Score>{s.bestOf === 1 ? (s.done ? (s.winner === t.id ? 'W' : 'L') : '') : <Dots n={t.wins} of={need} />}</Score>
        </div>
      ))}
      {big && s.next && <div className="osrc">Next game {dayShort(s.next)} {hhmm(s.next)} Rome</div>}
    </div>
  );
}

function Bracket({ series }: { series: Series[] }) {
  const round = (s: Series) => (s.round.startsWith('Play-In') ? 'Play-In' : s.round);
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ROUNDS.length}, minmax(150px, 1fr))`, gap: 14, minWidth: 820 }}>
        {ROUNDS.map(r => (
          <div key={r} style={{ display: 'grid', gap: 8, alignContent: 'center' }}>
            <div className="lab" style={{ marginBottom: 0 }}>{r}</div>
            {(['East', 'West', 'NBA'] as const).map(conf => {
              const list = series.filter(s => round(s) === r && s.conf === conf);
              if (!list.length) return null;
              return (
                <div key={conf} style={{ display: 'grid', gap: 6 }}>
                  {conf !== 'NBA' && <div style={{ fontSize: 11, color: 'var(--o-ink3)', fontFamily: 'var(--f-chart)' }}>{conf}</div>}
                  {list.map(s => <SeriesBox key={s.key} s={s} />)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfTable({ c }: { c: Conference }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="lab">{c.name}ern Conference</div>
      <table className="otable">
        <thead><tr><th>#</th><th>Team</th><th className="n">W</th><th className="n">L</th><th className="n">GB</th><th className="n">L10</th><th className="n">Strk</th></tr></thead>
        <tbody>
          {c.rows.map((r, i) => {
            const seed = r.seed ?? i + 1;
            const zone = seed <= 6 ? 'color-mix(in srgb, var(--oc-out) 12%, transparent)' : seed <= 10 ? 'color-mix(in srgb, var(--oc-usa) 12%, transparent)' : 'transparent';
            return (
              <tr key={r.id} style={{ background: zone }}>
                <td>{seed}</td><td>{r.name}{r.clinch ? <small style={{ color: 'var(--o-ink3)' }}> {r.clinch}</small> : null}</td>
                <td className="n">{r.w}</td><td className="n">{r.l}</td><td className="n">{r.gb}</td><td className="n">{r.last10}</td><td className="n">{r.streak}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

