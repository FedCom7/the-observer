import { PointsBars } from '../components/charts';
import { Score, Tbc } from '../components/common';
import { Hero, ocol } from '../components/sheet';
import { ScreenTabs, useTab } from '../components/tabs';
import { useData } from '../core/store';
import { CarsScreen, HowScreen, LeMansScreen, PowerScreen, SeasonScreen, WEC_TABS, useWecSeason } from './WecScreens';
import { countdown, dayLong, dayShort, hhmm } from '../core/time';
import { roundOf, type WecCrew, type WecRace, type WecResult, type WecRow, type WecTeam } from '../sources/wec';

const shortNames = (names: string[]) => names.map(n => n.split(' ').slice(-1)[0]).join(' / ');

/** FIA WEC and Le Mans: weekend schedule by session, official results, both championships. */
export function WecPage() {
  const { wec, news, now } = useData();
  const [tab, setTab] = useTab(WEC_TABS);
  const wecSeason = useWecSeason(tab !== 'now');
  if (!wec) return <Hero id="wec" dek="Loading the World Endurance Championship…" />;
  const season = wec.races.filter(r => r.year === wec.season);
  const raceStart = (r: WecRace) => Date.parse(r.sessions.find(s => s.kind === 'race')?.start ?? r.end ?? r.start ?? '');
  // Current weekend: from first session until 8 hours after the race start (24 h races: 26 h)
  const weekend = wec.races.find(r => {
    const first = Date.parse(r.sessions[0]?.start ?? ''), race = raceStart(r);
    return now >= first - 2 * 86400e3 && now <= race + (/24 Hours/.test(r.name) ? 26 : 8) * 3600e3;
  });
  const next = weekend ?? wec.races.find(r => raceStart(r) > now);
  const nextSession = next?.sessions.find(s => Date.parse(s.start) > now - 3600e3);
  const st = wec.standings;
  const leader = st?.hypercarDrivers[0], second = st?.hypercarDrivers[1];
  const manuf = st?.hypercarManufacturers ?? [];
  const lastRound = Object.keys(wec.results).map(Number).sort((a, b) => b - a).find(k => wec.results[k].sessions.length);
  const latest = lastRound ? latestSession(wec.results[lastRound].sessions) : null;
  const latestRace = lastRound ? season[lastRound - 1] : null;
  const roundsLeft = season.filter(r => raceStart(r) > now).length;
  const leMans = wec.races.find(r => /24 Hours of Le Mans/.test(r.name) && raceStart(r) > now);
  const lastLeMans = season.find(r => /24 Hours of Le Mans/.test(r.name));
  const leMansWinner = lastLeMans ? winners(wec.results[String(roundOf(wec, lastLeMans))]?.sessions) : null;
  const myNews = news.filter(n => n.passion === 'wec').slice(0, 8);

  return (
    <>
      <Hero id="wec" dek={`${next ? `${weekend ? 'This weekend' : 'Next'}: ${next.name}, round ${roundOf(wec, next)} of ${season.length}. ` : ''}${manuf[0] ? `${manuf[0].name} leads the Hypercar manufacturers by ${(manuf[0].points ?? 0) - (manuf[1]?.points ?? 0)} points` : ''}${leader ? `; ${shortNames(leader.names)} lead the drivers.` : '.'}`} />
      <ScreenTabs tabs={WEC_TABS} tab={tab} set={setTab} label="WEC screens" />
      {tab !== 'now' ? (tab === 'how' ? <HowScreen /> : !wecSeason ? <section className="ocard"><p className="dek">Loading the season…</p></section>
        : tab === 'season' ? <SeasonScreen d={wecSeason} />
        : tab === 'power' ? <PowerScreen d={wecSeason} />
        : tab === 'cars' ? <CarsScreen d={wecSeason} />
        : <LeMansScreen d={wecSeason} />) : <>

      <section className="s-top">
        <div className="ocard s-next">
          <div className="lab">{weekend ? 'Race weekend · next session' : 'Next session'}</div>
          {nextSession && next ? (
            <>
              <h3>{nextSession.name}<Tbc e={nextSession} /></h3>
              <div className="when">{next.name} · {dayLong(Date.parse(nextSession.start))} · {nextSession.tbc ? 'time TBC' : `${hhmm(Date.parse(nextSession.start))} Rome`}</div>
              <div className="s-cd">{Date.parse(nextSession.start) > now ? countdown(Date.parse(nextSession.start) - now) : 'Running'}<small>{Date.parse(nextSession.start) > now ? 'T-minus' : 'Session in progress'}</small></div>
            </>
          ) : <div>Season complete.</div>}
        </div>
        <div className="ocard">
          <div className="lab">Latest official result</div>
          {latest && latestRace ? (
            <>
              <div style={{ color: 'var(--o-ink3)', fontSize: 12 }}>{latestRace.name} · {latest.session}{latest.hour && !latest.final ? ` · after hour ${latest.hour}` : ''}</div>
              <Podium rows={latest.rows} />
            </>
          ) : <div>No results yet.</div>}
        </div>
        <div className="ocard">
          <div className="lab">Hypercar drivers' championship</div>
          {leader ? (
            <div className="kpis">
              <div className="kpi"><Score as="b">{leader.points}</Score><span>{shortNames(leader.names)}</span></div>
              <div className="kpi"><Score as="b">+{(leader.points ?? 0) - (second?.points ?? 0)}</Score><span>Gap to P2</span></div>
              <div className="kpi"><b>{roundsLeft}</b><span>Rounds left</span></div>
            </div>
          ) : <div>Standings not available.</div>}
        </div>
      </section>

      {next && (
        <section className="ocard">
          <h2>{next.name} · weekend schedule</h2>
          <p className="dek">Every session in Rome time, with the class it is for. Finished sessions show the leader from the official timing.</p>
          <Schedule race={next} results={next.year === wec.season ? wec.results[String(roundOf(wec, next))]?.sessions ?? [] : []} now={now} />
          <div className="osrc">Schedule: fiawec.com · results: Al Kamel Systems (official timing)</div>
        </section>
      )}

      {latest && latestRace && (
        <section className="ocard">
          <h2>{latestRace.name}: {latest.session}{latest.final ? '' : ` after hour ${latest.hour}`}</h2>
          <p className="dek">Official classification by class.</p>
          <div className="s-two" style={{ gap: 24 }}>
            <ClassTable title="Hypercar" rows={latest.rows.filter(r => /HYPERCAR/i.test(r.cls)).slice(0, 10)} />
            <ClassTable title="LMGT3" rows={latest.rows.filter(r => /GT3/i.test(r.cls)).slice(0, 10)} />
          </div>
        </section>
      )}

      {st && st.hypercarDrivers.length > 0 && (
        <section className="ocard">
          <h2>The Hypercar title fight</h2>
          <p className="dek">Points of each crew after {lastRound ?? 0} of {season.length} rounds, and how they finished at every race. Gold, silver and bronze for podiums.</p>
          <PointsBars rows={st.hypercarDrivers.slice(0, 10).map(c => ({ name: shortNames(c.names), value: c.points ?? 0, sub: c.team }))} color={ocol('wec')} labelWidth={230} />
          <ResultsGrid rounds={st.rounds} rows={st.hypercarDrivers.slice(0, 12).map(c => ({ label: shortNames(c.names), results: c.results, points: c.points }))} />
          <div className="osrc"><a href={st.url} target="_blank" rel="noreferrer">Standings: Wikipedia</a>, updated after each race</div>
        </section>
      )}

      <section className="s-two">
        <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
          {manuf.length > 0 && <TeamTable title="Hypercar manufacturers" rows={manuf} rounds={st!.rounds} />}
          {st && st.lmgt3Drivers.length > 0 && (
            <div className="ocard">
              <div className="lab">LMGT3 drivers</div>
              <table className="otable"><tbody>{st.lmgt3Drivers.slice(0, 8).map(c => <CrewRow key={c.pos + c.names[0]} c={c} />)}</tbody></table>
            </div>
          )}
          {st && st.lmgt3Teams.length > 0 && <TeamTable title="LMGT3 teams (car number)" rows={st.lmgt3Teams.slice(0, 8)} rounds={st.rounds} />}
        </div>
        <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
          <div className="ocard">
            <div className="lab">{wec.season} season · race winners</div>
            <div className="olist">
              {season.map((r, i) => {
                const w = winners(wec.results[String(i + 1)]?.sessions);
                const start = raceStart(r);
                return (
                  <div key={r.slug} className={`r${start < now ? ' past' : ''}`}>
                    <time>R{i + 1}<small>{dayShort(start)}</small></time>
                    <div><b>{r.name}</b>{w ? <Score as="span"><small>Hypercar #{w.hyper?.number} {w.hyper?.team}{w.gt3 ? ` · LMGT3 #${w.gt3.number} ${w.gt3.team}` : ''}</small></Score> : <small>{start > now ? `in ${countdown(start - now)}` : 'Result pending'}</small>}</div>
                    <span className="x"><a href={r.url} target="_blank" rel="noreferrer">Info</a></span>
                  </div>
                );
              })}
            </div>
          </div>
          {leMans && (
            <div className="ocard">
              <div className="lab">24 Hours of Le Mans {leMans.year}</div>
              <h3 style={{ margin: 0 }}>{dayLong(raceStart(leMans))}</h3>
              <div className="s-cd">{countdown(raceStart(leMans) - now)}<small>until the start{leMans.provisional ? ' · schedule provisional' : ''}</small></div>
              {leMansWinner?.hyper && <div className="osrc">{lastLeMans?.year} winner: <Score>#{leMansWinner.hyper.number} {leMansWinner.hyper.team} · {shortNames(leMansWinner.hyper.drivers)}</Score></div>}
            </div>
          )}
          <div className="ocard">
            <div className="lab">From the wire</div>
            <div className="onews">{myNews.map(n => <a key={n.id} className="r" href={n.url} target="_blank" rel="noreferrer"><time>{dayShort(n.time)} · {n.source}</time><p>{n.title}</p></a>)}</div>
          </div>
        </div>
      </section>
      </>}
    </>
  );
}

/** Most recent classification: the race (latest hour) if run, otherwise the last session. */
function latestSession(sessions: WecResult[]) {
  return sessions[sessions.length - 1] ?? null;
}

function winners(sessions?: WecResult[]) {
  const race = sessions?.find(s => s.kind === 'race' && s.final);
  if (!race) return null;
  return { hyper: race.rows.find(r => /HYPERCAR/i.test(r.cls)), gt3: race.rows.find(r => /GT3/i.test(r.cls)) };
}

function Podium({ rows }: { rows: WecRow[] }) {
  const hyper = rows.filter(r => /HYPERCAR/i.test(r.cls)).slice(0, 3);
  return (
    <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
      {hyper.map(r => (
        <Score as="div" key={r.number}>
          <span style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
            <b style={{ fontSize: 20, width: 22 }}>{r.pos === hyper[0].pos ? 1 : hyper.indexOf(r) + 1}</b>
            <span><b>#{r.number} {r.team}</b><br /><small style={{ color: 'var(--o-ink3)' }}>{r.vehicle} · {shortNames(r.drivers)}</small></span>
          </span>
        </Score>
      ))}
    </div>
  );
}

function Schedule({ race, results, now }: { race: WecRace; results: WecResult[]; now: number }) {
  const days = new Map<string, typeof race.sessions>();
  race.sessions.forEach(s => { const k = dayLong(Date.parse(s.start)); days.set(k, [...(days.get(k) ?? []), s]); });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
      {[...days.entries()].map(([day, list]) => (
        <div key={day}>
          <div className="lab">{day}</div>
          <div className="olist">
            {list.map(s => {
              const t = Date.parse(s.start);
              const res = results.find(x => x.session.toLowerCase() === s.name.split(' · ')[0].toLowerCase());
              const cls = /LMGT3|LMP2/i.test(s.name) ? 'GT3' : 'HYPERCAR';
              const p1 = res?.rows.find(r => (cls === 'GT3' ? /GT3/i : /HYPERCAR/i).test(r.cls)) ?? res?.rows[0];
              const live = !res?.final && now >= t && now < t + (s.kind === 'race' ? 7 : 1) * 3600e3;
              return (
                <div key={s.name + s.start} className="r" style={{ gridTemplateColumns: '58px 1fr', opacity: res?.final ? 0.8 : 1 }}>
                  <time>{s.tbc ? 'TBC' : hhmm(t)}</time>
                  <div>
                    <b style={{ fontWeight: s.kind === 'race' ? 700 : 550 }}>{s.name}</b>
                    {live && <small style={{ color: '#ff453a' }}>● Live{res?.hour ? ` · after hour ${res.hour}: #${p1?.number} leads` : ''}</small>}
                    {res?.final && p1 && <Score as="span"><small>P1 #{p1.number} {p1.team}{p1.bestLap && s.kind !== 'race' ? ` · ${p1.bestLap}` : ''}</small></Score>}
                    {!res && !live && t > now && <small>in {countdown(t - now)}</small>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ClassTable({ title, rows }: { title: string; rows: WecRow[] }) {
  if (!rows.length) return <div />;
  return (
    <div style={{ minWidth: 0 }}>
      <div className="lab">{title}</div>
      <div style={{ overflowX: 'auto' }}>
        <table className="otable">
          <thead><tr><th>#</th><th>Car</th><th>Drivers</th><th className="n">Laps</th><th className="n">Gap</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.number}>
                <td>{i + 1}</td>
                <td><b>#{r.number}</b> {r.team}<br /><small style={{ color: 'var(--o-ink3)' }}>{r.vehicle}</small></td>
                <td><Score>{shortNames(r.drivers)}</Score></td>
                <td className="n">{r.laps ?? ''}</td>
                <td className="n"><Score>{i === 0 ? '' : classGap(r, rows[0])}</Score></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** "6:01'01.299" or "1'31.159" -> seconds */
const secs = (t?: string) => {
  const m = t?.match(/^(?:(\d+):)?(\d+)'(\d+(?:\.\d+)?)$/);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
};

/** Gap to the class leader: laps down, or time behind on the same lap (best lap in practice and qualifying). */
function classGap(r: WecRow, lead: WecRow) {
  if (r.laps && lead.laps && r.laps < lead.laps) return `+${lead.laps - r.laps} lap${lead.laps - r.laps > 1 ? 's' : ''}`;
  const a = secs(r.time) ?? secs(r.bestLap), b = secs(lead.time) ?? secs(lead.bestLap);
  return a != null && b != null ? `+${(a - b).toFixed(3)}` : r.status;
}

const MEDAL: Record<string, string> = { '1': '#e7c55a', '2': '#c9ccd3', '3': '#d8a072' };

/** Finishing position at every round, colored like a results grid. */
function ResultsGrid({ rounds, rows }: { rounds: string[]; rows: { label: string; results: string[]; points: number | null }[] }) {
  return (
    <div style={{ overflowX: 'auto', marginTop: 18 }}>
      <table className="otable" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <thead><tr><th>Crew</th>{rounds.map(r => <th key={r} className="n">{r}</th>)}<th className="n">Pts</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.label}>
              <td>{r.label}</td>
              {rounds.map((_, i) => {
                const v = r.results[i] ?? '';
                const n = Number(v);
                const bg = MEDAL[v] ?? (n && n <= 10 ? 'color-mix(in srgb, var(--oc-mot) 18%, var(--o-card))' : v ? 'var(--o-grid)' : 'transparent');
                return <td key={i} className="n"><Score><span style={{ display: 'inline-block', minWidth: 30, textAlign: 'center', borderRadius: 4, padding: '2px 4px', background: bg, color: MEDAL[v] ? '#1d1d1f' : 'var(--o-ink)', fontWeight: MEDAL[v] ? 700 : 400 }}>{v || '·'}</span></Score></td>;
              })}
              <td className="n"><b>{r.points}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CrewRow({ c }: { c: WecCrew }) {
  return <tr><td>{c.pos}</td><td>{shortNames(c.names)}<br /><small style={{ color: 'var(--o-ink3)' }}>{c.team}</small></td><td className="n"><Score>{c.points}</Score></td></tr>;
}

function TeamTable({ title, rows, rounds }: { title: string; rows: WecTeam[]; rounds: string[] }) {
  return (
    <div className="ocard">
      <div className="lab">{title}</div>
      <ResultsGrid rounds={rounds} rows={rows.map(t => ({ label: t.name, results: t.results, points: t.points }))} />
    </div>
  );
}
