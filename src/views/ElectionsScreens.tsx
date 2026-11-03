// US elections screens beyond the home: each chamber race by race, the House seat by seat,
// one state with all its races and counties, the night as it went, the ballot measures.
// Data: public/data/elections.json (forecast, ratings), the live layer (civicAPI, Open America),
// public/data/us-county-2024.json (the 2024 presidential vote by county) and the calls
// this browser noted during the night (sources/electionsLive.ts).
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWidth } from '../components/charts';
import { Score } from '../components/common';
import { Chips } from '../components/tabs';
import { CountyChoropleth, UsMap, marginFill, norm, type StateCell } from '../components/UsMap';
import {
  CLOSINGS, GOV_HELD, GOV_NOT_UP, HOUSE_MAJORITY, HOUSE_SEATS, SENATE_HELD, STATE_NAME, fmtMargin, pct, pollsClose, ratingOf, scoreOf,
  type ElectionData, type ModelRace,
} from '../core/elections';
import { getJSON } from '../core/fetcher';
import { countdown, dayShort, hhmm } from '../core/time';
import { demLead, nightLog, raceDetail, stateRaces, type CountyResult, type LiveData, type LiveRace, type NightLog, type Side } from '../sources/electionsLive';

export const ELEZ_TABS = [['now', 'Now'], ['senate', 'Senate'], ['house', 'House'], ['governors', 'Governors'], ['states', 'States'], ['night', 'The night'], ['measures', 'Ballot measures']] as const;
export type ElezTab = typeof ELEZ_TABS[number][0];

const DEM = 'var(--o-dem)', REP = 'var(--o-rep)', IND = 'var(--oc-tech)';
const colorOf = (p?: Side | null) => (p === 'D' ? DEM : p === 'R' ? REP : p === 'I' ? IND : 'var(--o-other)');
const pale = (c: string, k = 35) => `color-mix(in srgb, ${c} ${k}%, var(--o-card))`;
const HATCH = 'repeating-linear-gradient(45deg, rgba(255,255,255,.6) 0 2px, transparent 2px 5px)';
const ink3: CSSProperties = { color: 'var(--o-ink3)' };
const Src = ({ children }: { children: ReactNode }) => <div className="osrc">{children}</div>;
const sgn = (v: number, d = 1) => `${v > 0 ? '+' : ''}${v.toFixed(d)}`;
/** Independents caucusing with the Democrats count on their side. */
const side = (p: Side | null | undefined): 'D' | 'R' | null => (p === 'D' || p === 'I' ? 'D' : p === 'R' ? 'R' : null);
const OFFICE_NAME: Record<string, string> = { senate: 'Senate', governor: 'Governor', house: 'House', measure: 'Measure', other: 'State office' };

/** Open a state (and optionally one of its races) on the States screen. */
export function useGoState() {
  const [, setParams] = useSearchParams();
  return (st: string, race?: number) => setParams(p => { p.set('tab', 'states'); p.set('st', st); if (race) p.set('race', String(race)); else p.delete('race'); return p; }, { replace: false });
}

interface County24 { counties: Record<string, [number, number]>; states: Record<string, [number, number]> }
let c24: Promise<County24> | null = null;
function use2024() {
  const [d, setD] = useState<County24 | null>(null);
  useEffect(() => { let on = true; (c24 ??= getJSON<County24>(`${import.meta.env.BASE_URL}data/us-county-2024.json`, 24 * 3600e3)).then(x => on && setD(x)).catch(() => { c24 = null; }); return () => { on = false; }; }, []);
  return d;
}
const FIPS_ST: Record<string, string> = { AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10', DC: '11', FL: '12', GA: '13', HI: '15', ID: '16', IL: '17', IN: '18', IA: '19', KS: '20', KY: '21', LA: '22', ME: '23', MD: '24', MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31', NV: '32', NH: '33', NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38', OH: '39', OK: '40', OR: '41', PA: '42', RI: '44', SC: '45', SD: '46', TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53', WV: '54', WI: '55', WY: '56' };

/** Where a race stands: called, counting with a leader, closed, or before the polls close. */
function statusOf(r: LiveRace | undefined, st: string, now: number) {
  const close = pollsClose(st);
  if (r?.winner) return { k: 'called' as const, text: `Called · ${r.winnerName}` };
  if (r && r.reporting > 0) { const l = r.cands[0]; return { k: 'counting' as const, text: `${l?.name ?? ''} leads · ${Math.round(r.reporting)}% in` }; }
  if (close && now >= close) return { k: 'closed' as const, text: 'Polls closed · awaiting votes' };
  return { k: 'pre' as const, text: close ? `Polls close ${hhmm(close)}` : 'Awaiting results' };
}

function LeadBar({ r, h = 8 }: { r: LiveRace; h?: number }) {
  const d = r.cands.find(c => c.party === 'D') ?? r.cands.find(c => c.party === 'I'), g = r.cands.find(c => c.party === 'R');
  return (
    <div style={{ display: 'flex', height: h, gap: 2, borderRadius: 3, overflow: 'hidden', background: 'var(--o-grid)' }}>
      <div style={{ width: `${d?.pct ?? 0}%`, background: colorOf(d?.party) }} /><div style={{ flex: 1 }} /><div style={{ width: `${g?.pct ?? 0}%`, background: REP }} />
    </div>
  );
}

