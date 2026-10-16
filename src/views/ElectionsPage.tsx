import { useEffect, useState, type ReactNode } from 'react';
import { useWidth } from '../components/charts';
import { ElectionNight, hasResults, inResultsWindow, isElectionNight, joinLive } from '../components/ElectionNight';
import { CountyMap, UsMap, marginFill, type StateCell } from '../components/UsMap';
import { Score } from '../components/common';
import { Hero, Row } from '../components/sheet';
import {
  CLOSINGS, FIRST_CLOSE, HOUSE_MAJORITY, HOUSE_SEATS, STATE_NAME, fmtMargin, pct, ratingOf, scoreOf,
  type Chamber, type ElectionData, type ModelRace, type PollAverage,
} from '../core/elections';
import { useData } from '../core/store';
import { DAY, countdown, dayLong, dayShort, hhmm } from '../core/time';
import { liveForced, raceCounties, tally, type LiveData, type LiveRace } from '../sources/electionsLive';

type Office = 'senate' | 'governor';
const OFFICE_LABEL: Record<Office, string> = { senate: 'Senate', governor: 'Governors' };

/** US elections: forecasts and polls before the vote, live results on the night, polls and the calendar the rest of the time. */
export function ElectionsPage() {
  const { now, events, elections: e, live } = useData();
  if (!e) return <Hero id="elez" dek="Loading forecasts and polls…" />;
  const eday = Date.parse(e.electionDay);
  const results = inResultsWindow(now) || hasResults(live) || (liveForced() && Boolean(live));
  const preseason = !results && eday > now && eday - now < 150 * DAY;
  const upcoming = events.filter(x => x.passion === 'elez' && x.start > now);
  return (
    <>
      {results ? <NightHero e={e} live={live} now={now} /> : <PreHero e={e} now={now} preseason={preseason} />}
      {results && live && <Results e={e} live={live} now={now} />}
      {(preseason || results) && e.model && <Forecast e={e} live={results ? live : undefined} />}
      <Polls e={e} />
      <section className="s-two">
        <div className="ocard">
          <div className="lab">Election night · Rome time</div>
          <h2 style={{ marginBottom: 10 }}>When the polls close</h2>
          <div className="closings">
            {CLOSINGS.map(c => {
              const t = Date.parse(`2026-11-0${c.nextDay ? 4 : 3}T${c.et}:00-05:00`);
              return <div key={c.et} className="r"><b>{hhmm(t)}</b><div>{c.states}{c.note && <><br /><small>{c.note}</small></>}</div></div>;
            })}
          </div>
        </div>
        <div className="ocard">
          <div className="lab">Coming up</div>
          <h2 style={{ marginBottom: 10 }}>Election calendar</h2>
          <div className="olist">
            {(e.calendar ?? []).filter(c => Date.parse(c.date) > now - DAY).slice(0, 8).map(c => (
              <div key={c.date + c.title} className="r"><time>{dayShort(Date.parse(`${c.date}T12:00:00Z`))}<small>{new Date(c.date).getUTCFullYear()}</small></time><div><b>{c.title}</b><small>{c.kind === 'general' ? 'General election' : c.kind === 'offyear' ? 'Off-year elections' : c.kind === 'primary' ? 'Primary' : 'Race'}</small></div><span className="x">{Math.ceil((Date.parse(c.date) - now) / DAY)} d</span></div>
            ))}
            {upcoming.slice(0, 2).map(x => <Row key={x.id} e={x} right={`in ${countdown(x.start - now)}`} />)}
          </div>
          <div className="osrc">Fixed election dates, and races listed by civicAPI</div>
        </div>
      </section>
    </>
  );
}

// ---------- heroes ----------

