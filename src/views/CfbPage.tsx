import { BumpChart } from '../components/charts';
import { Score, Tbc } from '../components/common';
import { ScreenTabs, useTab } from '../components/tabs';
import { CFB_TABS, ConferencesScreen, HeismanScreen, HistoryScreen, HowScreen, PowerScreen, RankingsScreen, SeasonScreen, useCfbSeason } from './CfbScreens';
import { Hero, Row } from '../components/sheet';
import { useData } from '../core/store';
import { DAY, countdown, dayLong, dayShort, hhmm, isNight } from '../core/time';
import { TEXAS, type CfpRound, type PostGame, type RankRow } from '../sources/cfb';

const ROUNDS: CfpRound[] = ['First Round', 'Quarterfinal', 'Semifinal', 'National Championship'];

/** College football: Top 25 race now, the 12-team playoff and every bowl later. */
export function CfbPage() {
  const { cfb, events, news, now } = useData();
  const [tab, setTab] = useTab(CFB_TABS);
  const season = useCfbSeason(tab !== 'now');
  if (!cfb) return <Hero id="cfb" dek="Loading college football…" />;
  const matchups = events.filter(e => e.passion === 'cfb' && e.sub === 'Top 25 matchup' && e.start > now - 4 * 3600e3);
  const cfpGames = cfb.post.filter(g => g.cfp);
  const bowls = cfb.post.filter(g => !g.cfp);
  const texas = cfb.ap.find(r => r.id === TEXAS);
  const poll = cfb.cfp ?? cfb.ap;
  const nextCfp = cfpGames.find(g => g.state !== 'post');
  const top = poll.slice(0, 10).map(r => r.id);
  const ids = [...new Set([...top, TEXAS])];
  const weeks = cfb.history.map(h => h.week);
  const series = ids.map(id => ({
    id, name: cfb.names[id] ?? id, color: id === TEXAS ? 'var(--oc-usa)' : undefined,
    ranks: cfb.history.map(h => h.ranks[id] ?? null),
  }));
  const myNews = news.filter(n => n.passion === 'cfb' || n.passion === 'texas').slice(0, 8);

  return (
    <>
      <Hero id="cfb" dek={`Week ${cfb.week ?? ''} of the ${cfb.season} season. ${cfb.cfp ? 'The playoff committee has released its rankings.' : 'The first playoff committee rankings arrive in November.'} The 12-team playoff starts ${cfb.firstGame ? dayLong(cfb.firstGame) : 'in December'}.`} />
      <ScreenTabs tabs={CFB_TABS} tab={tab} set={setTab} label="College football screens" />
      {tab !== 'now' ? (!season ? <section className="ocard"><p className="dek">Loading the season…</p></section>
        : tab === 'season' ? <SeasonScreen d={season} />
        : tab === 'power' ? <PowerScreen d={season} />
        : tab === 'rankings' ? <RankingsScreen d={season} />
        : tab === 'conferences' ? <ConferencesScreen d={season} />
        : tab === 'heisman' ? <HeismanScreen d={season} />
        : tab === 'history' ? <HistoryScreen d={season} />
        : <HowScreen d={season} />) : <>
      <section className="s-top">
        <div className="ocard s-next">
          <div className="lab">College Football Playoff</div>
          <h3>{nextCfp ? `${nextCfp.cfp}${nextCfp.cfp === 'First Round' ? '' : ' · ' + nextCfp.bowl}` : 'Season complete'}</h3>
          {nextCfp && <div className="when">{dayLong(nextCfp.start)} · {nextCfp.timeValid ? `${hhmm(nextCfp.start)} Rome` : 'time TBC'}</div>}
          {nextCfp && <div className="s-cd">{countdown(nextCfp.start - now)}<small>until kickoff</small></div>}
        </div>
        <div className="ocard">
          <div className="lab">This week's Top 25 matchups</div>
          <div className="olist">
            {matchups.slice(0, 4).map(e => (
              <div key={e.id} className="r" style={{ gridTemplateColumns: '78px 1fr' }}>
                <time>{dayShort(e.start)}<small>{hhmm(e.start)}{isNight(e.start) ? ' · night' : ''}</small></time>
                <div><b>{e.title}</b>{e.state !== 'pre' && <Score as="div"><small>{e.away?.score}–{e.home?.score} · {e.state === 'in' ? e.clock : 'Final'}</small></Score>}</div>
              </div>
            ))}
            {!matchups.length && <div style={{ color: 'var(--o-ink3)' }}>No ranked-vs-ranked games this week.</div>}
          </div>
        </div>
        <div className="ocard">
          <div className="lab">Texas Longhorns</div>
          <div className="kpis">
            <div className="kpi"><Score as="b">{texas ? `#${texas.rank}` : 'NR'}</Score><span>AP poll</span></div>
            <div className="kpi"><Score as="b">{texas?.record ?? '–'}</Score><span>Record</span></div>
            <div className="kpi"><b>{texas?.prev ? (texas.prev > texas.rank ? `▲${texas.prev - texas.rank}` : texas.prev < texas.rank ? `▼${texas.rank - texas.prev}` : '=') : '–'}</b><span>Since last week</span></div>
          </div>
        </div>
      </section>

      <section className="ocard">
        <h2>The 12-team playoff</h2>
        <p className="dek">First round on campus, quarterfinals and semifinals in the New Year's Six bowls, the final in Las Vegas. Teams appear once the committee seeds the field on Selection Sunday. Times in Rome time.</p>
        <Bracket games={cfpGames} />
      </section>

      {weeks.length > 1 && (
        <section className="ocard">
          <h2>How the top of the poll moved</h2>
          <p className="dek">AP rank each week for today's top ten, plus Texas in orange. Hover a line to follow one team.</p>
          <BumpChart weeks={weeks} series={series} maxRank={Math.min(25, Math.max(10, Math.ceil(Math.max(...series.flatMap(x => x.ranks.filter((r): r is number => r != null))) / 5) * 5))} />
          <div className="osrc">Source: AP poll via ESPN</div>
        </section>
      )}

      <section className="s-two">
        <div className="ocard">
          <div className="lab">Bowl season · {bowls.length} games · Rome time</div>
          <div className="olist">
            {bowls.map(g => (
              <div key={g.id} className={`r${g.state === 'post' ? ' past' : ''}`}>
                <time>{dayShort(g.start)}<small>{g.timeValid ? hhmm(g.start) : 'TBC'}{g.timeValid && isNight(g.start) ? ' · night' : ''}</small></time>
                <div><b>{g.bowl}</b><small>{g.teams.every(t => t.id) ? g.teams.map(t => t.name).join(' vs ') : 'Teams TBD'} · {g.city}{g.tv ? ' · ' + g.tv : ''}</small></div>
                <span className="x">{g.state === 'post' ? <Score>{g.teams.map(t => t.score).join('–')}</Score> : g.start - now < 30 * DAY ? `in ${countdown(g.start - now)}` : ''}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
          <Poll title={cfb.cfp ? 'CFP rankings' : 'AP Top 25'} rows={poll} />
          {cfb.cfp && <Poll title="AP Top 25" rows={cfb.ap} />}
          <div className="ocard">
            <div className="lab">From the wire</div>
            <div className="onews">{myNews.map(n => <a key={n.id} className="r" href={n.url} target="_blank" rel="noreferrer"><time>{dayShort(n.time)} · {n.source}</time><p>{n.title}</p></a>)}</div>
          </div>
        </div>
      </section>

      <section className="ocard">
        <div className="lab">Playoff calendar · Rome time</div>
        <div className="olist">{events.filter(e => e.passion === 'cfb' && e.sub?.startsWith('College Football Playoff')).map(e => <Row key={e.id} e={e} right={e.state === 'post' ? 'Final' : `in ${countdown(e.start - now)}`} />)}</div>
      </section>
      </>}
    </>
  );
}

function Bracket({ games }: { games: PostGame[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ROUNDS.length}, minmax(180px, 1fr))`, gap: 16, minWidth: 760 }}>
        {ROUNDS.map(round => (
          <div key={round} style={{ display: 'grid', gap: 10, alignContent: 'space-around' }}>
            <div className="lab" style={{ marginBottom: 0 }}>{round}</div>
            {games.filter(g => g.cfp === round).map(g => <GameBox key={g.id} g={g} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

function GameBox({ g }: { g: PostGame }) {
  return (
    <div style={{ border: '1px solid var(--o-line)', borderRadius: 10, padding: '8px 10px', fontFamily: 'var(--f-chart)', display: 'grid', gap: 4 }}>
      <div style={{ fontSize: 11, color: 'var(--o-ink3)' }}>
        {g.cfp === 'First Round' ? 'On campus' : g.bowl} · {dayShort(g.start)} {g.timeValid ? hhmm(g.start) : ''}{!g.timeValid && <Tbc e={{ tbc: true }} />}
      </div>
      {g.teams.map((t, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, opacity: g.state === 'post' && !t.winner ? 0.45 : 1 }}>
          <span style={{ width: 16, color: 'var(--o-ink3)', fontSize: 11 }}>{t.seed ?? ''}</span>
          <b style={{ flex: 1, color: t.id === TEXAS ? 'var(--oc-usa)' : t.id ? 'var(--o-ink)' : 'var(--o-ink3)', fontWeight: t.id ? 600 : 400 }}>{t.id ? t.name : 'TBD'}</b>
          {g.state !== 'pre' && <Score>{t.score}</Score>}
        </div>
      ))}
    </div>
  );
}

function Poll({ title, rows }: { title: string; rows: RankRow[] }) {
  return (
    <div className="ocard">
      <div className="lab">{title}</div>
      <table className="otable">
        <thead><tr><th>#</th><th>Team</th><th className="n">W–L</th><th className="n">Move</th></tr></thead>
        <tbody>
          {rows.map(r => {
            const mv = r.prev ? r.prev - r.rank : 0;
            return (
              <tr key={r.id} className={r.id === TEXAS ? 'me' : ''}>
                <td>{r.rank}</td><td>{r.name}</td><td className="n">{r.record}</td>
                <td className="n" style={{ color: mv > 0 ? 'var(--oc-out)' : mv < 0 ? 'var(--oc-mil)' : 'var(--o-ink3)' }}>{r.prev ? (mv > 0 ? `▲${mv}` : mv < 0 ? `▼${-mv}` : '–') : 'new'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