/** A row of seats from the Democratic left to the Republican right, with the line for control. */
function SeatRow({ cells, majority, label }: { cells: { fill: string; hatch?: boolean; title: string }[]; majority: number; label: string }) {
  return (
    <div style={{ position: 'relative', margin: '8px 0 4px' }} aria-label={label}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cells.length}, 1fr)`, gap: 1, height: 30 }}>
        {cells.map((c, i) => <i key={i} title={c.title} style={{ background: c.fill, backgroundImage: c.hatch ? HATCH : undefined, borderRadius: 1 }} />)}
      </div>
      <div style={{ position: 'absolute', left: `${(majority / cells.length) * 100}%`, top: -4, bottom: -4, width: 2, background: 'var(--o-ink)' }} />
    </div>
  );
}

function Kpis({ items }: { items: [ReactNode, string, string?][] }) {
  return (
    <div className="kpis" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map(([v, l, c], i) => <div key={i} className="kpi"><b style={{ color: c }}><Score>{v}</Score></b><span>{l}</span></div>)}
    </div>
  );
}

const sortByClose = (a: { st: string }, b: { st: string }) => (pollsClose(a.st) ?? 0) - (pollsClose(b.st) ?? 0) || STATE_NAME[a.st].localeCompare(STATE_NAME[b.st]);

// ---------- Senate and governors ----------

type MapMode = 'results' | 'forecast' | 'vsf' | 'shift';

export function ChamberScreen({ e, live, now, office }: { e: ElectionData; live?: LiveData; now: number; office: 'senate' | 'governor' }) {
  const goState = useGoState();
  const c24 = use2024();
  const [mode, setMode] = useState<MapMode>(live ? 'results' : 'forecast');
  const [sort, setSort] = useState<'close' | 'tight' | 'counted'>('close');
  const held = office === 'senate' ? SENATE_HELD : GOV_HELD;
  const model = (e.model?.races ?? []).filter(m => m.office === office);
  const lives = live?.[office] ?? [];
  const rows = Object.keys(held).map(st => {
    const m = model.find(x => x.st === st), r = lives.find(x => x.st === st);
    const lead = r && r.reporting > 0 ? demLead(r) : null;
    const win = side(r?.winner);
    return { st, m, r, lead, win, held: held[st], flip: Boolean(win && win !== held[st]), status: statusOf(r, st, now) };
  });
  const notUp = office === 'senate' ? (e.model?.chambers.senate.notUp ?? { D: 34, R: 31 }) : { D: Object.values(GOV_NOT_UP).filter(p => p === 'D').length, R: Object.values(GOV_NOT_UP).filter(p => p === 'R').length };
  const won = { D: rows.filter(x => x.win === 'D').length, R: rows.filter(x => x.win === 'R').length };
  const ahead = { D: rows.filter(x => !x.win && x.lead != null && x.lead > 0).length, R: rows.filter(x => !x.win && x.lead != null && x.lead < 0).length };
  const gains = { D: rows.filter(x => x.flip && x.win === 'D').length, R: rows.filter(x => x.flip && x.win === 'R').length };
  const majority = office === 'senate' ? 51 : 26;
  const fc = (x: typeof rows[number]) => x.m?.margin ?? (x.held === 'D' ? 15 : -15);
  const cells: { fill: string; hatch?: boolean; title: string }[] = [
    ...Array.from({ length: notUp.D }, () => ({ fill: pale(DEM, 22), title: 'Democratic seat not up this year' })),
    ...rows.filter(x => x.win === 'D').map(x => ({ fill: DEM, hatch: x.flip, title: `${STATE_NAME[x.st]}: ${x.r?.winnerName} (D)${x.flip ? ', flip' : ''}` })),
    ...rows.filter(x => !x.win).sort((a, b) => (b.lead ?? fc(b) / 4) - (a.lead ?? fc(a) / 4)).map(x => ({
      fill: x.lead == null ? 'var(--o-grid)' : pale(x.lead >= 0 ? DEM : REP, 45),
      title: `${STATE_NAME[x.st]}: ${x.lead == null ? `no votes yet · forecast ${x.m ? fmtMargin(x.m.margin) : '–'}` : `${fmtMargin(x.lead)}, ${Math.round(x.r!.reporting)}% in`}`,
    })),
    ...rows.filter(x => x.win === 'R').map(x => ({ fill: REP, hatch: x.flip, title: `${STATE_NAME[x.st]}: ${x.r?.winnerName} (R)${x.flip ? ', flip' : ''}` })),
    ...Array.from({ length: notUp.R }, () => ({ fill: pale(REP, 22), title: 'Republican seat not up this year' })),
  ];
  const mapCells: Record<string, StateCell> = {};
  for (const x of rows) {
    const p24 = c24?.states[FIPS_ST[x.st]]?.[0];
    const v = mode === 'forecast' ? (x.m ? x.m.margin : null)
      : mode === 'vsf' ? (x.lead != null && x.m ? x.lead - x.m.margin : null)
      : mode === 'shift' ? (x.lead != null && p24 != null ? x.lead - p24 : null)
      : x.lead;
    const fill = mode === 'results' && x.win ? colorOf(x.win) : marginFill(v, mode === 'results' ? 30 : mode === 'forecast' ? 20 : 12);
    mapCells[x.st] = {
      fill, stroke: x.flip ? 'var(--o-ink)' : undefined,
      tip: <>
        {x.m && <div>{x.m.dem} (D) vs {x.m.gop} (R)</div>}
        {x.r && x.r.reporting > 0 && x.r.cands.slice(0, 2).map(c => <div key={c.name}>{c.winner ? '✓ ' : ''}{c.name} {c.pct.toFixed(1)}%</div>)}
        <div className="k">{x.status.text}{x.m ? ` · forecast ${fmtMargin(x.m.margin)}` : ''}{mode === 'shift' && p24 != null ? ` · 2024 ${fmtMargin(p24)}` : ''}</div>
      </>,
    };
  }
  for (const [st, p] of Object.entries(office === 'governor' ? GOV_NOT_UP : {})) mapCells[st] = { fill: pale(colorOf(p), 15), tip: <div className="k">Not up this year · {p} governor</div> };
  const sorted = [...rows].sort(sort === 'close' ? sortByClose : sort === 'tight'
    ? (a, b) => Math.abs(a.lead ?? fc(a)) - Math.abs(b.lead ?? fc(b))
    : (a, b) => (b.r?.reporting ?? 0) - (a.r?.reporting ?? 0));
  const name = office === 'senate' ? 'Senate' : 'governors';
  return (
    <>
      <section className="ocard">
        <div className="lab">{office === 'senate' ? `Senate · ${majority} for control, the Vice President breaks a 50–50 tie for the Republicans` : `Governors · ${majority} for a majority`}</div>
        <Kpis items={[
          [notUp.D + won.D, `Democratic ${office === 'senate' ? 'seats' : 'governors'} in hand`, DEM],
          [ahead.D, 'Democrats ahead, counting', DEM],
          [rows.length - won.D - won.R, 'To call'],
          [ahead.R, 'Republicans ahead, counting', REP],
          [notUp.R + won.R, `Republican ${office === 'senate' ? 'seats' : 'governors'} in hand`, REP],
        ]} />
        <SeatRow cells={cells} majority={majority} label={`${name} seats`} />
        <p className="dek" style={{ marginTop: 6 }}>Pale tiles at the ends: {office === 'senate' ? 'seats' : 'governors'} not on the ballot. Solid: called races, in the order of the margin; hatched: a seat that changes party. Light tint: still counting, by who is ahead; grey: no votes yet. {gains.D || gains.R ? `Flips so far: ${gains.D} Democratic, ${gains.R} Republican.` : 'No seat has changed party yet.'}</p>
      </section>

      <section className="ocard">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ marginRight: 'auto' }}>The {name} map</h2>
          <Chips label="Map view" value={mode} set={setMode} items={[{ k: 'results', label: 'Results' }, { k: 'forecast', label: 'Forecast' }, { k: 'vsf', label: 'vs forecast' }, { k: 'shift', label: 'Shift vs 2024' }]} />
        </div>
        <p className="dek">{mode === 'results' ? 'Solid: called; tint: the leader so far, deeper the wider the lead; outlined: a flip.' : mode === 'forecast' ? "The pre-election forecast's margin (On Point Politics model)." : mode === 'vsf' ? 'How the count so far compares with the forecast: blue, better for the Democrats than expected; red, better for the Republicans.' : "The margin counted so far against Harris–Trump 2024 in the same state: blue, a shift toward the Democrats."} Click a state for its counties and every race on its ballot.</p>
        <UsMap cells={mapCells} onPick={st => goState(st, rows.find(x => x.st === st)?.r?.id)} />
      </section>

      <section className="ocard">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ marginRight: 'auto' }}>Every {office === 'senate' ? 'Senate' : "governor's"} race</h2>
          <Chips label="Order" value={sort} set={setSort} items={[{ k: 'close', label: 'Poll closing' }, { k: 'tight', label: 'Closest' }, { k: 'counted', label: 'Most counted' }]} />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="otable">
            <thead><tr><th>Race</th><th>Held</th><th className="n">Forecast</th><th style={{ minWidth: 160 }}>Count</th><th className="n">Margin</th><th className="n">vs fcst</th><th>Status</th></tr></thead>
            <tbody>{sorted.map(x => (
              <tr key={x.st} onClick={() => goState(x.st, x.r?.id)} style={{ cursor: 'pointer' }}>
                <td><b>{STATE_NAME[x.st]}</b>{x.m && /special/i.test(x.m.name) ? <small style={ink3}> special</small> : null}<br /><small style={ink3}>{x.m ? `${x.m.dem} vs ${x.m.gop}` : x.r?.cands.slice(0, 2).map(c => c.name).join(' vs ')}</small></td>
                <td><i className="cy-dot" style={{ background: colorOf(x.held) }} />{x.m?.incParty ? 'Inc.' : 'Open'}</td>
                <td className="n">{x.m ? <><b style={{ color: x.m.margin >= 0 ? DEM : REP }}>{fmtMargin(x.m.margin)}</b><br /><small style={ink3}>{pct(x.m.pDem)} D</small></> : '–'}</td>
                <td>{x.r && x.r.reporting > 0 ? <><LeadBar r={x.r} /><small style={ink3}>{Math.round(x.r.reporting)}% in</small></> : <small style={ink3}>—</small>}</td>
                <td className="n"><Score>{x.lead == null ? '–' : <b style={{ color: x.lead >= 0 ? DEM : REP }}>{fmtMargin(x.lead)}</b>}</Score></td>
                <td className="n"><Score>{x.lead != null && x.m ? <span style={{ color: x.lead - x.m.margin >= 0 ? DEM : REP }}>{sgn(x.lead - x.m.margin)}</span> : '–'}</Score></td>
                <td style={{ fontSize: 12 }}><Score>{x.flip ? <b style={{ color: colorOf(x.win) }}>FLIP · </b> : null}{x.status.text}</Score></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <Src>Forecast: On Point Politics · count and calls: civicAPI{live ? `, refreshed every minute (last ${hhmm(live.fetched)})` : ''} · "Held": the party holding the seat before the vote</Src>
      </section>
    </>
  );
}

// ---------- House ----------

export function HouseScreen({ e, live, now }: { e: ElectionData; live?: LiveData; now: number }) {
  const goState = useGoState();
  const model = useMemo(() => new Map((e.model?.races ?? []).filter(m => m.office === 'house').map(m => [`${m.st}-${m.district ?? 0}`, m])), [e]);
  const seats = (live?.house ?? []).map(r => {
    const m = model.get(`${r.st}-${r.district ?? 0}`);
    const inc = r.cands.find(c => c.inc);
    const held = side(inc?.party) ?? m?.incParty ?? null;
    const lead = r.reporting > 0 ? demLead(r) : null;
    const win = side(r.winner);
    return { r, m, inc, held, lead, win, flip: Boolean(win && held && win !== held) };
  });
  const won = { D: seats.filter(x => x.win === 'D').length, R: seats.filter(x => x.win === 'R').length };
  const ahead = { D: seats.filter(x => !x.win && x.lead != null && x.lead > 0).length, R: seats.filter(x => !x.win && x.lead != null && x.lead < 0).length };
  const flips = seats.filter(x => x.flip);
  const order = (x: typeof seats[number]) => (x.win === 'D' ? 1000 + (x.lead ?? 0) : x.win === 'R' ? -1000 + (x.lead ?? 0) : x.lead ?? (x.m?.margin ?? 0) / 4);
  const tiles = [...seats].sort((a, b) => order(b) - order(a));
  const byState = Object.entries(seats.reduce<Record<string, typeof seats>>((acc, x) => { (acc[x.r.st] ??= []).push(x); return acc; }, {})).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const close = seats.filter(x => !x.win && x.lead != null).sort((a, b) => Math.abs(a.lead!) - Math.abs(b.lead!)).slice(0, 25);
  const trailing = seats.filter(x => x.inc && x.r.reporting > 0 && x.r.cands[0]?.name !== x.inc.name);
  const watch = [...model.values()].sort((a, b) => Math.abs(a.margin) - Math.abs(b.margin)).slice(0, 40);
  const liveOf = (m: ModelRace) => seats.find(x => x.r.st === m.st && (x.r.district ?? 0) === (m.district ?? 0));
  const label = (st: string, d: number | null) => `${st}-${d ? String(d).padStart(2, '0') : 'AL'}`;
  return (
    <>
      <section className="ocard">
        <div className="lab">House · {HOUSE_MAJORITY} of {HOUSE_SEATS} for control · every seat on the ballot</div>
        <Kpis items={[[won.D, 'Democratic seats called', DEM], [ahead.D, 'Democrats ahead', DEM], [HOUSE_SEATS - won.D - won.R, 'To call'], [ahead.R, 'Republicans ahead', REP], [won.R, 'Republican seats called', REP]]} />
        {seats.length ? (
          <div style={{ display: 'grid', gridTemplateRows: 'repeat(15, 10px)', gridAutoFlow: 'column', gridAutoColumns: '10px', gap: 2, overflowX: 'auto', margin: '10px 0' }}>
            {tiles.map(x => <i key={x.r.id} title={`${label(x.r.st, x.r.district)}: ${x.r.winnerName ? `${x.r.winnerName} (${x.win})${x.flip ? ', flip' : ''}` : x.lead != null ? `${x.r.cands[0]?.name} leads ${fmtMargin(x.lead)}, ${Math.round(x.r.reporting)}% in` : 'no votes yet'}`}
              onClick={() => goState(x.r.st, x.r.id)}
              style={{ cursor: 'pointer', borderRadius: 2, background: x.win ? colorOf(x.win) : x.lead != null ? pale(x.lead >= 0 ? DEM : REP, 40) : 'var(--o-grid)', backgroundImage: x.flip ? HATCH : undefined }} />)}
          </div>
        ) : <p className="dek">The seat-by-seat count starts when the first polls close, at {hhmm(Date.parse('2026-11-03T18:00:00-05:00'))} Rome time.</p>}
        <p className="dek">Each square is a seat, from the Democratic wins on the left to the Republican ones on the right: solid, called; tint, ahead in the count; grey, no votes yet; hatched, a flip. Click a seat for its state. {flips.length ? `${flips.filter(x => x.win === 'D').length} Democratic and ${flips.filter(x => x.win === 'R').length} Republican gains so far.` : ''}</p>
        <Src>civicAPI · a seat is a flip when its winner beats the sitting member's party (open seats: the party in the forecast, where known; maps redrawn in 2025–26 make some of these approximate)</Src>
      </section>

      <section className="s-two">
        <div className="ocard">
          <h2>Closest races still counting</h2>
          {close.length ? <table className="otable"><tbody>{close.map(x => (
            <tr key={x.r.id} onClick={() => goState(x.r.st, x.r.id)} style={{ cursor: 'pointer' }}>
              <td><b>{label(x.r.st, x.r.district)}</b><br /><small style={ink3}>{x.r.cands.slice(0, 2).map(c => c.name).join(' vs ')}</small></td>
              <td style={{ minWidth: 110 }}><LeadBar r={x.r} /></td>
              <td className="n"><Score><b style={{ color: x.lead! >= 0 ? DEM : REP }}>{fmtMargin(x.lead!)}</b><br /><small style={ink3}>{Math.round(x.r.reporting)}% in</small></Score></td>
            </tr>))}</tbody></table> : <p className="dek">No close race being counted right now.</p>}
        </div>
        <div style={{ display: 'grid', gap: 18, minWidth: 0, alignContent: 'start' }}>
          <div className="ocard">
            <h2>Seats that changed party</h2>
            {flips.length ? <div className="olist">{flips.map(x => <div key={x.r.id} className="r" style={{ gridTemplateColumns: '70px 1fr auto' }}><time>{label(x.r.st, x.r.district)}</time><div><b>{x.r.winnerName}</b><small>gain from the {x.held === 'D' ? 'Democrats' : 'Republicans'}</small></div><span className="x" style={{ color: colorOf(x.win) }}>{x.win} gain</span></div>)}</div> : <p className="dek">None so far.</p>}
          </div>
          <div className="ocard">
            <h2>Incumbents trailing</h2>
            {trailing.length ? <div className="olist">{trailing.map(x => <div key={x.r.id} className="r" style={{ gridTemplateColumns: '70px 1fr auto' }}><time>{label(x.r.st, x.r.district)}</time><div><b>{x.inc!.name}</b><small>behind {x.r.cands[0]?.name} · {Math.round(x.r.reporting)}% in</small></div><span className="x" style={{ color: colorOf(x.inc!.party) }}>{x.r.winner ? 'lost' : 'trailing'}</span></div>)}</div> : <p className="dek">Every sitting member running is ahead or not yet counted.</p>}
          </div>
        </div>
      </section>

      <section className="s-two">
        <div className="ocard">
          <h2>State by state</h2>
          <div style={{ maxHeight: 560, overflowY: 'auto' }}>
            <table className="otable">
              <thead><tr><th>State</th><th className="n">Seats</th><th className="n">D won</th><th className="n">D ahead</th><th className="n">R ahead</th><th className="n">R won</th></tr></thead>
              <tbody>{byState.map(([st, xs]) => (
                <tr key={st} onClick={() => goState(st)} style={{ cursor: 'pointer' }}>
                  <td>{STATE_NAME[st]}</td><td className="n">{xs.length}</td>
                  <td className="n" style={{ color: DEM }}><Score>{xs.filter(x => x.win === 'D').length || ''}</Score></td>
                  <td className="n" style={{ color: DEM, opacity: 0.7 }}><Score>{xs.filter(x => !x.win && (x.lead ?? 0) > 0).length || ''}</Score></td>
                  <td className="n" style={{ color: REP, opacity: 0.7 }}><Score>{xs.filter(x => !x.win && (x.lead ?? 0) < 0).length || ''}</Score></td>
                  <td className="n" style={{ color: REP }}><Score>{xs.filter(x => x.win === 'R').length || ''}</Score></td>
                </tr>))}</tbody>
            </table>
          </div>
        </div>
        <div className="ocard">
          <h2>The forecast's 40 closest seats</h2>
          <p className="dek">The districts the model saw nearest to a tie, with the count next to its margin.</p>
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            <table className="otable">
              <thead><tr><th>Seat</th><th className="n">Forecast</th><th className="n">Count</th><th className="n">vs fcst</th></tr></thead>
              <tbody>{watch.map(m => { const x = liveOf(m); return (
                <tr key={m.id} onClick={() => goState(m.st, x?.r.id)} style={{ cursor: 'pointer' }}>
                  <td><b>{label(m.st, m.district)}</b> <small style={ink3}>{m.incParty ? `${m.incParty} held` : 'open'}</small><br /><small style={ink3}>{m.dem} vs {m.gop}</small></td>
                  <td className="n" style={{ color: m.margin >= 0 ? DEM : REP }}>{fmtMargin(m.margin)}<br /><small style={ink3}>{ratingOf(m.margin).label}</small></td>
                  <td className="n"><Score>{x?.win ? <b style={{ color: colorOf(x.win) }}>✓ {x.win}{x.flip ? ' flip' : ''}</b> : x?.lead != null ? <span style={{ color: x.lead >= 0 ? DEM : REP }}>{fmtMargin(x.lead)}<br /><small style={ink3}>{Math.round(x.r.reporting)}% in</small></span> : '–'}</Score></td>
                  <td className="n"><Score>{x?.lead != null ? <span style={{ color: x.lead - m.margin >= 0 ? DEM : REP }}>{sgn(x.lead - m.margin)}</span> : '–'}</Score></td>
                </tr>); })}</tbody>
            </table>
          </div>
          <Src>Forecast: On Point Politics · count: civicAPI</Src>
        </div>
      </section>
      {!live && <section className="ocard"><p className="dek">The count arrives from {hhmm(Date.parse('2026-11-03T18:00:00-05:00'))} Rome time on election night.{now < Date.parse('2026-11-04T00:00:00+01:00') ? ` In ${countdown(Date.parse('2026-11-04T00:00:00+01:00') - now)}.` : ''}</p></section>}
    </>
  );
}

// ---------- one state ----------

export function StatesScreen({ e, live, now }: { e: ElectionData; live?: LiveData; now: number }) {
  const [params, setParams] = useSearchParams();
  const st = params.get('st');
  const set = (k: string, v: string | null) => setParams(p => { if (v == null) p.delete(k); else p.set(k, v); if (k === 'st') p.delete('race'); return p; }, { replace: true });
  if (!st || !STATE_NAME[st]) return <StatePicker e={e} live={live} now={now} pick={s => set('st', s)} />;
  return <StatePage key={st} st={st} e={e} live={live} now={now} race={params.get('race')} setRace={id => set('race', id)} setSt={s => set('st', s)} />;
}

function StatePicker({ e, live, now, pick }: { e: ElectionData; live?: LiveData; now: number; pick: (st: string) => void }) {
  const states = Object.keys(STATE_NAME).filter(s => s !== 'DC').sort((a, b) => STATE_NAME[a].localeCompare(STATE_NAME[b]));
  return (
    <section className="ocard">
      <h2>Pick a state</h2>
      <p className="dek">Every state elects its House seats; S marks a Senate race, G a governor's race. The dot is who leads the top race of the night there.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
        {states.map(st => {
          const top = live?.senate.find(r => r.st === st) ?? live?.governor.find(r => r.st === st);
          const lead = top && top.reporting > 0 ? (top.winner ?? top.cands[0]?.party) : null;
          const close = pollsClose(st);
          const m = (e.model?.races ?? []).filter(x => x.st === st && x.office !== 'house');
          return (
            <button key={st} className="btn" onClick={() => pick(st)} style={{ textAlign: 'left', textTransform: 'none', letterSpacing: 0, color: 'var(--o-ink)', borderColor: 'var(--o-line)', background: 'transparent', padding: '6px 8px', display: 'grid', gap: 2 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}><b>{STATE_NAME[st]}</b><small style={ink3}>{SENATE_HELD[st] ? 'S' : ''}{GOV_HELD[st] ? ' G' : ''}</small></span>
              <small style={ink3}>{lead ? <><i className="cy-dot" style={{ background: colorOf(lead) }} />{top?.winner ? 'called' : `${Math.round(top!.reporting)}% in`}</> : close ? (now >= close ? 'polls closed' : `closes ${hhmm(close)}`) : ''}{m.length ? ` · ${m.map(x => fmtMargin(x.margin)).join(', ')}` : ''}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

const GROUPS: { k: string; label: string; test: (r: LiveRace) => boolean }[] = [
  { k: 'fed', label: 'Congress', test: r => r.office === 'senate' || r.office === 'house' },
  { k: 'state', label: 'State offices', test: r => r.office === 'governor' || (r.office === 'other' && !/^State (House|Senate)$/.test(r.kind ?? '')) },
  { k: 'leg', label: 'Legislature', test: r => /^State (House|Senate)$/.test(r.kind ?? '') },
  { k: 'measure', label: 'Ballot measures', test: r => r.office === 'measure' },
];

function StatePage({ st, e, live, now, race, setRace, setSt }: { st: string; e: ElectionData; live?: LiveData; now: number; race: string | null; setRace: (id: string | null) => void; setSt: (st: string) => void }) {
  const [races, setRaces] = useState<LiveRace[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let on = true;
    const load = () => stateRaces(st).then(v => { if (on) { setRaces(v); setErr(false); } }).catch(() => on && setErr(true));
    load();
    const t = setInterval(load, 60e3);
    return () => { on = false; clearInterval(t); };
  }, [st]);
  const c24 = use2024();
  // The national feed refreshes the big races every minute; prefer it when it is newer
  const all = (races ?? []).map(r => [...(live?.senate ?? []), ...(live?.governor ?? []), ...(live?.house ?? [])].find(x => x.id === r.id) ?? r)
    .sort((a, b) => ['senate', 'governor', 'house', 'other', 'measure'].indexOf(a.office) - ['senate', 'governor', 'house', 'other', 'measure'].indexOf(b.office) || (a.district ?? 0) - (b.district ?? 0) || a.name.localeCompare(b.name, 'en', { numeric: true }));
  const picked = all.find(r => String(r.id) === race) ?? all.find(r => r.office === 'senate') ?? all.find(r => r.office === 'governor') ?? all[0];
  const close = pollsClose(st);
  const p24 = c24?.states[FIPS_ST[st]];
  const house = all.filter(r => r.office === 'house');
  return (
    <>
      <section className="ocard">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ marginRight: 'auto', fontSize: 26 }}>{STATE_NAME[st]}</h2>
          <select value={st} onChange={ev => setSt(ev.target.value)} aria-label="State" style={{ font: 'inherit', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--o-line)', background: 'var(--o-card)', color: 'var(--o-ink)' }}>
            {Object.keys(STATE_NAME).filter(s => s !== 'DC').sort((a, b) => STATE_NAME[a].localeCompare(STATE_NAME[b])).map(s => <option key={s} value={s}>{STATE_NAME[s]}</option>)}
          </select>
        </div>
        <Kpis items={[
          [close ? (now >= close ? 'Closed' : hhmm(close)) : '–', close && now < close ? `Last polls close, Rome time · in ${countdown(close - now)}` : 'Polls'],
          [p24 ? fmtMargin(p24[0]) : '–', 'Harris–Trump 2024', p24 ? (p24[0] >= 0 ? DEM : REP) : undefined],
          [p24 ? `${(p24[1] / 1e6).toFixed(1)}M` : '–', 'Votes cast in 2024'],
          [house.length || '–', 'House seats'],
        ]} />
        {err && !races && <p className="dek">civicAPI is not answering right now; trying again every minute.</p>}
        {!races && !err && <p className="dek">Loading the races…</p>}
        {GROUPS.map(g => { const xs = all.filter(g.test); return xs.length ? (
          <div key={g.k} style={{ marginTop: 10 }}>
            <div className="lab">{g.label}</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {xs.map(r => { const lp = r.reporting > 0 ? (r.winner ?? r.cands[0]?.party) : null; return (
                <button key={r.id} className="btn" aria-pressed={picked?.id === r.id} onClick={() => setRace(String(r.id))} style={{ color: 'var(--o-ink)', background: picked?.id === r.id ? 'var(--o-accent-soft)' : 'transparent', borderColor: picked?.id === r.id ? 'var(--o-accent)' : 'var(--o-line)', fontSize: 11.5, padding: '3px 8px', textTransform: 'none', letterSpacing: 0 }}>
                  {lp && <i className="cy-dot" style={{ background: colorOf(lp), opacity: r.winner ? 1 : 0.5 }} />}{shortName(r, st)}{r.winner ? ' ✓' : ''}
                </button>); })}
            </div>
          </div>) : null; })}
      </section>
      {picked && <RacePanel key={picked.id} r={picked} e={e} live={live} now={now} c24={c24} />}
      {house.length > 1 && (
        <section className="ocard">
          <h2>{STATE_NAME[st]}'s House seats</h2>
          <table className="otable">
            <thead><tr><th>Seat</th><th>Candidates</th><th style={{ minWidth: 140 }}>Count</th><th className="n">Margin</th><th className="n">Forecast</th></tr></thead>
            <tbody>{house.map(r => { const m = e.model?.races.find(x => x.office === 'house' && x.st === st && (x.district ?? 0) === (r.district ?? 0)); const l = r.reporting > 0 ? demLead(r) : null; return (
              <tr key={r.id} onClick={() => setRace(String(r.id))} style={{ cursor: 'pointer' }}>
                <td><b>{st}-{r.district ? String(r.district).padStart(2, '0') : 'AL'}</b></td>
                <td style={{ fontSize: 12 }}>{r.cands.slice(0, 2).map(c => <div key={c.name}><i className="cy-dot" style={{ background: colorOf(c.party) }} />{c.winner ? '✓ ' : ''}{c.name}{c.inc ? <small style={ink3}> inc.</small> : null}</div>)}</td>
                <td>{l != null ? <><LeadBar r={r} /><small style={ink3}>{Math.round(r.reporting)}% in</small></> : <small style={ink3}>—</small>}</td>
                <td className="n"><Score>{l != null ? <b style={{ color: l >= 0 ? DEM : REP }}>{fmtMargin(l)}</b> : '–'}</Score></td>
                <td className="n">{m ? <span style={{ color: m.margin >= 0 ? DEM : REP }}>{fmtMargin(m.margin)}</span> : <small style={ink3}>safe</small>}</td>
              </tr>); })}</tbody>
          </table>
        </section>
      )}
    </>
  );
}

const shortName = (r: LiveRace, st: string) => r.office === 'house' ? `${st}-${r.district ? String(r.district).padStart(2, '0') : 'AL'}` : r.name.replace(new RegExp(`^${STATE_NAME[st]} `), '').replace(/^US /, 'U.S. ');

type CMode = 'margin' | 'shift' | 'reporting' | 'winner';

function RacePanel({ r, e, live, now, c24 }: { r: LiveRace; e: ElectionData; live?: LiveData; now: number; c24: County24 | null }) {
  const [counties, setCounties] = useState<Record<string, CountyResult> | null>(null);
  const [updated, setUpdated] = useState<string | null>(null);
  const [mode, setMode] = useState<CMode>('margin');
  const [sort, setSort] = useState<'votes' | 'margin' | 'shift' | 'reporting'>('votes');
  useEffect(() => {
    let on = true;
    const load = () => raceDetail(r.id).then(d => { if (on) { setCounties(d.counties); setUpdated(d.updated); } }).catch(() => on && setCounties(c => c ?? {}));
    load();
    const t = setInterval(load, 60e3);
    return () => { on = false; clearInterval(t); };
  }, [r.id]);
  const m = e.model?.races.find(x => x.office === r.office && x.st === r.st && (r.office !== 'house' || (x.district ?? 0) === (r.district ?? 0)));
  const raters = r.office === 'senate' ? e.ratings?.senate[r.st] : r.office === 'governor' ? e.ratings?.governor[r.st] : undefined;
  const official = r.office === 'senate' ? live?.official.senate[r.st] : r.office === 'governor' ? live?.official.governor[r.st] : undefined;
  const isMeasure = r.office === 'measure';
  const total = r.cands.reduce((s, c) => s + c.votes, 0);
  const lead = r.reporting > 0 ? demLead(r) : null;
  const [a, b] = r.cands;
  const st = statusOf(r, r.st, now);
  const held = r.office === 'senate' ? SENATE_HELD[r.st] : r.office === 'governor' ? GOV_HELD[r.st] : side(r.cands.find(c => c.inc)?.party) ?? m?.incParty ?? null;
  // Counties joined with 2024 by FIPS (civicAPI gives it; names as a fallback for the map's own FIPS)
  const rows = useMemo(() => Object.values(counties ?? {}).map(c => {
    const l = c.reporting > 0 || c.cands.some(x => x.votes > 0) ? (isMeasure ? yesLead(c.cands) : demLead(c)) : null;
    const was = c.fips ? c24?.counties[c.fips.padStart(5, '0')] : undefined;
    const votes = c.cands.reduce((s, x) => s + x.votes, 0);
    const top = [...c.cands].sort((p, q) => q.votes - p.votes);
    return { ...c, lead: l, was: was?.[0] ?? null, votes24: was?.[1] ?? null, shift: l != null && was && !isMeasure ? l - was[0] : null, votes, net: top.length > 1 ? top[0].votes - top[1].votes : 0, leader: top[0]?.votes ? top[0] : null };
  }), [counties, c24, isMeasure]);
  const byFips = useMemo(() => new Map(rows.filter(x => x.fips).map(x => [x.fips!.padStart(5, '0'), x])), [rows]);
  const byName = useMemo(() => new Map(rows.map(x => [norm(x.name), x])), [rows]);
  const find = (fips: string, name: string) => byFips.get(fips) ?? byName.get(norm(name));
  const counted = rows.filter(x => x.lead != null);
  const flipped = counted.filter(x => x.was != null && Math.sign(x.lead!) !== Math.sign(x.was) && Math.abs(x.lead!) > 0.05);
  const closest = [...counted].sort((p, q) => Math.abs(p.lead!) - Math.abs(q.lead!))[0];
  const shifts = counted.filter(x => x.shift != null).sort((p, q) => q.shift! - p.shift!);
  const banks = [...counted].sort((p, q) => q.votes - p.votes).slice(0, 5);
  const countyVotes = counted.reduce((s, x) => s + x.votes, 0);
  const share5 = countyVotes ? banks.reduce((s, x) => s + x.votes, 0) / countyVotes : 0;
  const history = r.office === 'senate' || r.office === 'governor' ? nightLog().races[r.id] ?? [] : [];
  const sortedRows = [...rows].sort((p, q) => sort === 'votes' ? q.votes - p.votes : sort === 'margin' ? Math.abs(p.lead ?? 999) - Math.abs(q.lead ?? 999) : sort === 'shift' ? (q.shift ?? -999) - (p.shift ?? -999) : q.reporting - p.reporting);
  const fill = (fips: string, name: string) => {
    const x = find(fips, name);
    if (!x || x.lead == null) return 'var(--o-grid)';
    if (mode === 'winner') return x.leader ? colorOf(isMeasure ? (/^yes/i.test(x.leader.name) ? 'D' : 'R') : x.leader.party) : 'var(--o-grid)';
    if (mode === 'reporting') return `color-mix(in srgb, var(--o-s4) ${Math.round(15 + Math.min(100, x.reporting) * 0.8)}%, var(--o-card))`;
    if (mode === 'shift') return x.shift == null ? 'var(--o-grid)' : marginFill(x.shift, 15);
    return marginFill(x.lead, 40);
  };
  const tip = (fips: string, name: string) => {
    const x = find(fips, name);
    if (!x) return <div>No results yet</div>;
    return <>{x.cands.slice(0, 3).map(c => <div key={c.name}>{c.name} {c.pct.toFixed(1)}% · {c.votes.toLocaleString('en-US')}</div>)}<div className="k">{Math.round(x.reporting)}% in{x.was != null ? ` · 2024 ${fmtMargin(x.was)}` : ''}{x.shift != null ? ` · shift ${sgn(x.shift)}` : ''}</div></>;
  };
  const runoff = r.st === 'GA' && (r.office === 'senate' || r.office === 'governor');
  const rcv = r.st === 'ME' || r.st === 'AK';
  return (
    <>
      <section className="ocard">
        <div className="lab">{OFFICE_NAME[r.office]}{r.kind && r.office === 'other' ? ` · ${r.kind}` : ''} · {held ? `${held === 'D' ? 'Democratic' : 'Republican'} seat` : 'civicAPI'}</div>
        <h2 style={{ marginTop: 0 }}>{r.name.replace(/^(.*) US /, '$1 U.S. ')}</h2>
        <div className="s-two" style={{ gap: 24 }}>
          <div style={{ minWidth: 0 }}>
            {r.cands.slice(0, 6).map(c => (
              <div key={c.name} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 4, marginBottom: 10 }}>
                <div><b style={{ fontSize: 16 }}>{c.winner ? '✓ ' : ''}{c.name}</b> <small style={ink3}>{isMeasure ? '' : { D: 'Democrat', R: 'Republican', I: 'Independent', O: 'Other' }[c.party]}{c.inc ? ' · incumbent' : ''}</small></div>
                <Score><b style={{ fontSize: 18 }}>{r.reporting > 0 || c.votes ? `${c.pct.toFixed(1)}%` : ''}</b></Score>
                <div style={{ gridColumn: '1 / -1', height: 10, borderRadius: 3, background: 'var(--o-grid)', overflow: 'hidden' }}><div style={{ width: `${c.pct}%`, height: '100%', background: isMeasure ? (/^yes/i.test(c.name) ? 'var(--o-s3)' : 'var(--o-other)') : colorOf(c.party) }} /></div>
                <small style={{ ...ink3, gridColumn: '1 / -1' }}><Score>{c.votes ? `${c.votes.toLocaleString('en-US')} votes` : ''}</Score></small>
              </div>
            ))}
            <div style={{ fontSize: 13 }}><Score><b>{st.text}</b>{total ? ` · ${total.toLocaleString('en-US')} votes counted` : ''}{a && b && a.votes ? ` · lead ${(a.votes - b.votes).toLocaleString('en-US')} votes` : ''}</Score></div>
            {runoff && <p className="dek" style={{ marginTop: 6 }}>Georgia needs 50% plus one: below it, the top two meet again in a runoff on 1 December.{a && r.reporting > 0 ? <Score> {a.name} is at {a.pct.toFixed(1)}%.</Score> : null}</p>}
            {rcv && r.office !== 'measure' && <p className="dek" style={{ marginTop: 6 }}>{STATE_NAME[r.st]} counts ranked choices: if no one passes 50%, the last-placed candidates are eliminated and their voters' next choices counted, usually days later.</p>}
          </div>
          <div style={{ minWidth: 0 }}>
            {m && (<>
              <div className="lab">Before the vote</div>
              <Kpis items={[[fmtMargin(m.margin), 'Forecast margin', m.margin >= 0 ? DEM : REP], [pct(m.pDem), 'Democratic chance'], [m.poll == null ? '–' : fmtMargin(m.poll), `Polls (${m.polls})`]]} />
              {lead != null && <p className="dek" style={{ marginTop: 6 }}><Score>The count so far: {fmtMargin(lead)}, {sgn(lead - m.margin)} against the forecast, with {Math.round(r.reporting)}% in.</Score></p>}
            </>)}
            {raters && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>{Object.entries(e.ratings?.names ?? {}).map(([k, n]) => <span key={k} style={{ fontSize: 12 }}>{n}: <Chip label={raters[k]} /></span>)}</div>}
            {official && (<>
              <div className="lab" style={{ marginTop: 12 }}>Official state count · Open America · {Math.round(official.pctIn)}% in</div>
              <table className="otable"><tbody>{official.cands.slice(0, 4).map(c => <tr key={c.n}><td>{c.n} <small style={ink3}>{c.p}</small></td><td className="n"><Score>{c.v.toLocaleString('en-US')}</Score></td><td className="n"><Score>{c.pct.toFixed(1)}%</Score></td></tr>)}</tbody></table>
            </>)}
            {history.length > 1 && (<><div className="lab" style={{ marginTop: 12 }}>The margin through the night</div><MarginLine pts={history} /></>)}
          </div>
        </div>
        <Src>civicAPI{updated ? ` · count last moved ${hhmm(Date.parse(updated))}` : ''} · refreshed every minute{m ? ' · forecast: On Point Politics' : ''}</Src>
      </section>

      <section className="ocard">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ marginRight: 'auto' }}>County by county</h2>
          <Chips label="County map" value={mode} set={setMode} items={[{ k: 'margin', label: 'Margin' }, { k: 'winner', label: 'Leader' }, ...(isMeasure ? [] : [{ k: 'shift' as CMode, label: 'Shift vs 2024' }]), { k: 'reporting', label: 'Counted' }]} />
        </div>
        <p className="dek">{mode === 'margin' ? (isMeasure ? 'Green-blue: Yes ahead; red: No ahead; deeper, a wider lead.' : 'The leader in each county, deeper the wider the lead.') : mode === 'winner' ? 'Who leads each county.' : mode === 'shift' ? 'Each county against Harris–Trump 2024: blue, it moved toward the Democrats; red, toward the Republicans.' : 'Share of the expected vote counted.'} Grey: no votes yet.</p>
        <div className="s-two" style={{ gap: 24 }}>
          <CountyChoropleth st={r.st} fill={fill} tip={tip} />
          <div style={{ minWidth: 0 }}>
            <Kpis items={[[`${counted.length}/${rows.length || '–'}`, 'Counties with votes'], [isMeasure ? '–' : flipped.length, 'Flipped since 2024'], [shifts.length ? sgn(median(shifts.map(x => x.shift!))) : '–', 'Median shift vs 2024']]} />
            {!isMeasure && shifts.length > 0 && (
              <div className="olist" style={{ marginTop: 10 }}>
                <div className="r" style={{ gridTemplateColumns: '1fr auto' }}><div><b>Biggest move to the Democrats</b><small>{shifts[0].name}: {fmtMargin(shifts[0].lead!)} against {fmtMargin(shifts[0].was!)} in 2024</small></div><span className="x" style={{ color: DEM }}>{sgn(shifts[0].shift!)}</span></div>
                <div className="r" style={{ gridTemplateColumns: '1fr auto' }}><div><b>Biggest move to the Republicans</b><small>{shifts[shifts.length - 1].name}: {fmtMargin(shifts[shifts.length - 1].lead!)} against {fmtMargin(shifts[shifts.length - 1].was!)}</small></div><span className="x" style={{ color: REP }}>{sgn(shifts[shifts.length - 1].shift!)}</span></div>
                {closest && <div className="r" style={{ gridTemplateColumns: '1fr auto' }}><div><b>Closest county</b><small>{closest.name}, {Math.round(closest.reporting)}% in</small></div><span className="x">{fmtMargin(closest.lead!)}</span></div>}
              </div>
            )}
            {flipped.length > 0 && <p className="dek" style={{ marginTop: 8 }}>Counties on the other side from 2024: {flipped.slice(0, 12).map(x => `${x.name} (${x.lead! >= 0 ? 'now D' : 'now R'})`).join(', ')}{flipped.length > 12 ? ` and ${flipped.length - 12} more` : ''}.</p>}
            {banks.length > 0 && (<>
              <div className="lab" style={{ marginTop: 12 }}>Where the votes are · the five biggest counties cast {Math.round(share5 * 100)}% so far</div>
              <table className="otable"><tbody>{banks.map(x => <tr key={x.name}><td>{x.name}</td><td className="n"><Score>{x.votes.toLocaleString('en-US')}</Score></td><td className="n"><Score><span style={{ color: colorOf(isMeasure ? (/^yes/i.test(x.leader?.name ?? '') ? 'D' : 'R') : x.leader?.party) }}>+{x.net.toLocaleString('en-US')}</span></Score></td><td className="n"><small style={ink3}>{x.votes24 ? `${Math.round((x.votes / x.votes24) * 100)}% of 2024` : ''}</small></td></tr>)}</tbody></table>
            </>)}
          </div>
        </div>
        {rows.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
              <div className="lab" style={{ marginRight: 'auto' }}>All {rows.length} counties</div>
              <Chips label="Sort counties" value={sort} set={setSort} items={[{ k: 'votes', label: 'Votes' }, { k: 'margin', label: 'Closest' }, ...(isMeasure ? [] : [{ k: 'shift' as const, label: 'Shift' }]), { k: 'reporting', label: 'Counted' }]} />
            </div>
            <div style={{ maxHeight: 460, overflowY: 'auto' }}>
              <table className="otable">
                <thead><tr><th>County</th><th className="n">Counted</th><th className="n">Votes</th><th className="n">Margin</th>{!isMeasure && <><th className="n">2024</th><th className="n">Shift</th></>}</tr></thead>
                <tbody>{sortedRows.map(x => (
                  <tr key={x.name}>
                    <td>{x.name}</td><td className="n">{Math.round(x.reporting)}%</td><td className="n"><Score>{x.votes.toLocaleString('en-US')}</Score></td>
                    <td className="n"><Score>{x.lead == null ? '–' : <b style={{ color: x.lead >= 0 ? (isMeasure ? 'var(--o-s3)' : DEM) : REP }}>{isMeasure ? `${x.lead >= 0 ? 'Yes' : 'No'} +${Math.abs(x.lead).toFixed(1)}` : fmtMargin(x.lead)}</b>}</Score></td>
                    {!isMeasure && <><td className="n" style={{ color: (x.was ?? 0) >= 0 ? DEM : REP }}>{x.was == null ? '–' : fmtMargin(x.was)}</td><td className="n"><Score>{x.shift == null ? '–' : <span style={{ color: x.shift >= 0 ? DEM : REP }}>{sgn(x.shift)}</span>}</Score></td></>}
                  </tr>))}</tbody>
              </table>
            </div>
          </>
        )}
        <Src>Counties: civicAPI · 2024: certified county results (tonmcg/US_County_Level_Election_Results) · shift = margin now minus Harris–Trump 2024, in points</Src>
      </section>
    </>
  );
}

const yesLead = (cands: { name: string; pct: number }[]) => { const y = cands.find(c => /^yes/i.test(c.name)), n = cands.find(c => /^no/i.test(c.name)); return y && n ? y.pct - n.pct : null; };
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

function Chip({ label }: { label?: string }) {
  const s = scoreOf(label);
  if (s == null || !label) return <span style={ink3}>—</span>;
  const c = s > 0 ? DEM : s < 0 ? REP : 'var(--o-ink3)';
  return <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 11, background: pale(c, s === 0 ? 18 : Math.round((Math.abs(s) / 3) * 70 + 10)), color: Math.abs(s) >= 2 ? '#fff' : 'var(--o-ink)' }}>{label.replace('Tossup', 'Toss-up')}</span>;
}

/** The Democratic lead as the count came in: margin against share counted. */
function MarginLine({ pts }: { pts: [number, number, number][] }) {
  const [ref, W] = useWidth<HTMLDivElement>(300);
  const H = 130, l = 34, rr = 8, t = 8, b = 18;
  const cap = Math.max(5, Math.ceil(Math.max(...pts.map(p => Math.abs(p[1]))) / 5) * 5);
  const t0 = pts[0][0], t1 = pts[pts.length - 1][0];
  const x = (ms: number) => l + ((ms - t0) / Math.max(1, t1 - t0)) * (W - l - rr);
  const y = (v: number) => t + ((cap - v) / (2 * cap)) * (H - t - b);
  const lastV = pts[pts.length - 1][1];
  return (
    <div ref={ref} className="ochart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Margin through the night">
        {[cap, 0, -cap].map(v => <g key={v}><line x1={l} x2={W - rr} y1={y(v)} y2={y(v)} stroke={v === 0 ? 'var(--o-ink3)' : 'var(--o-grid)'} strokeDasharray={v === 0 ? '3 3' : undefined} /><text x={l - 4} y={y(v) + 4} textAnchor="end">{v === 0 ? 'Even' : fmtMargin(v)}</text></g>)}
        <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0])},${y(p[1])}`).join(' ')} fill="none" stroke={lastV >= 0 ? DEM : REP} strokeWidth={2} />
        <text x={l} y={H - 3}>{hhmm(t0)}</text><text x={W - rr} y={H - 3} textAnchor="end">{hhmm(t1)} · {Math.round(pts[pts.length - 1][2])}% in</text>
      </svg>
    </div>
  );
}

