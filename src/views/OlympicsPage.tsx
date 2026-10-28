import { useState } from 'react';
import { PointsBars } from '../components/charts';
import { ScreenTabs, useTab } from '../components/tabs';
import { HistoryScreen as OlyHistoryScreen, HowScreen as OlyHowScreen, ItalyScreen as OlyItalyScreen, OLY_TABS, PowerScreen as OlyPowerScreen, useOlyHistory } from './OlympicsScreens';
import { Hero, ocol } from '../components/sheet';
import { useData } from '../core/store';
import { DAY, countdown, dayShort, fmt } from '../core/time';
import { NOC, type Calendar, type Edition, type Games, type Medalist } from '../sources/olympics';

const MEDAL = { gold: '#d4a62a', silver: '#a7adb4', bronze: '#b4744a' };
const gamesName = (g: Games) => `${g.host?.split(',')[0] ?? ''} ${g.year}`.trim();
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const span = (g: Games) => (g.opening && g.closing ? `${dayShort(Date.parse(g.opening))} – ${dayShort(Date.parse(g.closing))} ${g.year}` : `${g.year}`);

/** Olympic Games, summer and winter: the next Games, Italy's places, qualification, the last Games. */
export function OlympicsPage() {
  const { olympics, news, now } = useData();
  const [season, setSeason] = useState<'summer' | 'winter' | null>(null);
  const [tab, setTab] = useTab(OLY_TABS);
  const oh = useOlyHistory(tab !== 'now' && tab !== 'how');
  if (!olympics) return <Hero id="oly" dek="Loading…" />;
  const editions = [olympics.summer, olympics.winter].sort((a, b) => Date.parse(a.next.opening ?? '9999') - Date.parse(b.next.opening ?? '9999'));
  const focus = season ? olympics[season] : editions[0];
  const myNews = news.filter(n => n.passion === 'oly').slice(0, 8);
  const days = (g: Games) => (g.opening ? Math.ceil((Date.parse(g.opening) - now) / DAY) : null);

  return (
    <>
      <Hero id="oly" dek={<>{editions.map(e => e.next).map(g => `${gamesName(g)}: ${span(g)}${days(g) !== null && days(g)! > 0 ? `, in ${days(g)} days` : ''}`).join(' · ')}. {olympics.summer.italy ? `Italy has ${olympics.summer.italy.total} athletes qualified for ${gamesName(olympics.summer.next)} so far.` : ''}</>} />
      <ScreenTabs tabs={OLY_TABS} tab={tab} set={setTab} label="Olympic screens" />
      {tab !== 'now' ? (tab === 'how' ? <OlyHowScreen /> : !oh ? <section className="ocard"><p className="dek">Loading…</p></section>
        : tab === 'power' ? <OlyPowerScreen h={oh} /> : tab === 'italy' ? <OlyItalyScreen h={oh} /> : <OlyHistoryScreen h={oh} />) : <>

      <section className="s-top">
        {editions.map(e => <GamesCard key={e.next.season} e={e} now={now} />)}
        <div className="ocard">
          <div className="lab">Italy at the last Games</div>
          <div className="kpis" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {[olympics.summer.last, olympics.winter.last].map(l => {
              const it = l?.medals?.rows.find(r => r.code === 'ITA');
              return l && it ? <div key={l.season} className="kpi"><b>{it.total}</b><span>{gamesName(l)} · {it.gold} gold · {ord(it.rank)} in the table</span></div> : null;
            })}
          </div>
        </div>
      </section>

      <nav className="ocard" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 12px', gridColumn: '1 / -1' }} aria-label="Olympic Games editions">
        {(['summer', 'winter'] as const).map(s => {
          const on = focus === olympics[s];
          return <button key={s} className="btn" aria-pressed={on} onClick={() => setSeason(s)} style={{ color: 'var(--o-ink)', background: on ? 'var(--o-accent-soft)' : 'transparent', borderColor: on ? 'var(--o-accent)' : 'var(--o-line)', fontSize: 12.5, letterSpacing: '.04em' }}>{gamesName(olympics[s].next)} · {s === 'summer' ? 'Summer' : 'Winter'}</button>;
        })}
      </nav>

      <ItalyQuotas e={focus} />
      <QualificationTable e={focus} now={now} />
      {focus.next.calendar && <CalendarGrid g={focus.next} cal={focus.next.calendar} />}
      {focus.last && <LastGames e={focus} />}

      <section className="ocard">
        <div className="lab">From the wire</div>
        <div className="onews">{myNews.map(n => <a key={n.id} className="r" href={n.url} target="_blank" rel="noreferrer"><time>{dayShort(n.time)} · {n.source}</time><p>{n.title}</p></a>)}</div>
      </section>
      </>}
    </>
  );
}

