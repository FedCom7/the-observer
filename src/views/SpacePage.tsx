import { Tbc } from '../components/common';
import { Hero } from '../components/sheet';
import { useData } from '../core/store';
import { countdown, dayLong, dayShort, hhmm } from '../core/time';
import type { Launch, SpaceData } from '../sources/spaceData';
import { ArtemisScreen, ClassScreen, DeepSpace, IssScreen, isTiangong, MissionGantt, OrbitMissions, Patch, SpaceTabs, SpacexScreen, classProgress, evTime, netLabel, pill, useSpaceTab, type SpaceTab } from './SpaceScreens';

/** Human spaceflight: a recap of what is up and what is next, with a screen each for Artemis, the ISS, SpaceX and the astronaut class. */
export function SpacePage() {
  const { space, now } = useData();
  const [tab, setTab] = useSpaceTab();
  if (!space) return <Hero id="space" dek="Loading spaceflight data…" />;
  const manifest = new Map<string, Launch>();
  [...(space.crewed ?? []), ...(space.starship?.upcoming ?? []), ...(space.artemis ?? []).filter(l => !l.past)].forEach(l => manifest.set(l.id, l));
  const upcoming = [...manifest.values()].filter(l => Date.parse(l.net) > now - 3 * 3600e3 && !isTiangong(`${l.mission} ${l.description}`)).sort((a, b) => Date.parse(a.net) - Date.parse(b.net));
  const nextCrewed = upcoming.find(l => l.crewed);
  const nextStarship = upcoming.find(l => l.starship);
  const people = space.people ?? [];
  const dataMissing = !space.crewed && !space.people;

  return (
    <>
      <Hero id="space" dek={dataMissing ? 'Launch data is being refreshed; NASA news is below.' : `${people.length} people are in orbit right now.${nextCrewed ? ` Next crewed launch: ${nextCrewed.mission}, ${dayLong(Date.parse(nextCrewed.net))}.` : ''}${nextStarship ? ` Next Starship flight ${nextStarship.tbc ? 'expected' : 'set for'} ${dayShort(Date.parse(nextStarship.net))}.` : ''}`} />
      <SpaceTabs tab={tab} set={setTab} />
      {tab === 'artemis' ? <ArtemisScreen space={space} now={now} />
        : tab === 'iss' ? <IssScreen space={space} now={now} />
        : tab === 'spacex' ? <SpacexScreen space={space} now={now} />
        : tab === 'class' ? <ClassScreen space={space} now={now} />
        : <Overview space={space} upcoming={upcoming} now={now} open={setTab} />}
    </>
  );
}

// Launch Library's full agency names, shortened for one line
const shortAgency = (p: string) => p.replace(/National Aeronautics and Space Administration/i, 'NASA').replace(/.*\(ROSCOSMOS\).*/i, 'Roscosmos').replace(/China Aerospace Science and Technology Corporation/i, 'CASC');

