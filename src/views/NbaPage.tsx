import { TrendLine, type TrendPoint } from '../components/charts';
import { Score } from '../components/common';
import { Hero, Row, ocol } from '../components/sheet';
import { useData } from '../core/store';
import { DAY, countdown, dayLong, dayShort, hhmm } from '../core/time';
import { LAKERS, type Conference, type Series } from '../sources/nba';

const ROUNDS = ['Play-In', 'First Round', 'Conference Semifinals', 'Conference Finals', 'NBA Finals'];
const seasonLabel = (y: number) => `${y - 1}–${String(y).slice(2)}`;

/** NBA: the league at a glance, the Lakers in focus, playoffs and Finals when they come. */
export function NbaPage() {
  const { nba, events, news, now } = useData();
  if (!nba) return <Hero id="nba" dek="Loading the NBA…" />;
  const games = events.filter(e => e.passion === 'nba');
  const lakersGames = games.filter(e => e.home?.mine || e.away?.mine).sort((a, b) => a.start - b.start);
  const next = lakersGames.find(e => e.state !== 'post' && e.start > now - 3 * 3600e3);
  const live = games.filter(e => e.state === 'in');
  const inPlayoffs = nba.series.length > 0;
  const bracketSeries = inPlayoffs ? nba.series : nba.last?.series ?? [];
  const bracketSeason = inPlayoffs ? nba.season : nba.last?.season ?? nba.season;
  const standings = nba.started ? nba.conferences : nba.last?.conferences ?? nba.conferences;
  const standingsSeason = nba.started ? nba.season : nba.last?.season ?? nba.season;
  const me = nba.conferences.find(c => c.name === 'West')?.rows.find(r => r.mine);
  const meLast = nba.last?.conferences.find(c => c.name === 'West')?.rows.find(r => r.mine);
  const finals = bracketSeries.find(s => s.round === 'NBA Finals');
  const champ = finals?.done ? finals.teams.find(t => t.id === finals.winner) : null;
  const lakersExit = [...bracketSeries].reverse().find(s => s.teams.some(t => t.id === LAKERS));
  const myNews = news.filter(n => n.passion === 'nba').slice(0, 8);
  const nameOf = (id?: string) => [...(nba.last?.conferences ?? []), ...nba.conferences].flatMap(c => c.rows).find(r => r.id === id)?.name ?? id ?? '';
  const lakersScore = (s: Series) => `${s.teams.find(t => t.id === LAKERS)?.wins}–${s.teams.find(t => t.id !== LAKERS)?.wins}`;

  let net = 0;
  const trend: TrendPoint[] = nba.lakers.map((g, i) => {
    net += g.win ? 1 : -1;
    return { x: g.date, y: net, tip: `Game ${i + 1} · ${dayShort(g.date)} · ${g.win ? 'W' : 'L'} ${g.pf}–${g.pa} ${g.home ? 'vs' : '@'} ${g.opp} · ${net >= 0 ? '+' : ''}${net}` };
  });

  const dek = !nba.started
    ? `The ${seasonLabel(nba.season)} season opens ${next ? `${dayLong(next.start)} with ${next.title}` : 'soon'}.${champ ? ` Last season the ${nameOf(champ.id)} won the title, ${finals!.teams.map(t => t.wins).sort((a, b) => b - a).join('–')} in the Finals.` : ''}${lakersExit ? ` The Lakers went out in the ${lakersExit.conf === 'NBA' ? '' : lakersExit.conf + ' '}${lakersExit.round.toLowerCase()}.` : ''}`
    : me ? `The Lakers are ${me.w}–${me.l}, ${me.seed ? `#${me.seed} in the West` : ''}${me.streak ? ` (streak ${me.streak})` : ''}.` : '';

  return (
    <>
      <Hero id="nba" dek={dek} />
      <section className="s-top">
        {next ? (
          <div className="ocard s-next">
            <div className="lab">{next.state === 'in' ? <span style={{ color: '#ff453a' }}>● Lakers live · {next.clock}</span> : 'Next Lakers game'}</div>
            <h3>{next.title}</h3>
            <div className="when">{dayLong(next.start)} · {hhmm(next.start)} Rome{next.tv ? ` · ${next.tv}` : ''}{next.sub && !/Week/.test(next.sub) ? ` · ${next.sub}` : ''}</div>
            {next.state === 'in'
              ? <Score as="div" className="s-cd">{next.away?.abbr} {next.away?.score} – {next.home?.score} {next.home?.abbr}</Score>
              : <div className="s-cd">{countdown(next.start - now)}<small>T-minus{new Date(next.start).getUTCHours() < 6 ? ' · night viewing' : ''}</small></div>}
          </div>
        ) : <div className="ocard"><div className="lab">Next Lakers game</div><div>Not scheduled.</div></div>}
        <div className="ocard">
          <div className="lab">Lakers {nba.started ? seasonLabel(nba.season) : `last season (${seasonLabel(nba.last?.season ?? nba.season - 1)})`}</div>
          {(nba.started ? me : meLast) && (() => {
            const r = (nba.started ? me : meLast)!;
            return (
              <div className="kpis">
                <div className="kpi"><Score as="b">{r.w}–{r.l}</Score><span>Record</span></div>
                <div className="kpi"><b>{r.seed ? `#${r.seed}` : '–'}</b><span>West seed</span></div>
                <div className="kpi"><b>{r.diff > 0 ? '+' : ''}{r.diff}</b><span>Point diff. per game</span></div>
              </div>
            );
          })()}
          {!nba.started && lakersExit && <div className="osrc">Playoffs: out in the {lakersExit.round.toLowerCase()} vs the {nameOf(lakersExit.teams.find(t => t.id !== LAKERS)?.id)}, <Score>{lakersScore(lakersExit)}</Score></div>}
        </div>
        <div className="ocard">
          <div className="lab">{champ ? `${seasonLabel(bracketSeason)} champions` : 'Title race'}</div>
          {champ ? <h3 style={{ margin: 0, fontSize: 28 }}><Score>{nameOf(champ.id)}</Score></h3> : <div>{standings[0]?.rows[0]?.name} lead the East, {standings[1]?.rows[0]?.name} the West.</div>}
          {champ && finals && <div className="when">Finals vs {nameOf(finals.teams.find(t => t.id !== champ.id)?.id)}, <Score>{finals.teams.map(t => t.wins).sort((a, b) => b - a).join('–')}</Score></div>}
        </div>
      </section>

      {live.length > 0 && (
        <section className="ocard">
          <div className="lab"><span style={{ color: '#ff453a' }}>● Live now</span></div>
          <div className="olist">{live.map(e => <Row key={e.id} e={e} right={<Score>{e.away?.abbr} {e.away?.score} – {e.home?.score} {e.home?.abbr} · {e.clock}</Score>} />)}</div>
        </section>
      )}

      {bracketSeries.length > 0 && (
        <section className="ocard">
          <h2>{inPlayoffs ? 'The road to the Finals' : `How the ${seasonLabel(bracketSeason)} playoffs went`}</h2>
          <p className="dek">Play-in, four best-of-seven rounds, the Finals. Seeds on the left, wins as filled dots.{inPlayoffs ? '' : ' This season\'s bracket appears in April.'}</p>
          <Bracket series={bracketSeries} />
        </section>
      )}

      {trend.length > 1 && (
        <section className="ocard">
          <h2>The Lakers' season, game by game</h2>
          <p className="dek">Wins minus losses after each game. Hover for the result.</p>
          <TrendLine points={trend} color={ocol('nba')} unit="games over .500" />
        </section>
      )}

      <section className="ocard">
        <h2>{nba.started ? 'Conference standings' : `Final standings, ${seasonLabel(standingsSeason)}`}</h2>
        <p className="dek">Seeds 1–6 go straight to the playoffs, 7–10 play in the play-in tournament.</p>
        <div className="s-two" style={{ gap: 24 }}>
          {standings.map(c => <ConfTable key={c.name} c={c} />)}
        </div>
      </section>

      <section className="s-two">
        <div className="ocard">
          <div className="lab">Lakers schedule · Rome time</div>
          <div className="olist">
            {lakersGames.filter(e => e.start > now - 5 * DAY).slice(0, 10).map(e => (
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

function Dots({ n, of, color }: { n: number; of: number; color: string }) {
  return <span style={{ display: 'inline-flex', gap: 3 }}>{Array.from({ length: of }, (_, i) => <i key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: i < n ? color : 'transparent', boxShadow: i < n ? 'none' : 'inset 0 0 0 1.5px var(--o-line)' }} />)}</span>;
}

function SeriesBox({ s }: { s: Series }) {
  const need = Math.ceil(s.bestOf / 2);
  return (
    <div style={{ border: '1px solid var(--o-line)', borderRadius: 10, padding: '7px 10px', display: 'grid', gap: 4, fontFamily: 'var(--f-chart)' }}>
      {s.round.startsWith('Play-In') && <div style={{ fontSize: 10.5, color: 'var(--o-ink3)' }}>{s.round.replace('Play-In · ', '')}</div>}
      {s.teams.map(t => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, opacity: s.done && s.winner !== t.id ? 0.45 : 1 }}>
          <span style={{ width: 16, color: 'var(--o-ink3)', fontSize: 11 }}>{t.seed ?? ''}</span>
          <b style={{ width: 44, color: t.id === LAKERS ? 'var(--oc-usa)' : 'var(--o-ink)' }}>{t.abbr}</b>
          <Score>{s.bestOf === 1 ? (s.done ? (s.winner === t.id ? 'W' : 'L') : '') : <Dots n={t.wins} of={need} color={t.id === LAKERS ? 'var(--oc-usa)' : 'var(--o-ink2)'} />}</Score>
        </div>
      ))}
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
        <thead><tr><th>#</th><th>Team</th><th className="n">W</th><th className="n">L</th><th className="n">GB</th><th className="n">L10</th></tr></thead>
        <tbody>
          {c.rows.map((r, i) => {
            const seed = r.seed ?? i + 1;
            const zone = seed <= 6 ? 'color-mix(in srgb, var(--oc-out) 12%, transparent)' : seed <= 10 ? 'color-mix(in srgb, var(--oc-usa) 12%, transparent)' : 'transparent';
            return (
              <tr key={r.id} className={r.mine ? 'me' : ''} style={r.mine ? undefined : { background: zone }}>
                <td>{seed}</td><td>{r.name}{r.clinch ? <small style={{ color: 'var(--o-ink3)' }}> {r.clinch}</small> : null}</td>
                <td className="n">{r.w}</td><td className="n">{r.l}</td><td className="n">{r.gb}</td><td className="n">{r.last10}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
