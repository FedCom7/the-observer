import { useWidth } from '../components/charts';
import { Tbc } from '../components/common';
import { Hero } from '../components/sheet';
import { useData } from '../core/store';
import { DAY, countdown, dayLong, dayShort, hhmm } from '../core/time';
import type { Launch } from '../sources/spaceData';

const STATUS: Record<string, { label: string; color: string }> = {
  Go: { label: 'Go for launch', color: 'var(--oc-out)' }, TBD: { label: 'Date TBD', color: 'var(--o-ink3)' }, TBC: { label: 'To be confirmed', color: 'var(--oc-usa)' },
  Success: { label: 'Success', color: 'var(--oc-out)' }, Failure: { label: 'Failure', color: 'var(--oc-mil)' }, 'Partial Failure': { label: 'Partial failure', color: 'var(--oc-usa)' }, Hold: { label: 'Hold', color: 'var(--oc-usa)' }, 'In Flight': { label: 'In flight', color: 'var(--o-accent)' },
};
const pill = (s: string) => STATUS[s] ?? { label: s, color: 'var(--o-ink3)' };

/** Human spaceflight: launches with times, Artemis, Starship, who is in orbit, official NASA news. */
export function SpacePage() {
  const { space, now } = useData();
  if (!space) return <Hero id="space" dek="Loading spaceflight data…" />;
  const manifest = new Map<string, Launch>();
  [...(space.crewed ?? []), ...(space.starship?.upcoming ?? []), ...(space.artemis ?? []).filter(l => !l.past)].forEach(l => manifest.set(l.id, l));
  const upcoming = [...manifest.values()].filter(l => Date.parse(l.net) > now - 3 * 3600e3).sort((a, b) => Date.parse(a.net) - Date.parse(b.net));
  const nextCrewed = upcoming.find(l => l.crewed);
  const nextStarship = upcoming.find(l => l.starship);
  const next = upcoming[0];
  const events = (space.events ?? []).filter(e => Date.parse(e.date) > now - 3 * 3600e3);
  // Operations first (docking, spacewalk, splashdown); press conferences only in the list
  const ops = events.filter(e => !/press|conference|briefing/i.test(`${e.type} ${e.name}`));
  const people = space.people ?? [];
  const onIss = people.filter(p => !/CNSA|CMSA/.test(p.agency));
  const onTiangong = people.filter(p => /CNSA|CMSA/.test(p.agency));
  const dataMissing = !space.crewed && !space.people;

  return (
    <>
      <Hero id="space" dek={dataMissing ? 'Launch data is being refreshed; NASA news is below.' : `${people.length} people are in orbit right now.${nextCrewed ? ` Next crewed launch: ${nextCrewed.mission}, ${dayLong(Date.parse(nextCrewed.net))}.` : ''}${nextStarship ? ` Next Starship flight ${nextStarship.tbc ? 'expected' : 'set for'} ${dayShort(Date.parse(nextStarship.net))}.` : ''}`} />

      <section className="s-top">
        <div className="ocard s-next">
          <div className="lab">Next launch</div>
          {next ? (
            <>
              <h3>{next.mission}<Tbc e={next} /></h3>
              <div className="when">{next.rocket} · {next.provider} · {next.pad}</div>
              <div className="when">{dayLong(Date.parse(next.net))} · {next.tbc ? 'time TBC' : `${hhmm(Date.parse(next.net))} Rome`} · <span style={{ color: pill(next.status).color }}>{pill(next.status).label}</span></div>
              <div className="s-cd">{countdown(Date.parse(next.net) - now)}<small>T-minus</small></div>
            </>
          ) : <div>Waiting for the launch schedule.</div>}
        </div>
        <div className="ocard">
          <div className="lab">In orbit now</div>
          <div className="kpis">
            <div className="kpi"><b>{people.length || '–'}</b><span>People</span></div>
            <div className="kpi"><b>{onIss.length || '–'}</b><span>ISS</span></div>
            <div className="kpi"><b>{onTiangong.length || '–'}</b><span>Tiangong</span></div>
          </div>
        </div>
        <div className="ocard">
          <div className="lab">Next at the stations</div>
          {ops[0] ? (
            <>
              <h3 style={{ margin: 0, fontSize: 18 }}>{ops[0].name}</h3>
              <div className="when">{ops[0].type} · {dayLong(Date.parse(ops[0].date))} · {hhmm(Date.parse(ops[0].date))} Rome</div>
              <div className="s-cd" style={{ fontSize: 30 }}>{countdown(Date.parse(ops[0].date) - now)}</div>
            </>
          ) : <div>No docking, spacewalk or splashdown scheduled.</div>}
        </div>
      </section>

      <section className="ocard">
        <h2>Launch manifest</h2>
        <p className="dek">Crewed flights, Starship and Artemis, in Rome time. "TBC" means the provider has only given a month or a window.</p>
        <div className="olist">
          {upcoming.map(l => (
            <div key={l.id} className="r">
              <time>{dayShort(Date.parse(l.net))}<small>{l.tbc ? l.precision ?? 'TBC' : hhmm(Date.parse(l.net))}</small></time>
              <div>
                <b>{l.mission}</b> {l.crewed && <span className="tbc">CREW</span>}{l.starship && <span className="tbc">STARSHIP</span>}{l.artemis && <span className="tbc">ARTEMIS</span>}
                <small>{l.rocket} · {l.provider} · {l.location}</small>
              </div>
              <span className="x" style={{ color: pill(l.status).color }}>{pill(l.status).label}<br /><small style={{ color: 'var(--o-ink3)' }}>in {countdown(Date.parse(l.net) - now)}</small></span>
            </div>
          ))}
          {!upcoming.length && <div style={{ color: 'var(--o-ink3)' }}>The manifest refreshes hourly from Launch Library.</div>}
        </div>
      </section>

      {(space.artemis?.length ?? 0) > 0 && (
        <section className="ocard">
          <h2>The Artemis programme</h2>
          <p className="dek">Every Artemis flight, flown and planned, on one timeline.</p>
          <Timeline items={space.artemis!} now={now} />
        </section>
      )}

      {(space.starship?.previous.length ?? 0) > 0 && (
        <section className="ocard">
          <h2>Starship test flights</h2>
          <p className="dek">Each flight as a dot, oldest on the left: green success, orange partial failure, red failure.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', fontFamily: 'var(--f-chart)' }}>
            {[...space.starship!.previous].reverse().map(l => (
              <div key={l.id} title={`${l.mission} · ${dayShort(Date.parse(l.net))} · ${pill(l.status).label}`} style={{ display: 'grid', justifyItems: 'center', gap: 4, width: 64 }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: pill(l.status).color }} />
                <small style={{ fontSize: 10.5, color: 'var(--o-ink2)', textAlign: 'center' }}>{l.mission.replace(/^Starship\s*/i, '').replace(/Flight Test/i, 'FT')}</small>
                <small style={{ fontSize: 10, color: 'var(--o-ink3)' }}>{dayShort(Date.parse(l.net))}</small>
              </div>
            ))}
            {space.starship!.upcoming.map(l => (
              <div key={l.id} style={{ display: 'grid', justifyItems: 'center', gap: 4, width: 64 }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'transparent', boxShadow: 'inset 0 0 0 2px var(--o-ink3)' }} />
                <small style={{ fontSize: 10.5, color: 'var(--o-ink2)' }}>Next</small>
                <small style={{ fontSize: 10, color: 'var(--o-ink3)' }}>{dayShort(Date.parse(l.net))}</small>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="s-two">
        <div className="ocard">
          <div className="lab">Who is in space · days on this flight</div>
          <table className="otable">
            <tbody>
              {[...people].sort((a, b) => Date.parse(a.lastFlight ?? '') - Date.parse(b.lastFlight ?? '')).map(p => (
                <tr key={p.name}><td><b>{p.name}</b><br /><small style={{ color: 'var(--o-ink3)' }}>{p.nationality}</small></td><td>{p.agency}</td><td className="n">{p.lastFlight ? Math.floor((now - Date.parse(p.lastFlight)) / DAY) : '–'}</td></tr>
              ))}
              {!people.length && <tr><td style={{ color: 'var(--o-ink3)' }}>Refreshing…</td></tr>}
            </tbody>
          </table>
          {events.length > 1 && (
            <>
              <div className="lab" style={{ marginTop: 18 }}>Station events</div>
              <div className="olist">{events.slice(0, 6).map(e => <div key={e.id} className="r" style={{ gridTemplateColumns: '78px 1fr' }}><time>{dayShort(Date.parse(e.date))}<small>{hhmm(Date.parse(e.date))}</small></time><div><b>{e.name}</b><small>{e.type}</small></div></div>)}</div>
            </>
          )}
        </div>
        <div className="ocard">
          <div className="lab">From NASA</div>
          <div className="onews">{(space.news ?? []).slice(0, 12).map(n => <a key={n.url} className="r" href={n.url} target="_blank" rel="noreferrer"><time>{dayShort(Date.parse(n.time))} · {n.source}</time><p>{n.title}</p></a>)}</div>
        </div>
      </section>
    </>
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
