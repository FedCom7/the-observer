import { useWidth } from '../components/charts';
import { Tbc } from '../components/common';
import { Hero, Row } from '../components/sheet';
import { useData } from '../core/store';
import { DAY, countdown, dayLong, dayShort, fmt, hhmm } from '../core/time';
import type { RoyalEvent } from '../sources/royal';

const PEOPLE = ['The King', 'Prince of Wales', 'Princess of Wales'];
const KIND_LABEL: Record<RoyalEvent['kind'], string> = { 'state-visit': 'State visit abroad', 'state-visit-in': 'State visit to the UK', trip: 'Official trip', ceremony: 'Ceremony' };

/** The Royal Family: travels, the ceremonial year and anything extraordinary. */
export function RoyalPage() {
  const { royal, news, now } = useData();
  if (!royal) return <Hero id="royal" dek="Loading the royal diary…" />;
  const events = royal.events.map(e => ({ ...e, t: Date.parse(e.start) }));
  const upcoming = events.filter(e => e.t > now - 6 * 3600e3);
  const next = upcoming[0];
  const nextBig = upcoming.find(e => (e.weight ?? 1) >= 3);
  // Someone is abroad if a trip started in the last 5 days and the next leg has not begun
  const abroad = events.filter(e => e.kind !== 'ceremony' && e.kind !== 'state-visit-in' && e.t <= now && now - e.t < 5 * DAY);
  const myNews = news.filter(n => n.passion === 'royal').slice(0, 10);
  const months = new Map<string, typeof upcoming>();
  upcoming.forEach(e => { const k = fmt(e.t, { month: 'long', year: 'numeric' }); months.set(k, [...(months.get(k) ?? []), e]); });

  return (
    <>
      <Hero id="royal" dek={next ? `Next: ${next.title}, ${dayLong(next.t)}.${nextBig && nextBig !== next ? ` The next big occasion is ${nextBig.title.replace(/ \(.*\)$/, '')} on ${dayShort(nextBig.t)}.` : ''}` : 'No engagements announced.'} />

      {royal.alerts.length > 0 && (
        <section className="ocard" style={{ boxShadow: 'inset 3px 0 0 #ff453a, var(--o-shadow)' }}>
          <div className="lab" style={{ color: '#ff453a' }}>● Extraordinary news</div>
          <div className="onews">{royal.alerts.map(a => <a key={a.url} className="r" href={a.url} target="_blank" rel="noreferrer"><time>{dayShort(Date.parse(a.time))} · {a.source}</time><p>{a.title}</p></a>)}</div>
        </section>
      )}

      <section className="s-top">
        <div className="ocard s-next">
          <div className="lab">Next in the diary</div>
          {next ? (
            <>
              <h3>{next.title}<Tbc e={next} /></h3>
              <div className="when">{dayLong(next.t)} · {next.approxTime ? `≈ ${hhmm(next.t)}` : hhmm(next.t)} Rome · {KIND_LABEL[next.kind]}</div>
              <div className="s-cd">{countdown(next.t - now)}<small>T-minus</small></div>
            </>
          ) : <div>Nothing announced.</div>}
        </div>
        <div className="ocard">
          <div className="lab">Where they are</div>
          {abroad.length ? abroad.map(e => <div key={e.id} style={{ marginBottom: 8 }}><b>{e.who}</b><br /><span style={{ color: 'var(--o-ink2)' }}>{e.title} · since {dayShort(e.t)}</span></div>)
            : <div style={{ color: 'var(--o-ink2)' }}>No overseas trip under way. Engagements in the UK are not published in a form we can read automatically.</div>}
        </div>
        <div className="ocard">
          <div className="lab">Next big occasion</div>
          {nextBig ? (
            <>
              <h3 style={{ margin: 0, fontSize: 18 }}>{nextBig.title}<Tbc e={nextBig} /></h3>
              <div className="when">{dayLong(nextBig.t)}{nextBig.place ? ` · ${nextBig.place}` : ''}</div>
              <div className="s-cd" style={{ fontSize: 30 }}>{countdown(nextBig.t - now)}</div>
            </>
          ) : <div>—</div>}
        </div>
      </section>

      <section className="ocard">
        <h2>Royal travels</h2>
        <p className="dek">State visits and official trips abroad over the last two months and the year ahead, as announced. Hover a dot for the trip.</p>
        <TravelChart events={events.filter(e => e.kind !== 'ceremony')} now={now} />
        <div className="osrc">Source: Wikipedia lists of state visits and official overseas trips</div>
      </section>

      <section className="s-two">
        <div className="ocard">
          <div className="lab">The diary · Rome time</div>
          {[...months.entries()].map(([m, list]) => (
            <div key={m} style={{ marginBottom: 14 }}>
              <div className="lab" style={{ marginTop: 8 }}>{m}</div>
              <div className="olist">{list.map(e => <Row key={e.id} e={{ id: e.id, passion: 'royal', title: e.title, sub: KIND_LABEL[e.kind] + (e.who !== 'The Royal Family' ? ` · ${e.who}` : '') + (e.place ? ` · ${e.place}` : ''), start: e.t, state: 'pre', approx: e.approxTime, tbc: e.tbc, link: e.link }} right={`in ${countdown(e.t - now)}`} />)}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
          {(royal.press?.length ?? 0) > 0 && (
            <div className="ocard">
              <div className="lab">Announced in the press</div>
              <p className="dek" style={{ fontSize: 14 }}>Visits and engagements reported ahead of time. Dates and times are in the articles.</p>
              <div className="onews">{royal.press!.map(a => <a key={a.url} className="r" href={a.url} target="_blank" rel="noreferrer"><time>{dayShort(Date.parse(a.time))} · {a.source}</time><p>{a.title}</p></a>)}</div>
            </div>
          )}
          <div className="ocard">
            <div className="lab">How the dates are set</div>
            <div className="olist">
              {[...new Map(events.filter(e => e.kind === 'ceremony').map(e => [e.title, e])).values()].map(e => (
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
    </>
  );
}

/** One row per royal, one dot per trip along the months (NYT dot timeline). */
function TravelChart({ events, now }: { events: (RoyalEvent & { t: number })[]; now: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const from = now - 60 * DAY, to = now + 300 * DAY;
  const l = 140, r = 20, rowH = 46, H = PEOPLE.length * rowH + 30;
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
        {PEOPLE.map((p, i) => {
          const y = 20 + i * rowH;
          return (
            <g key={p}>
              <text x={0} y={y + 4} style={{ fill: 'var(--o-ink)', fontWeight: 600, fontSize: 12 }}>{p}</text>
              <line x1={l} x2={W - r} y1={y} y2={y} stroke="var(--o-line)" />
              {events.filter(e => e.who === p).map(e => (
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
