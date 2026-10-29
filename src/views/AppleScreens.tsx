// The Apple page's screens beyond "Now": event history, product clock, software, Newsroom study, rumours, AAPL.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { MultiLine, useWidth } from '../components/charts';
import { DAY, countdown, dayShort, fmt } from '../core/time';
import { fullHistory, historyTime, loadAppleArchive, type AppleAccount, type AppleData, type AppleGurman, type AppleHistoryEvent, type AppleStory } from '../sources/apple';

const fullDate = (t: number) => fmt(t, { day: 'numeric', month: 'short', year: 'numeric' });
const monthYear = (t: number) => fmt(t, { month: 'short', year: 'numeric' });
const btn = (on: boolean) => ({ color: 'var(--o-ink)', background: on ? 'var(--o-accent-soft)' : 'transparent', borderColor: on ? 'var(--o-accent)' : 'var(--o-line)', textTransform: 'none' as const, letterSpacing: 0 });

/** "3h ago", "2d ago". */
export function Ago({ t }: { t: number }) {
  const m = Math.max(0, Math.round((Date.now() - t) / 60e3));
  return <>{m < 60 ? `${m}m ago` : m < 48 * 60 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`}</>;
}

const KIND_SHORT: Record<string, string> = { 'PRESS RELEASE': 'Press release', UPDATE: 'Update', 'APPLE STORIES': 'Story', 'QUICK READ': 'Quick read', PHOTOS: 'Photos', PHOTO: 'Photos', 'APPLE STATEMENT': 'Statement', 'MEDIA ALERT': 'Media alert', FEATURE: 'Feature' };
export const KindTag = ({ kind }: { kind: string }) => <span className="tbc" style={kind === 'PRESS RELEASE' ? { color: 'var(--oc-tech)', borderColor: 'var(--oc-tech)' } : undefined}>{(KIND_SHORT[kind] ?? kind).toUpperCase()}</span>;

/** A floating tooltip inside a chart box. */
const Tip = ({ x, y, w, children }: { x: number; y: number; w: number; children: ReactNode }) => (
  <div className="tip obs" style={{ position: 'absolute', left: Math.max(0, Math.min(w - 250, x + 12)), top: y, maxWidth: 250 }}>{children}</div>
);

// ---------------------------------------------------------------- Events

const EVENT_KINDS = [
  { id: 'event', label: 'Special events', color: 'var(--oc-tech)' },
  { id: 'wwdc', label: 'WWDC', color: 'var(--o-s1)' },
  { id: 'expo', label: 'Macworld & expos', color: 'var(--o-s4)' },
] as const;
const kindColor = (k: string) => EVENT_KINDS.find(x => x.id === k)?.color ?? 'var(--o-other)';

export function EventsScreen({ d, now }: { d: AppleData; now: number }) {
  const events = useMemo(() => fullHistory(d), [d]);
  const [sel, setSel] = useState<AppleHistoryEvent | null>(null);
  const [kind, setKind] = useState<string>('all');
  const [all, setAll] = useState(false);
  const past = events.filter(e => historyTime(e) < now);
  const last = past[past.length - 1];
  const shown = sel ?? last;
  const byMonth = Array.from({ length: 12 }, (_, m) => events.filter(e => e.m === m + 1 && e.y >= 2007).length);
  const busiest = byMonth.indexOf(Math.max(...byMonth));
  const list = [...events].reverse().filter(e => kind === 'all' || e.kind === kind);
  // Gaps between consecutive dated events since 2007
  const modern = past.filter(e => e.y >= 2007 && e.d);
  const gaps = modern.slice(1).map((e, i) => (historyTime(e) - historyTime(modern[i])) / DAY);
  return (
    <>
      <section className="s-top">
        <div className="ocard">
          <div className="lab">Since 1984</div>
          <div className="kpis">
            <div className="kpi"><b>{events.length}</b><span>Events</span></div>
            <div className="kpi"><b>{events.filter(e => e.kind === 'wwdc').length}</b><span>WWDCs</span></div>
            <div className="kpi"><b>{events.filter(e => e.kind === 'event').length}</b><span>Special</span></div>
          </div>
        </div>
        <div className="ocard">
          <div className="lab">The rhythm since the iPhone</div>
          <div className="kpis">
            <div className="kpi"><b>{fmt(Date.UTC(2020, busiest, 1), { month: 'short' })}</b><span>Busiest month</span></div>
            <div className="kpi"><b>{gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : '–'}</b><span>Days apart (avg)</span></div>
            <div className="kpi"><b>{last ? Math.floor((now - historyTime(last)) / DAY) : '–'}</b><span>Days since last</span></div>
          </div>
        </div>
        <div className="ocard">
          <div className="lab">Selected</div>
          {shown && <EventCard e={shown} />}
        </div>
      </section>

      <section className="ocard">
        <h2>Every Apple event, 1984 to today</h2>
        <p className="dek">One column per year, January at the top. The Macworld keynotes of January give way to the September iPhone event and the June WWDC. Click a dot to read about it.</p>
        <RhythmChart events={events} sel={shown} onSel={setSel} now={now} />
      </section>

      <InviteGallery events={events} onSel={setSel} sel={shown} />

      <section className="ocard">
        <h2>The archive</h2>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 12px' }}>
          {[{ id: 'all', label: 'All' }, ...EVENT_KINDS].map(k => <button key={k.id} className="btn" aria-pressed={kind === k.id} onClick={() => setKind(k.id)} style={btn(kind === k.id)}>{k.label}</button>)}
        </div>
        <div className="olist">
          {list.slice(0, all ? undefined : 15).map(e => (
            <div key={e.title + e.date} className="r" style={{ gridTemplateColumns: '92px 1fr' }} onClick={() => setSel(e)}>
              <time>{e.d ? fmt(historyTime(e), { day: 'numeric', month: 'short' }) : e.m ? fmt(historyTime(e), { month: 'short' }) : '—'}<small>{e.y}</small></time>
              <div>
                <b><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: kindColor(e.kind), marginRight: 6 }} />{e.title}</b>
                {e.tagline && <span style={{ color: 'var(--o-ink2)' }}> · “{e.tagline}”</span>}
                {historyTime(e) > now && <span className="tbc">UPCOMING</span>}
                <small style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{e.summary}</small>
              </div>
            </div>
          ))}
        </div>
        {!all && list.length > 15 && <button className="btn" onClick={() => setAll(true)} style={{ ...btn(false), marginTop: 10 }}>Show all {list.length}</button>}
        <div className="osrc">Source: Wikipedia, “List of Apple Inc. media events”. Upcoming events come from apple.com/apple-events.</div>
      </section>
    </>
  );
}

/** Every invitation's artwork, newest first; a click shows the event. */
function InviteGallery({ events, onSel, sel }: { events: AppleHistoryEvent[]; onSel: (e: AppleHistoryEvent) => void; sel?: AppleHistoryEvent }) {
  const [kind, setKind] = useState<'event' | 'wwdc'>('event');
  const [all, setAll] = useState(false);
  const withArt = [...events].reverse().filter(e => e.invite?.image && e.invite.kind === kind);
  if (!withArt.length) return null;
  return (
    <section className="ocard" style={{ gridColumn: '1 / -1' }}>
      <h2>The invitations</h2>
      <p className="dek">The artwork Apple sends a week or two before each event. Tap one to read about the event.</p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button className="btn" aria-pressed={kind === 'event'} onClick={() => setKind('event')} style={btn(kind === 'event')}>Events</button>
        <button className="btn" aria-pressed={kind === 'wwdc'} onClick={() => setKind('wwdc')} style={btn(kind === 'wwdc')}>WWDC</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
        {withArt.slice(0, all ? undefined : 18).map(e => (
          <button key={e.date} onClick={() => onSel(e)} style={{ all: 'unset', cursor: 'pointer', display: 'grid', gap: 4, alignContent: 'start' }}>
            <img src={e.invite!.image!} alt={e.tagline ?? e.title} loading="lazy" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10, background: 'var(--o-grid)', outline: sel === e ? '2px solid var(--o-accent)' : 'none', outlineOffset: 2 }} />
            <b style={{ fontSize: 12.5 }}>{e.tagline ? `“${e.tagline}”` : e.title}</b>
            <small style={{ color: 'var(--o-ink3)', fontSize: 11.5 }}>{e.d ? fullDate(historyTime(e)) : e.y}</small>
          </button>
        ))}
      </div>
      {!all && withArt.length > 18 && <button className="btn" onClick={() => setAll(true)} style={{ ...btn(false), marginTop: 10 }}>Show all {withArt.length}</button>}
      <div className="osrc">Artwork: appleinvitearchive.com, a fan archive of every Apple invitation.</div>
    </section>
  );
}

function EventCard({ e }: { e: AppleHistoryEvent }) {
  const inv = e.invite;
  return (
    <div>
      {inv?.image && <img src={inv.image} alt="" style={{ width: '100%', borderRadius: 10, marginBottom: 8, display: 'block', background: 'var(--o-grid)' }} />}
      <h3 style={{ margin: 0, fontSize: 18 }}>{e.tagline ? `“${e.tagline}”` : e.title}</h3>
      <div style={{ color: 'var(--o-ink2)', fontSize: 13, margin: '2px 0 6px' }}>{e.title} · {e.d ? fullDate(historyTime(e)) : e.m ? monthYear(historyTime(e)) : e.y}</div>
      {inv?.announced && <div style={{ fontSize: 13, marginBottom: 6 }}><b>Announced:</b> {inv.announced}</div>}
      <div style={{ fontSize: 13, lineHeight: 1.45, maxHeight: 150, overflow: 'auto' }}>{e.summary}</div>
      {(inv?.youtube || inv?.invited) && <div className="osrc">{inv.invited ? `Invitation sent ${fullDate(Date.parse(inv.invited))}` : ''}{inv.invited && inv.youtube ? ' · ' : ''}{inv.youtube && <a href={inv.youtube} target="_blank" rel="noreferrer">Watch the keynote</a>}</div>}
    </div>
  );
}

function RhythmChart({ events, sel, onSel, now }: { events: AppleHistoryEvent[]; sel?: AppleHistoryEvent; onSel: (e: AppleHistoryEvent) => void; now: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<AppleHistoryEvent | null>(null);
  const y0 = 1984, y1 = new Date(now).getUTCFullYear();
  const l = 34, r = 8, t = 8, H = 330, b = 22;
  const col = (W - l - r) / (y1 - y0 + 1);
  const x = (y: number) => l + (y - y0 + 0.5) * col;
  // Day of the year; events known only by month sit mid-month, by year at the end
  const doy = (e: AppleHistoryEvent) => e.m ? (Date.UTC(2001, e.m - 1, e.d ?? 15) - Date.UTC(2001, 0, 1)) / DAY : 364;
  const y = (dd: number) => t + (dd / 365) * (H - t - b);
  const rad = Math.max(3, Math.min(7, col * 0.36));
  return (
    <div ref={ref} className="ochart" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Apple events by year and month">
        {Array.from({ length: 12 }, (_, m) => {
          const yy = y((Date.UTC(2001, m, 1) - Date.UTC(2001, 0, 1)) / DAY);
          return <g key={m}><line x1={l} x2={W - r} y1={yy} y2={yy} stroke="var(--o-grid)" /><text x={l - 6} y={yy + 11} textAnchor="end">{fmt(Date.UTC(2001, m, 1), { month: 'short' }).slice(0, 3)}</text></g>;
        })}
        {Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i).filter(yr => yr % (col < 16 ? 10 : 5) === 0 || (yr === y1 && y1 % (col < 16 ? 10 : 5) > 2)).map(yr => <text key={yr} x={x(yr)} y={H - 6} textAnchor="middle">{yr}</text>)}
        <line x1={x(2007) - col / 2} x2={x(2007) - col / 2} y1={t} y2={H - b} stroke="var(--o-ink3)" strokeDasharray="3 3" />
        <text x={x(2007) - col / 2 + 4} y={H - b - 4} style={{ fill: 'var(--o-ink2)' }}>iPhone era</text>
        {events.map(e => {
          const on = sel === e;
          return (
            <circle key={e.title + e.date} cx={x(e.y)} cy={y(doy(e))} r={on ? rad + 2 : rad} fill={kindColor(e.kind)} fillOpacity={e.d ? 0.9 : 0.4}
              stroke={on ? 'var(--o-ink)' : 'var(--o-card)'} strokeWidth={on ? 2 : 1} style={{ cursor: 'pointer' }}
              onPointerEnter={() => setHover(e)} onPointerLeave={() => setHover(null)} onClick={() => onSel(e)} />
          );
        })}
      </svg>
      {hover && <Tip x={x(hover.y)} y={Math.max(0, y(doy(hover)) - 10)} w={W}><b>{hover.title}</b>{hover.tagline && <div>“{hover.tagline}”</div>}<div className="k">{hover.d ? fullDate(historyTime(hover)) : hover.y}</div></Tip>}
      <div className="olegend">{EVENT_KINDS.map(k => <span key={k.id}><i style={{ width: 10, height: 10, borderRadius: '50%', background: k.color }} />{k.label}</span>)}<span>Faded: date not precise</span></div>
    </div>
  );
}

// ---------------------------------------------------------------- Products

const STATUS = [
  { max: 0.35, label: 'Just updated', color: 'var(--oc-out)' },
  { max: 0.85, label: 'Mid-cycle', color: 'var(--o-s1)' },
  { max: 1.15, label: 'Due', color: 'var(--o-s4)' },
  { max: Infinity, label: 'Overdue', color: 'var(--oc-mil)' },
];

interface Clock { name: string; last: { date: string; models: string[] } | null; coming: { date: string; models: string[] } | null; since: number; cycle: number | null; ratio: number; count: number }

export function ProductsScreen({ d, now }: { d: AppleData; now: number }) {
  const today = new Date(now).toISOString().slice(0, 10);
  const clocks: Clock[] = d.lines.map(l => {
    const past = l.releases.filter(r => r.date <= today);
    const last = past[past.length - 1] ?? null;
    const recent = past.slice(-6);
    const gaps = recent.slice(1).map((r, i) => (Date.parse(r.date) - Date.parse(recent[i].date)) / DAY);
    const cycle = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
    const since = last ? (now - Date.parse(last.date)) / DAY : 0;
    return { name: l.name, last, coming: l.releases.find(r => r.date > today) ?? null, since, cycle, ratio: cycle ? since / cycle : 0, count: past.length };
  }).filter(c => c.last || c.coming).sort((a, b) => (b.coming ? 1 : 0) - (a.coming ? 1 : 0) || b.ratio - a.ratio);
  const maxDays = Math.max(...clocks.map(c => Math.max(c.since, (c.cycle ?? 0) * 1.25)));
  return (
    <>
      <section className="ocard">
        <h2>Product clock</h2>
        <p className="dek">How long each line has gone without an update, against its own average cycle over the last five updates. Coming launches are on top.</p>
        <div className="olegend">{STATUS.map(s => <span key={s.label}><i style={{ background: s.color, height: 8 }} />{s.label}</span>)}<span><i style={{ width: 2, height: 12, background: 'var(--o-ink)' }} />Average cycle</span></div>
        <div style={{ display: 'grid', gap: 2 }}>
          {clocks.map(c => {
            const st = c.cycle ? STATUS.find(s => c.ratio <= s.max)! : { label: 'First of its line', color: 'var(--o-ink3)' };
            return (
              <div key={c.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(96px, 130px) 1fr minmax(92px, 120px)', gap: 12, alignItems: 'center', padding: '7px 0', borderTop: '1px solid var(--o-line)' }}>
                <div><b style={{ fontSize: 14 }}>{c.name}</b><small style={{ display: 'block', color: 'var(--o-ink3)', fontSize: 11.5 }} title={c.last?.models.join(', ')}>{c.last ? `${c.last.models[0].slice(0, 28)}` : 'New line'}</small></div>
                <div style={{ position: 'relative', height: 14 }} title={c.cycle ? `${Math.round(c.since)} days since the last update; it usually takes ${Math.round(c.cycle)}` : undefined}>
                  <div style={{ position: 'absolute', inset: '4px 0', background: 'var(--o-grid)', borderRadius: 4 }} />
                  <div style={{ position: 'absolute', left: 0, top: 4, bottom: 4, width: `${(c.since / maxDays) * 100}%`, background: c.coming ? 'var(--oc-tech)' : st.color, borderRadius: 4 }} />
                  {c.cycle && <div style={{ position: 'absolute', left: `${(c.cycle / maxDays) * 100}%`, top: 0, bottom: 0, width: 2, background: 'var(--o-ink)' }} />}
                </div>
                <div style={{ textAlign: 'right', fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
                  {c.coming ? <><b style={{ color: 'var(--oc-tech)' }}>New {dayShort(Date.parse(c.coming.date))}</b><small style={{ display: 'block', color: 'var(--o-ink3)' }}>in {countdown(Date.parse(c.coming.date) + 6 * 3600e3 - now)}</small></>
                    : <><b style={{ color: st.color }}>{st.label}</b><small style={{ display: 'block', color: 'var(--o-ink3)' }}>{Math.round(c.since)}d{c.cycle ? ` / ${Math.round(c.cycle)}d` : ''}</small></>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="osrc">Release dates: Wikipedia, “List of Apple products”. A new colour of the same model does not count as an update.</div>
      </section>

      <section className="ocard">
        <h2>Every release since the iPhone</h2>
        <p className="dek">One row per product line, one dot per update. Hover for the models.</p>
        <ReleaseStrip lines={d.lines} now={now} />
      </section>
    </>
  );
}

function ReleaseStrip({ lines, now }: { lines: AppleData['lines']; now: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ x: number; y: number; name: string; date: string; models: string[] } | null>(null);
  const t0 = Date.UTC(2007, 0, 1), t1 = Date.UTC(new Date(now).getUTCFullYear() + 1, 0, 1);
  const l = Math.min(110, W * 0.28), r = 10, rowH = 20, H = lines.length * rowH + 26;
  const x = (t: number) => l + ((t - t0) / (t1 - t0)) * (W - l - r);
  const years = Array.from({ length: new Date(t1).getUTCFullYear() - 2007 }, (_, i) => 2007 + i);
  return (
    <div ref={ref} className="ochart" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Apple product releases by line since 2007">
        {years.map(yr => <g key={yr}><line x1={x(Date.UTC(yr, 0, 1))} x2={x(Date.UTC(yr, 0, 1))} y1={0} y2={H - 20} stroke="var(--o-grid)" />{(yr % (W < 600 ? 4 : 2) === 0) && <text x={x(Date.UTC(yr, 6, 1))} y={H - 6} textAnchor="middle">{yr}</text>}</g>)}
        <line x1={x(now)} x2={x(now)} y1={0} y2={H - 20} stroke="var(--o-accent)" strokeWidth={1.5} />
        {lines.map((ln, i) => {
          const y = 10 + i * rowH;
          return (
            <g key={ln.name}>
              <text x={0} y={y + 4} style={{ fill: 'var(--o-ink)', fontSize: 11.5 }}>{ln.name}</text>
              {ln.releases.map(rel => {
                const t = Date.parse(rel.date), future = t > now;
                return <circle key={rel.date} cx={x(t)} cy={y} r={4.5} fill={future ? 'var(--o-card)' : 'var(--oc-tech)'} stroke={future ? 'var(--oc-tech)' : 'var(--o-card)'} strokeWidth={future ? 2 : 1}
                  onPointerEnter={() => setHover({ x: x(t), y, name: ln.name, date: rel.date, models: rel.models })} onPointerLeave={() => setHover(null)} />;
              })}
            </g>
          );
        })}
      </svg>
      {hover && <Tip x={hover.x} y={hover.y + 10} w={W}><b>{hover.name}</b><div className="k">{fullDate(Date.parse(hover.date))}</div>{hover.models.slice(0, 5).map(m => <div key={m}>{m}</div>)}</Tip>}
    </div>
  );
}

// ---------------------------------------------------------------- Software

const OSES = ['iOS', 'iPadOS', 'macOS', 'watchOS', 'tvOS', 'visionOS', 'Xcode'];
const STAGE_LABEL = { beta: 'Beta', rc: 'RC', release: 'Release' } as const;
const cmpVersion = (a: string, b: string) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
};

export function SoftwareScreen({ d, now }: { d: AppleData; now: number }) {
  const builds = d.software;
  const status = OSES.map(os => {
    const mine = builds.filter(b => b.os === os);
    const release = mine.filter(b => b.stage === 'release').sort((a, b) => cmpVersion(b.version, a.version))[0];
    const testing = mine.filter(b => b.stage !== 'release' && (!release || cmpVersion(b.version, release.version) > 0)).sort((a, b) => b.time.localeCompare(a.time))[0];
    const firstBeta = testing && mine.filter(b => b.version === testing.version && b.stage === 'beta').sort((a, b) => a.time.localeCompare(b.time))[0];
    return { os, release, testing, firstBeta };
  }).filter(s => s.release || s.testing);
  return (
    <>
      <section className="ocard">
        <h2>Where every OS stands</h2>
        <p className="dek">The latest public release and what developers are testing now. A release candidate (RC) usually ships within a week or two.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {status.map(s => (
            <div key={s.os} style={{ border: '1px solid var(--o-line)', borderRadius: 14, padding: 14, display: 'grid', gap: 8 }}>
              <div className="lab" style={{ margin: 0 }}>{s.os}</div>
              {s.release ? <div><b style={{ fontSize: 22, letterSpacing: '-0.02em' }}>{s.release.version}</b><small style={{ display: 'block', color: 'var(--o-ink3)' }}>Public · {dayShort(Date.parse(s.release.time))} · {s.release.build}</small></div>
                : <div style={{ color: 'var(--o-ink3)', fontSize: 13 }}>No public release in the feed yet</div>}
              {s.testing && (
                <div style={{ borderTop: '1px solid var(--o-line)', paddingTop: 8 }}>
                  <b style={{ color: s.testing.stage === 'rc' ? 'var(--oc-out)' : 'var(--o-s4)' }}>{s.testing.version} {STAGE_LABEL[s.testing.stage]}{s.testing.stage === 'beta' ? ` ${s.testing.n}` : ''}</b>
                  <small style={{ display: 'block', color: 'var(--o-ink3)' }}>{dayShort(Date.parse(s.testing.time))} · {s.testing.build}{s.firstBeta ? ` · ${Math.round((now - Date.parse(s.firstBeta.time)) / DAY)} days in testing` : ''}</small>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="ocard">
        <h2>Beta to release</h2>
        <p className="dek">Every build Apple has published to developers, by OS. Hollow: beta; half: release candidate; solid: public release.</p>
        <BuildTimeline d={d} now={now} />
      </section>

      <section className="ocard">
        <div className="lab">Latest builds</div>
        <div className="olist">
          {builds.slice(0, 24).map(b => (
            <a key={b.os + b.build} className="r" href={b.url} target="_blank" rel="noreferrer">
              <time>{dayShort(Date.parse(b.time))}</time>
              <div><b>{b.os} {b.version} {b.stage === 'release' ? '' : `${STAGE_LABEL[b.stage]}${b.stage === 'beta' ? ` ${b.n}` : ''}`}</b></div>
              <span className="x">{b.build}</span>
            </a>
          ))}
        </div>
        <div className="osrc">Source: Apple Developer releases feed. The history grows from October 2026, when The Observer started keeping it.</div>
      </section>
    </>
  );
}

function BuildTimeline({ d, now }: { d: AppleData; now: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const oses = OSES.filter(os => d.software.some(b => b.os === os));
  const t0 = Math.min(...d.software.map(b => Date.parse(b.time)), now - 120 * DAY), t1 = now + 5 * DAY;
  const l = 70, r = 10, rowH = 26, H = oses.length * rowH + 26;
  const x = (t: number) => l + ((t - t0) / (t1 - t0)) * (W - l - r);
  const months: number[] = [];
  for (let dd = new Date(t0); dd.getTime() <= t1; dd = new Date(dd.getFullYear(), dd.getMonth() + 1, 1)) if (dd.getDate() === 1 || months.length) months.push(new Date(dd.getFullYear(), dd.getMonth(), 1).getTime());
  return (
    <div ref={ref} className="ochart" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Apple OS builds over time">
        {months.filter(m => m >= t0).map(m => <g key={m}><line x1={x(m)} x2={x(m)} y1={0} y2={H - 20} stroke="var(--o-grid)" /><text x={x(m) + 3} y={H - 6}>{fmt(m, { month: 'short' })}</text></g>)}
        {oses.map((os, i) => {
          const y = 12 + i * rowH;
          return (
            <g key={os}>
              <text x={0} y={y + 4} style={{ fill: 'var(--o-ink)', fontSize: 12 }}>{os}</text>
              <line x1={l} x2={W - r} y1={y} y2={y} stroke="var(--o-line)" />
              {d.software.filter(b => b.os === os).map(b => {
                const cx = x(Date.parse(b.time));
                const text = `${b.os} ${b.version} ${b.stage === 'release' ? '' : STAGE_LABEL[b.stage] + (b.stage === 'beta' ? ` ${b.n}` : '')} · ${dayShort(Date.parse(b.time))} · ${b.build}`;
                const ev = { onPointerEnter: () => setHover({ x: cx, y: y + 10, text }), onPointerLeave: () => setHover(null) };
                return b.stage === 'release' ? <circle key={b.build} cx={cx} cy={y} r={6} fill="var(--oc-tech)" {...ev} />
                  : b.stage === 'rc' ? <g key={b.build} {...ev}><circle cx={cx} cy={y} r={5.5} fill="var(--o-card)" stroke="var(--oc-tech)" strokeWidth={1.5} /><path d={`M${cx},${y - 5.5} A5.5,5.5 0 0 1 ${cx},${y + 5.5} Z`} fill="var(--oc-tech)" /></g>
                    : <circle key={b.build} cx={cx} cy={y} r={4.5} fill="var(--o-card)" stroke="var(--oc-tech)" strokeWidth={1.5} {...ev} />;
              })}
            </g>
          );
        })}
      </svg>
      {hover && <Tip x={hover.x} y={hover.y} w={W}>{hover.text}</Tip>}
    </div>
  );
}

// ---------------------------------------------------------------- Newsroom

const TOPICS: Record<string, { label: string; color: string }> = {
  iphone: { label: 'iPhone', color: 'var(--o-s1)' }, mac: { label: 'Mac', color: 'var(--o-s2)' }, ipad: { label: 'iPad', color: 'var(--o-s3)' },
  watch: { label: 'Watch & health', color: 'var(--oc-mil)' }, audio: { label: 'Music, iPod & AirPods', color: 'var(--oc-cul)' }, vision: { label: 'Vision Pro', color: 'var(--o-s4)' },
  ai: { label: 'Apple Intelligence', color: 'var(--oc-tech)' }, tv: { label: 'TV, film & sport', color: 'var(--o-s4)' }, services: { label: 'Services', color: 'var(--o-s1)' },
  software: { label: 'Software & developers', color: 'var(--o-s3)' }, planet: { label: 'Environment', color: 'var(--oc-out)' }, retail: { label: 'Retail', color: 'var(--o-s2)' },
  company: { label: 'Company & results', color: 'var(--o-ink2)' }, community: { label: 'Education & community', color: 'var(--oc-cul)' }, other: { label: 'Other', color: 'var(--o-other)' },
};

export function NewsroomScreen({ d }: { d: AppleData }) {
  const [stories, setStories] = useState<AppleStory[] | null>(null);
  const [q, setQ] = useState('');
  const [topic, setTopic] = useState('all');
  const [group, setGroup] = useState('all');
  const [more, setMore] = useState(100);
  useEffect(() => { loadAppleArchive().then(a => setStories(a.stories)).catch(() => setStories([])); }, []);
  const stats = useMemo(() => {
    if (!stories?.length) return null;
    const years = [...new Set(stories.map(s => +s.d.slice(0, 4)))].sort();
    const thisYear = years[years.length - 1];
    const today = new Date().toISOString().slice(5, 10);
    const ytd = (y: number) => stories.filter(s => +s.d.slice(0, 4) === y && s.d.slice(5) <= today).length;
    const topThis = Object.entries(stories.filter(s => +s.d.slice(0, 4) === thisYear && s.c !== 'other').reduce<Record<string, number>>((a, s) => ({ ...a, [s.c]: (a[s.c] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1])[0];
    return { years, thisYear, ytd: ytd(thisYear), ytdPrev: ytd(thisYear - 1), press: stories.filter(s => s.k === 'PRESS RELEASE').length, topThis };
  }, [stories]);
  const results = useMemo(() => {
    if (!stories) return [];
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return stories.filter(s => (topic === 'all' || s.c === topic) && words.every(w => s.t.toLowerCase().includes(w)));
  }, [stories, q, topic]);
  const byGroup = useMemo(() => {
    const m: Record<string, AppleStory[]> = {};
    for (const s of results) (m[s.g ?? 'other'] ??= []).push(s);
    return m;
  }, [results]);
  if (!stories) return <section className="ocard"><div style={{ color: 'var(--o-ink3)' }}>Loading {d.archiveCount ? d.archiveCount.toLocaleString('en-GB') : 'every'} Newsroom stories…</div></section>;
  if (!stats) return <section className="ocard">The Newsroom archive is not available yet.</section>;
  return (
    <>
      <section className="s-top">
        <div className="ocard">
          <div className="lab">Apple Newsroom since {stats.years[0]}</div>
          <div className="kpis">
            <div className="kpi"><b>{stories.length.toLocaleString('en-GB')}</b><span>Stories</span></div>
            <div className="kpi"><b>{stats.press.toLocaleString('en-GB')}</b><span>Press releases</span></div>
            <div className="kpi"><b>{Math.round(stories.length / stats.years.length)}</b><span>Per year</span></div>
          </div>
        </div>
        <div className="ocard">
          <div className="lab">{stats.thisYear} so far</div>
          <div className="kpis">
            <div className="kpi"><b>{stats.ytd}</b><span>Stories</span></div>
            <div className="kpi"><b style={{ color: stats.ytd >= stats.ytdPrev ? 'var(--oc-out)' : 'var(--oc-mil)' }}>{stats.ytd >= stats.ytdPrev ? '+' : ''}{stats.ytd - stats.ytdPrev}</b><span>vs {stats.thisYear - 1}</span></div>
            <div className="kpi"><b style={{ fontSize: 18 }}>{stats.topThis ? TOPICS[stats.topThis[0]].label : '–'}</b><span>Top topic</span></div>
          </div>
        </div>
        <div className="ocard">
          <div className="lab">How to read it</div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--o-ink2)' }}>Press releases carry the news: launches, prices, dates, results. Updates, stories and quick reads are features. A launch day shows up as a burst of press releases on the same date.</p>
        </div>
      </section>

      <section className="ocard">
        <h2>What Apple talks about, year by year</h2>
        <p className="dek">Share of each year's Newsroom stories by topic, from the titles. The Mac and the iPod made the 2000s; since 2019 TV, services and the community take a growing share.</p>
        <TopicHeat stories={stories} years={stats.years} />
      </section>

      <section className="ocard">
        <h2>Stories per year</h2>
        <StackBars stories={stories} years={stats.years} />
      </section>

      <section className="ocard" style={{ gridColumn: '1 / -1' }}>
        <h2>The archive, by kind of news</h2>
        <p className="dek">Every story sorted by what it is: launches in one place, new features in another, store openings, events, the company. Search narrows every group at once.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <input type="search" value={q} onChange={e => { setQ(e.target.value); setMore(100); }} placeholder="Search titles: “iPod”, “WWDC”, “Mac Pro”, “opens”…" style={{ flex: '1 1 260px', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--o-line)', background: 'var(--o-card)', color: 'var(--o-ink)', font: 'inherit' }} />
          <select value={topic} onChange={e => setTopic(e.target.value)} aria-label="Subject" style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--o-line)', background: 'var(--o-card)', color: 'var(--o-ink)', font: 'inherit' }}>
            <option value="all">Every subject</option>
            {Object.keys(TOPICS).map(t => <option key={t} value={t}>{TOPICS[t].label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          <button className="btn" aria-pressed={group === 'all'} onClick={() => setGroup('all')} style={btn(group === 'all')}>All · {results.length.toLocaleString('en-GB')}</button>
          {GROUP_ORDER.filter(g => byGroup[g]?.length).map(g => <button key={g} className="btn" aria-pressed={group === g} onClick={() => { setGroup(g); setMore(100); }} style={btn(group === g)}><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: GROUPS[g].color, marginRight: 6 }} />{GROUPS[g].label} · {byGroup[g].length}</button>)}
        </div>
        {group === 'all' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {GROUP_ORDER.filter(g => byGroup[g]?.length).map(g => (
              <div key={g} style={{ borderTop: `3px solid ${GROUPS[g].color}`, paddingTop: 8 }}>
                <button onClick={() => { setGroup(g); setMore(100); }} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
                  <b style={{ fontSize: 15 }}>{GROUPS[g].label}</b> <span style={{ color: 'var(--o-ink3)', fontSize: 12 }}>{byGroup[g].length.toLocaleString('en-GB')} ›</span>
                  <small style={{ display: 'block', color: 'var(--o-ink3)', fontSize: 12 }}>{GROUPS[g].dek}</small>
                </button>
                <div className="onews">
                  {byGroup[g].slice(0, 6).map(s => <a key={s.u} className="r" href={`https://www.apple.com${s.u}`} target="_blank" rel="noreferrer" style={{ padding: '7px 0' }}><time>{fullDate(Date.parse(s.d))}</time><p style={{ fontSize: 13.5 }}>{s.t}</p></a>)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="osrc" style={{ marginTop: 0, marginBottom: 6 }}>{GROUPS[group].dek}</div>
            <div className="olist">
              {(byGroup[group] ?? []).slice(0, more).map(s => (
                <a key={s.u} className="r" href={`https://www.apple.com${s.u}`} target="_blank" rel="noreferrer" style={{ gridTemplateColumns: '92px 1fr auto' }}>
                  <time>{fmt(Date.parse(s.d), { day: 'numeric', month: 'short' })}<small>{s.d.slice(0, 4)}</small></time>
                  <div><b>{s.t}</b><small>{TOPICS[s.c]?.label}</small></div>
                  <span className="x"><KindTag kind={s.k} /></span>
                </a>
              ))}
            </div>
            {(byGroup[group]?.length ?? 0) > more && <button className="btn" onClick={() => setMore(m => m + 200)} style={{ ...btn(false), marginTop: 10 }}>Show more</button>}
          </>
        )}
      </section>
    </>
  );
}

