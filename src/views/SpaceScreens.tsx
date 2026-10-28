import { useSearchParams } from 'react-router-dom';
import { PointsBars, useWidth } from '../components/charts';
import { Tbc } from '../components/common';
import { DAY, countdown, dayLong, dayShort, hhmm } from '../core/time';
import type { ArtemisFlow, AstronautClass, CrewSeat, Launch, OrbitMission, SpaceData, SpacexData, SpacexKind, StationEvent } from '../sources/spaceData';

export const STATUS: Record<string, { label: string; color: string }> = {
  Go: { label: 'Go for launch', color: 'var(--oc-out)' }, TBD: { label: 'Date TBD', color: 'var(--o-ink3)' }, TBC: { label: 'To be confirmed', color: 'var(--oc-usa)' },
  Success: { label: 'Success', color: 'var(--oc-out)' }, Failure: { label: 'Failure', color: 'var(--oc-mil)' }, 'Partial Failure': { label: 'Partial failure', color: 'var(--oc-usa)' }, Hold: { label: 'Hold', color: 'var(--oc-usa)' }, 'In Flight': { label: 'In flight', color: 'var(--o-accent)' },
};
export const pill = (s: string) => STATUS[s] ?? { label: s, color: 'var(--o-ink3)' };

export type SpaceTab = 'overview' | 'artemis' | 'iss' | 'spacex' | 'class';
const TABS: [SpaceTab, string][] = [['overview', 'Overview'], ['artemis', 'Artemis'], ['iss', 'ISS'], ['spacex', 'SpaceX'], ['class', 'Astronaut class']];

/** The open Space screen lives in the URL (?tab=iss), so the terminal can drop its map off the overview. */
export function useSpaceTab(): [SpaceTab, (t: SpaceTab) => void] {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find(([k]) => k === params.get('tab'))?.[0] ?? 'overview') as SpaceTab;
  const set = (t: SpaceTab) => setParams(p => { if (t === 'overview') p.delete('tab'); else p.set('tab', t); return p; }, { replace: true });
  return [tab, set];
}

export function SpaceTabs({ tab, set }: { tab: SpaceTab; set: (t: SpaceTab) => void }) {
  return (
    <nav className="ocard sp-tabs" aria-label="Spaceflight screens">
      {TABS.map(([k, label]) => <button key={k} className="btn" aria-pressed={tab === k} onClick={() => set(k)}>{label}</button>)}
    </nav>
  );
}

/** "P190DT23H9M10S" → days (Launch Library durations). */
export function isoDays(d: string | null | undefined): number | null {
  const m = d?.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/);
  return m ? (+(m[1] ?? 0)) + (+(m[2] ?? 0)) / 24 + (+(m[3] ?? 0)) / 1440 : null;
}
/** "PT6H49M" → "6 h 49 min". */
const hm = (d: string | null | undefined) => {
  const m = d?.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return '–';
  const h = (+(m[1] ?? 0)) * 24 + (+(m[2] ?? 0));
  return `${h} h ${String(+(m[3] ?? 0)).padStart(2, '0')}`;
};
/** A launch date at the precision the provider gave: "Jun 2027", "Q4 2026", "H1 2028", "2030", or the day. */
export function netLabel(l: Pick<Launch, 'net' | 'precision' | 'tbc'>) {
  const t = Date.parse(l.net), y = new Date(t).getUTCFullYear(), p = l.precision ?? '';
  if (/^month/i.test(p)) return new Date(t).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const q = p.match(/quarter\s*(\d)/i); if (q) return `Q${q[1]} ${y}`;
  const h = p.match(/half\s*(\d)/i); if (h) return `H${h[1]} ${y}`;
  if (/^year/i.test(p) || (l.tbc && /^tbc|tbd/i.test(p))) return String(y);
  return `${dayShort(t)} ${y}`;
}
/** An event's time in Rome, or "time TBC" when the source gave only the day. */
export const evTime = (e: Pick<StationEvent, 'date' | 'allDay'>) => (e.allDay ? 'time TBC' : `${hhmm(Date.parse(e.date))}`);
const daysSince = (iso: string, now: number) => Math.floor((now - Date.parse(iso)) / DAY);
const initials = (n: string) => n.split(' ').map(x => x[0]).slice(0, 2).join('');
/** China's station: left out of every screen (not followed). */
export const isTiangong = (s: string) => /tiangong|tianhe|shenzhou|tianzhou|CNSA|CMSA/i.test(s);

/** A patch, or the mission name in a dashed circle when there is none. */
export function Patch({ src, name, size = 72 }: { src?: string | null; name: string; size?: number }) {
  return src ? <img className="sp-patch" src={src} alt={`${name} patch`} loading="lazy" style={{ width: size, height: size }} />
    : <span className="sp-patch ph" style={{ width: size, height: size }}>{name}</span>;
}

function Face({ name, image, size = 44 }: { name: string; image?: string | null; size?: number }) {
  return image ? <img className="sp-face" src={image} alt="" loading="lazy" style={{ width: size, height: size }} /> : <span className="sp-face ph" style={{ width: size, height: size }}>{initials(name)}</span>;
}

/** The missions with people aboard now: patch, where, how long, who. */
export function OrbitMissions({ missions, now }: { missions: OrbitMission[]; now: number }) {
  return (
    <div className="s-missions">
      {missions.map(m => (
        <div key={m.id} className="s-mission">
          <Patch src={m.patch} name={m.name} />
          <div>
            <b>{m.name}</b>
            <small>{[m.spacecraft !== m.name && m.spacecraft, m.destination].filter(Boolean).join(' · ')}</small>
            <small>{daysSince(m.launched, now)} days in orbit · launched {dayShort(Date.parse(m.launched))}</small>
            <small className="crew">{m.crew.map(c => c.name).join(', ')}</small>
          </div>
        </div>
      ))}
    </div>
  );
}

function CrewRow({ crew }: { crew: CrewSeat[] }) {
  return (
    <div className="sp-crew">
      {crew.map(c => (
        <div key={c.name}><Face name={c.name} image={c.image} size={52} /><b>{c.name}</b><small>{[c.role, c.agency].filter(Boolean).join(' · ')}</small></div>
      ))}
    </div>
  );
}

function EventList({ events, now, empty }: { events: StationEvent[]; now: number; empty: string }) {
  if (!events.length) return <div className="sp-empty">{empty}</div>;
  return (
    <div className="olist">
      {events.map(e => (
        <div key={e.id} className="r">
          <time>{dayShort(Date.parse(e.date))}<small>{evTime(e)}</small></time>
          <div><b>{e.name}</b><small>{e.type}{e.location ? ` · ${e.location}` : ''}</small></div>
          <span className="x">{Date.parse(e.date) > now ? `in ${countdown(Date.parse(e.date) - now)}` : 'under way'}</span>
        </div>
      ))}
    </div>
  );
}

function NewsList({ items, max = 10 }: { items: { title: string; source: string; time: string; url: string }[]; max?: number }) {
  if (!items.length) return <div className="sp-empty">No recent stories.</div>;
  return <div className="onews">{items.slice(0, max).map(n => <a key={n.url} className="r" href={n.url} target="_blank" rel="noreferrer"><time>{dayShort(Date.parse(n.time))} · {n.source}</time><p>{n.title}</p></a>)}</div>;
}