function Overview({ space, upcoming, now, open }: { space: SpaceData; upcoming: Launch[]; now: number; open: (t: SpaceTab) => void }) {
  const next = upcoming[0];
  const events = (space.events ?? []).filter(e => Date.parse(e.date) > now - 3 * 3600e3 && !isTiangong(`${e.name} ${e.location} ${e.description}`));
  // Operations first (docking, spacewalk, splashdown); press conferences only in the list
  const ops = events.filter(e => !/press|conference|briefing|broadcast/i.test(`${e.type} ${e.name}`));
  const people = space.people ?? [];
  const onIss = people.filter(p => !/CNSA|CMSA/.test(p.agency));
  // Missions in orbit, newest launch first
  const missions = [...(space.missions ?? [])].filter(m => !isTiangong(`${m.destination} ${m.name}`)).sort((a, b) => Date.parse(b.launched) - Date.parse(a.launched));

  // Recap figures for the four screens
  const artemisNext = (space.artemis ?? []).find(l => !l.past);
  const artemisLast = [...(space.artemis ?? [])].reverse().find(l => l.past);
  const exp = space.iss?.expedition;
  const issNext = ops.find(e => !/tiangong|tianhe|shenzhou|tianzhou|artemis|starship/i.test(`${e.name} ${e.location}`));
  const sx = space.spacex;
  const sxNext = sx?.upcoming.find(l => Date.parse(l.net) > now);
  const corps = space.corps;
  const cp = corps ? classProgress(corps, now) : null;

  return (
    <>
      <section className="s-top">
        <div className="ocard s-next">
          <div className="lab">Next launch</div>
          {next ? (
            <>
              <h3>{next.mission}<Tbc e={next} /></h3>
              <div className="when">{next.rocket} · {shortAgency(next.provider)} · {next.pad}</div>
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
            <div className="kpi"><b>{missions.length || '–'}</b><span>Missions</span></div>
          </div>
          {missions.length > 0 && <OrbitMissions missions={missions} now={now} />}
        </div>
        <div className="ocard">
          <div className="lab">Next at the stations</div>
          {ops[0] ? (
            <>
              <h3 style={{ margin: 0, fontSize: 18 }}>{ops[0].name}</h3>
              <div className="when">{ops[0].type} · {dayLong(Date.parse(ops[0].date))} · {ops[0].allDay ? 'time TBC' : `${hhmm(Date.parse(ops[0].date))} Rome`}</div>
              <div className="s-cd" style={{ fontSize: 30 }}>{countdown(Date.parse(ops[0].date) - now)}</div>
            </>
          ) : <div>No docking, spacewalk or splashdown scheduled.</div>}
          {events.length > 1 && (
            <div className="olist" style={{ marginTop: 12 }}>{events.slice(1, 5).map(e => <div key={e.id} className="r" style={{ gridTemplateColumns: '78px 1fr' }}><time>{dayShort(Date.parse(e.date))}<small>{evTime(e)}</small></time><div><b>{e.name}</b><small>{e.type}</small></div></div>)}</div>
          )}
        </div>
      </section>

      {/* One card per screen: the headline figure and a way in */}
      <section className="sp-recap">
        <button className="ocard" onClick={() => open('artemis')}>
          <div className="lab">Artemis</div>
          <div className="sp-rc">
            <Patch src={artemisNext?.patch ?? artemisLast?.patch} name={artemisNext?.mission ?? 'Artemis'} size={56} />
            <div>
              <b>{artemisNext ? artemisNext.mission : 'No flight planned'}</b>
              <small>{artemisNext ? `${artemisNext.tbc ? 'No earlier than ' : ''}${netLabel(artemisNext)}` : ''}</small>
              <small>{artemisLast ? `Last flown: ${artemisLast.mission}, ${dayShort(Date.parse(artemisLast.net))} ${new Date(artemisLast.net).getUTCFullYear()}` : ''}</small>
            </div>
          </div>
          <span className="go">Timeline, crews, news →</span>
        </button>
        <button className="ocard" onClick={() => open('iss')}>
          <div className="lab">International Space Station</div>
          <div className="sp-rc">
            <Patch src={exp?.patch} name={exp?.name ?? 'ISS'} size={56} />
            <div>
              <b>{exp?.name ?? 'ISS'}</b>
              <small>{space.iss ? `${space.iss.station.onboard ?? onIss.length} aboard · ${space.iss.station.docked ?? '–'} vehicles docked` : `${onIss.length} aboard`}</small>
              <small>{issNext ? `Next: ${issNext.name}, ${dayShort(Date.parse(issNext.date))}` : 'Nothing scheduled'}</small>
            </div>
          </div>
          <span className="go">Crew, ports, traffic, spacewalks →</span>
        </button>
        <button className="ocard" onClick={() => open('spacex')}>
          <div className="lab">SpaceX</div>
          {sx ? (
            <div className="sp-rc">
              <div className="sp-big">{sx.yearCount}<small>launches in {sx.year}</small></div>
              <div>
                <b>{sxNext ? sxNext.name : '–'}</b>
                <small>{sxNext ? `${sxNext.rocket} · in ${countdown(Date.parse(sxNext.net) - now)}` : ''}</small>
                <small>{sx.stats.streak} successes in a row</small>
              </div>
            </div>
          ) : <div className="sp-rc"><small>Refreshing…</small></div>}
          <span className="go">Cadence, boosters, Starship, Dragon →</span>
        </button>
        <button className="ocard" onClick={() => open('class')}>
          <div className="lab">Astronaut class</div>
          {corps && cp ? (
            <div className="sp-rc">
              <div className="sp-big">{Math.round(cp.pct * 100)}%<small>of training</small></div>
              <div>
                <b>{corps.group.nickname ?? corps.group.title}</b>
                <small>{corps.members.length} candidates · {corps.status === 'graduated' ? 'graduated' : cp.month ? `month ${cp.month} of ~24` : corps.status}</small>
                <span className="bar"><i style={{ width: `${cp.pct * 100}%` }} /></span>
              </div>
            </div>
          ) : <div className="sp-rc"><small>Refreshing…</small></div>}
          <span className="go">Journey, candidates, training →</span>
        </button>
      </section>

      {/* The timeline three parts wide, the manifest beside it */}
      <section className="ocard sp-wide">
        <div className="ocard">
          <h2>Missions in space, past and planned</h2>
          <p className="dek">Every vehicle at the ISS, with Artemis and the crewed flights to come. Solid bars are time already spent; dashed bars are planned or usual stays, ending at the planned undocking where AstronauticAgenda gives one.</p>
          <MissionGantt space={space} now={now} />
        </div>
        <div className="ocard">
          <h2>Launch manifest</h2>
          <p className="dek">Crewed flights, Starship and Artemis, in Rome time. "TBC" means the provider has only given a month or a window.</p>
          <div className="olist">
            {upcoming.slice(0, 10).map(l => (
              <div key={l.id} className="r">
                <time>{dayShort(Date.parse(l.net))}<small>{l.tbc ? l.precision ?? 'TBC' : hhmm(Date.parse(l.net))}</small></time>
                <div>
                  <b>{l.mission}</b> {l.crewed && <span className="tbc">CREW</span>}{l.starship && <span className="tbc">STARSHIP</span>}{l.artemis && <span className="tbc">ARTEMIS</span>}
                  <small>{l.rocket} · {shortAgency(l.provider)}</small>
                </div>
                <span className="x" style={{ color: pill(l.status).color }}>{pill(l.status).label}<br /><small style={{ color: 'var(--o-ink3)' }}>in {countdown(Date.parse(l.net) - now)}</small></span>
              </div>
            ))}
            {!upcoming.length && <div style={{ color: 'var(--o-ink3)' }}>The manifest refreshes hourly from Launch Library.</div>}
          </div>
        </div>
      </section>

      {(space.agenda?.items ?? []).some(a => a.kind === 'deep' && Date.parse(a.date) > now) && (
        <section className="ocard">
          <div className="lab">Beyond Earth orbit</div>
          <DeepSpace space={space} now={now} />
          <small style={{ color: 'var(--o-ink3)' }}>Probes and flybys, from AstronauticAgenda.</small>
        </section>
      )}

      <section className="ocard">
        <div className="lab">From NASA</div>
        <div className="onews">{(space.news ?? []).slice(0, 10).map(n => <a key={n.url} className="r" href={n.url} target="_blank" rel="noreferrer"><time>{dayShort(Date.parse(n.time))} · {n.source}</time><p>{n.title}</p></a>)}</div>
      </section>
    </>
  );
}