const GROUPS: Record<string, { label: string; dek: string; color: string }> = {
  launch: { label: 'New products', dek: 'Hardware announced, available to order, in stores.', color: 'var(--oc-tech)' },
  software: { label: 'Software & features', dek: 'New OS versions, apps and features.', color: 'var(--o-s1)' },
  services: { label: 'Services & entertainment', dek: 'Apple TV+, Music, Arcade, Pay, sport, the App Store.', color: 'var(--oc-cul)' },
  events: { label: 'Events & keynotes', dek: 'WWDC, special events, media alerts.', color: 'var(--o-s4)' },
  retail: { label: 'Apple Stores', dek: 'Store openings, Today at Apple, retail.', color: 'var(--o-s3)' },
  company: { label: 'Company & results', dek: 'Quarterly results, executives, investment, legal.', color: 'var(--o-ink2)' },
  impact: { label: 'Planet & community', dek: 'Environment, education, accessibility, privacy, giving.', color: 'var(--oc-out)' },
  stories: { label: 'Stories & spotlights', dek: 'Features, photo galleries, people using Apple products.', color: 'var(--o-s2)' },
  other: { label: 'Other', dek: 'Everything that fits none of the above.', color: 'var(--o-other)' },
};
const GROUP_ORDER = ['launch', 'software', 'services', 'events', 'retail', 'company', 'impact', 'stories', 'other'];

