import { useState } from 'react';
import { useWidth } from '../components/charts';
import { Hero } from '../components/sheet';
import { useData } from '../core/store';
import { DAY, countdown, dayLong, dayShort, fmt, hhmm } from '../core/time';
import { fullHistory, historyTime, productName, upcomingEvents, type AppleData, type AppleRelease, type AppleUpcoming } from '../sources/apple';
import { EventsScreen, NewsroomScreen, ProductsScreen, RumorsScreen, SoftwareScreen, StockScreen, Ago, KindTag } from './AppleScreens';

const TABS = [['now', 'Now'], ['events', 'Events'], ['products', 'Products'], ['software', 'Software'], ['newsroom', 'Newsroom'], ['rumors', 'Rumours'], ['aapl', 'AAPL']] as const;
type Tab = typeof TABS[number][0];
const fullDate = (t: number) => fmt(t, { day: 'numeric', month: 'short', year: 'numeric' });

/** Apple: the next keynote, every launch from announcement to stores, and the history, software, Newsroom, rumours and stock around them. */
export function ApplePage() {
  const { apple, now } = useData();
  // ?tab=events opens a screen directly
  const [tab, setTab] = useState<Tab>(() => TABS.find(([k]) => k === new URLSearchParams(location.search).get('tab'))?.[0] ?? 'now');
  if (!apple) return <Hero id="apple" dek="Loading Apple…" />;
  const next = upcomingEvents(apple, now)[0];
  const last = [...fullHistory(apple)].reverse().find(e => historyTime(e) < now);
  const toStores = apple.releases.filter(r => r.available && Date.parse(r.available) > now);
  return (
    <>
      <Hero id="apple" dek={<>
        {next ? `Next: ${eventName(next)}, ${dayLong(next.start)} at ${hhmm(next.start)} Rome time${next.city && next.city !== 'Cupertino' ? `, in ${next.city}` : ''}.` : `No event announced${last ? `; the last was ${last.tagline ? `“${last.tagline}”` : last.title}, ${Math.floor((now - historyTime(last)) / DAY)} days ago` : ''}.`}
        {toStores.length ? ` ${toStores.length} product${toStores.length > 1 ? 's' : ''} still to reach stores.` : ''}
        {apple.stock?.nextEarnings && Date.parse(apple.stock.nextEarnings) > now ? ` Quarterly results expected ${dayShort(Date.parse(apple.stock.nextEarnings))}.` : ''}
      </>} />
      <nav className="ocard" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 12px', gridColumn: '1 / -1' }} aria-label="Apple screens">
        {TABS.map(([k, label]) => <button key={k} className="btn" aria-pressed={tab === k} onClick={() => setTab(k)} style={{ color: 'var(--o-ink)', background: tab === k ? 'var(--o-accent-soft)' : 'transparent', borderColor: tab === k ? 'var(--o-accent)' : 'var(--o-line)', fontSize: 12.5, letterSpacing: '.04em' }}>{label}</button>)}
      </nav>
      {tab === 'events' ? <EventsScreen d={apple} now={now} />
        : tab === 'products' ? <ProductsScreen d={apple} now={now} />
          : tab === 'software' ? <SoftwareScreen d={apple} now={now} />
            : tab === 'newsroom' ? <NewsroomScreen d={apple} />
              : tab === 'rumors' ? <RumorsScreen d={apple} />
                : tab === 'aapl' ? <StockScreen d={apple} now={now} />
                  : <NowScreen d={apple} now={now} />}
    </>
  );
}

const eventName = (e: AppleUpcoming) => e.tagline ? `“${e.tagline}”` : e.title;

interface Milestone { r: AppleRelease; what: 'Pre-orders' | 'In stores'; t: number }

