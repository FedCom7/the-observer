import { useState } from 'react';
import { Score } from '../components/common';
import { Hero } from '../components/sheet';
import { Chips, ScreenTabs, useTab } from '../components/tabs';
import { useData } from '../core/store';
import { countdown, dayLong, dayShort } from '../core/time';
import { racing, type DakarData, type DakarRow, type DakarStage } from '../sources/dakar';
import { byCat, CAT_ORDER, DAKAR_TABS, gapText, HistoryScreen, HowScreen, ink, makeOfTeam, PowerScreen, ResultsScreen, RouteScreen, secs, useDakarSeason, type DakarSeason } from './DakarScreens';

/** Country names as the map data spells them, for the text. */
const COUNTRY_NAME: Record<string, string> = { 'W. Sahara': 'Western Sahara' };
const km = (n: number) => n.toLocaleString('en-US');
const dayCode = (s: DakarStage) => (s.rest ? 'R' : s.transfer ? 'T' : s.num === 0 ? 'P' : String(s.num));
/** A stage that sleeps in (or leaves from) the marathon refuge, without the mechanics. */
const marathon = (s: DakarStage) => /refuge|marathon/i.test(`${s.from} ${s.to}`);

/** Dakar Rally: the route around the map, the leaders and the makes that win it. */
export function DakarPage() {
  const { dakar, news, now } = useData();
  const [tab, setTab] = useTab(DAKAR_TABS);
  const ds = useDakarSeason(tab === 'now' || tab === 'power' || tab === 'history');
  if (!dakar) return <Hero id="dakar" dek="Loading the Dakar…" />;
  const stages = dakar.stages;
  const days = stages.filter(racing);
  const start = days[0] ? Date.parse(days[0].date) : null;
  const end = days.length ? Date.parse(days[days.length - 1].date) : null;
  const running = start !== null && end !== null && now >= start - 8 * 3600e3 && now <= end + 12 * 3600e3;
  const total = stages.reduce((a, s) => a + (s.totalKm ?? 0), 0), special = stages.reduce((a, s) => a + (s.specialKm ?? 0), 0);
  const first = stages[0], last = stages[stages.length - 1];
  const myNews = news.filter(n => n.passion === 'dakar').slice(0, 8);
  const countries = (dakar.countries ?? []).map(c => COUNTRY_NAME[c] ?? c);

  const dek = `Dakar ${dakar.edition}: ${days.length} days of racing${first && last ? ` from ${first.from} to ${last.to}` : ''}${countries.length ? ` across ${countries.join(', ').replace(/, ([^,]*)$/, ' and $1')}` : ''}, ${km(total)} km in all, ${km(special)} km against the clock.${!running && start && start > now ? ` The prologue starts in ${Math.ceil((start - now) / 86400e3)} days.` : ''}`;

  return (
    <>
      <Hero id="dakar" dek={dek} />
      <ScreenTabs tabs={DAKAR_TABS} tab={tab} set={setTab} label="Dakar screens" />
      {tab === 'results' ? <ResultsScreen dk={dakar} />
        : tab === 'route' ? <RouteScreen dk={dakar} />
        : tab === 'how' ? <HowScreen />
        : tab !== 'now' ? (!ds ? <section className="ocard"><p className="dek">Loading…</p></section> : tab === 'power' ? <PowerScreen dk={dakar} s={ds} /> : <HistoryScreen s={ds} />)
        : <>
          {/* In the terminal the left stack and the day-by-day flank the map */}
          <div className="s-two">
            <div className="dk-stack">
              <NextCard dk={dakar} now={now} running={running} />
              <NumbersCard stages={stages} />
              <LeadersCard dk={dakar} />
            </div>
            <DayByDay stages={stages} now={now} />
          </div>
          <div className="s-two">
            <GapsCard dk={dakar} />
            {ds && <MakesCard s={ds} />}
          </div>
          {myNews.length > 0 && (
            <section className="ocard">
              <div className="lab">From the wire</div>
              <div className="onews">{myNews.map(n => <a key={n.id} className="r" href={n.url} target="_blank" rel="noreferrer"><time>{dayShort(n.time)} · {n.source}</time><p>{n.title}</p></a>)}</div>
            </section>
          )}
        </>}
    </>
  );
}

