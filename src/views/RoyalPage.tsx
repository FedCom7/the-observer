import { useState } from 'react';
import { useWidth } from '../components/charts';
import { Tbc } from '../components/common';
import { RoyalMap, type Pin } from '../components/RoyalMap';
import { Hero } from '../components/sheet';
import { ScreenTabs, useTab } from '../components/tabs';
import { CeremoniesScreen, FamilyScreen, PatronagesScreen, ROYAL_TABS, TravelsScreen, WorkloadScreen, useRoyalArchive } from './RoyalScreens';
import { useData } from '../core/store';
import { DAY, countdown, dayLong, dayShort, fmt, hhmm } from '../core/time';
import type { RoyalEvent, RoyalPerson, RoyalWhere } from '../sources/royal';

const TRAVELLERS: [string, string][] = [['king', 'The King'], ['william', 'Prince of Wales'], ['catherine', 'Princess of Wales']];
const KIND_LABEL: Record<RoyalEvent['kind'], string> = { 'state-visit': 'State visit abroad', 'state-visit-in': 'State visit to the UK', trip: 'Official trip', ceremony: 'Ceremony', engagement: 'Engagement', birthday: 'Birthday', anniversary: 'Anniversary' };
const ROYAL_DIARY = 'https://www.royal.uk/media-centre/future-engagements';
const COURT_CIRCULAR = 'https://www.royal.uk/media-centre/court-circulars';