function NowScreen({ d, now }: { d: AppleData; now: number }) {
  const next = upcomingEvents(d, now)[0];
  const live = next && next.start <= now;
  const lastEvent = [...fullHistory(d)].reverse().find(e => historyTime(e) < now);
  // What came out of the last event: the press releases of that day, or apple.com's own list for its keynotes
  const fromLast = lastEvent ? d.releases.filter(r => Math.abs(Date.parse(r.published) - historyTime(lastEvent)) < 1.5 * DAY) : [];
  const leadMatches = !!lastEvent && d.history.some(e => e.date === lastEvent.date);
  const milestones: Milestone[] = d.releases.flatMap(r => [
    ...(r.preorder && r.preorder !== r.published ? [{ r, what: 'Pre-orders' as const, t: Date.parse(r.preorder) }] : []),
    ...(r.available ? [{ r, what: 'In stores' as const, t: Date.parse(r.available) }] : []),
  ]).filter(m => m.t > now).sort((a, b) => a.t - b.t);
  const board = d.releases.filter(r => [r.preorder, r.available].some(x => x && Date.parse(x) > now - 21 * DAY) || (!r.available && Date.parse(r.published) > now - 30 * DAY))
    .sort((a, b) => nextStep(a, now) - nextStep(b, now));
  const earnings = d.stock?.nextEarnings ? Date.parse(d.stock.nextEarnings) : null;
  const eps = d.stock?.nextEarningsNote?.match(/consensus EPS forecast for the quarter is (\$[\d.]+)/)?.[1];
  return (
    <>
      <section className="s-top">
        <div className="ocard s-next">
          <div className="lab">{live ? 'Live now' : 'Next Apple event'}</div>
          {next ? (
            <>
              {next.invite?.image && <a href="https://appleinvites.com/" target="_blank" rel="noreferrer"><img src={next.invite.image} alt={`Invitation: ${next.tagline ?? next.title}`} style={{ width: '100%', borderRadius: 12, marginBottom: 10, display: 'block', background: 'var(--o-grid)' }} /></a>}
              <h3>{eventName(next)}</h3>
              <div className="when">{next.title} · {dayLong(next.start)} · {hhmm(next.start)} Rome{next.city ? ` · ${next.city}` : ''}</div>
              {live ? <a className="s-cd" href={next.link} target="_blank" rel="noreferrer" style={{ color: 'var(--o-accent)' }}>{next.official ? 'Watch on apple.com ›' : 'Follow the news ›'}</a>
                : <div className="s-cd">{countdown(next.start - now)}<small>T-minus{next.official ? '' : ' · time as usual, 10 a.m. Pacific'}</small></div>}
              {!next.official && <div className="osrc">{next.invite ? `Invitation sent ${next.invite.invited ? dayShort(Date.parse(next.invite.invited)) : ''} (appleinvites.com)` : 'Invitation'}{next.sources.length ? `, reported by ${[...new Set(next.sources.map(x => x.source))].slice(0, 3).join(', ')}` : ''}. Not on apple.com/apple-events yet.</div>}
            </>
          ) : (
            <>
              <h3 style={{ color: 'var(--o-ink2)' }}>Not announced yet</h3>
              <div className="when">Apple sends invitations about a week ahead; the countdown starts here as soon as apple.com lists the event.</div>
              {lastEvent && <div className="s-cd" style={{ fontSize: 30 }}>{Math.floor((now - historyTime(lastEvent)) / DAY)} days<small>since {lastEvent.tagline ? `“${lastEvent.tagline}”` : lastEvent.title}, {fullDate(historyTime(lastEvent))}</small></div>}
            </>
          )}
        </div>
        <div className="ocard">
          <div className="lab">Next launch moment</div>
          {milestones[0] ? (
            <>
              <h3 style={{ margin: 0 }}>{productName(milestones[0].r.title)} · {milestones[0].what.toLowerCase()}</h3>
              <div className="when">{dayLong(milestones[0].t)}{milestones[0].what === 'Pre-orders' ? ` · ${hhmm(milestones[0].t)} Rome` : ''}{milestones[0].r.price ? ` · from ${milestones[0].r.price}` : ''}</div>
              <div className="s-cd" style={{ fontSize: 30 }}>{countdown(milestones[0].t - now)}</div>
              {milestones.slice(1, 3).map(m => <div key={m.r.url + m.what} className="osrc">{productName(m.r.title)} · {m.what.toLowerCase()} {dayShort(m.t)} · in {countdown(m.t - now)}</div>)}
            </>
          ) : <div style={{ color: 'var(--o-ink2)' }}>Nothing pending: every announced product is already in stores.</div>}
        </div>
        <div className="ocard">
          <div className="lab">Quarterly results</div>
          {earnings && earnings > now ? (
            <>
              <h3 style={{ margin: 0 }}>{fmt(earnings, { month: 'long' })} report</h3>
              <div className="when">{dayLong(earnings)} · call {hhmm(earnings)} Rome · expected date</div>
              <div className="s-cd" style={{ fontSize: 30 }}>{countdown(earnings - now)}</div>
              {eps && <div className="osrc">Analysts' consensus: {eps} per share (Zacks, via Nasdaq)</div>}
            </>
          ) : <div style={{ color: 'var(--o-ink2)' }}>Next date not published yet.</div>}
          {d.stock && <div className="osrc">AAPL ${d.stock.price.toFixed(2)} · <span style={{ color: d.stock.change >= 0 ? 'var(--oc-out)' : 'var(--oc-mil)' }}>{d.stock.change >= 0 ? '+' : ''}{d.stock.pct.toFixed(2)}%</span></div>}
        </div>
      </section>

      {board.length > 0 && (
        <section className="ocard">
          <h2>Launch board</h2>
          <p className="dek">Every product announced in the last weeks, from announcement to pre-orders to stores, with live countdowns. Pre-orders open at 5 a.m. Pacific; store times are approximate.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14 }}>
            {board.map(r => <LaunchCard key={r.url} r={r} now={now} />)}
          </div>
        </section>
      )}

      {d.releases.length > 0 && (
        <section className="ocard">
          <h2>Release calendar</h2>
          <p className="dek">Each product on one time axis. Hover for the dates.</p>
          <ReleaseChart releases={d.releases} now={now} />
        </section>
      )}

      {lastEvent && (
        <section className="ocard">
          <div className="lab">Last event · {fullDate(historyTime(lastEvent))}</div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {lastEvent.invite?.image && <img src={lastEvent.invite.image} alt="" loading="lazy" style={{ width: 'min(240px, 100%)', borderRadius: 12, background: 'var(--o-grid)' }} />}
            <div style={{ flex: '1 1 260px' }}>
              <h2>{lastEvent.tagline ? `“${lastEvent.tagline}”` : lastEvent.title}</h2>
              {lastEvent.invite?.announced && <p style={{ margin: '4px 0 6px', fontSize: 14 }}><b>What Apple announced:</b> {lastEvent.invite.announced}</p>}
              {lastEvent.invite?.youtube && <a href={lastEvent.invite.youtube} target="_blank" rel="noreferrer" style={{ color: 'var(--o-accent)', fontSize: 13 }}>Watch the keynote ›</a>}
            </div>
          </div>
          {!lastEvent.invite?.announced && <p className="dek">{leadMatches ? d.lead?.blurb ?? lastEvent.summary : `${lastEvent.title}${fromLast.length ? `. Announced that day: ${fromLast.map(r => productName(r.title)).join(', ')}.` : '.'}`}</p>}
          {!leadMatches && fromLast.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14 }}>
              {fromLast.map(r => (
                <a key={r.url} href={r.url} target="_blank" rel="noreferrer" style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
                  {r.image && <img src={r.image} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 12, background: 'var(--o-grid)' }} />}
                  <b>{productName(r.title)}</b>
                  {r.summary && <small style={{ color: 'var(--o-ink2)', fontSize: 12.5 }}>{r.summary}</small>}
                </a>
              ))}
            </div>
          )}
          {leadMatches && d.lead?.announced.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14 }}>
              {d.lead.announced.map(a => (
                <a key={a.name} href={a.url ?? 'https://www.apple.com/apple-events/'} target="_blank" rel="noreferrer" style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
                  {a.image && <img src={a.image} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 12, background: 'var(--o-grid)' }} />}
                  <b>{a.name}</b>
                  {a.copy && <small style={{ color: 'var(--o-ink2)', fontSize: 12.5 }}>{a.copy}</small>}
                </a>
              ))}
            </div>
          ) : null}
        </section>
      )}

      <section className="s-two">
        <div className="ocard">
          <div className="lab">Apple Newsroom · official</div>
          <div className="onews">{d.news.slice(0, 10).map(n => <a key={n.url} className="r" href={n.url} target="_blank" rel="noreferrer"><time>{dayShort(Date.parse(n.time))}{n.kind && <KindTag kind={n.kind} />}</time><p>{n.title}</p></a>)}</div>
        </div>
        <div className="ocard">
          <div className="lab">The rumour mill</div>
          <div className="onews">
            {(d.gurman ?? []).filter(g => g.bloomberg && !/^Watch |podcast/i.test(g.title)).slice(0, 3).map(g => <a key={g.url} className="r" href={g.url} target="_blank" rel="noreferrer"><time><Ago t={Date.parse(g.time)} /> · Bloomberg<span className="tbc">GURMAN</span></time><p>{g.title}</p></a>)}
          </div>
          <div className="onews">{d.rumors.filter(r => r.rumor).slice(0, 8).map(n => <a key={n.url} className="r" href={n.url} target="_blank" rel="noreferrer"><time><Ago t={Date.parse(n.time)} /> · {n.source}</time><p>{n.title}</p></a>)}</div>
          <div className="osrc">Reports, not announcements. More in Rumours.</div>
        </div>
      </section>
    </>
  );
}

