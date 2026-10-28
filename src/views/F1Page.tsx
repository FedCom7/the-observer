import { MultiLine, PointsBars } from '../components/charts';
import { Score } from '../components/common';
import { Hero, ocol } from '../components/sheet';
import { ScreenTabs, useTab } from '../components/tabs';
import { useData } from '../core/store';
import { countdown, dayLong, dayShort, hhmm } from '../core/time';
import type { F1Race, F1Session } from '../sources/f1';
import { useF1Season } from '../sources/f1Season';
import { CircuitsScreen, DriversScreen, F1_TABS, HistoryScreen, HowScreen, PowerScreen, SeasonScreen } from './F1Screens';

const COLORS = ['var(--o-s1)', 'var(--o-s2)', 'var(--o-s3)', 'var(--o-s4)', 'var(--oc-cul)', 'var(--oc-tech)'];
const surname = (n: string) => n.split(' ').slice(-1)[0];

/** Formula 1: every session in Rome time, the running order, both championships. */
export function F1Page() {
  const { f1, news, now } = useData();
  const [tab, setTab] = useTab(F1_TABS);
  const season = useF1Season(tab !== 'now');
  if (!f1) return <Hero id="f1" dek="Loading Formula 1…" />;
  const races = f1.races.filter(r => !r.cancelled);
  const raceStart = (r: F1Race) => r.sessions.find(s => s.key === 'Race')?.start ?? r.sessions[r.sessions.length - 1]?.start ?? 0;
  // The weekend in focus: the one in progress, else the next one
  const weekend = races.find(r => now >= (r.sessions[0]?.start ?? 0) - 2 * 86400e3 && now <= raceStart(r) + 6 * 3600e3) ?? races.find(r => raceStart(r) > now);
  const nextSession = weekend?.sessions.find(s => s.state !== 'post');
  const liveSession = races.flatMap(r => r.sessions).find(s => s.state === 'in');
  const done = races.filter(r => r.sessions.find(s => s.key === 'Race')?.state === 'post');
  const lastRace = done[done.length - 1];
  const left = races.filter(r => raceStart(r) > now);
  const sprintsLeft = left.filter(r => r.sessions.some(s => s.key === 'SR')).length;
  const maxLeft = left.length * 25 + sprintsLeft * 8;
  const [p1, p2] = f1.drivers;
  const gap = p1 && p2 ? p1.points - p2.points : 0;
  const myNews = news.filter(n => n.passion === 'f1').slice(0, 8);

  // Cumulative points per round for the top six drivers
  const doneIdx = f1.codes.map((_, i) => i).filter(i => f1.races[i] && !f1.races[i].cancelled && f1.races[i].sessions.find(s => s.key === 'Race')?.state === 'post');
  const steps = doneIdx.map(i => f1.codes[i]);
  const series = f1.drivers.slice(0, 6).map((d, k) => {
    let acc = 0;
    return { name: surname(d.name), color: COLORS[k], values: doneIdx.map(i => (acc += d.perRace[i] ?? 0)) };
  });

  return (
    <>
      <Hero id="f1" dek={`${weekend ? `${weekend.short} ${liveSession ? 'is live' : now >= (weekend.sessions[0]?.start ?? 0) ? 'this weekend' : 'is next'}: round ${races.indexOf(weekend) + 1} of ${races.length}. ` : ''}${p1 ? `${p1.name} leads ${p2 ? surname(p2.name) : ''} by ${gap} points with ${maxLeft} still available${gap > maxLeft ? ' — the title is decided' : gap > maxLeft - 25 ? ' and can clinch at the next race' : ''}.` : ''}`} />
      <ScreenTabs tabs={F1_TABS} tab={tab} set={setTab} label="Formula 1 screens" />
      {tab !== 'now' ? (!season ? <section className="ocard"><p className="dek">Loading the season…</p></section>
        : tab === 'season' ? <SeasonScreen d={season} />
        : tab === 'power' ? <PowerScreen d={season} />
        : tab === 'drivers' ? <DriversScreen d={season} />
        : tab === 'circuits' ? <CircuitsScreen d={season} />
        : tab === 'history' ? <HistoryScreen d={season} />
        : <HowScreen d={season} />) : <>

      <section className="s-top">
        <div className="ocard s-next">
          <div className="lab">{liveSession ? <span style={{ color: '#ff453a' }}>● Live · {liveSession.detail}</span> : 'Next session'}</div>
          {nextSession && weekend ? (
            <>
              <h3>{weekend.short} · {nextSession.name}</h3>
              <div className="when">{dayLong(nextSession.start)} · {hhmm(nextSession.start)} Rome · {weekend.circuit}</div>
              <div className="s-cd">{nextSession.state === 'in' ? 'Running' : countdown(nextSession.start - now)}<small>{nextSession.state === 'in' ? 'Session in progress' : 'T-minus'}</small></div>
            </>
          ) : <div>Season complete.</div>}
        </div>
        <div className="ocard">
          <div className="lab">Latest race</div>
          {lastRace ? (
            <>
              <div style={{ color: 'var(--o-ink3)', fontSize: 12 }}>{lastRace.short} · {dayShort(raceStart(lastRace))}</div>
              <Score as="div">
                <ol style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 17, lineHeight: 1.6 }}>{lastRace.sessions.find(s => s.key === 'Race')!.order.slice(0, 3).map(d => <li key={d}><b>{d}</b></li>)}</ol>
              </Score>
            </>
          ) : <div>No race yet.</div>}
        </div>
        <div className="ocard">
          <div className="lab">Drivers' championship</div>
          {p1 && (
            <div className="kpis">
              <div className="kpi"><Score as="b">{p1.points}</Score><span>{surname(p1.name)}</span></div>
              <div className="kpi"><Score as="b">+{gap}</Score><span>Gap to {p2 ? surname(p2.name) : 'P2'}</span></div>
              <div className="kpi"><b>{maxLeft}</b><span>Points left ({left.length} GP{sprintsLeft ? `, ${sprintsLeft} sprint` : ''})</span></div>
            </div>
          )}
        </div>
      </section>

      {weekend && (
        <section className="ocard">
          <h2>{weekend.short} · weekend schedule</h2>
          <p className="dek">{weekend.circuit}, {weekend.city}. Every session in Rome time; finished sessions show the top three, the live one its running order.</p>
          <Weekend race={weekend} now={now} />
        </section>
      )}

      {liveSession && <OrderCard title="Running order" s={liveSession} live />}

      {steps.length > 1 && (
        <section className="ocard">
          <h2>How the title fight unfolded</h2>
          <p className="dek">Points accumulated race by race by the top six drivers. Hover for the standings after each round.</p>
          <MultiLine steps={steps} series={series} unit="points" />
          <div className="osrc">Source: ESPN</div>
        </section>
      )}

      <section className="s-two">
        <div className="ocard">
          <div className="lab">Drivers</div>
          <PointsBars rows={f1.drivers.slice(0, 12).map(d => ({ name: surname(d.name), value: d.points }))} color={ocol('f1')} />
        </div>
        <div className="ocard">
          <div className="lab">Constructors</div>
          <PointsBars rows={f1.constructors.map(c => ({ name: c.name, value: c.points }))} color={ocol('f1')} labelWidth={130} />
        </div>
      </section>

      <section className="s-two">
        <div className="ocard">
          <div className="lab">{f1.season} calendar · winners and pole</div>
          <div className="olist">
            {f1.races.map(r => {
              const race = r.sessions.find(s => s.key === 'Race'), q = r.sessions.find(s => s.key === 'Qual');
              const t = raceStart(r);
              return (
                <div key={r.id} className={`r${t < now ? ' past' : ''}`}>
                  <time>{r.cancelled ? '–' : `R${races.indexOf(r) + 1}`}<small>{dayShort(t)}</small></time>
                  <div>
                    <b style={{ textDecoration: r.cancelled ? 'line-through' : 'none' }}>{r.short}</b>
                    <small>{r.cancelled ? 'Cancelled' : race?.state === 'post' ? <Score>Winner {race.order[0]}{q?.order[0] ? ` · pole ${q.order[0]}` : ''}</Score> : `${r.circuit} · in ${countdown(t - now)}`}</small>
                  </div>
                  <span className="x">{r.sessions.some(s => s.key === 'SR') ? 'Sprint' : ''}</span>
                </div>
              );
            })}
          </div>
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

function Weekend({ race, now }: { race: F1Race; now: number }) {
  const days = new Map<string, F1Session[]>();
  race.sessions.forEach(s => { const k = dayLong(s.start); days.set(k, [...(days.get(k) ?? []), s]); });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 18 }}>
      {[...days.entries()].map(([day, list]) => (
        <div key={day}>
          <div className="lab">{day}</div>
          <div className="olist">
            {list.map(s => (
              <div key={s.key} className="r" style={{ gridTemplateColumns: '54px 1fr' }}>
                <time>{hhmm(s.start)}</time>
                <div>
                  <b style={{ fontWeight: s.key === 'Race' ? 700 : 550 }}>{s.name}</b>
                  {s.state === 'in' && <small style={{ color: '#ff453a' }}>● Live · {s.detail}{s.order[0] ? ` · P1 ${surname(s.order[0])}` : ''}</small>}
                  {s.state === 'post' && s.order.length > 0 && <Score as="span"><small>{s.order.slice(0, 3).map((d, i) => `${i + 1}. ${surname(d)}`).join('  ')}</small></Score>}
                  {s.state === 'pre' && <small>in {countdown(s.start - now)}</small>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function OrderCard({ title, s, live }: { title: string; s: F1Session; live?: boolean }) {
  return (
    <section className="ocard">
      <div className="lab">{live ? <span style={{ color: '#ff453a' }}>● Live · {s.detail}</span> : title}</div>
      <h2>{s.name}</h2>
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '4px 18px', fontFamily: 'var(--f-chart)' }}>
        {s.order.map((d, i) => (
          <li key={d} style={{ display: 'flex', gap: 10, padding: '6px 0', borderTop: '1px solid var(--o-line)' }}>
            <b style={{ width: 22, color: i < 3 ? 'var(--oc-mot)' : 'var(--o-ink3)' }}>{i + 1}</b><Score>{d}</Score>
          </li>
        ))}
      </ol>
      <div className="osrc">Refreshed every minute · ESPN</div>
    </section>
  );
}