const ageOn = (born: [number, number, number], t: number) => { const d = new Date(t); return d.getFullYear() - born[0] - (d.getMonth() + 1 < born[1] || (d.getMonth() + 1 === born[1] && d.getDate() < born[2]) ? 1 : 0); };
/** Whole days from today: these events have a day, not an hour. */
const inDays = (t: number, now: number) => {
  const d = Math.round((new Date(t).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / DAY);
  return d <= 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`;
};
const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/** The Royal Family: the official diary, who is working, the ceremonial year, travels and anything extraordinary. */
export function RoyalPage() {
  const { royal, news, now } = useData();
  const [who, setWho] = useState('all');
  const [all, setAll] = useState(false);
  const [tab, setTab] = useTab(ROYAL_TABS);
  const archive = useRoyalArchive(tab === 'workload' || tab === 'travels' || tab === 'patronages');
  if (!royal) return <Hero id="royal" dek="Loading the royal diary…" />;

  const roster = royal.roster ?? [];
  const byId = new Map(roster.map(p => [p.id, p]));
  const working = roster.filter(p => p.working);
  const retired = roster.filter(p => p.id === 'kent' || p.id === 'alexandra');
  const mine = (people?: string[]) => who === 'all' || !!people?.includes(who);
  const events = royal.events.map(e => ({ ...e, t: Date.parse(e.start) }));
  const upcoming = events.filter(e => e.t > now - 6 * 3600e3);
  const diary = upcoming.filter(e => e.kind !== 'birthday' && e.kind !== 'anniversary');
  const next = diary.find(e => (e.weight ?? 1) >= 2 || e.kind !== 'engagement') ?? diary[0];
  const nextBig = diary.find(e => (e.weight ?? 1) >= 3);
  const today = events.filter(e => e.kind === 'engagement' && sameDay(e.t, now));
  const dates = upcoming.filter(e => e.kind === 'birthday' || e.kind === 'anniversary').slice(0, 7);
  const recent = (royal.recent ?? []).map(r => ({ ...r, t: Date.parse(r.start) })).filter(r => mine(r.people));
  const abroad = events.filter(e => (e.kind === 'trip' || e.kind === 'state-visit') && e.t <= now && now - e.t < 5 * DAY);
  const myNews = news.filter(n => n.passion === 'royal').slice(0, 10);

  const shownDiary = diary.filter(e => mine(e.people) && (all || e.t - now < 45 * DAY));
  const months = new Map<string, typeof shownDiary>();
  shownDiary.forEach(e => { const k = fmt(e.t, { month: 'long', year: 'numeric' }); months.set(k, [...(months.get(k) ?? []), e]); });

  const pins: Pin[] = [
    ...upcoming.filter(e => e.loc && mine(e.people) && e.kind !== 'birthday' && e.kind !== 'anniversary' && e.t - now < 200 * DAY)
      .map(e => ({ id: e.id, t: e.t, who: e.who, title: e.title, place: e.place ?? e.country, loc: e.loc!, weight: e.weight, rough: e.locPrecise === false })),
    ...recent.filter(r => r.loc).map(r => ({ id: r.id, t: r.t, who: r.who, title: r.title, place: r.place, loc: r.loc!, done: true, rough: r.locPrecise === false })),
  ];
  const mostActive = Math.max(1, ...Object.values(royal.activity ?? {}));
  const names = (ids: string[]) => ids.map(i => byId.get(i)?.name.split(',')[0] ?? i);

  return (
    <>
      <Hero id="royal" dek={next ? `Next: ${next.title}${next.who !== 'The Royal Family' ? ` (${next.who})` : ''}, ${dayLong(next.t)}.${nextBig && nextBig !== next ? ` The next big occasion is ${nextBig.title.replace(/ \(.*\)$/, '')} on ${dayShort(nextBig.t)}.` : ''}` : 'No engagements announced.'} />
      <ScreenTabs tabs={ROYAL_TABS} tab={tab} set={setTab} label="Royal Family screens" />
      {tab !== 'now' ? (tab === 'family' ? <FamilyScreen royal={royal} now={now} />
        : tab === 'ceremonies' ? <CeremoniesScreen royal={royal} now={now} />
        : !archive ? <section className="ocard"><p className="dek">Loading…</p></section>
        : tab === 'workload' ? <WorkloadScreen royal={royal} a={archive} />
        : tab === 'travels' ? <TravelsScreen a={archive} now={now} />
        : <PatronagesScreen royal={royal} a={archive} />) : <>

      {royal.alerts.length > 0 && (
        <section className="ocard" style={{ boxShadow: 'inset 3px 0 0 #ff453a, var(--o-shadow)' }}>
          <div className="lab" style={{ color: '#ff453a' }}>● Extraordinary news</div>
          <div className="onews">{royal.alerts.map(a => <a key={a.url} className="r" href={a.url} target="_blank" rel="noreferrer"><time>{dayShort(Date.parse(a.time))} · {a.source}</time><p>{a.title}</p></a>)}</div>
        </section>
      )}

      <section className="s-top">
        <div className="ocard s-next">
          <div className="lab">Next big occasion</div>
          {nextBig ? (
            <>
              <h3>{nextBig.title}<Tbc e={nextBig} /></h3>
              <div className="when">{dayLong(nextBig.t)}{nextBig.place ? ` · ${nextBig.place}` : ''} · {KIND_LABEL[nextBig.kind]}</div>
              <div className="s-cd">{countdown(nextBig.t - now)}<small>T-minus</small></div>
            </>
          ) : <div>Nothing announced.</div>}
        </div>
        <div className="ocard">
          <div className="lab">Today in the diary</div>
          {today.length ? today.map(e => <div key={e.id} style={{ marginBottom: 8 }}><b>{e.who}</b><br /><span style={{ color: 'var(--o-ink2)' }}>{e.title}{e.place ? ` · ${e.place}` : ''}</span></div>)
            : <div style={{ color: 'var(--o-ink2)' }}>No engagement in the Royal Diary today.{abroad.length ? '' : ' The King and Queen’s days are often added at short notice.'}</div>}
          {abroad.map(e => <div key={e.id} style={{ marginTop: 8 }}><b>{e.who}</b><br /><span style={{ color: 'var(--o-ink2)' }}>Abroad: {e.title} · since {dayShort(e.t)}</span></div>)}
        </div>
        <div className="ocard">
          <div className="lab">Next dates to remember</div>
          {dates.slice(0, 4).map(e => <div key={e.id} style={{ marginBottom: 6 }}><b>{e.title}</b><br /><span style={{ color: 'var(--o-ink2)' }}>{dayShort(e.t)} · {inDays(e.t, now)}</span></div>)}
        </div>
      </section>

      <section className="ocard">
        <h2>Where the royals are</h2>
        <p className="dek">Every engagement in the official Royal Diary (published up to eight weeks ahead), the state visits and trips, and what the Court Circular says they did in the last weeks.</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 12px' }}>
          <Chip on={who === 'all'} onClick={() => setWho('all')}>Everyone</Chip>
          {working.map(p => <Chip key={p.id} on={who === p.id} onClick={() => setWho(p.id)}>{p.title.replace(/^The /, '')}</Chip>)}
        </div>
        <RoyalMap pins={pins} now={now} />
        <div className="osrc">Sources: The Royal Diary and the Court Circular (royal.uk), Wikipedia, the Palace and the organisers. Locations come from OpenStreetMap.</div>
      </section>

      <section className="s-two">
        <div className="ocard">
          <div className="lab">The diary · London to Rome time</div>
          <p className="dek" style={{ fontSize: 14 }}>The Royal Diary gives the day and the place, not the hour. {royal.diaryFetched ? `Read from royal.uk ${dayShort(Date.parse(royal.diaryFetched))}.` : ''} <a href={ROYAL_DIARY} target="_blank" rel="noreferrer">Official diary</a></p>
          {[...months.entries()].map(([m, list]) => (
            <div key={m} style={{ marginBottom: 14 }}>
              <div className="lab" style={{ marginTop: 8 }}>{m}</div>
              <div className="olist">{list.map(e => <DiaryRow key={e.id} e={e} now={now} />)}</div>
            </div>
          ))}
          {!shownDiary.length && <div style={{ color: 'var(--o-ink2)' }}>Nothing announced{who !== 'all' ? ` for ${byId.get(who)?.title}` : ''} yet.</div>}
          {!all && diary.filter(e => mine(e.people)).length > shownDiary.length && <button className="btn" onClick={() => setAll(true)} style={{ color: 'var(--o-ink)', borderColor: 'var(--o-line)' }}>Show everything announced</button>}
        </div>

        <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
          <div className="ocard">
            <div className="lab">The working royals · where they are</div>
            <p className="dek" style={{ fontSize: 14 }}>Where each of them is today or was last seen (Court Circular), and how many engagements they did in the last three weeks.</p>
            <div className="olist">
              {working.map(p => <Person key={p.id} p={p} n={royal.activity?.[p.id] ?? 0} max={mostActive} now={now} where={royal.whereabouts?.[p.id]} today={today.filter(e => e.people?.includes(p.id))} />)}
            </div>
            {retired.length > 0 && (
              <p className="dek" style={{ fontSize: 13, marginTop: 10 }}>Stepped back from public life: {retired.map(p => `${p.title} (${p.role.split(';')[1]?.trim() ?? p.role})`).join(' · ')}.</p>
            )}
            {royal.succession && (
              <p className="dek" style={{ fontSize: 13, marginTop: 6 }}>Line of succession: {royal.succession.map((id, i) => `${i + 1} ${names([id])[0]}`).join(' · ')}.</p>
            )}
          </div>

          <div className="ocard">
            <div className="lab">Birthdays and anniversaries</div>
            <div className="olist">
              {dates.map(e => {
                const p = e.people?.length === 1 ? byId.get(e.people[0]) : undefined;
                return <div key={e.id} className="r" style={{ gridTemplateColumns: '78px 1fr auto' }}><time>{dayShort(e.t)}</time><div><b>{e.title}</b>{p && <small>{p.role}</small>}</div><span className="x">{inDays(e.t, now)}</span></div>;
              })}
            </div>
          </div>

          <div className="ocard">
            <div className="lab">Done recently · Court Circular</div>
            <div className="olist">
              {recent.slice(0, 14).map(r => (
                <div key={r.id} className="r" style={{ gridTemplateColumns: '64px 1fr' }}>
                  <time>{dayShort(r.t)}</time>
                  <div><b>{r.who.replace(/The /g, '')}</b><small style={{ color: 'var(--o-ink2)' }}>{r.title}{r.place ? ` · ${r.place}` : ''}</small></div>
                </div>
              ))}
              {!recent.length && <div style={{ color: 'var(--o-ink2)' }}>Nothing recorded.</div>}
            </div>
            <div className="osrc"><a href={COURT_CIRCULAR} target="_blank" rel="noreferrer">Court Circular on royal.uk</a></div>
          </div>

          {(royal.press?.length ?? 0) > 0 && (
            <div className="ocard">
              <div className="lab">Announced in the press</div>
              <p className="dek" style={{ fontSize: 14 }}>Visits and engagements reported ahead of time. Dates and times are in the articles.</p>
              <div className="onews">{royal.press!.map(a => <a key={a.url} className="r" href={a.url} target="_blank" rel="noreferrer"><time>{dayShort(Date.parse(a.time))} · {a.source}</time><p>{a.title}</p></a>)}</div>
            </div>
          )}
          <div className="ocard">
            <div className="lab">How the ceremonial dates are set</div>
            <div className="olist">
              {[...new Map(events.filter(e => e.kind === 'ceremony' && e.source?.startsWith('Rule')).map(e => [e.title, e])).values()].map(e => (
                <div key={e.id} className="r" style={{ gridTemplateColumns: '1fr' }}><div><b>{e.title}</b><small>{e.source?.replace(/^Rule: /, '')}</small></div></div>
              ))}
            </div>
          </div>
          <div className="ocard">
            <div className="lab">From the wire</div>
            <div className="onews">{myNews.map(n => <a key={n.id} className="r" href={n.url} target="_blank" rel="noreferrer"><time>{dayShort(n.time)} · {n.source}</time><p>{n.title}</p></a>)}</div>
          </div>
        </div>
      </section>

      <section className="ocard">
        <h2>Royal travels</h2>
        <p className="dek">State visits and official trips abroad over the last two months and the year ahead, as announced. Hover a dot for the trip.</p>
        <TravelChart events={events.filter(e => e.kind === 'trip' || e.kind === 'state-visit' || e.kind === 'state-visit-in')} now={now} />
        <div className="osrc">Source: Wikipedia lists of state visits and official overseas trips</div>
      </section>
      </>}
    </>
  );
}

const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button className="btn" aria-pressed={on} onClick={onClick} style={{ color: 'var(--o-ink)', background: on ? 'var(--o-accent-soft)' : 'transparent', borderColor: 'var(--o-line)' }}>{children}</button>
);

function DiaryRow({ e, now }: { e: RoyalEvent & { t: number }; now: number }) {
  const sub = [e.kind === 'engagement' ? e.who : `${KIND_LABEL[e.kind]}${e.who !== 'The Royal Family' ? ` · ${e.who}` : ''}`, e.role, e.place].filter(Boolean).join(' · ');
  return (
    <div className="r">
      <time>{dayShort(e.t)}<small>{e.dayOnly ? 'time not given' : `${e.approxTime ? '≈ ' : ''}${hhmm(e.t)}`}</small></time>
      <div>
        <b title={e.detail}>{e.title}</b><Tbc e={e} />
        <small>{sub}</small>
        {e.link && <small><a href={e.link} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>{e.source?.replace(/^Rule: /, '') ?? 'Source'}</a></small>}
      </div>
      <span className="x">{inDays(e.t, now)}</span>
    </div>
  );
}

const cleanPlace = (p?: string) => (p && p.length < 60 && (p.match(/\(/g) ?? []).length === (p.match(/\)/g) ?? []).length ? p : undefined);

function Person({ p, n, max, now, where, today }: { p: RoyalPerson; n: number; max: number; now: number; where?: RoyalWhere; today: (RoyalEvent & { t: number })[] }) {
  const seen = where?.seen, res = where?.residence;
  const seenT = seen ? Date.parse(seen.t) : 0;
  const ago = (t: number) => { const d = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / DAY); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };
  return (
    <div className="r" style={{ gridTemplateColumns: '1fr 74px' }}>
      <div>
        <b>{p.title.replace(/^The /, '')}</b>
        <small>{p.name} · {ageOn(p.born, now)}{p.role ? ` · ${p.role}` : ''}</small>
        {today.length > 0 && <small style={{ color: 'var(--o-ink)' }}>Today: {today.map(e => `${e.title}${cleanPlace(e.place) ? `, ${cleanPlace(e.place)}` : ''}`).join(' · ')}</small>}
        {!today.length && seen && <small>Last seen {ago(seenT)}: {seen.title.length > 90 ? `${seen.title.slice(0, 88)}…` : seen.title}{cleanPlace(seen.place) ? ` · ${cleanPlace(seen.place)}` : ''}</small>}
        {res && <small>Audiences at {res.name}, {ago(Date.parse(res.t))} (Court Circular)</small>}
        {p.homes && <small>Homes: {p.homes}</small>}
      </div>
      <div className="x" title={`${n} engagements in the Court Circular`}>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--o-line)', marginBottom: 3 }}><i style={{ display: 'block', height: 6, borderRadius: 3, width: `${(n / max) * 100}%`, background: 'var(--oc-cul)' }} /></div>
        {n}
      </div>
    </div>
  );
}

/** One row per royal, one dot per trip along the months (NYT dot timeline). */
function TravelChart({ events, now }: { events: (RoyalEvent & { t: number })[]; now: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const from = now - 60 * DAY, to = now + 300 * DAY;
  const l = 140, r = 20, rowH = 46, H = TRAVELLERS.length * rowH + 30;
  const x = (t: number) => l + ((t - from) / (to - from)) * (W - l - r);
  const months: number[] = [];
  for (let d = new Date(from); d.getTime() < to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) if (d.getTime() > from) months.push(d.getTime());
  return (
    <div ref={ref} className="ochart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Royal travels by person">
        {months.map(m => (
          <g key={m}><line x1={x(m)} x2={x(m)} y1={4} y2={H - 22} stroke="var(--o-grid)" /><text x={x(m) + 3} y={H - 6}>{new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(m)}</text></g>
        ))}
        <line x1={x(now)} x2={x(now)} y1={0} y2={H - 22} stroke="var(--o-accent)" strokeWidth={2} />
        <text x={x(now) + 4} y={10} style={{ fill: 'var(--o-accent)', fontWeight: 700 }}>Today</text>
        {TRAVELLERS.map(([id, label], i) => {
          const y = 20 + i * rowH;
          return (
            <g key={id}>
              <text x={0} y={y + 4} style={{ fill: 'var(--o-ink)', fontWeight: 600, fontSize: 12 }}>{label}</text>
              <line x1={l} x2={W - r} y1={y} y2={y} stroke="var(--o-line)" />
              {events.filter(e => e.people?.includes(id) && e.t > from && e.t < to).map(e => (
                <g key={e.id}>
                  <circle cx={x(e.t)} cy={y} r={e.kind.startsWith('state') ? 7 : 5} fill={e.kind === 'state-visit-in' ? 'var(--o-card)' : 'var(--oc-cul)'} stroke="var(--oc-cul)" strokeWidth={2} opacity={e.t < now ? 0.5 : 1}>
                    <title>{`${dayShort(e.t)} · ${e.title}`}</title>
                  </circle>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="olegend" style={{ marginTop: 6 }}>
        <span><i style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--oc-cul)' }} />State visit or trip abroad</span>
        <span><i style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--o-card)', boxShadow: 'inset 0 0 0 2px var(--oc-cul)' }} />Hosting a state visit</span>
      </div>
    </div>
  );
}
