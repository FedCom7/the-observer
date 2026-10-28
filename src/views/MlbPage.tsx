import { useWidth } from '../components/charts';
import { Score } from '../components/common';
import { LeagueGameGrid, useLeagueGames } from '../components/LeagueGames';
import { Hero, Row } from '../components/sheet';
import { ScreenTabs, useTab } from '../components/tabs';
import { AwardsScreen, HistoryScreen, HowScreen, MLB_TABS, OffseasonScreen, PlayersScreen, PowerScreen, SeasonScreen, TeamsScreen, useMlbSeason } from './MlbScreens';
import { useData } from '../core/store';
import { countdown, dayLong, dayShort, hhmm } from '../core/time';
import { DODGERS, type Division, type DivisionRow, type MlbData, type Series } from '../sources/mlb';

const ROUNDS = ['Wild Card', 'Division Series', 'Championship Series', 'World Series'];
const DIVS = ['East', 'Central', 'West'];
const pct = (r: { w: number; l: number }) => r.w / Math.max(1, r.w + r.l);
const nameOf = (m: MlbData | undefined, id?: string | null) => m?.divisions.flatMap(d => d.rows).find(r => r.id === id)?.name ?? '';

/** MLB, the whole league: the day's games, the standings and the playoff picture in season, October front and centre when it comes. */
export function MlbPage() {
  const { mlb, news, now } = useData();
  const day = useLeagueGames('mlb', now);
  const [tab, setTab] = useTab(MLB_TABS);
  const season = useMlbSeason(tab !== 'now');
  const series = mlb?.series ?? [];
  const october = series.length > 0;
  const ws = series.find(s => s.round === 'World Series');
  // The series in the spotlight: the World Series, otherwise the latest round still going
  const spotlight = ws ?? [...series].reverse().find(s => !s.done) ?? series[series.length - 1];
  const live = day?.today.filter(g => g.state === 'in') ?? [];
  const next = day?.today.find(g => g.state === 'pre');
  const all = (mlb?.divisions ?? []).flatMap(d => d.rows.map(r => ({ ...r, league: d.league, div: d.name })));
  const best = [...all].sort((a, b) => pct(b) - pct(a) || b.diff - a.diff)[0];
  const upcoming = (mlb?.postseasonEvents ?? []).filter(e => e.state !== 'post').slice(0, 8);
  const myNews = news.filter(n => n.passion === 'mlb').slice(0, 8);

  const dek = !mlb ? 'Loading the league…'
    : mlb.phase === 'off' && ws ? `The ${nameOf(mlb, ws.winner)} won the ${mlb.season} World Series, ${ws.teams.map(t => t.wins).sort((a, b) => b - a).join('–')} over the ${nameOf(mlb, ws.teams.find(t => t.id !== ws.winner)?.id)}.`
    : october && spotlight ? seriesSentence(mlb, spotlight)
    : mlb.phase === 'pre' && mlb.regStart ? `Opening day is ${dayLong(mlb.regStart)}.`
    : `Week ${mlb.week ?? '–'} of the regular season.${best ? ` Best record: ${best.name}, ${best.w}–${best.l}.` : ''}${day ? ` ${day.today.length} games today.` : ''}`;

  return (
    <>
      <Hero id="mlb" dek={dek} />
      <ScreenTabs tabs={MLB_TABS} tab={tab} set={setTab} label="MLB screens" />
      {tab !== 'now' ? (tab === 'how' ? <HowScreen /> : !season ? <section className="ocard"><p className="dek">Loading the season…</p></section>
        : tab === 'season' ? <SeasonScreen d={season} now={now} />
        : tab === 'power' ? <PowerScreen d={season} />
        : tab === 'teams' ? <TeamsScreen d={season} />
        : tab === 'players' ? <PlayersScreen d={season} />
        : tab === 'awards' ? <AwardsScreen d={season} />
        : tab === 'offseason' ? <OffseasonScreen d={season} />
        : <HistoryScreen d={season} />) : <>
      <section className="s-top">
        <div className="ocard s-next">
          <div className="lab">{live.length ? <span style={{ color: '#ff453a' }}>● Live now · {live.length}</span> : 'Next first pitch'}</div>
          {live[0] ? <LiveLine g={live[0]} /> : next ? <>
            <h3>{next.title}</h3>
            <div className="when">{dayLong(next.start)} · {hhmm(next.start)} Rome{next.tv ? ` · ${next.tv}` : ''}{next.sub ? ` · ${next.sub}` : ''}</div>
            <div className="s-cd">{countdown(next.start - now)}<small>T-minus</small></div>
          </> : <div>{mlb?.phase === 'off' ? 'Season over. Spring training in February.' : 'No game today.'}</div>}
        </div>
        <div className="ocard">
          <div className="lab">{october ? (mlb?.phase === 'off' ? 'World Series' : `Postseason · ${spotlight?.round}`) : 'The season'}</div>
          {october && spotlight ? <SeriesBox s={spotlight} big /> : mlb && (
            <div className="kpis">
              <div className="kpi"><b>{mlb.week ?? '–'}</b><span>Week</span></div>
              <div className="kpi"><b>{day?.today.length ?? '–'}</b><span>Games today</span></div>
              <div className="kpi"><b>{mlb.regEnd ? Math.max(0, Math.ceil((mlb.regEnd - now) / 86400e3)) : '–'}</b><span>Days to October</span></div>
            </div>
          )}
        </div>
        <div className="ocard">
          <div className="lab">The best record</div>
          {best && <><h3 style={{ margin: 0 }}>{best.name}</h3><div className="kpis" style={{ marginTop: 8 }}>
            <div className="kpi"><Score as="b">{best.w}–{best.l}</Score><span>{best.league} {best.div}</span></div>
            <div className="kpi"><Score as="b">{best.diff > 0 ? '+' : ''}{best.diff}</Score><span>Run diff.</span></div>
            <div className="kpi"><Score as="b">{best.streak || '–'}</Score><span>Streak</span></div>
          </div></>}
        </div>
      </section>

      {october && (
        <section className="ocard">
          <h2>The road to the World Series</h2>
          <p className="dek">Every postseason series, with wins as filled dots. Seeds on the left.</p>
          <Bracket series={series} />
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="ocard">
          <div className="lab">Postseason schedule · Rome time</div>
          <div className="olist">{upcoming.map(e => <Row key={e.id} e={e} right={e.state === 'in' ? <Score>{e.away?.abbr} {e.away?.score} – {e.home?.score} {e.home?.abbr}</Score> : `in ${countdown(e.start - now)}`} />)}</div>
        </section>
      )}

      {day && day.today.length > 0 && (
        <section className="ocard">
          <h2>Today's games</h2>
          <p className="dek">First pitch in Rome time; the night up to 07:00 counts with the evening before. Live games refresh every 30 seconds with count, outs and runners.</p>
          <LeagueGameGrid games={day.today} />
          <div className="osrc">Source: ESPN</div>
        </section>
      )}

      {!october && all.length > 0 && <Picture all={all} />}

      {all.some(r => r.w + r.l > 0) && (
        <section className="ocard">
          <h2>Run differential, all 30 teams</h2>
          <p className="dek">Runs scored minus runs allowed{mlb?.phase === 'regular' ? ' so far' : ' over the regular season'}, the best single measure of how good a team has been. Grouped by division; American League in red, National League in blue.</p>
          <DiffChart all={all} />
          <div className="osrc">Source: ESPN standings</div>
        </section>
      )}

      <section className="ocard">
        <h2>The six divisions</h2>
        <p className="dek">{mlb?.phase === 'regular' ? 'Standings to date.' : 'Final regular-season standings.'} The three division winners and three wild cards in each league reach the postseason; seeds in brackets.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
          {(mlb?.divisions ?? []).slice().sort((a, b) => (a.league === b.league ? DIVS.indexOf(a.name) - DIVS.indexOf(b.name) : a.league === 'AL' ? -1 : 1)).map(d => <DivisionTable key={d.league + d.name} d={d} />)}
        </div>
      </section>

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
      </>}
    </>
  );
}