function TopicHeat({ stories, years }: { stories: AppleStory[]; years: number[] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const topics = Object.keys(TOPICS).filter(t => t !== 'other');
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of stories) m[`${s.c}:${s.d.slice(0, 4)}`] = (m[`${s.c}:${s.d.slice(0, 4)}`] ?? 0) + 1;
    return m;
  }, [stories]);
  const perYear = Object.fromEntries(years.map(y => [y, stories.filter(s => +s.d.slice(0, 4) === y).length]));
  const l = Math.min(150, W * 0.32), r = 4, rowH = 20, H = topics.length * rowH + 22;
  const cw = (W - l - r) / years.length;
  return (
    <div ref={ref} className="ochart" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Newsroom topics by year">
        {topics.map((t, i) => (
          <g key={t}>
            <text x={0} y={i * rowH + 14} style={{ fill: 'var(--o-ink)', fontSize: 11.5 }}>{TOPICS[t].label}</text>
            {years.map((y, j) => {
              const n = counts[`${t}:${y}`] ?? 0, share = perYear[y] ? n / perYear[y] : 0;
              return <rect key={y} x={l + j * cw + 0.5} y={i * rowH + 2} width={Math.max(1, cw - 1)} height={rowH - 3} rx={2} fill="var(--oc-tech)" fillOpacity={n ? Math.min(1, 0.08 + share * 2.6) : 0.03}
                onPointerEnter={() => setHover({ x: l + j * cw, y: i * rowH + 22, text: `${TOPICS[t].label} · ${y}: ${n} of ${perYear[y]} stories (${Math.round(share * 100)}%)` })} onPointerLeave={() => setHover(null)} />;
            })}
          </g>
        ))}
        {years.filter(y => y % (cw < 22 ? 5 : 2) === 0).map(y => <text key={y} x={l + (years.indexOf(y) + 0.5) * cw} y={H - 4} textAnchor="middle">{y}</text>)}
      </svg>
      {hover && <Tip x={hover.x} y={hover.y} w={W}>{hover.text}</Tip>}
    </div>
  );
}