function GamesCard({ e, now }: { e: Edition; now: number }) {
  const g = e.next;
  const t = g.openingTime ? Date.parse(g.openingTime) : g.opening ? Date.parse(g.opening) : null;
  return (
    <div className="ocard s-next">
      <div className="lab">{g.season} Olympics</div>
      <h3>{gamesName(g)}</h3>
      <div className="when">{span(g)}{g.events ? ` · ${g.events}` : ''}</div>
      {t && <div className="s-cd" style={{ fontSize: 30 }}>{t > now ? countdown(t - now) : 'Under way'}<small>to the opening ceremony</small></div>}
    </div>
  );
}

function ItalyQuotas({ e }: { e: Edition }) {
  const it = e.italy;
  const g = e.next;
  return (
    <section className="ocard">
      <h2>Italy at {gamesName(g)}</h2>
      {it && it.competitors.length ? (
        <>
          <p className="dek">{it.total} athletes qualified in {it.competitors.length} sports so far. Places are won by the country, sport by sport, at the qualifying events; names come later, with the national selections.</p>
          <div className="s-two">
            <div style={{ minWidth: 0 }}><PointsBars rows={[...it.competitors].sort((a, b) => b.total - a.total).map(c => ({ name: c.sport, value: c.total, sub: [c.men && `${c.men} ${c.men === 1 ? 'man' : 'men'}`, c.women && `${c.women} ${c.women === 1 ? 'woman' : 'women'}`].filter(Boolean).join(' · ') }))} color={ocol('oly')} unit="athletes" labelWidth={130} /></div>
            <div className="olist">
              {Object.entries(it.how).map(([sport, text]) => <div key={sport} className="r" style={{ gridTemplateColumns: '1fr' }}><div><b>{sport}</b><small>{text}</small></div></div>)}
            </div>
          </div>
        </>
      ) : <p className="dek">No places won yet: qualification for the {g.season.toLowerCase()} Games mostly runs in the two seasons before them.</p>}
      <div className="osrc">Source: Wikipedia, "Italy at the {g.year} {g.season} Olympics"</div>
    </section>
  );
}

function QualificationTable({ e, now }: { e: Edition; now: number }) {
  const g = e.next;
  if (!e.qualification.length) return null;
  const open = e.qualification.filter(q => q.page);
  const upcoming = open.flatMap(q => (q.timeline ?? []).map(t => ({ ...t, sport: q.sport }))).filter(t => Date.parse(t.start) > now - 7 * DAY)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start)).slice(0, 12);
  return (
    <section className="ocard">
      <h2>Qualification in the key sports</h2>
      <p className="dek">Nations with places so far and Italy's share, sport by sport. Sports without a number have not handed out places yet (or the official list is not published).</p>
      <div className="s-two">
        <table className="otable">
          <thead><tr><th>Sport</th><th className="n">Nations</th><th className="n">Places</th><th className="n">Italy</th></tr></thead>
          <tbody>{e.qualification.map(q => (
            <tr key={q.sport} className={q.italy ? 'me' : ''}><td>{q.sport}</td>
              {q.page ? <><td className="n">{q.nations || '–'}</td><td className="n">{q.places || '–'}</td><td className="n">{q.italy || '–'}</td></> : <td colSpan={3} className="n" style={{ color: 'var(--o-ink3)' }}>not started</td>}
            </tr>
          ))}</tbody>
        </table>
        <div>
          <div className="lab">Next qualifying events</div>
          {upcoming.length ? (
            <div className="olist">
              {upcoming.map(t => (
                <div key={t.sport + t.event} className="r" style={{ gridTemplateColumns: '84px 1fr' }}>
                  <time>{dayShort(Date.parse(t.start))}<small>{t.start.slice(0, 4)}</small></time>
                  <div><b>{t.event}</b><small>{t.sport}{t.discipline && !t.discipline.startsWith(t.sport) ? ` · ${t.discipline}` : ''} · {t.dates} · {t.place}</small></div>
                </div>
              ))}
            </div>
          ) : <p className="dek">The qualifying calendars of {gamesName(g)} are not published yet.</p>}
        </div>
      </div>
      <div className="osrc">Source: Wikipedia, "[Sport] at the {g.year} {g.season} Olympics – Qualification"</div>
    </section>
  );
}