// ---------- the night ----------

export function NightScreen({ e, live, now }: { e: ElectionData; live?: LiveData; now: number }) {
  const goState = useGoState();
  const [log, setLog] = useState<NightLog>(() => nightLog());
  useEffect(() => setLog(nightLog()), [live?.fetched]);
  const [kind, setKind] = useState<'all' | 'senate' | 'governor' | 'house'>('all');
  const [chamber, setChamber] = useState<'s' | 'h' | 'g'>('s');
  const model = (e.model?.races ?? []).filter(m => m.office !== 'house');
  const liveOf = (m: ModelRace) => live?.[m.office as 'senate' | 'governor']?.find(r => r.st === m.st);
  const slots = CLOSINGS.map(c => ({ c, t: Date.parse(`2026-11-0${c.nextDay ? 4 : 3}T${c.et}:00-05:00`) }));
  const next = slots.find(s => s.t > now);
  const byClose = new Map<number, ModelRace[]>();
  for (const m of model) { const t = pollsClose(m.st); if (t) byClose.set(t, [...(byClose.get(t) ?? []), m]); }
  const closeTimes = [...byClose.keys()].sort((a, b) => a - b);
  const calls = [...log.calls].filter(c => kind === 'all' || c.office === kind).sort((a, b) => b.t - a.t);
  const heldOf = (c: NightLog['calls'][number]) => c.office === 'senate' ? SENATE_HELD[c.st] : c.office === 'governor' ? GOV_HELD[c.st] : null;
  const watch = model.map(m => ({ m, r: liveOf(m) })).filter(x => x.r && !x.r.winner && x.r.reporting > 0).sort((a, b) => Math.abs(demLead(a.r!) ?? 0) - Math.abs(demLead(b.r!) ?? 0)).slice(0, 12);
  return (
    <>
      <section className="s-two">
        <div className="ocard">
          <div className="lab">Poll closings · Rome time</div>
          <h2 style={{ marginTop: 0 }}>{next ? <>Next: {hhmm(next.t)} <small style={ink3}>in {countdown(next.t - now)}</small></> : 'Every poll has closed'}</h2>
          <div style={{ display: 'grid', gap: 0 }}>
            {closeTimes.map(t => (
              <div key={t} style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 10, padding: '8px 0', borderTop: '1px solid var(--o-line)', opacity: t <= now ? 0.75 : 1 }}>
                <div><b>{hhmm(t)}</b><br /><small style={ink3}>{t <= now ? 'closed' : countdown(t - now)}</small></div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {byClose.get(t)!.sort((a, b) => a.st.localeCompare(b.st)).map(m => { const r = liveOf(m), l = r && r.reporting > 0 ? demLead(r) : null; return (
                    <button key={m.id} className="btn" onClick={() => goState(m.st, r?.id)} title={`${m.name}: forecast ${fmtMargin(m.margin)}`} style={{ textTransform: 'none', letterSpacing: 0, fontSize: 11.5, padding: '3px 8px', color: r?.winner ? '#fff' : 'var(--o-ink)', borderColor: 'var(--o-line)', background: r?.winner ? colorOf(side(r.winner)) : l != null ? pale(l >= 0 ? DEM : REP, 30) : 'transparent' }}>
                      {m.st} {m.office === 'senate' ? 'Sen' : 'Gov'}{r?.winner ? ' ✓' : l != null ? ` ${fmtMargin(l)}` : ''}
                    </button>); })}
                </div>
              </div>
            ))}
          </div>
          <Src>Senate and governor races at the hour their state's last polls close · tint: the leader in the count; solid: called</Src>
        </div>
        <div className="ocard">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ marginRight: 'auto' }}>Latest calls</h2>
            <Chips label="Calls" value={kind} set={setKind} items={[{ k: 'all', label: 'All' }, { k: 'senate', label: 'Senate' }, { k: 'governor', label: 'Governors' }, { k: 'house', label: 'House' }]} />
          </div>
          {calls.length ? (
            <div className="olist" style={{ maxHeight: 560, overflowY: 'auto' }}>
              {calls.slice(0, 120).map(c => { const h = heldOf(c), flip = h && side(c.winner) !== h; return (
                <div key={c.id} className="r" style={{ gridTemplateColumns: '54px 1fr auto', cursor: 'pointer' }} onClick={() => goState(c.st, c.id)}>
                  <time>{hhmm(c.t)}<small>{dayShort(c.t).split(' ')[0]}</small></time>
                  <div><b><Score>{c.name}</Score></b><small>{STATE_NAME[c.st]} {c.office === 'house' ? `House ${c.district || 'at-large'}` : OFFICE_NAME[c.office]}</small></div>
                  <span className="x" style={{ color: colorOf(c.winner), fontWeight: 600 }}><Score>{flip ? 'FLIP ' : ''}{c.winner}</Score></span>
                </div>); })}
            </div>
          ) : <p className="dek">No race called yet. The first polls close at {hhmm(Date.parse('2026-11-03T18:00:00-05:00'))} Rome time in Indiana and Kentucky; calls come once a race is clear, safe seats right at poll closing.</p>}
          <Src>Calls from civicAPI, timed by this app when it first saw them (it has to be open: calls made while it was closed get the time it next opened)</Src>
        </div>
      </section>

      <section className="s-two">
        <div className="ocard">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ marginRight: 'auto' }}>Seats called through the night</h2>
            <Chips label="Chamber" value={chamber} set={setChamber} items={[{ k: 's', label: 'Senate' }, { k: 'h', label: 'House' }, { k: 'g', label: 'Governors' }]} />
          </div>
          {log.seats.length > 1 ? <SeatSteps pts={log.seats.map(p => ({ t: p.t, d: p[chamber][0] + (chamber === 's' ? (e.model?.chambers.senate.notUp?.D ?? 34) : chamber === 'g' ? 6 : 0), r: p[chamber][1] + (chamber === 's' ? (e.model?.chambers.senate.notUp?.R ?? 31) : chamber === 'g' ? 8 : 0) }))} majority={chamber === 's' ? 51 : chamber === 'h' ? HOUSE_MAJORITY : 26} />
            : <p className="dek">The chart fills in as the calls arrive.</p>}
          <Src>{chamber === 'h' ? 'Called House seats' : 'Seats in hand, counting those not up this year'} · noted by this app every minute</Src>
        </div>
        <div className="ocard">
          <h2>Races to watch</h2>
          <p className="dek">Senate and governor races still being counted, closest first.</p>
          {watch.length ? <table className="otable"><tbody>{watch.map(({ m, r }) => { const l = demLead(r!)!; return (
            <tr key={m.id} onClick={() => goState(m.st, r!.id)} style={{ cursor: 'pointer' }}>
              <td><b>{STATE_NAME[m.st]}</b> <small style={ink3}>{m.office === 'senate' ? 'Senate' : 'Gov.'}</small><br /><small style={ink3}>forecast {fmtMargin(m.margin)}</small></td>
              <td style={{ minWidth: 110 }}><LeadBar r={r!} /></td>
              <td className="n"><Score><b style={{ color: l >= 0 ? DEM : REP }}>{fmtMargin(l)}</b><br /><small style={ink3}>{Math.round(r!.reporting)}% in</small></Score></td>
            </tr>); })}</tbody></table> : <p className="dek">Nothing being counted right now.</p>}
        </div>
      </section>
    </>
  );
}

