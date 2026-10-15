import { TrendLine, type TrendPoint } from '../components/charts';
import { Score } from '../components/common';
import { Hero, Row, ocol } from '../components/sheet';
import { useData } from '../core/store';
import { DAY, countdown, dayLong, dayShort, hhmm } from '../core/time';
import { DODGERS, type Division, type Series } from '../sources/mlb';

const ROUNDS = ['Wild Card', 'Division Series', 'Championship Series', 'World Series'];

/** MLB: the league at a glance, the Dodgers in focus, October front and centre when it comes. */
export function MlbPage() {
  const { mlb, events, news, now } = useData();
  const games = events.filter(e => e.passion === 'mlb');
  const dodgersGames = games.filter(e => e.home?.mine || e.away?.mine);
  const next = dodgersGames.find(e => e.state !== 'post' && e.start > now - 4 * 3600e3);
  const live = games.filter(e => e.state === 'in');
  const series = mlb?.series ?? [];
  const mySeries = series.filter(s => s.teams.some(t => t.id === DODGERS));
  const current = mySeries[mySeries.length - 1];
  const october = series.length > 0;
  const nlWest = mlb?.divisions.find(d => d.league === 'NL' && d.name === 'West');
  const me = nlWest?.rows.find(r => r.mine);
  const myNews = news.filter(n => n.passion === 'mlb').slice(0, 8);

  // Games above .500, game by game
  let net = 0;
  const trend: TrendPoint[] = (mlb?.dodgers ?? []).map((g, i) => {
    net += g.win ? 1 : -1;
    return { x: g.date, y: net, tip: `Game ${i + 1} · ${dayShort(g.date)} · ${g.win ? 'W' : 'L'} ${g.rs}–${g.ra} ${g.home ? 'vs' : '@'} ${g.opp} · ${net >= 0 ? '+' : ''}${net}` };
  });

  const dek = current
    ? seriesSentence(current)
    : me ? `The Dodgers finished ${me.w}–${me.l}, ${me.gb === '-' || me.gb === '0' ? 'first' : me.gb + ' games back'} in the NL West.` : 'Loading the league…';

  return (
    <>
      <Hero id="mlb" dek={dek} />
      <section className="s-top">
        {next ? (
          <div className="ocard s-next">
            <div className="lab">{next.state === 'in' ? <span style={{ color: '#ff453a' }}>● Dodgers live · {next.clock}</span> : 'Next Dodgers game'}</div>
            <h3>{next.title}</h3>
            <div className="when">{dayLong(next.start)} · {hhmm(next.start)} Rome{next.tv ? ` · ${next.tv}` : ''}{next.sub ? ` · ${next.sub}` : ''}</div>
            {next.state === 'in'
              ? <Score as="div" className="s-cd">{next.away?.abbr} {next.away?.score} – {next.home?.score} {next.home?.abbr}</Score>
              : <div className="s-cd">{countdown(next.start - now)}<small>T-minus · night viewing</small></div>}
          </div>
        ) : <div className="ocard"><div className="lab">Next Dodgers game</div><div>{october && current?.done ? 'Season over.' : 'Not scheduled yet.'}</div></div>}
        <div className="ocard">
          <div className="lab">{october ? 'Dodgers in October' : 'Dodgers season'}</div>
          {current ? <SeriesBox s={current} big /> : me ? <div className="kpis"><div className="kpi"><b>{me.w}–{me.l}</b><span>Record</span></div><div className="kpi"><b>{me.gb}</b><span>Games back</span></div><div className="kpi"><b>{me.streak}</b><span>Streak</span></div></div> : null}
        </div>
        <div className="ocard">
          <div className="lab">Regular season</div>
          {me && (
            <div className="kpis">
              <div className="kpi"><b>{me.w}–{me.l}</b><span>Record</span></div>
              <div className="kpi"><b>{me.seed ? `#${me.seed}` : '–'}</b><span>NL seed</span></div>
              <div className="kpi"><b>{me.diff > 0 ? '+' : ''}{me.diff}</b><span>Run diff. per game</span></div>
            </div>
          )}
        </div>
      </section>

      {live.length > 0 && (
        <section className="ocard">
          <div className="lab"><span style={{ color: '#ff453a' }}>● Live now</span></div>
          <div className="olist">{live.map(e => <Row key={e.id} e={e} right={<Score>{e.away?.abbr} {e.away?.score} – {e.home?.score} {e.home?.abbr} · {e.clock}</Score>} />)}</div>
        </section>
      )}

      {october && (
        <section className="ocard">
          <h2>The road to the World Series</h2>
          <p className="dek">Every postseason series, with wins as filled dots. Seeds on the left.</p>
          <Bracket series={series} />
        </section>
      )}

      {trend.length > 1 && (
        <section className="ocard">
          <h2>The Dodgers' season, game by game</h2>
          <p className="dek">Wins minus losses after each regular-season game. Hover for the result.</p>
          <TrendLine points={trend} color={ocol('mlb')} unit="games over .500" />
          <div className="osrc">Source: ESPN</div>
        </section>
      )}

      <section className="ocard">
        <h2>The league</h2>
        <p className="dek">Final regular-season standings by division. Seeds 1–6 in each league made the postseason.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
          {(mlb?.divisions ?? []).slice().sort((a, b) => (a.league === b.league ? 0 : a.league === 'NL' ? -1 : 1)).map(d => <DivisionTable key={d.league + d.name} d={d} />)}
        </div>
      </section>

      <section className="s-two">
        <div className="ocard">
          <div className="lab">Dodgers schedule · Rome time</div>
          <div className="olist">
            {dodgersGames.filter(e => e.start > now - 6 * DAY).slice(0, 10).map(e => (
              <Row key={e.id} e={e} past={e.state === 'post'} right={e.state === 'post' ? <Score>{e.away?.abbr} {e.away?.score}–{e.home?.score} {e.home?.abbr}</Score> : e.state === 'in' ? e.clock : `in ${countdown(e.start - now)}`} />
            ))}
          </div>
        </div>
        <div className="ocard">
          <div className="lab">From the wire</div>
          <div className="onews">{myNews.map(n => <a key={n.id} className="r" href={n.url} target="_blank" rel="noreferrer"><time>{dayShort(n.time)} · {n.source}</time><p>{n.title}</p></a>)}</div>
        </div>
      </section>
    </>
  );
}