/** Time of the next step still ahead for a release (far future when all are done), to sort the board. */
const nextStep = (r: AppleRelease, now: number) => [r.preorder, r.available].map(x => (x ? Date.parse(x) : NaN)).filter(t => t > now)[0] ?? 1e15 - Date.parse(r.published);

function LaunchCard({ r, now }: { r: AppleRelease; now: number }) {
  const steps = [
    { label: 'Announced', t: Date.parse(r.published) },
    ...(r.preorder && r.preorder !== r.published ? [{ label: 'Pre-orders', t: Date.parse(r.preorder) }] : []),
    { label: r.available === r.published ? 'Available' : 'In stores', t: r.available ? Date.parse(r.available) : null },
  ];
  const nextIdx = steps.findIndex(s => s.t !== null && s.t > now);
  return (
    <a href={r.url} target="_blank" rel="noreferrer" style={{ border: '1px solid var(--o-line)', borderRadius: 16, overflow: 'hidden', display: 'grid', alignContent: 'start' }}>
      {r.image && <img src={r.image} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', background: 'var(--o-grid)' }} />}
      <div style={{ padding: 14, display: 'grid', gap: 10 }}>
        <div>
          <b style={{ fontSize: 16 }}>{productName(r.title)}</b>
          <small style={{ display: 'block', color: 'var(--o-ink3)' }}>{r.price ? `From ${r.price}` : 'Price in the press release'}{r.preorder === r.published ? ' · order from day one' : ''}</small>
        </div>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {steps.map((s, i) => {
            const done = s.t !== null && s.t <= now, isNext = i === nextIdx;
            return (
              <li key={s.label} style={{ display: 'grid', gridTemplateColumns: '14px 1fr auto', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: done ? 'var(--oc-tech)' : 'transparent', boxShadow: done ? 'none' : `inset 0 0 0 2px ${isNext ? 'var(--oc-tech)' : 'var(--o-line)'}` }} />
                <span style={{ color: done || isNext ? 'var(--o-ink)' : 'var(--o-ink3)', fontWeight: isNext ? 600 : 400 }}>{s.label}{s.t !== null && <small style={{ color: 'var(--o-ink3)', fontWeight: 400 }}> · {dayShort(s.t)}</small>}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: isNext ? 'var(--oc-tech)' : 'var(--o-ink3)', fontWeight: isNext ? 600 : 400 }}>{s.t === null ? 'TBA' : done ? '✓' : countdown(s.t - now)}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </a>
  );
}

/** One row per product: announcement, pre-order and store dates on a shared time axis. */
function ReleaseChart({ releases, now }: { releases: AppleRelease[]; now: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const rows = releases.filter(r => r.available || r.preorder);
  const ts = rows.flatMap(r => [r.published, r.preorder, r.available].filter(Boolean).map(d => Date.parse(d!)));
  const from = Math.min(...ts, now) - 4 * DAY, to = Math.max(...ts, now) + 8 * DAY;
  const l = Math.min(190, W * 0.38), rr = 20, rowH = 30, H = rows.length * rowH + 30;
  const x = (t: number) => l + ((t - from) / (to - from)) * (W - l - rr);
  return (
    <div ref={ref} className="ochart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Apple release dates">
        <line x1={x(now)} x2={x(now)} y1={0} y2={H - 20} stroke="var(--o-accent)" strokeWidth={2} />
        <text x={x(now) + 4} y={H - 6} style={{ fill: 'var(--o-accent)', fontWeight: 700 }}>Today</text>
        {rows.map((r, i) => {
          const y = 16 + i * rowH, a = Date.parse(r.published), p = r.preorder ? Date.parse(r.preorder) : null, s = r.available ? Date.parse(r.available) : null;
          return (
            <g key={r.url}>
              <text x={0} y={y + 4} style={{ fill: 'var(--o-ink)', fontSize: 12 }}>{productName(r.title).slice(0, Math.floor(l / 7))}</text>
              <line x1={x(a)} x2={x(s ?? p ?? a)} y1={y} y2={y} stroke="var(--o-line)" strokeWidth={3} strokeLinecap="round" />
              <circle cx={x(a)} cy={y} r={4} fill="var(--o-ink3)"><title>{`Announced ${dayShort(a)}`}</title></circle>
              {p && p !== a && <circle cx={x(p)} cy={y} r={5} fill="var(--o-card)" stroke="var(--oc-tech)" strokeWidth={2}><title>{`Pre-order ${dayShort(p)}`}</title></circle>}
              {s && <circle cx={x(s)} cy={y} r={6} fill="var(--oc-tech)"><title>{`In stores ${dayShort(s)}`}</title></circle>}
              {s && <text x={x(s) + 9} y={y + 4} style={{ fontSize: 11 }}>{dayShort(s)}</text>}
            </g>
          );
        })}
      </svg>
      <div className="olegend">
        <span><i style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--o-ink3)' }} />Announced</span>
        <span><i style={{ width: 10, height: 10, borderRadius: '50%', boxShadow: 'inset 0 0 0 2px var(--oc-tech)' }} />Pre-order</span>
        <span><i style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--oc-tech)' }} />In stores</span>
      </div>
    </div>
  );
}