function LiveLine({ g }: { g: { away?: { name: string; score?: string }; home?: { name: string; score?: string }; clock?: string; line: { situation?: string } } }) {
  return (
    <>
      <Score as="div" className="s-cd">{g.away?.name} {g.away?.score} – {g.home?.score} {g.home?.name}</Score>
      <div className="when" style={{ marginTop: 8 }}>{g.clock}{g.line.situation ? ` · ${g.line.situation}` : ''}</div>
    </>
  );
}

/** One sentence on a series, from the leader's side. */
export function seriesSentence(m: MlbData, s: Series) {
  const [a, b] = s.teams;
  if (!a || !b) return '';
  const round = `${s.league === 'MLB' ? '' : s.league + ' '}${s.round}`;
  const lead = a.wins >= b.wins ? a : b, other = lead === a ? b : a;
  if (s.done) return `The ${nameOf(m, s.winner)} won the ${round} ${lead.wins}–${other.wins}.`;
  const need = Math.ceil(s.bestOf / 2);
  const state = a.wins === 0 && b.wins === 0 ? `The ${nameOf(m, a.id)} and the ${nameOf(m, b.id)} open the ${round}.`
    : a.wins === b.wins ? `The ${nameOf(m, a.id)} and the ${nameOf(m, b.id)} are tied ${a.wins}–${b.wins} in the ${round}.`
    : `The ${nameOf(m, lead.id)} lead the ${nameOf(m, other.id)} ${lead.wins}–${other.wins} in the ${round}.${lead.wins === need - 1 ? ' One more win takes it.' : ''}`;
  return `${state}${s.next ? ` Next game ${dayLong(s.next)} at ${hhmm(s.next)} Rome time.` : ''}`;
}