/** The next day of racing with its countdown, and the whole fortnight as a strip of days. */
function NextCard({ dk, now, running }: { dk: DakarData; now: number; running: boolean }) {
  const st = dk.stages;
  const next = st.find(s => racing(s) && Date.parse(s.date) > now - 8 * 3600e3);
  const isNext = (s: DakarStage) => s === next;
  return (
    <section className="ocard s-next dk-l">
      <div className="lab">{running ? 'Rally under way · next stage' : `Dakar ${dk.edition} · the start`}</div>
      {next ? (
        <>
          <h3>{next.label}{marathon(next) ? ' · marathon' : ''}</h3>
          <div className="when">{dayLong(Date.parse(next.date))} · {next.from}{next.to !== next.from ? ` → ${next.to}` : ''}</div>
          <div className="s-cd">{countdown(Date.parse(next.date) - now)}<small>approximate start · {next.specialKm ?? '?'} km special of {next.totalKm ?? '?'}</small></div>
        </>
      ) : <div>The {dk.edition} rally is over.</div>}
      <div className="dk-strip" style={{ gridTemplateColumns: `repeat(${st.length}, minmax(0, 1fr))` }}>
        {st.map((s, i) => {
          const done = !isNext(s) && Date.parse(s.date) < now - 12 * 3600e3;
          const off = s.rest || s.transfer;
          return (
            <span key={i} title={`${dayShort(Date.parse(s.date))} · ${s.label} · ${s.from}${s.to !== s.from ? ` → ${s.to}` : ''}`}
              className={`${off ? 'off' : ''} ${isNext(s) ? 'hot' : ''} ${done ? 'done' : ''}`}>{dayCode(s)}</span>
          );
        })}
      </div>
      {st.length > 0 && <div className="dk-ends"><span>{dayShort(Date.parse(st[0].date))} · {st[0].from}</span><span>{st[st.length - 1].to} · {dayShort(Date.parse(st[st.length - 1].date))}</span></div>}
    </section>
  );
}

/** The route in a few numbers, and how much of it is raced against the clock. */
function NumbersCard({ stages }: { stages: DakarStage[] }) {
  const days = stages.filter(racing);
  const total = stages.reduce((a, s) => a + (s.totalKm ?? 0), 0), special = stages.reduce((a, s) => a + (s.specialKm ?? 0), 0);
  const longSp = days.reduce<DakarStage | null>((a, s) => ((s.specialKm ?? 0) > (a?.specialKm ?? 0) ? s : a), null);
  const longDay = days.reduce<DakarStage | null>((a, s) => ((s.totalKm ?? 0) > (a?.totalKm ?? 0) ? s : a), null);
  const share = Math.round((special / (total || 1)) * 100);
  return (
    <section className="ocard dk-l">
      <div className="lab">The route in numbers</div>
      <div className="kpis">
        <div className="kpi"><b>{days.length}</b><span>Racing days</span></div>
        <div className="kpi"><b>{km(special)}</b><span>km timed</span></div>
        <div className="kpi"><b>{km(total)}</b><span>km in all</span></div>
        {longSp && <div className="kpi"><b>{longSp.specialKm}</b><span>km, longest special ({longSp.label})</span></div>}
        {longDay && <div className="kpi"><b>{km(longDay.totalKm ?? 0)}</b><span>km, longest day ({longDay.label})</span></div>}
        <div className="kpi"><b>{share}%</b><span>against the clock</span></div>
      </div>
      <div className="dk-split" aria-label={`${share}% of the distance is timed`}><i style={{ flex: special }} /><i style={{ flex: total - special }} /></div>
      <div className="dk-ends"><span>Specials {km(special)} km</span><span>Liaisons {km(total - special)} km</span></div>
    </section>
  );
}