function SeatSteps({ pts, majority }: { pts: { t: number; d: number; r: number }[]; majority: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const H = 220, l = 34, rr = 70, t = 10, b = 20;
  const t0 = pts[0].t, t1 = Math.max(pts[pts.length - 1].t, t0 + 1);
  const max = Math.max(majority + 5, ...pts.map(p => Math.max(p.d, p.r)));
  const x = (ms: number) => l + ((ms - t0) / (t1 - t0)) * (W - l - rr);
  const y = (v: number) => t + ((max - v) / max) * (H - t - b);
  const step = (k: 'd' | 'r') => pts.map((p, i) => `${i ? `H${x(p.t)}V` : `M${x(p.t)},`}${y(p[k])}`).join('');
  const last = pts[pts.length - 1];
  return (
    <div ref={ref} className="ochart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Seats called through the night">
        <line x1={l} x2={W - rr} y1={y(majority)} y2={y(majority)} stroke="var(--o-ink3)" strokeDasharray="3 3" />
        <text x={l - 4} y={y(majority) + 4} textAnchor="end">{majority}</text>
        <text x={l - 4} y={y(0) + 4} textAnchor="end">0</text>
        <path d={step('d')} fill="none" stroke={DEM} strokeWidth={2} />
        <path d={step('r')} fill="none" stroke={REP} strokeWidth={2} />
        <text x={W - rr + 6} y={y(last.d) + 4} style={{ fill: DEM, fontSize: 11 }}>D {last.d}</text>
        <text x={W - rr + 6} y={y(last.r) + (Math.abs(y(last.r) - y(last.d)) < 12 ? 16 : 4)} style={{ fill: REP, fontSize: 11 }}>R {last.r}</text>
        <text x={l} y={H - 4}>{hhmm(t0)}</text><text x={W - rr} y={H - 4} textAnchor="end">{hhmm(t1)}</text>
      </svg>
    </div>
  );
}

// ---------- ballot measures ----------

export function MeasuresScreen({ live }: { live?: LiveData }) {
  const goState = useGoState();
  const [f, setF] = useState<'all' | 'passed' | 'failed' | 'counting'>('all');
  const list = (live?.measures ?? []).filter(m => {
    const passed = m.winnerName ? /^yes/i.test(m.winnerName) : null;
    return f === 'all' || (f === 'passed' && passed === true) || (f === 'failed' && passed === false) || (f === 'counting' && passed == null);
  });
  const byState = Object.entries(list.reduce<Record<string, LiveRace[]>>((acc, m) => { (acc[m.st] ??= []).push(m); return acc; }, {})).sort((a, b) => STATE_NAME[a[0]].localeCompare(STATE_NAME[b[0]]));
  const all = live?.measures ?? [];
  return (
    <section className="ocard">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ marginRight: 'auto' }}>Statewide ballot measures</h2>
        <Chips label="Filter" value={f} set={setF} items={[{ k: 'all', label: `All ${all.length}` }, { k: 'passed', label: `Passed ${all.filter(m => m.winnerName && /^yes/i.test(m.winnerName)).length}` }, { k: 'failed', label: `Failed ${all.filter(m => m.winnerName && !/^yes/i.test(m.winnerName)).length}` }, { k: 'counting', label: 'Undecided' }]} />
      </div>
      {!all.length ? <p className="dek">The measures appear here once the count starts.</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
          {byState.map(([st, ms]) => (
            <div key={st}>
              <div className="lab" style={{ cursor: 'pointer' }} onClick={() => goState(st)}>{STATE_NAME[st]} ›</div>
              {ms.map(m => { const y = m.cands.find(c => /^yes/i.test(c.name)), n = m.cands.find(c => /^no/i.test(c.name)); return (
                <div key={m.id} style={{ fontSize: 13, padding: '6px 0', borderTop: '1px solid var(--o-line)', cursor: 'pointer' }} onClick={() => goState(st, m.id)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span>{m.name.replace(new RegExp(`^${STATE_NAME[st]} `), '')}</span><Score><b>{m.winnerName ? (/^yes/i.test(m.winnerName) ? 'Passed' : 'Failed') : m.reporting ? `${Math.round(m.reporting)}% in` : ''}</b></Score></div>
                  {m.reporting > 0 && y && n && <>
                    <div style={{ display: 'flex', gap: 2, height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 3 }}><div style={{ flex: y.pct, background: 'var(--o-s3)' }} /><div style={{ flex: n.pct, background: 'var(--o-other)' }} /></div>
                    <small style={ink3}><Score>Yes {y.pct.toFixed(1)}% · No {n.pct.toFixed(1)}%</Score></small>
                  </>}
                </div>); })}
            </div>
          ))}
        </div>
      )}
      <Src>civicAPI · click a measure for its counties</Src>
    </section>
  );
}