function Dots({ n, of, color }: { n: number; of: number; color: string }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {Array.from({ length: of }, (_, i) => <i key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: i < n ? color : 'transparent', boxShadow: i < n ? 'none' : 'inset 0 0 0 1.5px var(--o-line)' }} />)}
    </span>
  );
}

export function SeriesBox({ s, big, mine = DODGERS }: { s: Series; big?: boolean; mine?: string }) {
  const need = Math.ceil(s.bestOf / 2);
  return (
    <div style={{ border: big ? 'none' : '1px solid var(--o-line)', borderRadius: 10, padding: big ? 0 : '8px 10px', display: 'grid', gap: 6, fontFamily: 'var(--f-chart)' }}>
      {big && <div style={{ fontSize: 13, color: 'var(--o-ink2)' }}>{s.league !== 'MLB' ? s.league + ' ' : ''}{s.round} · best of {s.bestOf}</div>}
      {s.teams.map(t => {
        const lost = s.done && s.winner !== t.id;
        return (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: lost ? 0.45 : 1, fontSize: big ? 18 : 13 }}>
            <span style={{ width: 16, color: 'var(--o-ink3)', fontSize: 11 }}>{t.seed ?? ''}</span>
            <b style={{ width: big ? 60 : 44, color: t.id === mine ? 'var(--oc-usa)' : 'var(--o-ink)' }}>{t.abbr}</b>
            <Score><Dots n={t.wins} of={need} color={t.id === mine ? 'var(--oc-usa)' : 'var(--o-ink2)'} /></Score>
          </div>
        );
      })}
      {big && s.next && <div className="osrc">Next game {dayShort(s.next)} {hhmm(s.next)} Rome</div>}
    </div>
  );
}