/** Who leads each category now, or who won it last time, with the margin over the second. */
function LeadersCard({ dk }: { dk: DakarData }) {
  const r = dk.rankings;
  if (!r) return null;
  const live = r.edition === dk.edition;
  // The five main categories (the Classic and Future Mission are on the Last edition screen)
  const cats = Object.keys(r.general).filter(c => CAT_ORDER.indexOf(c) >= 0 && CAT_ORDER.indexOf(c) < 5).sort(byCat);
  return (
    <section className="ocard dk-l">
      <div className="lab">{live ? `Leaders after stage ${r.stage}` : `Defending champions · ${r.edition}`}</div>
      <div className="dk-lead">
        {cats.map(c => {
          const [a, b] = r.general[c] ?? [];
          if (!a) return null;
          const gap = b ? secs(b.gap) : 0;
          const make = makeOfTeam(a.team);
          return (
            <div key={c}>
              <i style={{ background: ink(make) }} />
              <span><small>{c}</small><Score as="b">{a.crew.join(' / ')}</Score> <small>{a.nation} · {make}</small></span>
              {gap > 0 && <Score className="m">{live ? 'leads' : 'won'} by<br /><b>{gapText(gap)}</b></Score>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Every day of the rally as a bar: the timed special dark, the liaison light. */
function DayByDay({ stages, now }: { stages: DakarStage[]; now: number }) {
  const max = Math.max(1, ...stages.map(s => s.totalKm ?? 0));
  const next = stages.find(s => racing(s) && Date.parse(s.date) > now - 8 * 3600e3);
  return (
    <section className="ocard dk-r">
      <h2>Day by day</h2>
      <p className="dek">Each day's distance: the special against the clock in color, the liaison on open roads light.</p>
      <div className="dk-days">
        {stages.map((s, i) => {
          const done = s !== next && Date.parse(s.date) < now - 12 * 3600e3;
          const off = s.rest || s.transfer;
          return (
            <div key={i} className={`${s === next ? 'hot' : ''} ${done ? 'done' : ''}`}>
              <span className="d"><b>{dayCode(s)}</b><small>{dayShort(Date.parse(s.date)).split(' ').slice(1).join(' ')}</small></span>
              <span className="b">
                {off ? <em>{s.rest ? `Rest day · ${s.from}` : `Transfer · ${s.from} → ${s.to}`}</em> : (
                  <span className="bar" style={{ width: `${((s.totalKm ?? 0) / max) * 100}%` }} title={`${s.label}: ${s.specialKm ?? '?'} km special of ${s.totalKm ?? '?'} km`}>
                    <i style={{ flex: s.specialKm ?? 0 }} /><i style={{ flex: (s.totalKm ?? 0) - (s.specialKm ?? 0) }} />
                  </span>
                )}
                {!off && <small>{s.from === s.to ? `Loop · ${s.from}` : `${s.from} → ${s.to}`}{marathon(s) ? ' · marathon' : ''}</small>}
              </span>
              <span className="k">{off ? '' : <><b>{s.specialKm ?? '–'}</b>/{s.totalKm ?? '–'}</>}</span>
            </div>
          );
        })}
      </div>
      <div className="olegend"><span><i style={{ background: 'var(--o-s4)', height: 10 }} />Special (km timed)</span><span><i style={{ background: 'color-mix(in srgb, var(--o-s4) 30%, var(--o-card))', height: 10 }} />Liaison (km in all)</span></div>
      <div className="osrc">Source: dakar.com · start times approximate</div>
    </section>
  );
}

/** The general classification as gaps to the leader, each bar in its make's color. */
function GapsCard({ dk }: { dk: DakarData }) {
  const r = dk.rankings;
  const cats = r ? Object.keys(r.general).filter(c => (r.general[c] ?? []).some(x => secs(x.gap) > 0)).sort(byCat) : [];
  const [cat, setCat] = useState(cats[0] ?? '');
  if (!r || !cats.length) return null;
  const live = r.edition === dk.edition;
  const pick = cats.includes(cat) ? cat : cats[0];
  const rows: DakarRow[] = r.general[pick] ?? [];
  const max = Math.max(1, ...rows.map(x => secs(x.gap)));
  const makes = [...new Set(rows.map(x => makeOfTeam(x.team)))];
  const stageWin = live ? r.stageRanking[pick]?.[0] : undefined;
  return (
    <section className="ocard dk-wide">
      <h2>{live ? `General classification after stage ${r.stage}` : `How the ${r.edition} Dakar finished`}</h2>
      <Chips label="Category" items={cats.map(c => ({ k: c, label: c }))} value={pick} set={setCat} />
      <p className="dek">{live ? 'Gap to the leader, refreshed with every update from the organiser.' : `Gap to the winner after ${r.stage} stages. The ${dk.edition} standings replace these once the rally starts.`}</p>
      <div className="dk-gaps">
        {rows.map(x => {
          const g = secs(x.gap), m = makeOfTeam(x.team);
          return (
            <div key={x.bib}>
              <span className="p">{x.pos}</span>
              <span className="n"><Score as="b">{x.crew[0]}</Score> <small>{x.nation}</small></span>
              <span className="g">
                {x.pos === 1 ? <Score className="w">{x.time} <small>{live ? 'leader' : 'winner'}</small></Score> : <>
                  <Score className="t"><i style={{ width: `${(g / max) * 100}%`, background: ink(m) }} /></Score>
                  <Score className="v">+{gapText(g)}</Score>
                </>}
              </span>
            </div>
          );
        })}
      </div>
      <div className="olegend">{makes.map(m => <span key={m}><i style={{ background: ink(m), height: 10 }} />{m}</span>)}</div>
      {stageWin && <p className="dek" style={{ marginTop: 8 }}>Stage {r.stage} went to <Score as="b">{stageWin.crew.join(' / ')}</Score> ({makeOfTeam(stageWin.team)}).</p>}
      <div className="osrc">Source: dakar.com official rankings</div>
    </section>
  );
}

/** The winning make of every edition since the move to South America, cars and bikes. */
function MakesCard({ s }: { s: DakarSeason }) {
  const since = 2009;
  const years = s.winners.filter(x => x.year >= since);
  const rows = [['car', 'Cars'], ['bike', 'Bikes']] as const;
  return (
    <section className="ocard dk-makes">
      <h2>The winning makes</h2>
      <p className="dek">Every edition since {since}, one square per year in the winner's color.</p>
      {rows.map(([k, label]) => {
        const wins = Object.entries(years.reduce<Record<string, number>>((a, x) => { const m = x[k]?.make; if (m && !x.cancelled) a[m] = (a[m] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
        return (
          <div key={k} style={{ marginBottom: 12 }}>
            <div className="lab">{label}</div>
            <div className="dk-tiles" style={{ gridTemplateColumns: `repeat(${years.length}, minmax(0, 1fr))` }}>
              {years.map(x => <span key={x.year} title={`${x.year}: ${x.cancelled ? 'cancelled' : `${x[k]?.make ?? '–'} · ${x[k]?.name ?? ''}`}`} style={{ background: x.cancelled ? 'transparent' : ink(x[k]?.make) }}>{String(x.year).slice(2)}</span>)}
            </div>
            <div className="olegend">{wins.map(([m, n]) => <span key={m}><i style={{ background: ink(m), height: 10 }} />{m} {n}</span>)}</div>
          </div>
        );
      })}
      <div className="osrc">Source: Wikipedia, Dakar Rally</div>
    </section>
  );
}