/** Day-by-day programme: one row per sport, a cell per day, gold medal events as numbers. */
function CalendarGrid({ g, cal }: { g: Games; cal: Calendar }) {
  const totals = cal.days.map((_, i) => cal.sports.reduce((n, s) => n + (s.marks[i] ?? 0), 0));
  const max = Math.max(1, ...totals);
  return (
    <section className="ocard">
      <h2>{gamesName(g)} · the programme</h2>
      <p className="dek">Competition days by sport. Shaded: competition; numbers: gold medal events that day. Bars at the bottom: medal events per day.</p>
      <div style={{ overflowX: 'auto' }}>
        <table className="otable" style={{ fontSize: 11.5, minWidth: 760, tableLayout: 'fixed' }}>
          <thead>
            <tr><th style={{ width: 150 }} />{cal.days.map(d => <th key={d} className="n" style={{ textAlign: 'center', padding: '4px 0', fontSize: 10 }}>{fmt(Date.parse(d), { weekday: 'narrow' })}<br />{Number(d.slice(8, 10))}</th>)}<th className="n" style={{ width: 34 }}>Golds</th></tr>
          </thead>
          <tbody>
            {cal.sports.map(s => (
              <tr key={s.name}>
                <td style={{ padding: '2px 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</td>
                {s.marks.map((v, i) => (
                  <td key={i} style={{ padding: 1, borderBottom: 0 }}>
                    {v !== null && <div style={{ height: 16, borderRadius: 3, background: v ? MEDAL.gold : 'var(--o-accent-soft)', color: v ? '#fff' : 'transparent', fontSize: 10, fontWeight: 700, textAlign: 'center', lineHeight: '16px' }} title={`${s.name} · ${dayShort(Date.parse(cal.days[i]))}${v ? ` · ${v} gold` : ''}`}>{v || ''}</div>}
                  </td>
                ))}
                <td className="n" style={{ padding: '2px 4px' }}>{s.golds}</td>
              </tr>
            ))}
            <tr>
              <td style={{ padding: '6px 4px', fontWeight: 600 }}>Medal events</td>
              {totals.map((t, i) => <td key={i} style={{ verticalAlign: 'bottom', padding: '6px 1px 0' }}><div style={{ height: Math.round((t / max) * 40), background: ocol('oly'), borderRadius: 2 }} title={`${t} medal events`} /><div style={{ fontSize: 9.5, textAlign: 'center', color: 'var(--o-ink3)' }}>{t || ''}</div></td>)}
              <td className="n" style={{ fontWeight: 700 }}>{totals.reduce((a, b) => a + b, 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="osrc">Source: Wikipedia (organising committee schedule) · dates in local time</div>
    </section>
  );
}

function LastGames({ e }: { e: Edition }) {
  const l = e.last!;
  const rows = l.medals?.rows ?? [];
  const top = rows.slice(0, 10);
  const ita = rows.find(r => r.code === 'ITA');
  const medalists = l.italy?.medalists ?? [];
  const bySport = new Map<string, Medalist[]>();
  medalists.forEach(m => bySport.set(m.sport, [...(bySport.get(m.sport) ?? []), m]));
  const sports = [...bySport.entries()].sort((a, b) => b[1].length - a[1].length);
  return (
    <section className="ocard">
      <h2>{gamesName(l)}, how it went</h2>
      <p className="dek">{l.medals ? `${l.medals.nations} nations won medals. ` : ''}{ita ? `Italy finished ${ord(ita.rank)} with ${ita.gold} gold, ${ita.silver} silver and ${ita.bronze} bronze.` : ''}</p>
      <div className="s-two">
        <table className="otable">
          <thead><tr><th>#</th><th>Nation</th><th className="n" style={{ color: MEDAL.gold }}>G</th><th className="n" style={{ color: MEDAL.silver }}>S</th><th className="n" style={{ color: MEDAL.bronze }}>B</th><th className="n">Tot</th></tr></thead>
          <tbody>{[...top, ...(ita && !top.includes(ita) ? [ita] : [])].map(r => (
            <tr key={r.code} className={r.code === 'ITA' ? 'me' : ''}><td>{r.rank}</td><td>{NOC[r.code] ?? r.code}{r.code === l.medals?.host ? ' (host)' : ''}</td><td className="n">{r.gold}</td><td className="n">{r.silver}</td><td className="n">{r.bronze}</td><td className="n">{r.total}</td></tr>
          ))}</tbody>
        </table>
        <div>
          <div className="lab">Italy's medals by sport</div>
          <MedalStrips sports={sports} />
        </div>
      </div>
      {medalists.some(m => m.medal === 'gold') && (
        <>
          <div className="lab" style={{ marginTop: 16 }}>Italy's gold medals</div>
          <div className="olist">
            {medalists.filter(m => m.medal === 'gold').map(m => (
              <div key={m.event + m.name} className="r" style={{ gridTemplateColumns: '84px 1fr' }}>
                <time>{m.date ? dayShort(Date.parse(m.date)) : ''}</time>
                <div><b>{m.name}</b><small>{m.sport} · {m.event}</small></div>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="osrc">Source: Wikipedia</div>
    </section>
  );
}

/** One row per sport, a dot per medal in its colour (gold first). */
function MedalStrips({ sports }: { sports: [string, Medalist[]][] }) {
  const order = { gold: 0, silver: 1, bronze: 2 };
  return (
    <div style={{ display: 'grid', gap: 5, fontSize: 12.5, fontFamily: 'var(--f-chart)' }}>
      {sports.map(([sport, list]) => (
        <div key={sport} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: 8 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sport}</span>
          <span style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>{[...list].sort((a, b) => order[a.medal] - order[b.medal]).map((m, i) => <i key={i} title={`${m.medal} · ${m.name} · ${m.event}`} style={{ width: 11, height: 11, borderRadius: '50%', background: MEDAL[m.medal], display: 'inline-block' }} />)}</span>
        </div>
      ))}
    </div>
  );
}