export function Bracket({ series }: { series: Series[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ROUNDS.length}, minmax(170px, 1fr))`, gap: 16, minWidth: 720 }}>
        {ROUNDS.map(round => (
          <div key={round} style={{ display: 'grid', gap: 10, alignContent: 'center' }}>
            <div className="lab" style={{ marginBottom: 0 }}>{round}</div>
            {(['AL', 'NL', 'MLB'] as const).map(lg => {
              const list = series.filter(s => s.round === round && s.league === lg);
              if (!list.length) return null;
              return (
                <div key={lg} style={{ display: 'grid', gap: 8 }}>
                  {lg !== 'MLB' && <div style={{ fontSize: 11, color: 'var(--o-ink3)', fontFamily: 'var(--f-chart)' }}>{lg === 'AL' ? 'American League' : 'National League'}</div>}
                  {list.map(s => <SeriesBox key={s.key} s={s} />)}
                </div>
              );
            })}
            {!series.some(s => s.round === round) && <div style={{ fontSize: 12, color: 'var(--o-ink3)' }}>To be decided</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

type Team = DivisionRow & { league: 'AL' | 'NL'; div: string };

/** If the season ended today: three division winners and three wild cards per league. */
function Picture({ all }: { all: Team[] }) {
  return (
    <section className="ocard">
      <h2>If the season ended today</h2>
      <p className="dek">Six teams per league: the three division leaders, then three wild cards. Seeds 1 and 2 skip the Wild Card Series.</p>
      <div className="s-two" style={{ gap: 24 }}>
        {(['AL', 'NL'] as const).map(lg => {
          const teams = all.filter(r => r.league === lg);
          const seeds = teams.filter(r => r.seed && r.seed <= 6).sort((a, b) => a.seed! - b.seed!);
          const hunt = teams.filter(r => !r.seed || r.seed > 6).sort((a, b) => pct(b) - pct(a)).slice(0, 3);
          const cut = seeds[seeds.length - 1];
          return (
            <div key={lg}>
              <div className="lab">{lg === 'AL' ? 'American League' : 'National League'}</div>
              <table className="otable"><tbody>
                {seeds.map(r => <tr key={r.id} className={r.mine ? 'me' : ''}><td style={{ width: 24 }}><b>{r.seed}</b></td><td>{r.name}<small style={{ color: 'var(--o-ink3)' }}>{r.seed! <= 3 ? ` · ${r.div} leader` : ' · wild card'}{r.seed! <= 2 ? ' · bye' : ''}</small></td><td className="n"><Score>{r.w}–{r.l}</Score></td></tr>)}
                {hunt.map(r => <tr key={r.id} className={r.mine ? 'me' : ''} style={{ color: 'var(--o-ink3)' }}><td /><td>{r.name} <small>· {cut ? `${((cut.w - r.w + r.l - cut.l) / 2).toFixed(1).replace('.0', '')} back` : 'in the hunt'}</small></td><td className="n">{r.w}–{r.l}</td></tr>)}
              </tbody></table>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DiffChart({ all }: { all: Team[] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const order = (['AL', 'NL'] as const).flatMap(lg => DIVS.flatMap(d => all.filter(r => r.league === lg && r.div === d).sort((a, b) => b.diff - a.diff)));
  const max = Math.max(10, ...order.map(r => Math.abs(r.diff)));
  const H = 260, l = 38, b = 46, t = 10;
  const band = (W - l) / Math.max(1, order.length), bw = Math.min(18, band * 0.7);
  const y = (v: number) => t + ((max - v) / (2 * max)) * (H - t - b);
  return (
    <div ref={ref} className="ochart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Run differential by team">
        {[-max, 0, max].map(v => <g key={v}><line x1={l} x2={W} y1={y(v)} y2={y(v)} stroke={v === 0 ? 'var(--o-ink3)' : 'var(--o-grid)'} /><text x={l - 6} y={y(v) + 4} textAnchor="end">{v > 0 ? `+${Math.round(v)}` : Math.round(v)}</text></g>)}
        {order.map((r, i) => {
          const cx = l + band * i + band / 2;
          const divStart = i === 0 || order[i - 1].div !== r.div || order[i - 1].league !== r.league;
          return (
            <g key={r.id}>
              {divStart && <><line x1={l + band * i} x2={l + band * i} y1={t} y2={H - 14} stroke="var(--o-grid)" /><text x={l + band * i + 3} y={H - 4} style={{ fontSize: 10 }}>{r.league} {r.div}</text></>}
              <rect x={cx - bw / 2} y={Math.min(y(r.diff), y(0))} width={bw} height={Math.abs(y(r.diff) - y(0))} rx={2} fill={r.league === 'AL' ? 'var(--o-rep)' : 'var(--o-dem)'}><title>{`${r.name} ${r.w}–${r.l} · ${r.diff > 0 ? '+' : ''}${r.diff}`}</title></rect>
              <text x={cx} y={H - 22} textAnchor="middle" style={{ fontSize: 9.5, fill: 'var(--o-ink2)' }} transform={`rotate(-90 ${cx} ${H - 22})`}>{r.abbr}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DivisionTable({ d }: { d: Division }) {
  return (
    <div>
      <div className="lab">{d.league} {d.name}</div>
      <table className="otable">
        <thead><tr><th>Team</th><th className="n">W</th><th className="n">L</th><th className="n">GB</th><th className="n">Diff</th><th className="n">Strk</th></tr></thead>
        <tbody>
          {d.rows.map(r => (
            <tr key={r.id} className={r.mine ? 'me' : ''}>
              <td>{r.name}{r.seed ? <small style={{ color: 'var(--o-ink3)' }}> ({r.seed})</small> : null}</td>
              <td className="n">{r.w}</td><td className="n">{r.l}</td><td className="n">{r.gb}</td><td className="n">{r.diff > 0 ? '+' : ''}{r.diff}</td><td className="n">{r.streak}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
