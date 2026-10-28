import { ScreenTabs, useTab } from '../components/tabs';
import { BrandsScreen, CitiesScreen, CollectionsScreen, FASHION_TABS, HowScreen as FashionHow, type FashionFile } from './FashionScreens';
import { useMemo, useState } from 'react';
import { ocol, Hero } from '../components/sheet';
import { Tbc } from '../components/common';
import { useData } from '../core/store';
import { DAY, countdown, dayShort, fmt, hhmm } from '../core/time';
import { CITIES, KIND_NAME, weekEnd, weekName, weekStart, weekState, type FashionCity, type FashionWeek } from '../sources/fashion';

const dayRange = (w: FashionWeek) => `${dayShort(weekStart(w)).replace(/^\w+ /, '')} – ${dayShort(weekEnd(w) - DAY).replace(/^\w+ /, '')}`;
const CITY_TZ: Record<FashionCity, string> = { 'New York': 'America/New_York', London: 'Europe/London', Milan: 'Europe/Rome', Paris: 'Europe/Paris' };
const KIND_MARK = { women: 'W', men: 'M', couture: 'C' } as const;
const caps = (s: string) => s.toLowerCase().replace(/(^|[\s'’(.-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

/** Fashion weeks of the Big 4: when each one runs, who shows and when. */
export function FashionPage() {
  const { fashion, news, now } = useData();
  const [pick, setPick] = useState<string>();
  const [onlyShows, setOnlyShows] = useState(true);
  const [season, setSeason] = useState<string>();
  const [all, setAll] = useState(false);

  const weeks = useMemo(() => fashion?.weeks ?? [], [fashion]);
  const current = weeks.filter(w => weekState(w, now) === 'in');
  const upcoming = weeks.filter(w => weekState(w, now) === 'pre');
  const past = weeks.filter(w => weekState(w, now) === 'post');
  const next = upcoming[0];
  const withShows = useMemo(() => weeks.filter(w => fashion?.shows.some(s => s.week === w.id)), [weeks, fashion]);
  const shown = weeks.find(w => w.id === pick) ?? current.find(w => withShows.includes(w)) ?? [...withShows].reverse().find(w => weekState(w, now) !== 'pre') ?? withShows.at(-1);
  const shows = useMemo(() => (fashion?.shows ?? []).filter(s => s.week === shown?.id && (!onlyShows || s.type === 'show')).sort((a, b) => a.start.localeCompare(b.start)), [fashion, shown, onlyShows]);
  const myNews = news.filter(n => n.passion === 'fashion').slice(0, 10);

  const [tab, setTab] = useTab(FASHION_TABS);
  if (!fashion) return <Hero id="fashion" dek="Loading the fashion calendar…" />;

  const days = new Map<string, typeof shows>();
  const tz = shown ? CITY_TZ[shown.city] : 'Europe/Rome';
  shows.forEach(s => { const k = fmt(Date.parse(s.start), { weekday: 'long', day: 'numeric', month: 'long' }, tz); days.set(k, [...(days.get(k) ?? []), s]); });

  const seasons = [...new Set(fashion.collections.map(c => c.season))];
  const cs = season ?? seasons[0];
  const mensSeason = (x: string) => x.startsWith('mens-');
  const label = (x: string) => x.replace('mens-', "men's ").replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());

  return (
    <>
      <Hero id="fashion" dek={current.length
        ? `On now: ${current.map(weekName).join(' and ')}.${next ? ` Next: ${weekName(next)}, ${dayRange(next)}.` : ''}`
        : next ? `Next: ${weekName(next)}, ${dayRange(next)}${next.tbc ? ' (dates expected, not announced yet)' : ''}.` : 'The four capitals of fashion: New York, London, Milan and Paris.'} />
      <ScreenTabs tabs={FASHION_TABS} tab={tab} set={setTab} label="Fashion screens" />
      {tab !== 'now' ? (tab === 'cities' ? <CitiesScreen d={fashion as unknown as FashionFile} now={now} /> : tab === 'brands' ? <BrandsScreen d={fashion as unknown as FashionFile} /> : tab === 'collections' ? <CollectionsScreen d={fashion as unknown as FashionFile} /> : <FashionHow />) : <>

      <section className="s-top">
        <div className="ocard s-next">
          <div className="lab">{current.length ? 'On now' : 'Next fashion week'}</div>
          {(current[0] ?? next) ? (() => {
            const w = current[0] ?? next;
            const on = weekState(w, now) === 'in';
            return (
              <>
                <h3>{weekName(w)}{w.tbc && <Tbc e={{ tbc: true }} />}</h3>
                <div className="when">{w.season} · {dayRange(w)}{w.tbc ? ' · expected window' : ''}</div>
                <div className="s-cd">{on ? `Day ${Math.floor((now - weekStart(w)) / DAY) + 1}` : countdown(weekStart(w) - now)}<small>{on ? `of ${Math.round((weekEnd(w) - weekStart(w)) / DAY)}` : 'T-minus'}</small></div>
              </>
            );
          })() : <div>Nothing scheduled.</div>}
        </div>
        <div className="ocard">
          <div className="lab">Next in each capital</div>
          <div className="olist">
            {CITIES.map(c => {
              const w = [...current, ...upcoming].find(x => x.city === c);
              return (
                <div key={c} className="r" style={{ gridTemplateColumns: '84px 1fr auto' }}>
                  <time>{c}</time>
                  <div>{w ? <><b>{KIND_NAME[w.kind]}</b> <small>{w.season}</small></> : <span style={{ color: 'var(--o-ink3)' }}>—</span>}</div>
                  <span className="x">{w ? <>{dayRange(w)}{w.tbc && <> <Tbc e={{ tbc: true }} /></>}</> : ''}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="ocard">
          <div className="lab">Latest season</div>
          {(() => {
            const last = past.at(-1);
            if (!last) return <div>No past edition on record.</div>;
            const n = fashion.shows.filter(s => s.week === last.id && s.type === 'show').length;
            return (
              <>
                <h3 style={{ margin: 0, fontSize: 18 }}>{weekName(last)}</h3>
                <div className="when" style={{ color: 'var(--o-ink2)', fontSize: 13 }}>{last.season} · {dayRange(last)}</div>
                <div className="kpis" style={{ marginTop: 12 }}>
                  <div className="kpi"><b>{n || '—'}</b><span>Runway shows</span></div>
                  <div className="kpi"><b>{fashion.collections.filter(c => c.city === last.city && !mensSeason(c.season)).length || '—'}</b><span>Reviewed (WWD)</span></div>
                </div>
              </>
            );
          })()}
        </div>
      </section>

      <section className="ocard">
        <h2>The fashion year</h2>
        <p className="dek">Every week of the Big 4, from a month back to a year ahead. W womenswear, M menswear, C haute couture. Hatched bars are expected windows the organisers have not announced yet.</p>
        <Year weeks={weeks} now={now} />
        <div className="osrc">Source: CFDA (New York), British Fashion Council (London), Camera Nazionale della Moda Italiana (Milan), FHCM (Paris)</div>
      </section>

      <section className="s-two">
        <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
          <div className="ocard">
            <div className="lab">Runway schedule · {shown ? `${tz === 'Europe/Rome' ? 'Rome' : shown.city} time` : ''}</div>
            {shown ? (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {withShows.slice().reverse().map(w => (
                    <button key={w.id} className="btn" aria-pressed={w.id === shown.id} onClick={() => { setPick(w.id); setAll(false); }}
                      style={{ color: 'var(--o-ink)', background: w.id === shown.id ? 'var(--o-accent-soft)' : 'transparent', borderColor: 'var(--o-line)', textTransform: 'none', letterSpacing: 0 }}>
                      {weekName(w).replace(' Fashion Week', '').replace(' Haute Couture Week', ' couture')} · {w.season.replace(/^(Spring\/Summer|Autumn\/Winter)\s*/, m => (m.startsWith('S') ? 'SS' : 'FW')).replace(/(\d{4})-\d{4}/, '$1')}
                    </button>
                  ))}
                </div>
                <h2>{weekName(shown)} · {shown.season}</h2>
                <p className="dek">{dayRange(shown)}. {fashion.shows.filter(s => s.week === shown.id && s.type === 'show').length} runway shows and {fashion.shows.filter(s => s.week === shown.id && s.type === 'presentation').length} presentations on the organiser's calendar.</p>
                <label style={{ fontSize: 13, color: 'var(--o-ink2)', display: 'inline-flex', gap: 6, marginBottom: 8 }}>
                  <input type="checkbox" checked={onlyShows} onChange={e => setOnlyShows(e.target.checked)} /> Runway shows only
                </label>
                {[...days.entries()].slice(0, all ? undefined : 3).map(([d, list]) => (
                  <div key={d} style={{ marginBottom: 12 }}>
                    <div className="lab" style={{ marginTop: 8 }}>{d}</div>
                    <div className="olist">
                      {list.map(s => (
                        <div key={s.id} className="r" style={{ gridTemplateColumns: '60px 1fr auto' }}>
                          <time>{hhmm(Date.parse(s.start), tz)}</time>
                          <div>
                            <b>{s.link ? <a href={s.link} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{caps(s.brand)}</a> : caps(s.brand)}</b>
                            {(s.place || s.note) && <small>{[s.place, s.note].filter(Boolean).join(' · ')}</small>}
                          </div>
                          <span className="x">{s.live ? 'live' : s.type === 'show' ? 'show' : 'presentation'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {days.size > 3 && <button className="btn" onClick={() => setAll(!all)} style={{ color: 'var(--o-ink)', borderColor: 'var(--o-line)', textTransform: 'none', letterSpacing: 0 }}>{all ? 'Show fewer days' : `Show all ${days.size} days`}</button>}
                {!shows.length && <div style={{ color: 'var(--o-ink2)' }}>No listing for this week.</div>}
                <div className="osrc">Source: {shown.city === 'Paris' ? 'FHCM final calendar' : shown.city === 'Milan' ? 'Camera Nazionale della Moda Italiana calendar' : 'British Fashion Council schedule'}. Times in the city's own time zone.</div>
              </>
            ) : <div>No show schedule yet.</div>}
            <div style={{ color: 'var(--o-ink2)', fontSize: 13, marginTop: 10 }}>
              Show-by-show schedules come out two to three weeks before each week. New York's detailed calendar is a CFDA subscription, so only its dates are tracked here; its collections show up under "Reviewed" once they have walked.
            </div>
          </div>

          <div className="ocard">
            <div className="lab">Reviewed · WWD Runway · <span title="Vogue Runway page">V = Vogue</span></div>
            {seasons.length > 0 ? (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {seasons.map(x => (
                    <button key={x} className="btn" aria-pressed={x === cs} onClick={() => setSeason(x)}
                      style={{ color: 'var(--o-ink)', background: x === cs ? 'var(--o-accent-soft)' : 'transparent', borderColor: 'var(--o-line)', textTransform: 'none', letterSpacing: 0 }}>{label(x)}</button>
                  ))}
                </div>
                {CITIES.map(c => {
                  const list = fashion.collections.filter(x => x.season === cs && x.city === c);
                  return list.length ? (
                    <div key={c} style={{ marginBottom: 10 }}>
                      <div className="lab" style={{ marginTop: 6 }}>{c} · {list.length}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 13.5 }}>
                        {list.map(x => (
                          <span key={x.url}>
                            <a href={x.url} target="_blank" rel="noreferrer" style={{ color: 'var(--o-ink)' }}>{x.brand}</a>
                            {x.vogue && <a href={x.vogue} target="_blank" rel="noreferrer" title="Vogue Runway" style={{ color: 'var(--o-ink3)', fontSize: 11, marginLeft: 3 }}>V</a>}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })}
              </>
            ) : <div>No reviews yet.</div>}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
          <div className="ocard">
            <div className="lab">Calendar · all four capitals</div>
            <div className="olist">
              {[...current, ...upcoming].map(w => (
                <div key={w.id} className="r" style={{ gridTemplateColumns: '92px 1fr auto' }}>
                  <time>{dayRange(w)}<small>{fmt(weekStart(w), { year: 'numeric' })}</small></time>
                  <div><b>{weekName(w)}</b><Tbc e={w} /><small>{w.season}{w.official ? ` · ${w.official}` : ''}</small></div>
                  <span className="x">{weekState(w, now) === 'in' ? <span className="tag-live">ON NOW</span> : w.link ? <a href={w.link} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>in {countdown(weekStart(w) - now).split(' ')[0]}</a> : `in ${countdown(weekStart(w) - now).split(' ')[0]}`}</span>
                </div>
              ))}
            </div>
          </div>
          {myNews.length > 0 && (
            <div className="ocard">
              <div className="lab">From the wire</div>
              <div className="onews">
                {myNews.map(n => (
                  <a key={n.id} className="r" href={n.url} target="_blank" rel="noreferrer">
                    <time>{now - n.time < DAY ? `Today ${hhmm(n.time)}` : dayShort(n.time)} · {n.source}</time>
                    <p>{n.title}</p>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
      </>}
    </>
  );
}

/** One row per capital on a shared time axis, from 30 days back to a year ahead. */
function Year({ weeks, now }: { weeks: FashionWeek[]; now: number }) {
  const a = now - 30 * DAY, b = now + 365 * DAY;
  const pct = (t: number) => `${(Math.min(Math.max(t, a), b) - a) / (b - a) * 100}%`;
  const months: number[] = [];
  for (let d = new Date(a); d < new Date(b); d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) if (+d > a) months.push(+d);
  const color = ocol('fashion');
  return (
    <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '74px 1fr', rowGap: 8, fontSize: 12 }}>
      <div />
      <div style={{ position: 'relative', height: 16 }}>
        {months.map(m => <span key={m} style={{ position: 'absolute', left: pct(m), color: 'var(--o-ink3)', transform: 'translateX(-1px)' }}>{new Date(m).getMonth() === 0 ? String(new Date(m).getFullYear()) : fmt(m, { month: 'narrow' })}</span>)}
      </div>
      {CITIES.map(c => (
        <div key={c} style={{ display: 'contents' }}>
          <div style={{ color: 'var(--o-ink2)', alignSelf: 'center' }}>{c}</div>
          <div style={{ position: 'relative', height: 26, borderRadius: 6, background: 'var(--o-line)', opacity: 1, overflow: 'hidden' }}>
            {months.map(m => <i key={m} style={{ position: 'absolute', left: pct(m), top: 0, bottom: 0, width: 1, background: 'var(--o-card)' }} />)}
            {weeks.filter(w => w.city === c && weekEnd(w) > a && weekStart(w) < b).map(w => {
              const l = (Math.max(weekStart(w), a) - a) / (b - a) * 100;
              const wd = Math.max((Math.min(weekEnd(w), b) - Math.max(weekStart(w), a)) / (b - a) * 100, 1.3);
              return (
                <span key={w.id} title={`${weekName(w)} · ${w.season} · ${dayRange(w)}${w.tbc ? ' (expected)' : ''}`}
                  style={{ position: 'absolute', left: `${l}%`, width: `${wd}%`, top: 3, bottom: 3, borderRadius: 4, display: 'grid', placeItems: 'center', fontSize: 10.5, fontWeight: 700, color: '#fff',
                    background: w.tbc ? `repeating-linear-gradient(45deg, ${color}, ${color} 3px, transparent 3px, transparent 6px)` : color, opacity: weekState(w, now) === 'post' ? 0.45 : 1, boxShadow: w.tbc ? `inset 0 0 0 1px ${color}` : undefined }}>
                  <span style={{ color: w.tbc ? color : '#fff', background: w.tbc ? 'var(--o-card)' : 'transparent', borderRadius: 3, padding: w.tbc ? '0 3px' : 0 }}>{KIND_MARK[w.kind]}</span>
                </span>
              );
            })}
            <i style={{ position: 'absolute', left: pct(now), top: 0, bottom: 0, width: 2, background: '#ff453a' }} />
          </div>
        </div>
      ))}
    </div>
  );
}