function PreHero({ e, now, preseason }: { e: ElectionData; now: number; preseason: boolean }) {
  const c = e.model?.chambers, ap = e.polls?.approval, gb = e.polls?.generic;
  const days = Math.ceil((Date.parse(e.electionDay) - now) / DAY);
  return (
    <>
      <Hero id="elez" dek={preseason && c
        ? `Election Day is in ${days} days. On Point Politics gives Democrats a ${pct(c.senate.dem)} chance of winning the Senate and ${pct(c.house.dem)} for the House.${ap ? ` Trump's net approval is ${ap.marginText}` : ''}${gb ? `; the generic ballot is ${gb.marginText}.` : '.'}`
        : `${ap ? `Trump's net approval: ${ap.marginText}. ` : ''}${gb ? `Generic ballot: ${gb.marginText}. ` : ''}Next: ${e.calendar?.find(x => Date.parse(x.date) > now)?.title ?? 'no election scheduled'}.`} />
      <section className="s-top">
        <div className="ocard s-next">
          <div className="lab">Election night</div>
          <h3>{dayLong(Date.parse(e.electionDay))}</h3>
          <div className="when">First polls close at {hhmm(FIRST_CLOSE)} Rome time</div>
          <div className="s-cd">{now < FIRST_CLOSE ? countdown(FIRST_CLOSE - now) : 'Results night'}<small>until first results</small></div>
        </div>
        <div className="ocard">
          <div className="lab">Chance of Democratic control · On Point model</div>
          {c ? (['senate', 'house', 'governor'] as const).map(k => <ChanceBar key={k} label={k === 'governor' ? 'Governors' : k[0].toUpperCase() + k.slice(1)} p={c[k].dem} seats={c[k].demSeats} total={c[k].total} />) : <div>Not available.</div>}
          {e.model && <div className="osrc">{e.model.sims.toLocaleString('en-US')} simulations · updated {dayShort(Date.parse(e.model.updated))}</div>}
        </div>
        <div className="ocard">
          <div className="lab">The national mood</div>
          <div className="kpis" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {ap && <div className="kpi"><b style={{ color: ap.margin >= 0 ? 'var(--o-dem)' : 'var(--o-rep)' }}>{ap.marginText}</b><span>Trump net approval ({ap.a.value}% / {ap.b.value}%)</span></div>}
            {gb && <div className="kpi"><b style={{ color: gb.margin >= 0 ? 'var(--o-dem)' : 'var(--o-rep)' }}>{gb.marginText}</b><span>Generic ballot</span></div>}
          </div>
          <div className="osrc">On Point Politics averages{e.silver?.approval?.series.length ? ` · Silver Bulletin approve ${e.silver.approval.series[e.silver.approval.series.length - 1].a}%` : ''}</div>
        </div>
      </section>
    </>
  );
}

function ChanceBar({ label, p, seats, total }: { label: string; p: number; seats: number; total: number }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><b>{label}</b><span><Score><b style={{ color: 'var(--o-dem)' }}>{pct(p)}</b> D · <b style={{ color: 'var(--o-rep)' }}>{pct(1 - p)}</b> R</Score></span></div>
      <div style={{ display: 'flex', gap: 2, height: 8, borderRadius: 3, overflow: 'hidden', marginTop: 4 }}><div style={{ flex: p, background: 'var(--o-dem)' }} /><div style={{ flex: 1 - p, background: 'var(--o-rep)' }} /></div>
      <small style={{ color: 'var(--o-ink3)' }}>Average outcome {Math.round(seats)}–{Math.round(total - seats)}</small>
    </div>
  );
}

function NightHero({ e, live, now }: { e: ElectionData; live?: LiveData; now: number }) {
  const sen = senateCount(e, live), house = live ? tally(live.house) : null;
  return (
    <>
      <Hero id="elez" dek={<>
        {isElectionNight(now) ? <span style={{ color: '#ff453a' }}>● Live. </span> : null}
        {live ? `Senate: Democrats ${sen.D}, Republicans ${sen.R}, ${sen.open} races uncalled. House: ${house!.D} D, ${house!.R} R called, ${house!.open} still counting.` : 'Waiting for the first results…'}
      </>} />
      <section className="s-top">
        <div className="ocard"><div className="lab">Senate · 51 for control</div><SeatBar d={sen.D} r={sen.R} total={100} majority={51} /></div>
        <div className="ocard"><div className="lab">House · {HOUSE_MAJORITY} for control</div>{house ? <SeatBar d={house.D} r={house.R} total={HOUSE_SEATS} majority={HOUSE_MAJORITY} /> : '–'}</div>
        <div className="ocard"><div className="lab">Governors</div>{live && e.model ? (() => { const g = tally(live.governor), n = e.model.chambers.governor.notUp!; return <SeatBar d={g.D + n.D} r={g.R + n.R} total={50} majority={26} />; })() : '–'}</div>
      </section>
    </>
  );
}

/** Senate seats: those not up this year plus the races called so far. */
function senateCount(e: ElectionData, live?: LiveData) {
  const n = e.model?.chambers.senate.notUp ?? { D: 34, R: 31 };
  const t = live ? tally(live.senate) : { D: 0, R: 0, I: 0, O: 0, open: 35 };
  // Independents such as Nebraska's Osborn are counted with the Democrats, as the model does
  return { D: n.D + t.D + t.I, R: n.R + t.R, open: t.open };
}

function SeatBar({ d, r, total, majority }: { d: number; r: number; total: number; majority: number }) {
  return (
    <>
      <div className="kpis" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="kpi"><b style={{ color: 'var(--o-dem)' }}>{d}</b><span>Democrats</span></div>
        <div className="kpi" style={{ textAlign: 'right' }}><b style={{ color: 'var(--o-rep)' }}>{r}</b><span>Republicans</span></div>
      </div>
      <div style={{ position: 'relative', display: 'flex', gap: 2, height: 12, borderRadius: 3, overflow: 'hidden', marginTop: 10, background: 'var(--o-grid)' }}>
        <div style={{ width: `${(d / total) * 100}%`, background: 'var(--o-dem)' }} /><div style={{ flex: 1 }} /><div style={{ width: `${(r / total) * 100}%`, background: 'var(--o-rep)' }} />
        <div style={{ position: 'absolute', left: `${(majority / total) * 100}%`, top: 0, bottom: 0, width: 2, background: 'var(--o-ink)' }} />
      </div>
      <small style={{ color: 'var(--o-ink3)' }}>{total - d - r} not called · line at {majority}</small>
    </>
  );
}

// ---------- results ----------