/* ───────────────────────── Artemis ───────────────────────── */

/** NASA's return to the Moon: every flight with its patch and crew, what is next, and the news. */
export function ArtemisScreen({ space, now }: { space: SpaceData; now: number }) {
  // "Orion CM-003 · Integrity", from Wikipedia via the road-to-launch collector
  const capsuleOf = (mission: string) => space.artemisFlow?.capsules?.[mission.replace(/\s*\(.*\)$/, '')] ?? null;
  const flights = space.artemis ?? [];
  const next = flights.find(l => !l.past);
  const flown = flights.filter(l => l.past);
  const events = (space.events ?? []).filter(e => /artemis|orion|sls|moon|lunar/i.test(`${e.name} ${e.description}`) && Date.parse(e.date) > now - 3 * 3600e3);
  // Artemis feeds, plus Artemis stories from the general news releases; never the station blogs
  const news = (space.news ?? []).filter(n => /artemis/i.test(n.source) || (/news releases/i.test(n.source) && /artemis|orion|\bsls\b|moon|lunar|rs-25|gateway/i.test(n.title)));
  return (
    <>
      <section className="s-top sp-two">
        <div className="ocard">
          <div className="lab">Next Artemis flight</div>
          {next ? (
            <div className="sp-feature">
              <Patch src={next.patch} name={next.mission} size={110} />
              <div>
                <h3>{next.mission}<Tbc e={next} /></h3>
                <div className="when">{next.rocket} · {next.pad}</div>
                {capsuleOf(next.mission)?.orion && <div className="when">Capsule: <b>{capsuleOf(next.mission)!.orion}</b>{capsuleOf(next.mission)!.name ? <> · <i>{capsuleOf(next.mission)!.name}</i></> : ' · not named yet'}</div>}
                <div className="when">{next.tbc ? `No earlier than ${netLabel(next)}` : dayLong(Date.parse(next.net))} · <span style={{ color: pill(next.status).color }}>{pill(next.status).label}</span></div>
                <div className="s-cd" style={{ fontSize: 30 }}>{countdown(Date.parse(next.net) - now)}<small>{next.tbc ? 'to the earliest date' : 'T-minus'}</small></div>
              </div>
            </div>
          ) : <div className="sp-empty">No Artemis flight on the manifest.</div>}
          {next?.description && <p className="sp-desc">{next.description}</p>}
          {next?.crew && next.crew.length > 0 && <><div className="lab" style={{ marginTop: 12 }}>Crew</div><CrewRow crew={next.crew} /></>}
        </div>
        <div className="ocard">
          <div className="lab">The programme so far</div>
          <div className="kpis">
            <div className="kpi"><b>{flown.length}</b><span>Flown</span></div>
            <div className="kpi"><b>{flights.length - flown.length}</b><span>Planned</span></div>
            <div className="kpi"><b>{flown.filter(l => l.crew?.length).reduce((n, l) => n + (l.crew?.length ?? 0), 0) || '–'}</b><span>Crew flown</span></div>
          </div>
          <div className="lab" style={{ marginTop: 16 }}>Coming up</div>
          <EventList events={events.slice(0, 5)} now={now} empty="No Artemis events on the calendar." />
        </div>
      </section>

      {space.artemisFlow && next && <RoadToLaunch flow={space.artemisFlow} launch={next} lander={(space.starship?.upcoming ?? []).find(l => /hls/i.test(l.mission)) ?? null} now={now} />}

      {flights.length > 0 && (
        <section className="ocard">
          <h2>Every Artemis flight</h2>
          <p className="dek">Flown missions filled, planned ones hollow. Dates past Artemis III are NASA targets, not schedules.</p>
          <Timeline items={flights} now={now} />
          <div className="sp-missions">
            {flights.map(l => (
              <article key={l.id} className={`sp-mcard${l.past ? ' past' : ''}`}>
                <Patch src={l.patch} name={l.mission} size={64} />
                <div>
                  <b>{l.mission}</b>
                  <small>{l.past ? `${dayShort(Date.parse(l.net))} ${new Date(l.net).getUTCFullYear()}` : netLabel(l)} · <span style={{ color: pill(l.status).color }}>{pill(l.status).label}</span></small>
                  <small>{l.rocket}</small>
                  {capsuleOf(l.mission)?.orion && <small className="capsule">{capsuleOf(l.mission)!.orion}{capsuleOf(l.mission)!.name ? <> · <i>{capsuleOf(l.mission)!.name}</i></> : ''}</small>}
                  {l.crew && l.crew.length > 0 ? <small className="crew">{l.crew.map(c => c.name).join(', ')}</small> : l.crew ? <small className="crew">{l.crewed && !l.past ? 'Crew not named yet' : 'Uncrewed'}</small> : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="ocard">
        <div className="lab">Artemis news from NASA</div>
        <NewsList items={news} max={12} />
      </section>
    </>
  );
}

const LANES: { id: ArtemisFlow['steps'][number]['lane']; label: string; color: string }[] = [
  { id: 'rocket', label: 'SLS rocket', color: 'var(--o-s2)' },
  { id: 'orion', label: 'Orion spacecraft', color: 'var(--o-s1)' },
  { id: 'pad', label: 'Integration and pad', color: 'var(--o-s4)' },
  { id: 'crew', label: 'Crew and lander', color: 'var(--o-s3)' },
  { id: 'traditions', label: 'Crew traditions', color: 'var(--oc-cul)' },
];

/** Every step from hardware arriving at Kennedy to liftoff, marked from NASA's own reports. */
function RoadToLaunch({ flow, launch, lander, now }: { flow: ArtemisFlow; launch: Launch; lander: Launch | null; now: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const done = flow.steps.filter(s => s.status === 'done').length;
  const active = flow.steps.filter(s => s.status === 'active');
  const dated = flow.steps.filter(s => s.date);
  const t0 = Math.min(...dated.map(s => Date.parse(s.date!)), now) - 30 * DAY;
  const t1 = Math.max(Date.parse(launch.net), now) + 30 * DAY;
  const LX = Math.min(130, W * 0.22);
  const x = (t: number) => LX + ((t - t0) / (t1 - t0)) * (W - LX - 14);
  const years: number[] = [];
  for (let y = new Date(t0).getUTCFullYear() + 1; y <= new Date(t1).getUTCFullYear(); y++) years.push(Date.UTC(y, 0, 1));
  const laneY = (lane: string) => 26 + LANES.findIndex(l => l.id === lane) * 16;
  const H = 26 + LANES.length * 16 + 22;
  const nextUp = flow.steps.find(s => s.status === 'todo');
  return (
    <section className="ocard">
      <h2>Road to launch · {flow.mission}</h2>
      <p className="dek">
        {done} of {flow.steps.length} steps reported done by NASA{active.length ? `, ${active.length} under way` : ''}. Launch no earlier than {netLabel(launch)}.
        {nextUp ? ` Next on the list: ${nextUp.label.toLowerCase()}.` : ''}
      </p>
      <div className="sp-progress"><i style={{ width: `${(done / flow.steps.length) * 100}%` }} /><i className="act" style={{ width: `${(active.length / flow.steps.length) * 100}%` }} /></div>

      {/* Each reported step on a time axis, one row per lane, up to the launch date */}
      <div ref={ref} className="ochart" style={{ marginTop: 10 }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`${flow.mission} processing timeline`}>
          {years.map(y => <g key={y}><line x1={x(y)} x2={x(y)} y1={14} y2={H - 16} stroke="var(--o-grid)" /><text x={x(y) + 3} y={H - 4}>{new Date(y).getUTCFullYear()}</text></g>)}
          {LANES.map(l => <g key={l.id}><text x={0} y={laneY(l.id) + 4} style={{ fill: l.color, fontSize: 11, fontWeight: 600 }}>{l.label}</text><line x1={LX} x2={W - 14} y1={laneY(l.id)} y2={laneY(l.id)} stroke="var(--o-line)" /></g>)}
          <line x1={x(now)} x2={x(now)} y1={10} y2={H - 16} stroke="var(--o-accent)" strokeWidth={2} />
          <text x={x(now)} y={9} textAnchor="middle" style={{ fill: 'var(--o-accent)', fontWeight: 700 }}>Today</text>
          {dated.map(s => {
            const c = LANES.find(l => l.id === s.lane)!.color;
            return <circle key={s.id} cx={x(Date.parse(s.date!))} cy={laneY(s.lane)} r={5.5} fill={s.status === 'done' ? c : 'var(--o-card)'} stroke={c} strokeWidth={2}><title>{`${s.label} · ${dayShort(Date.parse(s.date!))} ${new Date(s.date!).getUTCFullYear()}\n${s.title ?? ''}`}</title></circle>;
          })}
          {lander && <rect x={x(Date.parse(lander.net)) - 5} y={laneY('crew') - 5} width={10} height={10} fill="none" stroke="var(--o-s3)" strokeWidth={2} strokeDasharray="2 2"><title>{`${lander.mission} · ${netLabel(lander)}`}</title></rect>}
          <path d={`M${x(Date.parse(launch.net))},${laneY('pad') - 8}l7,8l-7,8l-7,-8z`} fill="var(--oc-spa)"><title>{`Launch · no earlier than ${netLabel(launch)}`}</title></path>
          <text x={x(Date.parse(launch.net))} y={H - 4} textAnchor="middle" style={{ fill: 'var(--oc-spa)', fontWeight: 700 }}>Launch</text>
        </svg>
      </div>

      <div className="sp-lanes">
        {LANES.map(l => (
          <div key={l.id}>
            <div className="lab" style={{ color: l.color }}>{l.label}</div>
            <ol>
              {flow.steps.filter(s => s.lane === l.id).map(s => (
                <li key={s.id} className={s.status}>
                  <span className="mark" style={{ borderColor: l.color, background: s.status === 'done' ? l.color : undefined }}>{s.status === 'done' ? '✓' : ''}</span>
                  <div>
                    <b>{s.label}</b>
                    {s.note && <small className="note">{s.note}</small>}
                    {s.id === 'lander' && lander && <small>{lander.mission} · {netLabel(lander)}</small>}
                    {s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.status === 'active' ? 'Under way · ' : ''}{dayShort(Date.parse(s.date!))} {new Date(s.date!).getUTCFullYear()} · {s.title}</a> : <small>Not reported yet</small>}
                  </div>
                </li>
              ))}
              {l.id === 'pad' && (
                <li className="launch">
                  <span className="mark" style={{ borderColor: 'var(--oc-spa)' }}>▲</span>
                  <div><b>Launch</b><small>No earlier than {netLabel(launch)} · in {countdown(Date.parse(launch.net) - now)}</small></div>
                </li>
              )}
            </ol>
          </div>
        ))}
      </div>
      <small style={{ color: 'var(--o-ink3)' }}>Steps follow the usual SLS and Orion campaign at Kennedy. Each is ticked when a nasa.gov story on {flow.mission} reports it done, or marked under way when one says it has begun, with a link to that story.</small>
    </section>
  );
}

/* ───────────────────────── ISS ───────────────────────── */

const CREWED_SINCE = Date.UTC(2000, 10, 2); // Expedition 1 arrived on 2 November 2000

/** The International Space Station: expedition and crew, who is docked where, traffic and spacewalks. */
export function IssScreen({ space, now }: { space: SpaceData; now: number }) {
  const iss = space.iss;
  const events = (space.events ?? []).filter(e => Date.parse(e.date) > now - 3 * 3600e3 && !isTiangong(`${e.name} ${e.location} ${e.description}`));
  // Station operations only: no press events, nothing about Artemis or Starship
  const ops = events.filter(e => !/press|conference|briefing|broadcast|artemis|starship/i.test(`${e.type} ${e.name}`));
  const evaEvents = events.filter(e => /eva|spacewalk/i.test(`${e.type} ${e.name}`));
  const trafficEvents = events.filter(e => /dock|undock|berth|relocat|splashdown|landing|launch/i.test(`${e.type} ${e.name}`));
  // Station and Commercial Crew blogs, plus station stories from the news releases; never the Artemis feeds
  const news = (space.news ?? []).filter(n => /station|commercial crew/i.test(n.source) || (/news releases/i.test(n.source) && /station|\biss\b|spacewalk|expedition/i.test(n.title)));
  if (!iss) return <section className="ocard"><div className="sp-empty">The station data refreshes every few hours; it will appear here after the next collection.</div></section>;
  const exp = iss.expedition;
  const year = new Date(now).getUTCFullYear();
  const walksYear = iss.spacewalks.filter(w => new Date(w.start).getUTCFullYear() === year);
  const hoursYear = walksYear.reduce((h, w) => h + (isoDays(w.duration) ?? 0) * 24, 0);
  const occupied = iss.ports.filter(p => p.vehicle);
  const free = iss.ports.filter(p => !p.vehicle);
  return (
    <>
      <section className="s-top">
        <div className="ocard">
          <div className="lab">On board now</div>
          {exp ? (
            <div className="sp-feature">
              <Patch src={exp.patch} name={exp.name} size={96} />
              <div>
                <h3>{exp.name}</h3>
                <div className="when">Since {dayLong(Date.parse(exp.start))} · day {daysSince(exp.start, now) + 1}</div>
                <div className="when">Commander: {exp.crew.find(c => /commander/i.test(c.role))?.name ?? '–'}</div>
              </div>
            </div>
          ) : <div className="sp-empty">Expedition data unavailable.</div>}
        </div>
        <div className="ocard">
          <div className="lab">The station</div>
          <div className="kpis">
            <div className="kpi"><b>{iss.station.onboard ?? '–'}</b><span>Crew aboard</span></div>
            <div className="kpi"><b>{iss.station.docked ?? occupied.length}</b><span>Vehicles docked</span></div>
            <div className="kpi"><b>{Math.floor((now - CREWED_SINCE) / DAY).toLocaleString('en-US')}</b><span>Days crewed in a row</span></div>
          </div>
          <div className="kpis" style={{ marginTop: 10 }}>
            <div className="kpi"><b>{iss.station.mass ?? '–'} t</b><span>Mass</span></div>
            <div className="kpi"><b>{iss.station.volume ?? '–'} m³</b><span>Pressurised</span></div>
            <div className="kpi"><b>{2030 - year}</b><span>Years to retirement</span></div>
          </div>
        </div>
        <div className="ocard">
          <div className="lab">Next at the station</div>
          {ops[0] ? (
            <>
              <h3 style={{ margin: 0, fontSize: 18 }}>{ops[0].name}</h3>
              <div className="when">{ops[0].type} · {dayLong(Date.parse(ops[0].date))} · {ops[0].allDay ? 'time TBC' : `${hhmm(Date.parse(ops[0].date))} Rome`}</div>
              <div className="s-cd" style={{ fontSize: 30 }}>{countdown(Date.parse(ops[0].date) - now)}</div>
            </>
          ) : <div className="sp-empty">Nothing scheduled.</div>}
        </div>
      </section>

      {exp && (
        <section className="ocard">
          <h2>The crew of {exp.name}</h2>
          <p className="dek">Days on this flight, and each person's career totals in space and on spacewalks.</p>
          <div className="sp-people">
            {exp.crew.map(c => {
              const career = isoDays(c.inSpace);
              const eva = isoDays(c.evaTime);
              return (
                <div key={c.name} className="sp-person">
                  <Face name={c.name} image={c.image} size={64} />
                  <div>
                    <b>{c.name}</b>
                    <small>{c.role} · {c.agency}{c.nationality ? ` · ${c.nationality}` : ''}</small>
                    <small className="nums">
                      {c.lastFlight ? <span><i>{daysSince(c.lastFlight, now)}</i> days this flight</span> : null}
                      {career != null && <span><i>{Math.round(career)}</i> days career</span>}
                      {eva != null && eva > 0 && <span><i>{hm(c.evaTime)}</i> EVA</span>}
                    </small>
                    <small>{c.firstFlight && Date.parse(c.firstFlight) > now - 400 * DAY ? 'First flight' : c.age ? `Age ${c.age}` : ''}</small>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="s-two">
        <div className="ocard">
          <div className="lab">Who is docked where</div>
          <table className="otable">
            <thead><tr><th>Port</th><th>Vehicle</th><th className="n">Docked</th></tr></thead>
            <tbody>
              {occupied.map(p => <tr key={p.name}><td>{p.name}</td><td><b>{p.vehicle}</b>{p.mission && p.mission !== p.vehicle ? <><br /><small style={{ color: 'var(--o-ink3)' }}>{p.mission}</small></> : null}</td><td className="n">{p.since ? `${daysSince(p.since, now)} d` : ''}</td></tr>)}
            </tbody>
          </table>
          <div className="sp-ports">{free.map(p => <span key={p.name}>{p.name}</span>)}</div>
          <small style={{ color: 'var(--o-ink3)' }}>Free ports above · {occupied.length} of {iss.ports.length} in use</small>
        </div>
        <div className="ocard">
          <div className="lab">Traffic · coming up</div>
          <EventList events={trafficEvents.slice(0, 6)} now={now} empty="No arrivals or departures scheduled." />
          <div className="lab" style={{ marginTop: 16 }}>Traffic · recent arrivals and departures</div>
          <div className="olist">
            {iss.traffic.flatMap(t => [
              ...(t.departure ? [{ k: `${t.id}d`, at: t.departure, what: 'Undocked', t }] : []),
              { k: `${t.id}a`, at: t.docking, what: 'Docked', t },
            ]).filter(x => Date.parse(x.at) < now).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 10).map(x => (
              <div key={x.k} className="r">
                <time>{dayShort(Date.parse(x.at))}<small>{new Date(x.at).getUTCFullYear()}</small></time>
                <div><b>{x.t.vehicle}</b><small>{x.what} · {x.t.port}</small></div>
                <span className="x" style={{ color: x.what === 'Docked' ? 'var(--oc-spa)' : 'var(--o-ink3)' }}>{x.what === 'Docked' ? 'Arrived' : 'Left'}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="s-two">
        <div className="ocard">
          <div className="lab">Spacewalks</div>
          <div className="kpis" style={{ marginBottom: 12 }}>
            <div className="kpi"><b>{walksYear.length}</b><span>In {year}</span></div>
            <div className="kpi"><b>{Math.round(hoursYear)} h</b><span>Outside in {year}</span></div>
            <div className="kpi"><b>{evaEvents.length}</b><span>Scheduled</span></div>
          </div>
          {evaEvents.length > 0 && <EventList events={evaEvents} now={now} empty="" />}
          <table className="otable">
            <thead><tr><th>Date</th><th>Spacewalk</th><th className="n">Duration</th></tr></thead>
            <tbody>
              {iss.spacewalks.map(w => <tr key={w.id}><td>{dayShort(Date.parse(w.start))}<br /><small style={{ color: 'var(--o-ink3)' }}>{new Date(w.start).getUTCFullYear()}</small></td><td><b>{w.name}</b><br /><small style={{ color: 'var(--o-ink3)' }}>{w.crew.join(', ')}</small></td><td className="n">{hm(w.duration)}</td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="ocard">
          <div className="lab">From the Space Station and Commercial Crew blogs</div>
          <NewsList items={news} max={10} />
        </div>
      </section>
    </>
  );
}

/* ───────────────────────── SpaceX ───────────────────────── */

const KIND_COLOR: Record<SpacexKind, string> = { Starlink: 'var(--o-s1)', Customer: 'var(--o-s4)', Dragon: 'var(--o-s3)', Starship: 'var(--o-s2)' };
const KINDS: SpacexKind[] = ['Starlink', 'Customer', 'Dragon', 'Starship'];
const LANDING: Record<string, { label: string; color: string }> = { landed: { label: 'Landed', color: 'var(--oc-out)' }, lost: { label: 'Lost', color: 'var(--oc-mil)' }, pending: { label: '…', color: 'var(--o-ink3)' }, expended: { label: 'Expended', color: 'var(--o-ink3)' } };

/** Launches per month this year, stacked by kind. */
function MonthBars({ d, now }: { d: SpacexData; now: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const H = 170, top = 14, bottom = 22, l = 26;
  const curMonth = new Date(now).getUTCFullYear() === d.year ? new Date(now).getUTCMonth() : 11;
  const totals = d.byMonth.map(m => KINDS.reduce((n, k) => n + m[k], 0));
  const max = Math.max(4, ...totals);
  const band = (W - l) / 12, bw = Math.min(28, band * 0.62);
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max);
  const ticks = [0, Math.round(max / 2), max];
  return (
    <div ref={ref} className="ochart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`SpaceX launches per month in ${d.year}`}>
        {ticks.map(t => <g key={t}><line x1={l} x2={W} y1={y(t)} y2={y(t)} stroke="var(--o-grid)" /><text x={l - 6} y={y(t) + 4} textAnchor="end">{t}</text></g>)}
        {d.byMonth.map((m, i) => {
          let acc = 0;
          const x = l + band * i + (band - bw) / 2;
          return (
            <g key={i} opacity={i > curMonth ? 0.35 : 1}>
              {KINDS.map(k => {
                if (!m[k]) return null;
                const y0 = y(acc), y1 = y(acc + m[k]);
                acc += m[k];
                return <rect key={k} x={x} y={y1} width={bw} height={Math.max(1, y0 - y1 - 1)} fill={KIND_COLOR[k]}><title>{`${new Date(Date.UTC(d.year, i, 1)).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })}: ${m[k]} ${k}`}</title></rect>;
              })}
              {totals[i] > 0 && <text x={x + bw / 2} y={y(totals[i]) - 4} textAnchor="middle" style={{ fill: 'var(--o-ink2)', fontWeight: 600 }}>{totals[i]}</text>}
              <text x={x + bw / 2} y={H - 6} textAnchor="middle">{new Date(Date.UTC(d.year, i, 1)).toLocaleDateString('en-GB', { month: 'narrow', timeZone: 'UTC' })}</text>
            </g>
          );
        })}
      </svg>
      <div className="sp-legend">{KINDS.map(k => <span key={k}><i style={{ background: KIND_COLOR[k] }} />{k}</span>)}</div>
    </div>
  );
}

/** Everything SpaceX: records, the year's cadence, the next launches, boosters, Starship and Dragon. */
export function SpacexScreen({ space, now }: { space: SpaceData; now: number }) {
  const d = space.spacex;
  const starship = space.starship;
  const dragons = (space.missions ?? []).filter(m => /dragon/i.test(m.spacecraft));
  const cargo = (space.iss?.ports ?? []).filter(p => /cargo dragon/i.test(p.vehicle ?? ''));
  if (!d) return <section className="ocard"><div className="sp-empty">SpaceX data refreshes every few hours; it will appear here after the next collection.</div></section>;
  const up = d.upcoming.filter(l => Date.parse(l.net) > now - 3 * 3600e3);
  const next = up[0];
  const landRate = d.stats.landingAttempts ? Math.round((d.stats.landings / d.stats.landingAttempts) * 1000) / 10 : null;
  const dayOfYear = Math.max(1, Math.ceil((now - Date.UTC(d.year, 0, 1)) / DAY));
  const pace = Math.round((d.yearCount / dayOfYear) * 365);
  return (
    <>
      <section className="s-top">
        <div className="ocard s-next">
          <div className="lab">Next SpaceX launch</div>
          {next ? (
            <>
              <h3>{next.name}<Tbc e={next} /></h3>
              <div className="when">{next.rocket} · {next.pad} · {next.orbit}</div>
              <div className="when">{dayLong(Date.parse(next.net))} · {next.tbc ? 'time TBC' : `${hhmm(Date.parse(next.net))} Rome`} · <span style={{ color: pill(next.status).color }}>{pill(next.status).label}</span></div>
              <div className="s-cd">{countdown(Date.parse(next.net) - now)}<small>T-minus</small></div>
            </>
          ) : <div className="sp-empty">No launch on the schedule.</div>}
        </div>
        <div className="ocard">
          <div className="lab">{d.year} so far</div>
          <div className="kpis">
            <div className="kpi"><b>{d.yearCount}</b><span>Launches</span></div>
            <div className="kpi"><b>{pace}</b><span>Year pace</span></div>
            <div className="kpi"><b>{(d.yearCount / (dayOfYear / 7)).toFixed(1)}</b><span>Per week</span></div>
          </div>
          <div className="lab" style={{ marginTop: 16 }}>All time</div>
          <div className="kpis">
            <div className="kpi"><b>{d.stats.total}</b><span>Launches</span></div>
            <div className="kpi"><b>{d.stats.streak}</b><span>Successes in a row</span></div>
            <div className="kpi"><b>{d.stats.failures}</b><span>Failures</span></div>
          </div>
        </div>
        <div className="ocard">
          <div className="lab">Coming home</div>
          <div className="kpis">
            <div className="kpi"><b>{d.stats.landings}</b><span>Booster landings</span></div>
            <div className="kpi"><b>{landRate ?? '–'}%</b><span>Of attempts</span></div>
            <div className="kpi"><b>{d.stats.landingStreak}</b><span>In a row</span></div>
          </div>
          <div className="kpis" style={{ marginTop: 10 }}>
            <div className="kpi"><b>{d.stats.dragonReturns}</b><span>Dragon returns</span></div>
            <div className="kpi"><b>{d.fleet[0]?.flights ?? '–'}</b><span>Most flights, one booster</span></div>
            <div className="kpi"><b>{d.stats.pending}</b><span>On the manifest</span></div>
          </div>
        </div>
      </section>

      <section className="ocard">
        <h2>{d.year}, month by month</h2>
        <p className="dek">Every SpaceX launch this year. Starlink fills most of the calendar; customer missions, Dragon and Starship flights are the rest.</p>
        <MonthBars d={d} now={now} />
      </section>

      <section className="s-two">
        <div className="ocard">
          <div className="lab">Next launches</div>
          <div className="olist">
            {up.slice(0, 12).map(l => (
              <div key={l.id} className="r">
                <time>{dayShort(Date.parse(l.net))}<small>{l.tbc ? 'TBC' : hhmm(Date.parse(l.net))}</small></time>
                <div><b>{l.name}</b> <span className="tbc" style={{ color: KIND_COLOR[l.kind], borderColor: 'currentColor' }}>{l.kind.toUpperCase()}</span><small>{l.rocket} · {l.location}</small></div>
                <span className="x" style={{ color: pill(l.status).color }}>{pill(l.status).label}<br /><small style={{ color: 'var(--o-ink3)' }}>in {countdown(Date.parse(l.net) - now)}</small></span>
              </div>
            ))}
          </div>
        </div>
        <div className="ocard">
          <div className="lab">Fleet leaders · flights per booster</div>
          <PointsBars rows={d.fleet.slice(0, 10).map(b => ({ name: b.serial, value: b.flights, sub: dayShort(Date.parse(b.last)) }))} color="var(--o-s1)" unit="flights" labelWidth={64} />
          <small style={{ color: 'var(--o-ink3)' }}>Boosters seen in recent launches, with their last flight.</small>
        </div>
      </section>

      <section className="ocard">
        <div className="lab">Recent launches</div>
        <table className="otable">
          <thead><tr><th>Date</th><th>Mission</th><th>Rocket</th><th>Orbit</th><th>Booster</th><th>Landing</th></tr></thead>
          <tbody>
            {d.recent.slice(0, 20).map(l => (
              <tr key={l.id}>
                <td>{dayShort(Date.parse(l.net))}</td>
                <td><b>{l.name}</b>{l.status !== 'Success' && <span style={{ color: pill(l.status).color }}> · {pill(l.status).label}</span>}</td>
                <td>{l.rocket}</td>
                <td>{l.orbit}</td>
                <td>{(l.boosters ?? []).map(b => `${b.serial}${b.flight ? ` · ${b.flight}` : ''}`).join(', ')}</td>
                <td>{(l.boosters ?? []).map((b, i) => <span key={i} style={{ color: LANDING[b.result].color }}>{i ? ', ' : ''}{LANDING[b.result].label}{b.where ? ` ${b.where}` : ''}</span>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="s-two">
        {(starship?.previous.length ?? 0) > 0 && (
          <div className="ocard">
            <h2>Starship test flights</h2>
            <p className="dek">Each flight as a dot, oldest on the left: green success, orange partial failure, red failure.</p>
            <div className="sp-dots">
              {[...starship!.previous].reverse().map(l => (
                <div key={l.id} title={`${l.mission} · ${dayShort(Date.parse(l.net))} · ${pill(l.status).label}`}>
                  <span style={{ background: pill(l.status).color }} />
                  <small>{l.mission.replace(/^Starship\s*/i, '').replace(/Integrated Flight Test/i, 'IFT').replace(/Flight Test/i, 'FT')}</small>
                  <small className="d">{dayShort(Date.parse(l.net))}</small>
                </div>
              ))}
              {starship!.upcoming.map(l => (
                <div key={l.id}>
                  <span className="next" />
                  <small>{l.mission.replace(/^Starship\s*/i, '')}</small>
                  <small className="d">{l.tbc ? 'TBC' : dayShort(Date.parse(l.net))}</small>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="ocard">
          <div className="lab">Dragons in space now</div>
          {dragons.length ? <OrbitMissions missions={dragons} now={now} /> : <div className="sp-empty">No crewed Dragon in orbit.</div>}
          {cargo.map(p => <div key={p.name} className="sp-cargo"><b>{p.vehicle}</b><small>{p.mission} · at {p.name}{p.since ? ` since ${dayShort(Date.parse(p.since))}` : ''}</small></div>)}
        </div>
      </section>
    </>
  );
}

/* ───────────────────────── Astronaut class ───────────────────────── */

export function ClassScreen({ space, now }: { space: SpaceData; now: number }) {
  return space.corps ? <ClassSection c={space.corps} now={now} /> : <section className="ocard"><div className="sp-empty">The class data refreshes every six hours.</div></section>;
}

/** Recap figures for the overview cards. */
export function classProgress(c: AstronautClass, now: number) {
  const t0 = c.dates.announced ? Date.parse(c.dates.announced) : null;
  const t1 = c.dates.graduated ? Date.parse(c.dates.graduated) : c.dates.expectedGraduation ? Date.parse(c.dates.expectedGraduation) : null;
  return {
    pct: t0 && t1 ? Math.max(0, Math.min(1, (now - t0) / (t1 - t0))) : 0,
    month: t0 ? Math.floor((now - t0) / (30.44 * DAY)) + 1 : null,
  };
}


const monthYear = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const dayMonthYear = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const ageOn = (born: string, now: number) => Math.floor((now - Date.parse(born)) / (365.25 * DAY));

/** NASA's newest astronaut class: from applicant to candidate to astronaut, with its members and training news. */
function ClassSection({ c, now }: { c: AstronautClass; now: number }) {
  const d = c.dates;
  const t0 = d.announced ? Date.parse(d.announced) : null;
  const tEnd = d.graduated ? Date.parse(d.graduated) : d.expectedGraduation ? Date.parse(d.expectedGraduation) : null;
  const pct = t0 && tEnd ? Math.max(0, Math.min(1, (now - t0) / (tEnd - t0))) : 0;
  const month = t0 ? Math.floor((now - t0) / (30.44 * DAY)) + 1 : null;
  const name = c.group.nickname ?? c.group.title;
  const steps = [
    { label: 'Applications', when: d.applicationsOpen ? `${dayMonthYear(d.applicationsOpen)}${d.applicationsClose ? ` – ${dayMonthYear(d.applicationsClose)}` : ''}` : 'Call open', done: !!d.applicationsClose && Date.parse(d.applicationsClose) < now, note: c.group.applicants ? `${c.group.applicants.toLocaleString('en-US')}+ applied` : '' },
    { label: 'Selection', when: 'Interviews and medicals at Johnson', done: !!d.announced, note: '' },
    { label: 'Announced', when: d.announced ? dayMonthYear(d.announced) : 'To come', done: !!d.announced, note: c.group.size ? `${c.group.size} candidates` : '' },
    { label: 'Training', when: c.status === 'training' && month ? `Month ${month} of ~24` : c.status === 'graduated' ? 'Complete' : 'Two years', done: c.status === 'graduated', note: c.status === 'training' ? `${Math.round(pct * 100)}%` : '' },
    { label: 'Astronauts', when: d.graduated ? dayMonthYear(d.graduated) : d.expectedGraduation ? `Expected ~${monthYear(d.expectedGraduation)}` : '–', done: !!d.graduated, note: d.graduated ? 'Eligible for flights' : '' },
  ];
  const current = steps.findIndex(s => !s.done);
  const flown = c.members.filter(m => m.missions);
  const assigned = c.members.filter(m => m.assignment);

  return (
    <section className="ocard ac">
      <div className="ac-head">
        <div>
          <div className="lab">The next astronauts · {c.group.title}</div>
          <h2>{name}</h2>
          <p className="dek">
            {c.status === 'selection' && 'NASA is choosing its next class of astronaut candidates.'}
            {c.status === 'training' && `${c.group.size ?? c.members.length} astronaut candidates${c.group.applicants ? `, picked from more than ${c.group.applicants.toLocaleString('en-US')} applicants,` : ''} are in their ${month ? `${month}${month === 1 ? 'st' : month === 2 ? 'nd' : month === 3 ? 'rd' : 'th'} month` : 'first years'} of training. After about two years they graduate as NASA astronauts and can be assigned to a flight.`}
            {c.status === 'graduated' && `The class graduated on ${dayMonthYear(d.graduated!)}: they are now NASA astronauts, waiting for flight assignments.`}
            {assigned.length > 0 && ` Already assigned: ${assigned.map(m => `${m.name} (${m.assignment})`).join(', ')}.`}
          </p>
          <div className="kpis" style={{ marginTop: 14 }}>
            <div className="kpi"><b>{t0 ? Math.max(0, daysSince(d.announced!, now)) : '–'}</b><span>Days in training</span></div>
            <div className="kpi"><b>{d.graduated ? 'Done' : tEnd ? Math.max(0, Math.ceil((tEnd - now) / DAY)) : '–'}</b><span>{d.graduated ? 'Graduated' : 'Days to expected graduation'}</span></div>
            <div className="kpi"><b>{c.news.filter(n => !t0 || Date.parse(n.time) >= t0).length}</b><span>NASA stories on the class</span></div>
          </div>
        </div>
        {c.group.image && <a href={c.group.wiki} target="_blank" rel="noreferrer" className="ac-photo"><img src={c.group.image} alt={`${c.group.title} class photo`} loading="lazy" /></a>}
      </div>

      <ol className="ac-steps">
        {steps.map((s, i) => (
          <li key={s.label} className={s.done ? 'done' : i === current ? 'now' : ''}>
            <span className="dot" />
            <b>{s.label}</b>
            <small>{s.when}</small>
            {s.note && <small className="note">{s.note}</small>}
            {s.label === 'Training' && c.status === 'training' && <span className="bar"><i style={{ width: `${pct * 100}%` }} /></span>}
          </li>
        ))}
      </ol>

      {c.training.length > 0 && (
        <>
          <div className="lab" style={{ marginTop: 18 }}>Training NASA has shown so far</div>
          <div className="ac-chips">
            {c.training.map(t => <a key={t.topic} href={t.url} target="_blank" rel="noreferrer" title={`Latest: ${t.title}`}><b>{t.topic}</b><small>{dayShort(Date.parse(t.last))} · {t.count}×</small></a>)}
          </div>
        </>
      )}

      <div className="lab" style={{ marginTop: 18 }}>The class{flown.length ? ` · ${flown.length} already flown to space` : ''}</div>
      <div className="ac-grid">
        {c.members.map(m => (
          <a key={m.name} className="ac-person" href={m.url} target="_blank" rel="noreferrer">
            {m.image ? <img src={m.image} alt="" loading="lazy" /> : <span className="ph">{m.name.split(' ').map(x => x[0]).join('')}</span>}
            <div>
              <b>{m.name}</b>
              <small>{m.background}</small>
              <small className="meta">
                {m.born ? `${ageOn(m.born, now)} · ` : ''}{m.candidate ? 'Candidate' : 'Astronaut'}
                {m.missions && <span className="tbc">FLOWN · {m.missions}</span>}
                {m.assignment && <span className="tbc">{m.assignment}</span>}
              </small>
            </div>
          </a>
        ))}
      </div>

      <div className="ac-two">
        <div>
          <div className="lab">Class news from NASA</div>
          <div className="onews">{c.news.slice(0, 8).map(n => (
            <a key={n.url} className="r" href={n.url} target="_blank" rel="noreferrer">
              <time>{dayShort(Date.parse(n.time))} {new Date(n.time).getUTCFullYear()}{n.who.length > 0 && n.who.length < (c.group.size ?? 99) ? ` · ${n.who.join(', ')}` : ''}</time>
              <p>{n.title}</p>
            </a>
          ))}</div>
        </div>
        <div>
          <div className="lab">Next selection</div>
          {c.next ? (
            <div className="ac-next open">
              <b>NASA is taking applications</b>
              <a href={c.next.url} target="_blank" rel="noreferrer">{c.next.title}</a>
              <small>{c.next.time ? `Announced ${dayMonthYear(c.next.time)}` : ''}{c.next.closes ? ` · closes ${dayMonthYear(c.next.closes)} (${countdown(Date.parse(c.next.closes) - now)})` : ''}</small>
            </div>
          ) : (
            <div className="ac-next">
              <b>No call open</b>
              <small>NASA usually opens applications for the next class when the current one graduates (the Platypi call opened the day Group 23 graduated, March 2024). {d.expectedGraduation ? `Watch for it around ${monthYear(d.expectedGraduation)}.` : ''} This panel lights up when nasa.gov announces it.</small>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** A dot per mission along a time axis, flown missions filled, planned ones hollow. */
function Timeline({ items, now }: { items: Launch[]; now: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const ts = items.map(l => Date.parse(l.net));
  const from = Math.min(...ts) - 120 * DAY, to = Math.max(...ts, now) + 200 * DAY;
  const x = (t: number) => 20 + ((t - from) / (to - from)) * (W - 40);
  const years: number[] = [];
  for (let y = new Date(from).getFullYear() + 1; y <= new Date(to).getFullYear(); y++) years.push(Date.UTC(y, 0, 1));
  return (
    <div ref={ref} className="ochart">
      <svg viewBox={`0 0 ${W} 120`} width="100%" height={120} role="img" aria-label="Artemis timeline">
        <line x1={20} x2={W - 20} y1={60} y2={60} stroke="var(--o-line)" strokeWidth={2} />
        {years.map(y => <g key={y}><line x1={x(y)} x2={x(y)} y1={54} y2={66} stroke="var(--o-ink3)" /><text x={x(y)} y={84} textAnchor="middle">{new Date(y).getUTCFullYear()}</text></g>)}
        <line x1={x(now)} x2={x(now)} y1={30} y2={90} stroke="var(--o-accent)" strokeWidth={2} />
        <text x={x(now) + 4} y={28} style={{ fill: 'var(--o-accent)', fontWeight: 700 }}>Today</text>
        {items.map((l, i) => {
          const t = Date.parse(l.net), up = i % 2 === 0;
          return (
            <g key={l.id}>
              <circle cx={x(t)} cy={60} r={8} fill={l.past ? 'var(--oc-spa)' : 'var(--o-card)'} stroke="var(--oc-spa)" strokeWidth={2.5} />
              <text x={x(t)} y={up ? 40 : 108} textAnchor="middle" style={{ fill: 'var(--o-ink)', fontWeight: 600, fontSize: 12 }}>{l.mission.replace(/\s*\(.*\)$/, '')}{l.tbc && !l.past ? ' (TBC)' : ''}</text>
              <title>{`${l.mission} · ${dayShort(t)} · ${pill(l.status).label}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ───────────────────────── Mission timeline (Gantt) ───────────────────────── */

// How long each kind of vehicle usually stays: the dashed tail of a stay still open, or a planned flight
const TYPICAL: [RegExp, number][] = [
  [/artemis/i, 10], [/axiom|ax-\d|vast|haven|private/i, 14], [/cargo dragon|crs-2 spx|spx-/i, 33],
  [/crew dragon|crew-\d|starliner/i, 180], [/soyuz/i, 240], [/shenzhou/i, 183], [/progress/i, 190],
  [/cygnus|ng-\d/i, 170], [/tianzhou/i, 320], [/htv|dream chaser/i, 120],
];
const typical = (s: string) => TYPICAL.find(([re]) => re.test(s))?.[1] ?? 30;
const stationOf = (s: string) => (/artemis/i.test(s) ? 'Moon' : /haven|vast|starlab|axiom station/i.test(s) && !/iss/i.test(s) ? 'Commercial' : 'ISS');

interface Bar { key: string; label: string; sub: string; group: string; start: number; end: number | null; expected: number; crewed: boolean; planned: boolean; tbc: boolean; plannedEnd?: boolean }

/** Every stay at the stations and every crewed flight, flown and planned, on one time axis. */
export function MissionGantt({ space, now }: { space: SpaceData; now: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const from = now - 220 * DAY, to = now + 280 * DAY;
  const bars: Bar[] = [];
  for (const s of space.iss?.stays ?? []) {
    const start = Date.parse(s.docking), end = s.departure ? Date.parse(s.departure) : null;
    // Stations only: Launch Library's docking list also has satellite pairs such as SpaDeX
    if ((end ?? now) < from || s.station !== 'ISS') continue;
    bars.push({ key: `st${s.id}`, label: s.vehicle.replace(/\s*\(.*\)$/, ''), sub: s.mission, group: s.station, start, end, expected: start + typical(`${s.vehicle} ${s.mission}`) * DAY, crewed: s.crewed, planned: false, tbc: false });
  }
  // AstronauticAgenda's plan: a planned undocking ends an open stay; planned dockings are new bars
  const plan = (space.agenda?.items ?? []).filter(a => a.vehicle && a.station === 'ISS' && Date.parse(a.date) > now - DAY);
  const sameVehicle = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]/g, '') === b.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const b of bars) {
    if (b.end != null) continue;
    const out = plan.find(a => a.kind === 'undock' && (sameVehicle(a.vehicle!, b.label) || sameVehicle(a.vehicle!, b.sub)));
    if (out) { b.expected = Date.parse(out.date); b.plannedEnd = true; }
  }
  for (const a of plan.filter(p => p.kind === 'dock')) {
    if (bars.some(b => sameVehicle(b.label, a.vehicle!) || sameVehicle(b.sub, a.vehicle!))) continue;
    const t = Date.parse(a.date), out = plan.find(p => p.kind === 'undock' && sameVehicle(p.vehicle!, a.vehicle!) && Date.parse(p.date) > t);
    bars.push({ key: `ag${a.id}`, label: a.vehicle!, sub: `Planned docking${a.allDay ? '' : ` ${hhmm(t)}`}`, group: a.station!, start: t, end: null, expected: out ? Date.parse(out.date) : t + typical(a.vehicle!) * DAY, crewed: a.crewed ?? /soyuz|crew|shenzhou/i.test(a.vehicle!), planned: true, tbc: false, plannedEnd: !!out });
  }
  // Artemis flights in the window, flown or planned
  for (const l of space.artemis ?? []) {
    const t = Date.parse(l.net);
    if (t < from || t > to) continue;
    bars.push({ key: `ar${l.id}`, label: l.mission, sub: l.rocket, group: 'Moon', start: t, end: l.past ? t + typical(l.mission) * DAY : null, expected: t + typical(l.mission) * DAY, crewed: true, planned: !l.past, tbc: l.tbc });
  }
  // Planned crewed launches not yet docked anywhere
  for (const l of space.crewed ?? []) {
    const t = Date.parse(l.net);
    if (t < now - DAY || t > to || l.artemis || isTiangong(`${l.mission} ${l.description}`) || bars.some(b => b.label === l.mission)) continue;
    bars.push({ key: `up${l.id}`, label: l.mission, sub: `${l.rocket}${l.tbc ? ` · ${netLabel(l)}` : ''}`, group: stationOf(`${l.mission} ${l.description}`), start: t, end: null, expected: t + typical(`${l.mission} ${l.rocket}`) * DAY, crewed: true, planned: true, tbc: l.tbc });
  }
  const GROUPS = ['ISS', 'Moon', 'Commercial'];
  const rows: ({ head: string } | Bar)[] = [];
  for (const g of GROUPS) {
    const gb = bars.filter(b => b.group === g).sort((a, b) => a.start - b.start);
    if (!gb.length) continue;
    rows.push({ head: g === 'Moon' ? 'Artemis · the Moon' : g === 'Commercial' ? 'Commercial stations' : 'International Space Station' }, ...gb);
  }
  const L = Math.min(190, W * 0.3), R = 8, row = 22, head = 26, top = 22;
  const x = (t: number) => L + ((Math.max(from, Math.min(to, t)) - from) / (to - from)) * (W - L - R);
  let yy = top;
  const ys = rows.map(r => { const y0 = yy; yy += 'head' in r ? head : row; return y0; });
  const H = yy + 6;
  const months: number[] = [];
  const d0 = new Date(from);
  for (let m = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1)).getTime(); m < to; m = Date.UTC(new Date(m).getUTCFullYear(), new Date(m).getUTCMonth() + 1, 1)) months.push(m);
  const fmtDay = (t: number) => `${dayShort(t)} ${new Date(t).getUTCFullYear()}`;
  return (
    <div ref={ref} className="ochart sp-gantt">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Mission timeline">
        {months.map(m => {
          const jan = new Date(m).getUTCMonth() === 0;
          return (
            <g key={m}>
              <line x1={x(m)} x2={x(m)} y1={top - 4} y2={H} stroke="var(--o-grid)" strokeWidth={jan ? 2 : 1} />
              {/* Month labels make room for "Today" */}
              {(x(m) - x(now) > 22 || x(now) - x(m) > 52) && <text x={x(m) + 3} y={12} style={{ fontWeight: jan ? 700 : 400 }}>{jan ? new Date(m).getUTCFullYear() : new Date(m).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}</text>}
            </g>
          );
        })}
        {rows.map((r, i) => {
          const y = ys[i];
          if ('head' in r) return <text key={`h${r.head}`} x={0} y={y + 17} className="lbl" style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', fill: 'var(--o-ink2)' }}>{r.head}</text>;
          const color = r.crewed ? 'var(--oc-spa)' : 'var(--o-s4)';
          const s = x(r.start), solidEnd = r.end != null ? x(r.end) : r.planned ? s : x(now);
          const tailEnd = r.end != null ? solidEnd : x(Math.max(r.expected, now + 7 * DAY));
          const tip = `${r.label}${r.sub && r.sub !== r.label ? ` · ${r.sub}` : ''}\n${r.planned ? 'Planned: ' : ''}${fmtDay(r.start)} → ${r.end != null ? fmtDay(r.end) : r.plannedEnd ? `planned undocking ${fmtDay(r.expected)}` : `expected ~${fmtDay(r.expected)}`}`;
          return (
            <g key={r.key}>
              <title>{tip}</title>
              <text x={0} y={y + 15} style={{ fill: r.planned ? 'var(--o-ink3)' : 'var(--o-ink)', fontSize: 11.5, fontWeight: r.crewed ? 600 : 400 }}>{r.label.length > 26 ? `${r.label.slice(0, 25)}…` : r.label}</text>
              {solidEnd - s > 0 && <rect x={s} y={y + 5} width={Math.max(3, solidEnd - s)} height={row - 9} rx={3} fill={color} opacity={r.crewed ? 1 : 0.85} />}
              {tailEnd > solidEnd + 1 && <rect x={solidEnd} y={y + 5.5} width={tailEnd - solidEnd} height={row - 10} rx={3} fill="none" stroke={color} strokeDasharray="4 3" opacity={r.tbc ? 0.5 : 0.9} />}
              {r.planned && <circle cx={s} cy={y + row / 2 - 0.5} r={3.5} fill={color} />}
              {r.plannedEnd && r.end == null && r.expected < to && <line x1={x(r.expected)} x2={x(r.expected)} y1={y + 3} y2={y + row - 3} stroke={color} strokeWidth={2.5} />}
            </g>
          );
        })}
        <line x1={x(now)} x2={x(now)} y1={top - 6} y2={H} stroke="var(--o-accent)" strokeWidth={2} />
        <text x={x(now)} y={12} textAnchor="middle" style={{ fill: 'var(--o-accent)', fontWeight: 700 }}>Today</text>
      </svg>
      <div className="sp-legend">
        <span><i style={{ background: 'var(--oc-spa)' }} />Crew</span>
        <span><i style={{ background: 'var(--o-s4)' }} />Cargo</span>
        <span><i style={{ background: 'transparent', boxShadow: 'inset 0 0 0 1.5px var(--o-ink3)' }} />Expected or planned (dashed)</span>
        <span><i style={{ width: 3, background: 'var(--o-ink2)' }} />Planned undocking</span>
      </div>
    </div>
  );
}

/** Probes and flybys beyond Earth orbit, from AstronauticAgenda. */
export function DeepSpace({ space, now }: { space: SpaceData; now: number }) {
  const items = (space.agenda?.items ?? []).filter(a => a.kind === 'deep' && Date.parse(a.date) > now - DAY).slice(0, 6);
  if (!items.length) return null;
  return (
    <div className="olist">
      {items.map(a => (
        <div key={a.id} className="r">
          <time>{dayShort(Date.parse(a.date))}<small>{new Date(a.date).getUTCFullYear()}</small></time>
          <div><b>{a.name}</b></div>
          <span className="x">in {Math.ceil((Date.parse(a.date) - now) / DAY)} d</span>
        </div>
      ))}
    </div>
  );
}
