import { MultiLine, PointsBars } from '../components/charts';
import { Score } from '../components/common';
import { ScreenTabs, useTab } from '../components/tabs';
import { AC_TABS, HistoryScreen, HowScreen, NaplesScreen, PowerScreen, RacesScreen, useAcHistory } from './AcScreens';
import { Hero, Row, ocol } from '../components/sheet';
import { useData } from '../core/store';
import { countdown, dayLong, dayShort, hhmm } from '../core/time';

const COLORS = ['var(--o-s1)', 'var(--o-s2)', 'var(--o-s3)', 'var(--o-s4)', 'var(--oc-cul)', 'var(--oc-tech)'];

/** America's Cup: every regatta with standings and race times, building up to the Match in Naples. */
export function AcPage() {
  const { ac, events, news, now } = useData();
  const [tab, setTab] = useTab(AC_TABS);
  const hist = useAcHistory(tab === 'history');
  if (!ac) return <Hero id="ac" dek="Loading the America's Cup…" />;
  const matchStart = events.find(e => e.passion === 'ac' && /America's Cup Match/i.test(e.title));
  const upcoming = ac.races.filter(r => Date.parse(r.start) > now).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const last = ac.regattas[ac.regattas.length - 1];
  const steps = last?.standings[0]?.races.map(r => r.race) ?? [];
  const series = (last?.standings ?? []).slice(0, 6).map((s, i) => {
    let acc = 0;
    return { name: s.team.replace(/Emirates Team /, '').replace(/ Racing Team$/, ''), color: COLORS[i], values: s.races.map(r => (acc += r.points)) };
  });
  const myNews = news.filter(n => n.passion === 'ac').slice(0, 8);

  return (
    <>
      <Hero id="ac" dek={`${ac.edition}. ${ac.regattas.map(r => `${r.standings[0]?.team} won the ${r.name} preliminary regatta`).join('; ')}.${matchStart ? ` The Match in Naples starts ${dayLong(matchStart.start)}.` : ''}`} />
      <ScreenTabs tabs={AC_TABS} tab={tab} set={setTab} label="America's Cup screens" />
      {tab !== 'now' ? (tab === 'season' ? <RacesScreen ac={ac} /> : tab === 'power' ? <PowerScreen ac={ac} /> : tab === 'naples' ? <NaplesScreen /> : tab === 'how' ? <HowScreen />
        : !hist ? <section className="ocard"><p className="dek">Loading…</p></section> : <HistoryScreen h={hist} />) : <>
      <section className="s-top">
        <div className="ocard s-next">
          <div className="lab">{upcoming[0] ? 'Next race' : 'The Match, Naples'}</div>
          {upcoming[0] ? (
            <>
              <h3>{upcoming[0].regatta} · {upcoming[0].name}</h3>
              <div className="when">{dayLong(Date.parse(upcoming[0].start))} · {hhmm(Date.parse(upcoming[0].start))} Rome</div>
              <div className="s-cd">{countdown(Date.parse(upcoming[0].start) - now)}<small>T-minus</small></div>
            </>
          ) : matchStart ? (
            <>
              <h3>America's Cup Match</h3>
              <div className="when">{dayLong(matchStart.start)} · Gulf of Naples · race times published nearer the date</div>
              <div className="s-cd">{countdown(matchStart.start - now)}<small>until the first race</small></div>
            </>
          ) : <div>No races scheduled.</div>}
        </div>
        {ac.regattas.slice(-2).map(r => (
          <div key={r.id} className="ocard">
            <div className="lab">{r.name} preliminary regatta</div>
            {r.standings.slice(0, 3).map(s => <div key={s.teamId} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}><span><b>{s.position}.</b> <Score>{s.team}</Score></span><Score as="b">{s.total}</Score></div>)}
          </div>
        ))}
      </section>

      {series.length > 0 && (
        <section className="ocard">
          <h2>{last.name}: points race by race</h2>
          <p className="dek">Cumulative points after each race of the most recent regatta, top six teams. Hover for the standings after each race.</p>
          <MultiLine steps={steps} series={series} unit="points" />
          <div className="osrc">Source: americascup.com</div>
        </section>
      )}

      <section className="s-two">
        {ac.regattas.map(r => (
          <div key={r.id} className="ocard">
            <div className="lab">{r.name} · final standings</div>
            <PointsBars rows={r.standings.map(s => ({ name: s.team.replace('Emirates Team ', ''), value: s.total }))} color={ocol('ac')} labelWidth={210} />
          </div>
        ))}
      </section>

      <section className="s-two">
        <div className="ocard">
          <div className="lab">Races · Rome time</div>
          <div className="olist">{events.filter(e => e.passion === 'ac').sort((a, b) => b.start - a.start).slice(0, 14).map(e => <Row key={e.id} e={e} past={e.state === 'post'} right={e.state === 'post' ? <Score>{e.sub}</Score> : `in ${countdown(e.start - now)}`} />)}</div>
        </div>
        <div className="ocard">
          <div className="lab">From the wire</div>
          <div className="onews">{myNews.map(n => <a key={n.id} className="r" href={n.url} target="_blank" rel="noreferrer"><time>{dayShort(n.time)} · {n.source}</time><p>{n.title}</p></a>)}</div>
        </div>
      </section>
      </>}
    </>
  );
}