function Results({ e, live, now }: { e: ElectionData; live: LiveData; now: number }) {
  const [office, setOffice] = useState<Office>('senate');
  const [pick, setPick] = useState<string | null>(null);
  const model = e.model?.races ?? [];
  const races: LiveRace[] = live[office];
  const cells: Record<string, StateCell> = {};
  for (const r of races) {
    const [a, b] = r.cands;
    const dm = a && b ? (a.party === 'D' || a.party === 'I' ? a.pct - b.pct : -(a.pct - b.pct)) : null;
    const counted = r.reporting > 0;
    cells[r.st] = {
      fill: r.winner ? (r.winner === 'R' ? 'var(--o-rep)' : 'var(--o-dem)') : counted ? marginFill(dm, 30) : 'var(--o-grid)',
      stroke: !r.winner && counted ? 'var(--o-ink3)' : undefined,
      tip: <>{r.cands.slice(0, 3).map(c => <div key={c.name}>{c.winner ? '✓ ' : ''}{c.name} {c.pct.toFixed(1)}%</div>)}<div className="k">{r.winnerName ? 'Called' : `${Math.round(r.reporting)}% reporting`}</div></>,
    };
  }
  const picked = pick ? races.find(r => r.st === pick) : null;
  const rows = joinLive(model.filter(m => m.office === office), races);
  const closeHouse = joinLive(model.filter(m => m.office === 'house').sort((a, b) => Math.abs(a.margin) - Math.abs(b.margin)).slice(0, 30), live.house);
  return (
    <>
      <section className="ocard">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ marginRight: 'auto' }}>{OFFICE_LABEL[office]}: results by state</h2>
          {(['senate', 'governor'] as Office[]).map(o => <Toggle key={o} on={office === o} onClick={() => { setOffice(o); setPick(null); }}>{OFFICE_LABEL[o]}</Toggle>)}
        </div>
        <p className="dek">Solid color: race called. Lighter shades: the current leader, by margin. Click a state for its counties and the official state count.</p>
        <UsMap cells={cells} selected={pick} onPick={setPick} />
        {picked && <RaceDetail r={picked} official={(office === 'senate' ? live.official.senate : live.official.governor)[picked.st]} />}
        <div className="osrc">Results and calls: civicAPI · official state counts: Open America{live.official.asOf ? ` (${hhmm(Date.parse(live.official.asOf))})` : ''} · refreshed every minute, last {hhmm(live.fetched)}</div>
      </section>
      <section className="s-two">
        <div className="ocard">
          <h2>Senate races, in closing order</h2>
          <ElectionNight rows={joinLive(model.filter(m => m.office === 'senate'), live.senate)} now={now} variant="sheet" />
        </div>
        <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
          <div className="ocard">
            <h2>The House</h2>
            <p className="dek">Each square is a seat: called seats in solid color, ordered from the safest Democratic to the safest Republican.</p>
            <HouseWaffle live={live} model={model} />
          </div>
          <div className="ocard">
            <h2>Closest House races</h2>
            <ElectionNight rows={closeHouse} now={now} variant="sheet" />
          </div>
        </div>
      </section>
      <section className="s-two">
        <div className="ocard">
          <h2>Governors</h2>
          <ElectionNight rows={rows.length && office === 'governor' ? rows : joinLive(model.filter(m => m.office === 'governor' && Math.abs(m.margin) < 12), live.governor)} now={now} variant="sheet" />
        </div>
        <div className="ocard">
          <h2>Statewide ballot measures</h2>
          <Measures list={live.measures} />
        </div>
      </section>
    </>
  );
}

function RaceDetail({ r, official }: { r: LiveRace; official?: { pctIn: number; total: number; cands: { n: string; p: string; v: number; pct: number }[] } }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof raceCounties>> | null>(null);
  useEffect(() => {
    let on = true;
    setRows(null);
    raceCounties(r.id).then(x => on && setRows(x)).catch(() => on && setRows({}));
    return () => { on = false; };
  }, [r.id]);
  return (
    <div className="s-two" style={{ marginTop: 16, gap: 24 }}>
      <div style={{ minWidth: 0 }}>
        <div className="lab">{r.name} · counties</div>
        {rows ? <CountyMap st={r.st} rows={rows} /> : <p className="dek">Loading…</p>}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="lab">civicAPI · {Math.round(r.reporting)}% reporting</div>
        <table className="otable"><tbody>{r.cands.slice(0, 5).map(c => <tr key={c.name}><td><i className="cy-dot" style={{ background: c.party === 'D' ? 'var(--o-dem)' : c.party === 'R' ? 'var(--o-rep)' : 'var(--oc-tech)' }} />{c.winner ? '✓ ' : ''}{c.name}</td><td className="n"><Score>{c.votes.toLocaleString('en-US')}</Score></td><td className="n"><Score>{c.pct.toFixed(1)}%</Score></td></tr>)}</tbody></table>
        {official && (
          <>
            <div className="lab" style={{ marginTop: 14 }}>Official state count · Open America · {Math.round(official.pctIn)}% in</div>
            <table className="otable"><tbody>{official.cands.slice(0, 4).map(c => <tr key={c.n}><td>{c.n} <small style={{ color: 'var(--o-ink3)' }}>{c.p}</small></td><td className="n"><Score>{c.v.toLocaleString('en-US')}</Score></td><td className="n"><Score>{c.pct.toFixed(1)}%</Score></td></tr>)}</tbody></table>
          </>
        )}
      </div>
    </div>
  );
}