function seriesSentence(s: Series) {
  const me = s.teams.find(t => t.id === DODGERS)!, opp = s.teams.find(t => t.id !== DODGERS)!;
  if (s.done) return s.winner === DODGERS ? `The Dodgers won the ${s.round} ${me.wins}–${opp.wins} over ${opp.abbr}.` : `The Dodgers were eliminated ${opp.wins}–${me.wins} by ${opp.abbr} in the ${s.round}.`;
  const verb = me.wins > opp.wins ? 'lead' : me.wins < opp.wins ? 'trail' : 'are tied with';
  const round = `${s.league === 'MLB' ? '' : s.league + ' '}${s.round}`;
  const edge = me.wins === opp.wins ? `${me.wins}–${opp.wins}` : `${Math.max(me.wins, opp.wins)}–${Math.min(me.wins, opp.wins)}`;
  const elimination = opp.wins === Math.ceil(s.bestOf / 2) - 1 ? ' One more loss ends their season.' : '';
  return `The Dodgers ${verb} ${opp.abbr} ${edge} in the ${round}.${elimination}${s.next ? ` Next game ${dayShort(s.next)} at ${hhmm(s.next)} Rome time.` : ''}`;
}

function Dots({ n, of, color }: { n: number; of: number; color: string }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {Array.from({ length: of }, (_, i) => <i key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: i < n ? color : 'transparent', boxShadow: i < n ? 'none' : 'inset 0 0 0 1.5px var(--o-line)' }} />)}
    </span>
  );
}

function SeriesBox({ s, big }: { s: Series; big?: boolean }) {
  const need = Math.ceil(s.bestOf / 2);
  return (
    <div style={{ border: big ? 'none' : '1px solid var(--o-line)', borderRadius: 10, padding: big ? 0 : '8px 10px', display: 'grid', gap: 6, fontFamily: 'var(--f-chart)' }}>
      {big && <div style={{ fontSize: 13, color: 'var(--o-ink2)' }}>{s.league !== 'MLB' ? s.league + ' ' : ''}{s.round} · best of {s.bestOf}</div>}
      {s.teams.map(t => {
        const lost = s.done && s.winner !== t.id;
        return (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: lost ? 0.45 : 1, fontSize: big ? 18 : 13 }}>
            <span style={{ width: 16, color: 'var(--o-ink3)', fontSize: 11 }}>{t.seed ?? ''}</span>
            <b style={{ width: big ? 60 : 44, color: t.id === DODGERS ? 'var(--oc-usa)' : 'var(--o-ink)' }}>{t.abbr}</b>
            <Score><Dots n={t.wins} of={need} color={t.id === DODGERS ? 'var(--oc-usa)' : 'var(--o-ink2)'} /></Score>
          </div>
        );
      })}
      {big && s.next && <div className="osrc">Next game {dayShort(s.next)} {hhmm(s.next)} Rome</div>}
    </div>
  );
}

function Bracket({ series }: { series: Series[] }) {
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

function DivisionTable({ d }: { d: Division }) {
  return (
    <div>
      <div className="lab">{d.league} {d.name}</div>
      <table className="otable">
        <thead><tr><th>Team</th><th className="n">W</th><th className="n">L</th><th className="n">GB</th><th className="n">Seed</th></tr></thead>
        <tbody>
          {d.rows.map(r => (
            <tr key={r.id} className={r.mine ? 'me' : ''}>
              <td>{r.name}{r.clinch ? <small style={{ color: 'var(--o-ink3)' }}> {r.clinch}</small> : null}</td>
              <td className="n">{r.w}</td><td className="n">{r.l}</td><td className="n">{r.gb}</td><td className="n">{r.seed ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