function StackBars({ stories, years }: { stories: AppleStory[]; years: number[] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const rows = years.map(y => {
    const ys = stories.filter(s => +s.d.slice(0, 4) === y);
    return { y, press: ys.filter(s => s.k === 'PRESS RELEASE').length, other: ys.filter(s => s.k !== 'PRESS RELEASE').length };
  });
  const max = Math.max(...rows.map(r => r.press + r.other));
  const H = 200, l = 30, b = 20, t = 8, cw = (W - l) / rows.length;
  const yv = (v: number) => t + (1 - v / max) * (H - t - b);
  const step = max > 150 ? 50 : 25;
  return (
    <div ref={ref} className="ochart" style={{ position: 'relative' }}>
      <div className="olegend"><span><i style={{ background: 'var(--oc-tech)', height: 8 }} />Press releases</span><span><i style={{ background: 'var(--o-other)', height: 8 }} />Updates, stories, photos and other</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Newsroom stories per year">
        {Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step).map(v => <g key={v}><line x1={l} x2={W} y1={yv(v)} y2={yv(v)} stroke="var(--o-grid)" /><text x={l - 4} y={yv(v) + 4} textAnchor="end">{v}</text></g>)}
        {rows.map((r, i) => (
          <g key={r.y} onPointerEnter={() => setHover({ x: l + i * cw, y: yv(r.press + r.other), text: `${r.y}: ${r.press} press releases, ${r.other} other stories` })} onPointerLeave={() => setHover(null)}>
            <rect x={l + i * cw + 1} y={yv(r.press)} width={cw - 2} height={yv(0) - yv(r.press)} fill="var(--oc-tech)" />
            <rect x={l + i * cw + 1} y={yv(r.press + r.other)} width={cw - 2} height={yv(r.press) - yv(r.press + r.other)} fill="var(--o-other)" />
          </g>
        ))}
        {rows.filter(r => r.y % (cw < 22 ? 5 : 2) === 0).map(r => <text key={r.y} x={l + (rows.indexOf(r) + 0.5) * cw} y={H - 4} textAnchor="middle">{r.y}</text>)}
      </svg>
      {hover && <Tip x={hover.x} y={Math.max(20, hover.y)} w={W}>{hover.text}</Tip>}
    </div>
  );
}