function HouseWaffle({ live, model }: { live: LiveData; model: ModelRace[] }) {
  const forecast = new Map(model.filter(m => m.office === 'house').map(m => [`${m.st}-${m.district ?? 0}`, m.margin]));
  const seats = live.house.map(r => ({ r, m: forecast.get(`${r.st}-${r.district ?? 0}`) ?? (r.cands[0]?.party === 'D' ? 30 : -30) })).sort((a, b) => b.m - a.m);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 9px)', gap: 2 }}>
      {seats.map(({ r }) => {
        const lead = r.cands[0];
        const bg = r.winner ? (r.winner === 'R' ? 'var(--o-rep)' : 'var(--o-dem)') : r.reporting > 0 && lead ? `color-mix(in srgb, ${lead.party === 'R' ? 'var(--o-rep)' : 'var(--o-dem)'} 35%, var(--o-card))` : 'var(--o-grid)';
        return <i key={r.id} title={`${STATE_NAME[r.st]} ${r.district || 'at-large'}: ${r.winnerName ? `called for ${r.winnerName}` : lead && r.reporting ? `${lead.name} leads, ${Math.round(r.reporting)}% in` : 'no results yet'}`} style={{ width: 9, height: 9, borderRadius: 2, background: bg }} />;
      })}
    </div>
  );
}