// ---------------------------------------------------------------- Rumours

/** "Watch …" is a Bloomberg video, "Power On" his weekly newsletter and podcast. */
const gurmanKind = (g: AppleGurman) => !g.bloomberg ? null : /^Watch /.test(g.title) ? 'VIDEO' : /podcast/i.test(g.title) ? 'PODCAST' : /power on/i.test(g.title) ? 'POWER ON' : 'BLOOMBERG';

export function RumorsScreen({ d }: { d: AppleData }) {
  const [only, setOnly] = useState(true);
  const [gAll, setGAll] = useState(false);
  const list = d.rumors.filter(r => !only || r.rumor);
  const gurman = d.gurman ?? [];
  const own = gurman.filter(g => g.bloomberg && (gAll || gurmanKind(g) === 'BLOOMBERG'));
  const cited = gurman.filter(g => !g.bloomberg);
  return (
    <>
      <section className="s-two">
        <div className="ocard">
          <h2>Mark Gurman · Bloomberg</h2>
          <p className="dek">Bloomberg's Apple reporter, the most reliable source on what Apple has not announced yet. His stories are behind Bloomberg's paywall; the headline says most of it.</p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <button className="btn" aria-pressed={!gAll} onClick={() => setGAll(false)} style={btn(!gAll)}>Stories</button>
            <button className="btn" aria-pressed={gAll} onClick={() => setGAll(true)} style={btn(gAll)}>With videos and Power On</button>
          </div>
          <div className="onews">
            {own.slice(0, 18).map(g => <a key={g.url} className="r" href={g.url} target="_blank" rel="noreferrer"><time>{dayShort(Date.parse(g.time))}{gurmanKind(g) !== 'BLOOMBERG' && <span className="tbc">{gurmanKind(g)}</span>}</time><p>{g.title.replace(/^Watch /, '')}</p></a>)}
            {!own.length && <div style={{ color: 'var(--o-ink3)' }}>No Bloomberg story in the last weeks.</div>}
          </div>
        </div>
        <div className="ocard">
          <div className="lab">Reported elsewhere, citing Gurman</div>
          <div className="onews">
            {cited.slice(0, 14).map(g => <a key={g.url} className="r" href={g.url} target="_blank" rel="noreferrer"><time><Ago t={Date.parse(g.time)} /> · {g.source}</time><p>{g.title}</p></a>)}
            {!cited.length && <div style={{ color: 'var(--o-ink3)' }}>Nothing in the last two weeks.</div>}
          </div>
          <div className="osrc">Bloomberg via Google News; other outlets only when the headline credits him.</div>
        </div>
      </section>
      <section className="s-two">
        <div className="ocard">
          <h2>The rumour mill</h2>
          <p className="dek">Latest headlines from MacRumors and 9to5Mac. “Rumours only” keeps the reports about things Apple has not announced.</p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <button className="btn" aria-pressed={only} onClick={() => setOnly(true)} style={btn(only)}>Rumours only</button>
            <button className="btn" aria-pressed={!only} onClick={() => setOnly(false)} style={btn(!only)}>All headlines</button>
          </div>
          <div className="onews">
            {list.map(n => <a key={n.url} className="r" href={n.url} target="_blank" rel="noreferrer"><time><Ago t={Date.parse(n.time)} /> · {n.source}{n.rumor && <span className="tbc">RUMOUR</span>}{/gurman/i.test(n.title) && <span className="tbc">GURMAN</span>}</time><p>{n.title}</p></a>)}
            {!list.length && <div style={{ color: 'var(--o-ink3)' }}>No rumours in the latest headlines.</div>}
          </div>
        </div>
        <div className="ocard">
          <div className="lab">What Apple actually said</div>
          <div className="onews">
            {d.news.map(n => (
              <a key={n.url} className="r" href={n.url} target="_blank" rel="noreferrer">
                <time>{dayShort(Date.parse(n.time))}{n.kind && <KindTag kind={n.kind} />}</time>
                <p>{n.title}</p>
                {n.summary && <small style={{ color: 'var(--o-ink3)', fontSize: 12 }}>{n.summary}</small>}
              </a>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------- AAPL

export function StockScreen({ d, now }: { d: AppleData; now: number }) {
  const s = d.stock;
  const [range, setRange] = useState<1 | 5>(1);
  if (!s) return <section className="ocard">Stock data is not available right now.</section>;
  const closes = s.closes;
  const idx = new Map(closes.map(([dt], i) => [dt, i]));
  // Close-to-close move on the day of each keynote in the price history
  const reactions = fullHistory(d).filter(e => e.d && e.m).map(e => {
    const key = `${e.y}-${String(e.m).padStart(2, '0')}-${String(e.d).padStart(2, '0')}`;
    const i = idx.get(key);
    return i && i > 0 ? { e, key, before: closes[i - 1][1], after: closes[i][1], pct: (closes[i][1] / closes[i - 1][1] - 1) * 100 } : null;
  }).filter(Boolean).reverse() as { e: AppleHistoryEvent; key: string; before: number; after: number; pct: number }[];
  const med = reactions.length ? [...reactions].sort((a, b) => a.pct - b.pct)[Math.floor(reactions.length / 2)].pct : null;
  const earnings = s.nextEarnings ? Date.parse(s.nextEarnings) : null;
  const q = d.earnings.filter(r => r.revenue && r.q);
  return (
    <>
      <section className="s-top">
        <div className="ocard s-next">
          <div className="lab">AAPL · Nasdaq</div>
          <h3 style={{ fontSize: 34, letterSpacing: '-0.03em' }}>${s.price.toFixed(2)}</h3>
          <div className="when" style={{ color: s.change >= 0 ? 'var(--oc-out)' : 'var(--oc-mil)', fontWeight: 600 }}>{s.change >= 0 ? '+' : ''}{s.change.toFixed(2)} ({s.change >= 0 ? '+' : ''}{s.pct.toFixed(2)}%)</div>
          <div className="osrc">{s.at}</div>
        </div>
        <div className="ocard">
          <div className="lab">Next quarterly results</div>
          {earnings && earnings > now ? <>
            <h3 style={{ margin: 0 }}>{fmt(earnings, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
            <div className="s-cd" style={{ fontSize: 30 }}>{countdown(earnings - now)}</div>
            <div className="osrc">{s.nextEarningsNote}</div>
          </> : <div style={{ color: 'var(--o-ink2)' }}>Date not published yet.</div>}
        </div>
        <div className="ocard">
          <div className="lab">The keynote effect</div>
          <div className="kpis">
            <div className="kpi"><b>{reactions.length}</b><span>Events</span></div>
            <div className="kpi"><b style={{ color: (med ?? 0) >= 0 ? 'var(--oc-out)' : 'var(--oc-mil)' }}>{med === null ? '–' : `${med >= 0 ? '+' : ''}${med.toFixed(1)}%`}</b><span>Median day</span></div>
            <div className="kpi"><b>{reactions.filter(r => r.pct < 0).length}</b><span>Fell</span></div>
          </div>
          <div className="osrc">How AAPL closed on keynote day, versus the day before, over the last five years.</div>
        </div>
      </section>

      <section className="ocard">
        <h2>AAPL and the Apple calendar</h2>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {([1, 5] as const).map(r => <button key={r} className="btn" aria-pressed={range === r} onClick={() => setRange(r)} style={btn(range === r)}>{r} year{r > 1 ? 's' : ''}</button>)}
        </div>
        <PriceChart d={d} range={range} />
      </section>

      <section className="ocard">
        <h2>Revenue, quarter by quarter</h2>
        <p className="dek">Every quarter since 2001 as Apple reported it in its own press releases. The tall bars are the holiday quarter (fiscal Q1, October to December).</p>
        <RevenueBars quarters={q} />
      </section>

      <Accounts d={d} />

      <section className="s-two">
        <div className="ocard">
          <div className="lab">Keynote days</div>
          <table className="otable">
            <thead><tr><th>Event</th><th>Date</th><th className="n">Close</th><th className="n">Day</th></tr></thead>
            <tbody>
              {reactions.slice(0, 12).map(r => (
                <tr key={r.key}>
                  <td>{r.e.tagline ? `“${r.e.tagline}”` : r.e.title}</td>
                  <td>{fullDate(Date.parse(r.key))}</td>
                  <td className="n">${r.after.toFixed(2)}</td>
                  <td className="n" style={{ color: r.pct >= 0 ? 'var(--oc-out)' : 'var(--oc-mil)' }}>{r.pct >= 0 ? '+' : ''}{r.pct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="osrc">Prices and the expected results date: Nasdaq. Revenue bars since 2001: Apple's quarterly results press releases.</div>
        </div>
      </section>
    </>
  );
}

function PriceChart({ d, range }: { d: AppleData; range: 1 | 5 }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const all = d.stock!.closes;
  const from = new Date(Date.parse(all[all.length - 1][0]) - range * 365 * DAY).toISOString().slice(0, 10);
  const pts = all.filter(([dt]) => dt >= from).map(([dt, v]) => ({ t: Date.parse(dt), v }));
  if (pts.length < 2) return null;
  const H = 280, l = 44, r = 64, t = 26, b = 24;
  const lo = Math.min(...pts.map(p => p.v)), hi = Math.max(...pts.map(p => p.v));
  const step = (hi - lo) > 150 ? 50 : (hi - lo) > 60 ? 20 : 10;
  const y0 = Math.floor(lo / step) * step, y1 = Math.ceil(hi / step) * step;
  const x = (tt: number) => l + ((tt - pts[0].t) / (pts[pts.length - 1].t - pts[0].t)) * (W - l - r);
  const y = (v: number) => t + ((y1 - v) / (y1 - y0)) * (H - t - b);
  const events = fullHistory(d).filter(e => e.d && historyTime(e) >= pts[0].t && historyTime(e) <= pts[pts.length - 1].t + DAY);
  const results = d.earnings.filter(e => Date.parse(e.d) >= pts[0].t);
  const last = pts[pts.length - 1];
  const years = range === 5;
  const ticks: number[] = [];
  for (let dd = new Date(pts[0].t); dd.getTime() <= last.t; dd = years ? new Date(dd.getFullYear() + 1, 0, 1) : new Date(dd.getFullYear(), dd.getMonth() + 1, 1)) ticks.push(years ? new Date(dd.getFullYear() + 1, 0, 1).getTime() : new Date(dd.getFullYear(), dd.getMonth() + 1, 1).getTime());
  return (
    <div ref={ref} className="ochart" style={{ position: 'relative' }}
      onPointerMove={ev => {
        const px = ev.clientX - (ev.currentTarget as HTMLDivElement).getBoundingClientRect().left;
        let best = 0;
        pts.forEach((p, i) => { if (Math.abs(x(p.t) - px) < Math.abs(x(pts[best].t) - px)) best = i; });
        setHover(best);
      }} onPointerLeave={() => setHover(null)}>
      <div className="olegend"><span><i style={{ background: 'var(--oc-tech)' }} />AAPL close</span><span><i style={{ width: 2, height: 12, background: 'var(--o-s1)' }} />Apple event</span><span><i style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--o-s4)' }} />Quarterly results</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="AAPL price with Apple events">
        {Array.from({ length: Math.round((y1 - y0) / step) + 1 }, (_, i) => y0 + i * step).map(v => <g key={v}><line x1={l} x2={W - r} y1={y(v)} y2={y(v)} stroke="var(--o-grid)" /><text x={l - 6} y={y(v) + 4} textAnchor="end">${v}</text></g>)}
        {ticks.filter(tk => tk <= last.t).map(tk => <text key={tk} x={x(tk)} y={H - 6} textAnchor="middle">{years ? new Date(tk).getFullYear() : fmt(tk, { month: 'short' })}</text>)}
        {events.map(e => (
          <g key={e.date}>
            <line x1={x(historyTime(e))} x2={x(historyTime(e))} y1={t - 4} y2={H - b} stroke="var(--o-s1)" strokeOpacity={0.55} />
            {!years && <text x={x(historyTime(e)) + 3} y={t - 8} style={{ fill: 'var(--o-s1)', fontSize: 10.5 }}>{e.kind === 'wwdc' ? 'WWDC' : e.tagline ?? 'Event'}</text>}
          </g>
        ))}
        <polyline points={pts.map(p => `${x(p.t)},${y(p.v)}`).join(' ')} fill="none" stroke="var(--oc-tech)" strokeWidth={years ? 1.5 : 2} strokeLinejoin="round" />
        {results.map(e => <circle key={e.u} cx={x(Date.parse(e.d))} cy={H - b} r={4} fill="var(--o-s4)"><title>{`Q${e.q} FY${e.fy} results · ${fullDate(Date.parse(e.d))}`}</title></circle>)}
        <circle cx={x(last.t)} cy={y(last.v)} r={4.5} fill="var(--oc-tech)" stroke="var(--o-card)" strokeWidth={2} />
        <text className="lbl" x={x(last.t) + 8} y={y(last.v) + 4}>${last.v.toFixed(0)}</text>
        {hover !== null && <><line x1={x(pts[hover].t)} x2={x(pts[hover].t)} y1={t} y2={H - b} stroke="var(--o-ink3)" /><circle cx={x(pts[hover].t)} cy={y(pts[hover].v)} r={4} fill="var(--oc-tech)" stroke="var(--o-card)" strokeWidth={2} /></>}
      </svg>
      {hover !== null && <Tip x={x(pts[hover].t)} y={30} w={W}><b>${pts[hover].v.toFixed(2)}</b><div className="k">{fullDate(pts[hover].t)}</div>{events.filter(e => Math.abs(historyTime(e) - pts[hover].t) < 2 * DAY).map(e => <div key={e.date}>{e.title}{e.tagline ? ` · “${e.tagline}”` : ''}</div>)}</Tip>}
    </div>
  );
}

function RevenueBars({ quarters }: { quarters: AppleData['earnings'] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (!quarters.length) return null;
  const H = 240, l = 40, b = 22, t = 10, cw = (W - l) / quarters.length;
  const max = Math.ceil(Math.max(...quarters.map(q => q.revenue!)) / 25) * 25;
  const y = (v: number) => t + (1 - v / max) * (H - t - b);
  return (
    <div ref={ref} className="ochart" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Apple quarterly revenue since 2001">
        {Array.from({ length: max / 25 + 1 }, (_, i) => i * 25).map(v => <g key={v}><line x1={l} x2={W} y1={y(v)} y2={y(v)} stroke="var(--o-grid)" /><text x={l - 4} y={y(v) + 4} textAnchor="end">${v}B</text></g>)}
        {quarters.map((q, i) => (
          <rect key={q.u} x={l + i * cw + 0.5} y={y(q.revenue!)} width={Math.max(1, cw - 1)} height={y(0) - y(q.revenue!)} fill={q.q === 1 ? 'var(--oc-tech)' : 'var(--o-other)'} fillOpacity={hover === i ? 1 : 0.9}
            onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} />
        ))}
        {quarters.map((q, i) => q.q === 1 && q.fy % (cw < 6 ? 5 : 2) === 0 ? <text key={q.u} x={l + (i + 0.5) * cw} y={H - 5} textAnchor="middle">{q.fy - 1}</text> : null)}
      </svg>
      {hover !== null && <Tip x={l + hover * cw} y={Math.max(10, y(quarters[hover].revenue!) - 50)} w={W}><b>Q{quarters[hover].q} FY{quarters[hover].fy}</b><div>${quarters[hover].revenue!.toFixed(1)} billion</div>{quarters[hover].eps !== null && <div className="k">EPS ${quarters[hover].eps!.toFixed(2)} · reported {fullDate(Date.parse(quarters[hover].d))}</div>}</Tip>}
      <div className="olegend"><span><i style={{ background: 'var(--oc-tech)', height: 8 }} />Holiday quarter (Oct–Dec), labelled with its calendar year</span><span><i style={{ background: 'var(--o-other)', height: 8 }} />Other quarters</span></div>
    </div>
  );
}

// ---------------------------------------------------------------- Accounts (SEC filings)

const PRODUCT_COLORS: Record<string, string> = { iPhone: 'var(--o-s1)', Services: 'var(--oc-tech)', Mac: 'var(--o-s2)', iPad: 'var(--o-s3)', Wearables: 'var(--o-s4)' };
const REGION_COLORS: Record<string, string> = { Americas: 'var(--o-s1)', Europe: 'var(--o-s3)', 'Greater China': 'var(--oc-mil)', Japan: 'var(--o-s4)', 'Rest of Asia Pacific': 'var(--o-s2)' };
const PRODUCT_LABEL: Record<string, string> = { Wearables: 'Wearables, Home & Acc.' };
const bn = (m: number | null | undefined, d = 1) => (m === null || m === undefined ? '–' : `$${(m / 1000).toFixed(d)}B`);
const pct = (v: number | null) => (v === null || !Number.isFinite(v) ? '–' : `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`);
const qLabel = (a: AppleAccount) => `Q${a.q} FY${String(a.fy).slice(2)}`;
/** Short axis label: "1Q26" is the first quarter of fiscal 2026. */
const qShort = (a: AppleAccount) => `${a.q}Q${String(a.fy).slice(2)}`;
const complete = (r: Record<string, number | null> | null): r is Record<string, number> => !!r && Object.values(r).every(v => v !== null && v > 0);

/** Apple's accounts from its SEC filings: who sells the most, the income statement, the balance sheet. */
function Accounts({ d }: { d: AppleData }) {
  const [by, setBy] = useState<'products' | 'regions'>('products');
  const acc = d.accounts ?? [];
  if (!acc.length) return null;
  const rows = acc.filter(a => complete(a[by]));
  const keys = Object.keys(by === 'products' ? PRODUCT_COLORS : REGION_COLORS);
  const colors = by === 'products' ? PRODUCT_COLORS : REGION_COLORS;
  const last = rows[rows.length - 1];
  const yearAgo = last && rows.find(r => r.fy === last.fy - 1 && r.q === last.q);
  const ttm = (end: number) => rows.slice(Math.max(0, end - 3), end + 1);
  const li = rows.length - 1;
  const ttmNow = ttm(li), ttmPrev = li >= 4 ? ttm(li - 4) : [];
  const sumOf = (list: AppleAccount[], k: string) => list.length === 4 ? list.reduce((s, r) => s + (r[by]![k] ?? 0), 0) : null;
  const league = last ? keys.map(k => {
    const v = last[by]![k]!, total = keys.reduce((s, kk) => s + last[by]![kk]!, 0);
    const t = sumOf(ttmNow, k), tp = sumOf(ttmPrev, k);
    return { k, v, share: (v / total) * 100, yoy: yearAgo ? (v / yearAgo[by]![k]! - 1) * 100 : null, ttm: t, ttmYoy: t && tp ? (t / tp - 1) * 100 : null };
  }).sort((a, b) => b.v - a.v) : [];
  const recent = acc.slice(-8).reverse();
  const margins = acc.filter(a => a.revenue && a.gross && a.operating);
  const bal = acc.filter(a => a.cash !== null && a.debt);
  const lastBal = bal[bal.length - 1];
  const cashAll = lastBal ? (lastBal.cash ?? 0) + (lastBal.securities ?? 0) : 0;
  return (
    <>
      <section className="ocard" style={{ gridColumn: '1 / -1' }}>
        <h2>Who sells the most</h2>
        <p className="dek">Net sales every quarter, from Apple's filings with the SEC. {by === 'products' ? 'By product since fiscal 2019, when Apple started reporting each quarter this way.' : 'By region since fiscal 2016.'} Hover a bar for the split.</p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button className="btn" aria-pressed={by === 'products'} onClick={() => setBy('products')} style={btn(by === 'products')}>By product</button>
          <button className="btn" aria-pressed={by === 'regions'} onClick={() => setBy('regions')} style={btn(by === 'regions')}>By region</button>
        </div>
        <MixBars rows={rows} by={by} keys={keys} colors={colors} />
        {last && (
          <table className="otable" style={{ marginTop: 14 }}>
            <thead><tr><th>{by === 'products' ? 'Product' : 'Region'}</th><th className="n">{qLabel(last)}</th><th className="n">Share</th><th className="n">vs a year ago</th><th className="n">Last 12 months</th><th className="n">Growth</th></tr></thead>
            <tbody>
              {league.map(r => (
                <tr key={r.k}>
                  <td><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: colors[r.k], marginRight: 7 }} />{PRODUCT_LABEL[r.k] ?? r.k}</td>
                  <td className="n">{bn(r.v)}</td>
                  <td className="n">{r.share.toFixed(0)}%</td>
                  <td className="n" style={{ color: (r.yoy ?? 0) >= 0 ? 'var(--oc-out)' : 'var(--oc-mil)' }}>{pct(r.yoy)}</td>
                  <td className="n">{bn(r.ttm)}</td>
                  <td className="n" style={{ color: (r.ttmYoy ?? 0) >= 0 ? 'var(--oc-out)' : 'var(--oc-mil)' }}>{pct(r.ttmYoy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="ocard" style={{ gridColumn: '1 / -1' }}>
        <h2>Income statement</h2>
        <p className="dek">The last eight quarters. Apple's fiscal year ends in late September: Q1 is October to December, the holiday quarter.</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="otable">
            <thead><tr><th>Quarter</th><th className="n">Revenue</th><th className="n">YoY</th><th className="n">Products</th><th className="n">Services</th><th className="n">Gross margin</th><th className="n">R&amp;D</th><th className="n">Operating income</th><th className="n">Net income</th><th className="n">EPS</th></tr></thead>
            <tbody>
              {recent.map(a => {
                const prev = acc.find(x => x.fy === a.fy - 1 && x.q === a.q);
                return (
                  <tr key={a.period}>
                    <td>{qLabel(a)}<small style={{ display: 'block', color: 'var(--o-ink3)' }}>to {fmt(Date.parse(a.period), { day: 'numeric', month: 'short', year: 'numeric' })}</small></td>
                    <td className="n"><b>{bn(a.revenue)}</b></td>
                    <td className="n" style={{ color: prev?.revenue && a.revenue! >= prev.revenue ? 'var(--oc-out)' : 'var(--oc-mil)' }}>{prev?.revenue && a.revenue ? pct((a.revenue / prev.revenue - 1) * 100) : '–'}</td>
                    <td className="n">{bn(a.productsRev)}</td>
                    <td className="n">{bn(a.servicesRev)}</td>
                    <td className="n">{a.gross && a.revenue ? `${((a.gross / a.revenue) * 100).toFixed(1)}%` : '–'}</td>
                    <td className="n">{bn(a.rnd)}</td>
                    <td className="n">{bn(a.operating)}</td>
                    <td className="n">{bn(a.net)}</td>
                    <td className="n">{a.eps !== null ? `$${a.eps.toFixed(2)}` : '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="s-two">
        <div className="ocard">
          <h2>Margins</h2>
          <p className="dek">Gross and operating margin, percent of revenue. Services' growing share has pushed the gross margin up.</p>
          <MultiLine steps={margins.map(qShort)} unit="%" series={[
            { name: 'Gross', color: 'var(--oc-tech)', values: margins.map(a => Math.round((a.gross! / a.revenue!) * 1000) / 10) },
            { name: 'Operating', color: 'var(--o-s1)', values: margins.map(a => Math.round((a.operating! / a.revenue!) * 1000) / 10) },
            { name: 'Services share', color: 'var(--o-s4)', values: margins.map(a => (a.servicesRev ? Math.round((a.servicesRev / a.revenue!) * 1000) / 10 : null)) },
          ]} />
        </div>
        <div className="ocard">
          <h2>Balance sheet</h2>
          {lastBal && (
            <div className="kpis" style={{ marginBottom: 10 }}>
              <div className="kpi"><b>{bn(cashAll, 0)}</b><span>Cash &amp; securities</span></div>
              <div className="kpi"><b>{bn(lastBal.debt, 0)}</b><span>Debt</span></div>
              <div className="kpi"><b style={{ color: cashAll - lastBal.debt! >= 0 ? 'var(--oc-out)' : 'var(--oc-mil)' }}>{bn(cashAll - lastBal.debt!, 0)}</b><span>Net cash</span></div>
            </div>
          )}
          <MultiLine steps={bal.map(qShort)} unit="$B" series={[
            { name: 'Cash & securities', color: 'var(--oc-out)', values: bal.map(a => Math.round(((a.cash ?? 0) + (a.securities ?? 0)) / 1000)) },
            { name: 'Debt', color: 'var(--oc-mil)', values: bal.map(a => Math.round(a.debt! / 1000)) },
            { name: 'Equity', color: 'var(--o-s1)', values: bal.map(a => (a.equity !== null ? Math.round(a.equity / 1000) : null)) },
          ]} />
          {lastBal && <div className="osrc">At {fmt(Date.parse(lastBal.period), { day: 'numeric', month: 'long', year: 'numeric' })}: total assets {bn(lastBal.assets, 0)}. Apple has spent its cash on buybacks for a decade, bringing the net cash towards zero.</div>}
          <div className="osrc">Source: Apple's 10-Q and 10-K filings (SEC EDGAR). The fourth quarter is the annual report minus the first three.</div>
        </div>
      </section>
    </>
  );
}

function MixBars({ rows, by, keys, colors }: { rows: AppleAccount[]; by: 'products' | 'regions'; keys: string[]; colors: Record<string, string> }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (!rows.length) return null;
  const H = 260, l = 44, b = 22, t = 8, cw = (W - l) / rows.length;
  const totals = rows.map(r => keys.reduce((s, k) => s + (r[by]![k] ?? 0), 0));
  const max = Math.ceil(Math.max(...totals) / 25000) * 25000;
  const y = (v: number) => t + (1 - v / max) * (H - t - b);
  return (
    <div ref={ref} className="ochart" style={{ position: 'relative' }}>
      <div className="olegend">{keys.map(k => <span key={k}><i style={{ background: colors[k], height: 8 }} />{PRODUCT_LABEL[k] ?? k}</span>)}</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`Apple net sales by ${by === 'products' ? 'product' : 'region'}`}>
        {Array.from({ length: max / 25000 + 1 }, (_, i) => i * 25000).map(v => <g key={v}><line x1={l} x2={W} y1={y(v)} y2={y(v)} stroke="var(--o-grid)" /><text x={l - 4} y={y(v) + 4} textAnchor="end">${v / 1000}B</text></g>)}
        {rows.map((r, i) => {
          let acc = 0;
          return (
            <g key={r.period} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} opacity={hover === null || hover === i ? 1 : 0.55}>
              {keys.map(k => {
                const v = r[by]![k] ?? 0, y0 = y(acc), y1 = y(acc + v);
                acc += v;
                return <rect key={k} x={l + i * cw + 1} y={y1} width={Math.max(1, cw - 2)} height={Math.max(0, y0 - y1)} fill={colors[k]} />;
              })}
            </g>
          );
        })}
        {rows.map((r, i) => (r.q === 1 ? <text key={r.period} x={l + (i + 0.5) * cw} y={H - 5} textAnchor="middle">FY{String(r.fy).slice(2)}</text> : null))}
      </svg>
      {hover !== null && (
        <Tip x={l + hover * cw} y={10} w={W}>
          <b>{qLabel(rows[hover])} · {bn(totals[hover])}</b>
          {[...keys].sort((a, b) => (rows[hover][by]![b] ?? 0) - (rows[hover][by]![a] ?? 0)).map(k => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: colors[k], marginRight: 6 }} />{PRODUCT_LABEL[k] ?? k}</span><b>{bn(rows[hover][by]![k])} · {((rows[hover][by]![k]! / totals[hover]) * 100).toFixed(0)}%</b></div>
          ))}
        </Tip>
      )}
    </div>
  );
}