function Measures({ list }: { list: LiveRace[] }) {
  if (!list.length) return <p className="dek">No statewide measures reported yet.</p>;
  return (
    <div style={{ display: 'grid', gap: 8, maxHeight: 520, overflowY: 'auto' }}>
      {list.map(m => {
        const yes = m.cands.find(c => /^yes/i.test(c.name)), no = m.cands.find(c => /^no/i.test(c.name));
        return (
          <div key={m.id} style={{ fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span>{m.name}</span><Score><b>{m.winnerName ? (/^yes/i.test(m.winnerName) ? 'Passed' : 'Failed') : m.reporting ? `${Math.round(m.reporting)}% in` : ''}</b></Score></div>
            {m.reporting > 0 && yes && no && <div style={{ display: 'flex', gap: 2, height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 3 }}><div style={{ flex: yes.pct, background: 'var(--o-s3)' }} /><div style={{ flex: no.pct, background: 'var(--o-other)' }} /></div>}
          </div>
        );
      })}
    </div>
  );
}

// ---------- forecast ----------

function Forecast({ e, live }: { e: ElectionData; live?: LiveData }) {
  const [office, setOffice] = useState<Office>('senate');
  const [pick, setPick] = useState<string | null>(null);
  const m = e.model!;
  const races = m.races.filter(r => r.office === office);
  const cells: Record<string, StateCell> = {};
  for (const r of races) cells[r.st] = { fill: marginFill(r.margin), tip: <><div>{r.dem} (D) vs {r.gop} (R)</div><div><b>{fmtMargin(r.margin)}</b> · {pct(r.pDem)} D chance</div><div className="k">{ratingOf(r.margin).label}</div></> };
  const picked = races.find(r => r.st === pick) ?? races.filter(r => r.marquee).sort((a, b) => Math.abs(a.margin) - Math.abs(b.margin))[0];
  const close = races.filter(r => Math.abs(r.margin) < 12).sort((a, b) => b.margin - a.margin);
  const raters = e.ratings;
  return (
    <>
      {!live && (
        <section className="ocard">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ marginRight: 'auto' }}>The {OFFICE_LABEL[office].toLowerCase()} forecast, state by state</h2>
            {(['senate', 'governor'] as Office[]).map(o => <Toggle key={o} on={office === o} onClick={() => { setOffice(o); setPick(null); }}>{OFFICE_LABEL[o]}</Toggle>)}
          </div>
          <p className="dek">Projected margin in each race on the ballot, from the On Point Politics model. Deeper color, safer seat; grey states have no {office === 'senate' ? 'Senate' : 'governor'} race this year. Click a state for the details.</p>
          <UsMap cells={cells} selected={picked?.st} onPick={setPick} legend={<MarginLegend />} />
          {picked && <ForecastCard r={picked} raters={(office === 'senate' ? raters?.senate : raters?.governor)?.[picked.st]} names={raters?.names ?? {}} />}
          <div className="osrc">Model: <a href={m.url} target="_blank" rel="noreferrer">On Point Politics</a>, updated {dayShort(Date.parse(m.updated))}</div>
        </section>
      )}

      <section className="s-two">
        <div className="ocard">
          <h2>How many seats: {m.sims.toLocaleString('en-US')} simulations</h2>
          <p className="dek">Share of the model's simulations ending with each number of Democratic seats. The line marks control: 51 Senate seats for the Democrats (the Vice President breaks ties for the Republicans) and 218 in the House.</p>
          <div className="lab">Senate</div>
          <SeatHist c={m.chambers.senate} majority={51} />
          <div className="lab" style={{ marginTop: 14 }}>House</div>
          <SeatHist c={m.chambers.house} majority={HOUSE_MAJORITY} />
        </div>
        <div className="ocard">
          <h2>Chance of Democratic control, recent updates</h2>
          <p className="dek">How the model's odds moved over its last {m.chambers.senate.trend.length} updates.</p>
          <TrendLines series={(['senate', 'house', 'governor'] as const).map((k, i) => ({ name: k === 'governor' ? 'Governors' : k[0].toUpperCase() + k.slice(1), color: ['var(--o-s1)', 'var(--o-s3)', 'var(--o-s4)'][i], values: m.chambers[k].trend.map(t => t.dem * 100) }))} unit="%" min={0} max={100} />
        </div>
      </section>

      <section className="ocard">
        <h2>{OFFICE_LABEL[office === 'senate' ? 'senate' : 'governor']} races within 12 points</h2>
        <p className="dek">Projected margin with the model's 80% range, and what each forecaster says. Markets show the Democratic chance.</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="otable">
            <thead><tr><th>Race</th><th style={{ minWidth: 200 }}>Margin · 80% range</th><th className="n">D chance</th>{Object.entries(raters?.names ?? {}).map(([k, n]) => <th key={k} className="n">{n}</th>)}</tr></thead>
            <tbody>{close.map(r => (
              <tr key={r.id}>
                <td><b>{STATE_NAME[r.st]}</b>{/special/i.test(r.name) ? <small style={{ color: 'var(--o-ink3)' }}> special</small> : null}<br /><small style={{ color: 'var(--o-ink3)' }}>{r.dem} vs {r.gop}{r.incParty ? ` · ${r.incParty} held` : ''}{r.open ? ', open' : ''}</small></td>
                <td><RangeDot r={r} /></td>
                <td className="n"><b style={{ color: r.pDem >= 0.5 ? 'var(--o-dem)' : 'var(--o-rep)' }}>{pct(r.pDem)}</b></td>
                {Object.keys(raters?.names ?? {}).map(k => { const l = (office === 'senate' ? raters?.senate : raters?.governor)?.[r.st]?.[k]; return <td key={k} className="n"><RatingChip label={l} /></td>; })}
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="osrc">Ratings via civicAPI{raters?.asOf ? `, as of ${dayShort(Date.parse(raters.asOf))}` : ''}</div>
      </section>

      {!live && (
        <section className="ocard">
          <h2>The closest House races</h2>
          <p className="dek">The 24 districts the model sees as nearest to a tie. {m.safeHouse.D + m.safeHouse.R} of 435 seats are rated safe.</p>
          <div className="olist">
            {m.races.filter(r => r.office === 'house').sort((a, b) => Math.abs(a.margin) - Math.abs(b.margin)).slice(0, 24).map(r => (
              <div key={r.id} className="r" style={{ gridTemplateColumns: '120px 1fr 120px' }}>
                <time>{r.st}-{String(r.district ?? 0).padStart(2, '0')}<small>{r.incParty ? `${r.incParty} held` : 'open'}</small></time>
                <div><b>{r.dem} vs {r.gop}</b><small>{ratingOf(r.margin).label}</small></div>
                <span className="x" style={{ color: r.margin >= 0 ? 'var(--o-dem)' : 'var(--o-rep)', fontWeight: 600 }}>{fmtMargin(r.margin)} · {pct(r.pDem)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function ForecastCard({ r, raters, names }: { r: ModelRace; raters?: Record<string, string>; names: Record<string, string> }) {
  return (
    <div className="s-two" style={{ marginTop: 14, gap: 24 }}>
      <div>
        <div className="lab">{r.name}</div>
        <h3 style={{ margin: '0 0 4px' }}>{r.dem} <small style={{ color: 'var(--o-ink3)' }}>vs</small> {r.gop}</h3>
        <div className="kpis" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <div className="kpi"><b style={{ color: r.margin >= 0 ? 'var(--o-dem)' : 'var(--o-rep)' }}>{fmtMargin(r.margin)}</b><span>Projected</span></div>
          <div className="kpi"><b>{pct(r.pDem)}</b><span>Democratic chance</span></div>
          <div className="kpi"><b>{r.poll == null ? '–' : fmtMargin(r.poll)}</b><span>Polling average ({r.polls} polls)</span></div>
        </div>
        <RangeDot r={r} wide />
      </div>
      <div>
        <div className="lab">What the forecasters say</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(names).map(([k, n]) => <span key={k} style={{ fontSize: 12 }}>{n}: <RatingChip label={raters?.[k]} /></span>)}
        </div>
        {r.trend.length > 1 && <><div className="lab" style={{ marginTop: 12 }}>Democratic chance, recent updates</div><Spark values={r.trend.map(v => v * 100)} /></>}
      </div>
    </div>
  );
}

// ---------- polls ----------

function Polls({ e }: { e: ElectionData }) {
  const p = e.polls ?? {};
  const sb = e.silver;
  const fresh = (d?: string | null) => Boolean(d && Date.now() - Date.parse(d) < 45 * DAY);
  return (
    <>
      <section className="s-two">
        {p.approval && (
          <div className="ocard">
            <h2>Trump job approval: {p.approval.a.value}% approve, {p.approval.b.value}% disapprove</h2>
            <p className="dek">On Point Politics average of {p.approval.n} polls{sb?.approval && fresh(sb.approval.updated) ? ', with the Silver Bulletin average dashed' : ''}. Updated {dayShort(Date.parse(p.approval.updated))}.</p>
            <PollChart avg={p.approval} alt={sb?.approval && fresh(sb.approval.updated) ? sb.approval : undefined} colors={['var(--o-s3)', 'var(--o-s2)']} />
          </div>
        )}
        {p.generic && (
          <div className="ocard">
            <h2>Generic ballot: {p.generic.marginText}</h2>
            <p className="dek">Which party voters would back for Congress, On Point Politics average of {p.generic.n} polls{sb?.generic && fresh(sb.generic.updated) ? ', Silver Bulletin dashed' : ''}. Updated {dayShort(Date.parse(p.generic.updated))}.</p>
            <PollChart avg={p.generic} alt={sb?.generic && fresh(sb.generic.updated) ? sb.generic : undefined} colors={['var(--o-dem)', 'var(--o-rep)']} />
          </div>
        )}
      </section>
      <section className="s-two">
        <div className="ocard">
          {sb?.issues && (
            <>
              <h2>Trump's net approval by issue</h2>
              <p className="dek">Approve minus disapprove on each issue, Silver Bulletin average as of {dayShort(Date.parse(sb.issues.date))}.</p>
              <IssueBars net={sb.issues.net} />
              <div className="osrc"><a href={sb.url} target="_blank" rel="noreferrer">Silver Bulletin</a> public charts</div>
            </>
          )}
          {p.track && <div style={{ marginTop: 18 }}><div className="lab">Right direction / wrong track</div><div className="kpis" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}><div className="kpi"><b>{p.track.a.value}%</b><span>{p.track.a.label}</span></div><div className="kpi"><b>{p.track.b.value}%</b><span>{p.track.b.label}</span></div><div className="kpi"><b>{p.track.marginText}</b><span>Net · {dayShort(Date.parse(p.track.updated))}</span></div></div></div>}
          {p.y2028 && <div style={{ marginTop: 18 }}><div className="lab">Looking to 2028</div><div className="kpis" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}><div className="kpi"><b>{p.y2028.a.value}%</b><span>{p.y2028.a.label}</span></div><div className="kpi"><b>{p.y2028.b.value}%</b><span>{p.y2028.b.label}</span></div><div className="kpi"><b>{p.y2028.marginText}</b><span>Polls to {dayShort(Date.parse(p.y2028.updated))}</span></div></div></div>}
        </div>
        <div className="ocard">
          <div className="lab">Latest approval polls</div>
          <table className="otable">
            <thead><tr><th>Pollster</th><th>Date</th><th className="n">App.</th><th className="n">Dis.</th><th className="n">Net</th></tr></thead>
            <tbody>{(p.approval?.latest ?? []).map(x => <tr key={x.pollster + x.date}><td>{x.pollster}<br /><small style={{ color: 'var(--o-ink3)' }}>{x.n.toLocaleString('en-US')} {x.type}</small></td><td>{dayShort(Date.parse(x.date))}</td><td className="n">{x.a}</td><td className="n">{x.b}</td><td className="n" style={{ color: x.margin >= 0 ? 'var(--o-dem)' : 'var(--o-rep)' }}>{x.margin > 0 ? '+' : ''}{x.margin}</td></tr>)}</tbody>
          </table>
          <div className="osrc">On Point Politics public poll feed</div>
        </div>
      </section>
    </>
  );
}

// ---------- small charts ----------

const Toggle = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) => (
  <button className="btn" aria-pressed={on} onClick={onClick} style={{ color: 'var(--o-ink)', background: on ? 'var(--o-accent-soft)' : 'transparent', borderColor: 'var(--o-line)' }}>{children}</button>
);

function MarginLegend() {
  return (
    <div className="olegend" style={{ justifyContent: 'center', marginTop: 6 }}>
      {[-15, -8, -3, 0, 3, 8, 15].map(v => <span key={v}><i style={{ width: 22, height: 10, background: marginFill(v) }} />{v === 0 ? 'Even' : fmtMargin(v)}</span>)}
      <span><i style={{ width: 22, height: 10, background: 'var(--o-bg)', outline: '1px solid var(--o-line)' }} />No race</span>
    </div>
  );
}

function RatingChip({ label }: { label?: string }) {
  const s = scoreOf(label);
  if (s == null || !label) return <span style={{ color: 'var(--o-ink3)' }}>—</span>;
  const c = s > 0 ? 'var(--o-dem)' : s < 0 ? 'var(--o-rep)' : 'var(--o-ink3)';
  return <span style={{ display: 'inline-block', minWidth: 56, padding: '2px 6px', borderRadius: 4, fontSize: 11, textAlign: 'center', background: `color-mix(in srgb, ${c} ${s === 0 ? 18 : Math.round((Math.abs(s) / 3) * 70 + 10)}%, var(--o-card))`, color: Math.abs(s) >= 2 ? '#fff' : 'var(--o-ink)' }}>{label.replace('Tossup', 'Toss-up')}</span>;
}

/** Margin with its 80% range on a fixed D+20 … R+20 scale. */
function RangeDot({ r, wide }: { r: ModelRace; wide?: boolean }) {
  const [ref, W] = useWidth<HTMLDivElement>(200);
  const H = wide ? 40 : 26, cap = 20;
  const x = (v: number) => W / 2 - (Math.max(-cap, Math.min(cap, v)) / cap) * (W / 2 - 8);
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} aria-label={`${fmtMargin(r.margin)}, range ${fmtMargin(r.lo)} to ${fmtMargin(r.hi)}`}>
        <line x1={W / 2} x2={W / 2} y1={2} y2={H - (wide ? 14 : 2)} stroke="var(--o-ink3)" strokeDasharray="2 2" />
        <line x1={x(r.lo)} x2={x(r.hi)} y1={H / 2 - (wide ? 6 : 0)} y2={H / 2 - (wide ? 6 : 0)} stroke={r.margin >= 0 ? 'var(--o-dem)' : 'var(--o-rep)'} strokeOpacity={0.35} strokeWidth={6} strokeLinecap="round" />
        <circle cx={x(r.margin)} cy={H / 2 - (wide ? 6 : 0)} r={5} fill={r.margin >= 0 ? 'var(--o-dem)' : 'var(--o-rep)'} stroke="var(--o-card)" strokeWidth={2} />
        {wide && <><text x={8} y={H - 2} style={{ fontSize: 10 }}>D+20</text><text x={W / 2} y={H - 2} textAnchor="middle" style={{ fontSize: 10 }}>Even</text><text x={W - 8} y={H - 2} textAnchor="end" style={{ fontSize: 10 }}>R+20</text></>}
      </svg>
    </div>
  );
}

function SeatHist({ c, majority }: { c: Chamber; majority: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 120, b = 18;
  const bins = [...c.hist].sort((a, z) => a[0] - z[0]);
  const lo = bins[0][0], hi = bins[bins.length - 1][0], max = Math.max(...bins.map(x => x[1]));
  const bw = (W - 4) / (hi - lo + 1);
  const x = (s: number) => 2 + (s - lo) * bw;
  return (
    <div ref={ref} className="ochart" style={{ position: 'relative' }} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Distribution of simulated seats">
        {bins.map(([s, p]) => <rect key={s} x={x(s) + 0.5} y={H - b - (p / max) * (H - b - 6)} width={Math.max(1, bw - 1)} height={(p / max) * (H - b - 6)} rx={bw > 6 ? 2 : 0} fill={s >= majority ? 'var(--o-dem)' : 'var(--o-rep)'} opacity={hover == null || hover === s ? 1 : 0.5} onPointerEnter={() => setHover(s)} />)}
        <line x1={x(majority)} x2={x(majority)} y1={0} y2={H - b} stroke="var(--o-ink)" strokeWidth={1.5} />
        {[lo, majority, hi].map(v => <text key={v} x={x(v) + bw / 2} y={H - 4} textAnchor="middle">{v}</text>)}
      </svg>
      {hover != null && <div className="tip obs" style={{ position: 'absolute', left: Math.min(x(hover) + 10, W - 170), top: 0 }}><b>{hover} Democratic seats</b><div>{(bins.find(z => z[0] === hover)![1] * 100).toFixed(1)}% of simulations</div></div>}
      <small style={{ color: 'var(--o-ink3)' }}>Middle outcome {c.median} D · 80% of simulations between {c.p10} and {c.p90}</small>
    </div>
  );
}

function TrendLines({ series, unit, min, max }: { series: { name: string; color: string; values: number[] }[]; unit: string; min: number; max: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const H = 220, l = 36, r = 90, t = 10, b = 20;
  const n = Math.max(...series.map(s => s.values.length));
  const x = (i: number) => l + (i / Math.max(1, n - 1)) * (W - l - r);
  const y = (v: number) => t + ((max - v) / (max - min)) * (H - t - b);
  return (
    <div ref={ref} className="ochart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Chance of control">
        {[0, 25, 50, 75, 100].map(v => <g key={v}><line x1={l} x2={W - r} y1={y(v)} y2={y(v)} stroke={v === 50 ? 'var(--o-ink3)' : 'var(--o-grid)'} strokeDasharray={v === 50 ? '3 3' : undefined} /><text x={l - 6} y={y(v) + 4} textAnchor="end">{v}{unit}</text></g>)}
        {series.map(s => <path key={s.name} d={s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')} fill="none" stroke={s.color} strokeWidth={2} />)}
        {labels(series.map(s => ({ s, yy: y(s.values[s.values.length - 1]) }))).map(({ s, yy }) => <text key={s.name} x={W - r + 6} y={yy + 4} style={{ fill: 'var(--o-ink2)', fontSize: 11 }}>{s.name} {Math.round(s.values[s.values.length - 1])}{unit}</text>)}
        <text x={l} y={H - 4}>earlier</text><text x={W - r} y={H - 4} textAnchor="end">latest</text>
      </svg>
    </div>
  );
}

/** End-of-line labels pushed apart so they never overlap. */
function labels<T extends { yy: number }>(xs: T[]): T[] {
  const out = [...xs].sort((a, b) => a.yy - b.yy).map(x => ({ ...x }));
  for (let k = 1; k < out.length; k++) if (out[k].yy - out[k - 1].yy < 13) out[k].yy = out[k - 1].yy + 13;
  return out;
}

function Spark({ values }: { values: number[] }) {
  const [ref, W] = useWidth<HTMLDivElement>(200);
  const H = 44, x = (i: number) => 4 + (i / Math.max(1, values.length - 1)) * (W - 50), y = (v: number) => 4 + ((100 - v) / 100) * (H - 8);
  const last = values[values.length - 1];
  return (
    <div ref={ref}><svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
      <line x1={4} x2={W - 46} y1={y(50)} y2={y(50)} stroke="var(--o-grid)" strokeDasharray="3 3" />
      <path d={values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')} fill="none" stroke={last >= 50 ? 'var(--o-dem)' : 'var(--o-rep)'} strokeWidth={2} />
      <text x={W - 42} y={y(last) + 4} style={{ fontSize: 11, fill: 'var(--o-ink2)' }}>{Math.round(last)}%</text>
    </svg></div>
  );
}

/** Two lines over time (approve/disapprove, D/R) with an optional second source dashed. */
function PollChart({ avg, alt, colors }: { avg: PollAverage; alt?: { series: { d: string; a: number; b: number }[] }; colors: [string, string] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 230, l = 30, r = 96, t = 10, b = 22;
  const s = avg.series;
  const t0 = Date.parse(s[0].d), t1 = Date.parse(s[s.length - 1].d);
  const vals = [...s.flatMap(p => [p.a, p.b]), ...(alt?.series.flatMap(p => [p.a, p.b]) ?? [])];
  const lo = Math.floor(Math.min(...vals) / 5) * 5, hi = Math.ceil(Math.max(...vals) / 5) * 5;
  const x = (d: string) => l + ((Date.parse(d) - t0) / (t1 - t0)) * (W - l - r);
  const y = (v: number) => t + ((hi - v) / (hi - lo)) * (H - t - b);
  const line = (pts: { d: string; v: number }[]) => pts.filter(p => Date.parse(p.d) >= t0).map((p, i) => `${i ? 'L' : 'M'}${x(p.d)},${y(p.v)}`).join(' ');
  const years = [...new Set(s.map(p => p.d.slice(0, 4)))];
  const last = s[s.length - 1];
  const hp = hover != null ? s[hover] : null;
  return (
    <div ref={ref} className="ochart" style={{ position: 'relative' }}
      onPointerMove={ev => { const bx = ev.currentTarget.getBoundingClientRect(); const tt = t0 + ((ev.clientX - bx.left - l) / (W - l - r)) * (t1 - t0); let k = 0; s.forEach((p, i) => { if (Math.abs(Date.parse(p.d) - tt) < Math.abs(Date.parse(s[k].d) - tt)) k = i; }); setHover(k); }}
      onPointerLeave={() => setHover(null)}>
      <div className="olegend"><span><i style={{ background: colors[0] }} />{avg.a.label}</span><span><i style={{ background: colors[1] }} />{avg.b.label}</span>{alt && <span><i style={{ background: 'var(--o-ink3)' }} />Silver Bulletin (dashed)</span>}</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={avg.title}>
        {Array.from({ length: (hi - lo) / 5 + 1 }, (_, k) => lo + k * 5).map(v => <g key={v}><line x1={l} x2={W - r} y1={y(v)} y2={y(v)} stroke="var(--o-grid)" /><text x={l - 6} y={y(v) + 4} textAnchor="end">{v}</text></g>)}
        {years.map(yr => { const d = `${yr}-01-01`; return Date.parse(d) > t0 ? <text key={yr} x={x(d)} y={H - 4} textAnchor="middle">{yr}</text> : null; })}
        {alt && <>
          <path d={line(alt.series.map(p => ({ d: p.d, v: p.a })))} fill="none" stroke={colors[0]} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7} />
          <path d={line(alt.series.map(p => ({ d: p.d, v: p.b })))} fill="none" stroke={colors[1]} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7} />
        </>}
        <path d={line(s.map(p => ({ d: p.d, v: p.a })))} fill="none" stroke={colors[0]} strokeWidth={2} />
        <path d={line(s.map(p => ({ d: p.d, v: p.b })))} fill="none" stroke={colors[1]} strokeWidth={2} />
        <text x={W - r + 6} y={y(last.a) + 4} style={{ fill: 'var(--o-ink2)', fontSize: 11 }}>{avg.a.label} {last.a}</text>
        <text x={W - r + 6} y={y(last.b) + 4} style={{ fill: 'var(--o-ink2)', fontSize: 11 }}>{avg.b.label} {last.b}</text>
        {hp && <line x1={x(hp.d)} x2={x(hp.d)} y1={t} y2={H - b} stroke="var(--o-ink3)" />}
      </svg>
      {hp && <div className="tip obs" style={{ position: 'absolute', left: Math.min(x(hp.d) + 10, W - 180), top: 24 }}><b>{dayShort(Date.parse(hp.d))} {hp.d.slice(0, 4)}</b><div>{avg.a.label} {hp.a} · {avg.b.label} {hp.b}</div></div>}
    </div>
  );
}

function IssueBars({ net }: { net: Record<string, number> }) {
  const rows = Object.entries(net).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...rows.map(r => Math.abs(r[1])), 10);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 52px', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <span>{k}</span>
          <div style={{ height: 12 }}><div style={{ width: `${(Math.abs(v) / max) * 100}%`, height: 12, borderRadius: 3, background: v >= 0 ? 'var(--o-s3)' : 'var(--o-s2)' }} /></div>
          <Score><b>{v > 0 ? '+' : ''}{v.toFixed(1)}</b></Score>
        </div>
      ))}
    </div>
  );
}
