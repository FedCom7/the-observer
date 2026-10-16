import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DiffBars, MarginDots, SeasonStrip, type Bar } from '../components/charts';
import { ElectionNight, isElectionNight } from '../components/ElectionNight';
import { Score, Tbc } from '../components/common';
import { Hero, Row, ocol } from '../components/sheet';
import { CfbPage } from './CfbPage';
import { F1Page } from './F1Page';
import { MlbPage } from './MlbPage';
import { NbaPage } from './NbaPage';
import { RoyalPage } from './RoyalPage';
import { SkiPage } from './SkiPage';
import { SpacePage } from './SpacePage';
import { DakarPage } from './DakarPage';
import { WecPage } from './WecPage';
import { PASSION } from '../core/passions';
import { useData } from '../core/store';
import { DAY, countdown, dayLong, dayShort, hhmm, isNight } from '../core/time';
import type { ObsEvent, PassionId, Side, Standing } from '../core/types';
import { CLOSINGS, FIRST_CLOSE, GOVERNORS_UP, HOUSE_MAJORITY, HOUSE_SEATS, SENATE_UP, fmtMargin, senateIfPollsHold, type Race } from '../core/elections';


/** Standings and team-schedule charts that belong to each passion. */
const STANDINGS: Partial<Record<PassionId, string[]>> = {
  milan: ['seriea'], pats: ['afceast'], nfl: ['afceast'], texas: ['ap'], cfb: ['ap'], f1: ['f1d', 'f1c'],
};
const TEAM_CHART = new Set<PassionId>(['milan', 'pats', 'texas']);

const mineOf = (e: ObsEvent): [Side, Side] | null => {
  if (!e.home || !e.away) return null;
  if (e.home.mine) return [e.home, e.away];
  if (e.away.mine) return [e.away, e.home];
  return null;
};

export function PassionSheet() {
  const { id } = useParams();
  const nav = useNavigate();
  const close = () => nav('/');
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.classList.add('sheet-open');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    sheet.current?.querySelector<HTMLButtonElement>('.s-back')?.focus({ preventScroll: true });
    return () => { document.body.classList.remove('sheet-open'); window.removeEventListener('keydown', onKey); };
  }, []);

  useEffect(() => { sheet.current?.scrollTo(0, 0); }, [id]);

  const passion = id && id in PASSION ? PASSION[id as PassionId] : null;
  if (!passion) return null;

  return (
    <div className="sheet obs" ref={sheet} role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
      <div className="s-bar">
        <button className="s-back" onClick={close} aria-label="Back to the control room">‹ Control Room</button>
        <span className="s-crumb">/ {passion.name}</span>
        <span className="s-esc">esc</span>
      </div>
      <div className="s-wrap">
        {passion.id === 'elez' ? <ElectionsPage /> : passion.id === 'mlb' ? <MlbPage /> : passion.id === 'f1' ? <F1Page /> : passion.id === 'nba' ? <NbaPage /> : passion.id === 'cfb' ? <CfbPage /> : passion.id === 'wec' ? <WecPage /> : passion.id === 'royal' ? <RoyalPage /> : passion.id === 'sci' ? <SkiPage /> : passion.id === 'space' ? <SpacePage /> : passion.id === 'dakar' ? <DakarPage /> : <GenericPage id={passion.id} />}
      </div>
    </div>
  );
}

function resultText(e: ObsEvent) {
  const m = mineOf(e);
  if (m && m[0].score !== undefined) return `${m[0].name} ${m[0].score}–${m[1].score} ${m[1].name}`;
  if (e.home && e.away) return `${e.away.name} ${e.away.score ?? ''} – ${e.home.name} ${e.home.score ?? ''}`;
  return e.sub ?? e.title;
}

function GenericPage({ id }: { id: PassionId }) {
  const { events, standings, news, now, orbit } = useData();
  const mine = events.filter(e => e.passion === id);
  const upcoming = mine.filter(e => e.state === 'pre' && e.start > now);
  const liveNow = mine.filter(e => e.state === 'in');
  const past = mine.filter(e => e.state === 'post').sort((a, b) => b.start - a.start);
  const next = upcoming.find(e => (e.weight ?? 1) >= 2) ?? upcoming[0];
  const latest = liveNow[0] ?? past[0];
  const tables = (STANDINGS[id] ?? []).map(k => standings[k]).filter(Boolean) as Standing[];
  const myNews = news.filter(n => n.passion === id).slice(0, 8);

  // Margin per game for my team, oldest first
  const bars: Bar[] = TEAM_CHART.has(id)
    ? past.filter(e => mineOf(e) && mineOf(e)![0].score !== undefined).slice(0, 20).reverse().map(e => {
        const [me, opp] = mineOf(e)!;
        const v = Number(me.score) - Number(opp.score);
        return { label: (e.home?.mine ? '' : '@') + opp.abbr, value: v, tip: `${dayShort(e.start)} · ${me.name} ${me.score}–${opp.score} ${opp.name}` };
      })
    : [];

  const myRow = tables[0]?.rows.find(r => r.mine);
  const kpis: [string, string][] = [];
  if (myRow) kpis.push([`${myRow.rank}${typeof myRow.rank === 'number' ? ordinal(myRow.rank) : ''}`, tables[0].title], [String(myRow.values[myRow.values.length - 1]), tables[0].cols[tables[0].cols.length - 1]]);
  if (bars.length) {
    const w = bars.filter(b => b.value > 0).length, l = bars.filter(b => b.value < 0).length, d = bars.length - w - l;
    kpis.push(id === 'milan' ? [`${w}–${d}–${l}`, 'W–D–L, all comps'] : [`${w}–${l}`, 'W–L']);
  }
  if (id === 'space' && orbit) kpis.push([String(orbit.total), 'In orbit now'], ...orbit.byAgency.slice(0, 2).map(([a, n]) => [String(n), a] as [string, string]));
  if (!kpis.length) kpis.push([String(upcoming.length), 'Upcoming dates'], [upcoming.filter(e => e.tbc).length ? 'TBC' : 'Set', 'Calendar status']);

  const dek = next ? `Next: ${next.title}, ${dayLong(next.start)}.` : liveNow.length ? 'Live now.' : 'No dates in the calendar yet.';

  return (
    <>
      <Hero id={id} dek={dek} />
      <section className="s-top">
        {next ? (
          <div className="ocard s-next">
            <div className="lab">Next up</div>
            <h3>{next.title}<Tbc e={next} /></h3>
            <div className="when">{dayLong(next.start)} · {next.approx ? '≈ ' : ''}{hhmm(next.start)} Rome{next.tv ? ` · ${next.tv}` : ''}</div>
            <div className="s-cd">{countdown(next.start - now)}<small>T-minus{isNight(next.start) ? ' · night viewing' : ''}</small></div>
          </div>
        ) : <div className="ocard"><div className="lab">Next up</div><div>Nothing scheduled yet.</div></div>}
        {latest ? (
          <div className="ocard s-last">
            <div className="lab">{latest.state === 'in' ? <span style={{ color: '#ff453a' }}>● Live now</span> : 'Latest'}</div>
            <div style={{ color: 'var(--o-ink3)', fontSize: 12 }}>{dayShort(latest.start)} · {latest.state === 'in' ? latest.clock ?? '' : latest.home ? latest.title : latest.sub ? 'Result' : ''}</div>
            {latest.home ? <Score as="div" className="big">{resultText(latest)}</Score> : (
              <>
                <div className="big">{latest.title}</div>
                {latest.sub && <Score as="div" className="">{latest.sub}</Score>}
              </>
            )}
            {latest.place && <div style={{ color: 'var(--o-ink2)', marginTop: 4 }}>{latest.place}</div>}
          </div>
        ) : <div className="ocard"><div className="lab">Latest</div><div>No recent results.</div></div>}
        <div className="ocard">
          <div className="lab">At a glance</div>
          <div className="kpis">{kpis.slice(0, 3).map(([v, l]) => <div key={l} className="kpi"><Score as="b">{v}</Score><span>{l}</span></div>)}</div>
        </div>
      </section>

      {bars.length > 1 && (
        <section className="ocard">
          <h2>Game by game</h2>
          <p className="dek">{id === 'milan' ? 'Goal difference in each match, all competitions.' : 'Point differential in each game.'} Wins in color.</p>
          <DiffBars bars={bars} color={ocol(id)} />
          <div className="osrc">Source: ESPN</div>
        </section>
      )}
      <section className="s-two">
        <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
          <div className="ocard">
            <div className="lab">Schedule · Rome time</div>
            <div className="olist">
              {liveNow.map(e => <Row key={e.id} e={e} right={<span className="tag-live">{e.clock ?? 'LIVE'}</span>} />)}
              {upcoming.slice(0, 8).map(e => <Row key={e.id} e={e} right={`in ${countdown(e.start - now)}`} />)}
              {past.slice(0, 6).map(e => <Row key={e.id} e={e} past right={<Score>{e.home ? resultText(e).replace(/^.*?(\d+–\d+).*$/, '$1') : e.sub ?? 'Done'}</Score>} />)}
              {!mine.length && <div className="r"><div /><div>No dates yet.</div></div>}
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
        <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
          {tables.map(t => <TableCard key={t.title} s={t} />)}
          {id === 'space' && orbit && (
            <div className="ocard"><div className="lab">In orbit now</div><div className="onews">{orbit.names.map(n => <div key={n} className="r"><p>{n}</p></div>)}</div></div>
          )}
          <div className="ocard"><div className="lab">The season ahead</div><SeasonStrip heat={PASSION[id].heat} now={now} /></div>
        </div>
      </section>
    </>
  );
}

const ordinal = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');

function TableCard({ s }: { s: Standing }) {
  const rows = s.rows.slice(0, 20);
  return (
    <div className="ocard">
      <div className="lab">{s.title}{s.meta ? ` · ${s.meta}` : ''}</div>
      <div style={{ overflowX: 'auto' }}>
        <table className="otable">
          <thead><tr>{s.cols.map((c, i) => <th key={c} className={i >= 2 ? 'n' : ''}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={String(r.rank) + r.name} className={r.mine ? 'me' : ''}>
                <td>{r.rank}</td><td>{r.name}</td>
                {r.values.map((v, i) => <td key={i} className="n">{i === r.values.length - 1 ? <Score>{v}</Score> : v}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function battlegroundHeadline(races: Race[]) {
  const polled = races.filter(r => r.margin != null && r.dem && r.rep), d = polled.filter(r => r.margin! > 0).length;
  if (!polled.length) return 'Senate battlegrounds';
  if (d === polled.length) return `Democrats lead in all ${polled.length} polled Senate battlegrounds`;
  if (d === 0) return `Republicans lead in all ${polled.length} polled Senate battlegrounds`;
  return `Democrats lead in ${d} of ${polled.length} polled Senate battlegrounds`;
}

const SHEET_TOKENS = { ink: 'var(--o-ink)', ink2: 'var(--o-ink2)', ink3: 'var(--o-ink3)', grid: 'var(--o-grid)', dem: 'var(--o-dem)', rep: 'var(--o-rep)', surface: 'var(--o-card)' };
const asOfDay = (s?: string | null) => (s ? dayShort(Date.parse(s)) : 'n/a');

function ElectionsPage() {
  const { now, events, elections: e } = useData();
  // Election night: Eastern Time on 3 November is UTC-5, so Rome is six hours ahead.
  const closings = CLOSINGS.map(c => ({ ...c, t: Date.parse(`2026-11-0${c.nextDay ? 4 : 3}T${c.et}:00-05:00`) }));
  const upcoming = events.filter(x => x.passion === 'elez' && x.start > now);
  if (!e) return <><Hero id="elez" dek="Loading the latest ratings and polls…" /></>;
  const sen = senateIfPollsHold(e);
  const races = e.battlegrounds.filter(r => r.dem && r.rep && r.margin != null);
  const raterNames = Object.keys(e.battlegrounds[0]?.raters ?? {});
  const gb = e.generic;
  return (
    <>
      <Hero id="elez" dek={`${gb ? `Democrats ${gb.margin >= 0 ? 'lead' : 'trail'} the generic ballot by ${Math.abs(gb.margin)} points. ` : ''}In the Senate they need a net gain of ${sen.need} seats; if every polling leader wins they would hold ${sen.D}.`} />
      <section className="s-top">
        <div className="ocard s-next">
          <div className="lab">Election night</div>
          <h3>Tuesday 3 November</h3>
          <div className="when">First polls close at 00:00 Rome time</div>
          <div className="s-cd">{now < FIRST_CLOSE ? countdown(FIRST_CLOSE - now) : 'Results night'}<small>until first results</small></div>
        </div>
        <div className="ocard">
          <div className="lab">Senate if the polls hold</div>
          <div className="kpis" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="kpi"><b style={{ color: 'var(--o-dem)' }}>{sen.D}</b><span>Democrats</span></div>
            <div className="kpi" style={{ textAlign: 'right' }}><b style={{ color: 'var(--o-rep)' }}>{sen.R}</b><span>Republicans</span></div>
          </div>
          <div style={{ display: 'flex', gap: 2, height: 10, borderRadius: 3, overflow: 'hidden', marginTop: 12 }}>
            <div style={{ flex: sen.D, background: 'var(--o-dem)' }} /><div style={{ flex: sen.R, background: 'var(--o-rep)' }} />
          </div>
          <div className="osrc">Now {e.senate.current.D}–{e.senate.current.R}. Flips if leaders win: {[...sen.dFlips, ...sen.rFlips].map(r => r.state).join(', ') || 'none'}.</div>
        </div>
        <div className="ocard">
          <div className="lab">Generic ballot · House</div>
          {gb ? (
            <>
              <div className="kpis" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                <div className="kpi"><b style={{ color: 'var(--o-dem)' }}>{fmtMargin(gb.margin)}</b><span>Margin</span></div>
                <div className="kpi"><b>{gb.dem}%</b><span>Democrats</span></div>
                <div className="kpi"><b>{gb.rep}%</b><span>Republicans</span></div>
              </div>
              <div className="osrc"><a href={gb.url} target="_blank" rel="noreferrer">{gb.source}</a> average, {asOfDay(gb.asOf)}</div>
            </>
          ) : <div>Not available right now.</div>}
        </div>
      </section>

      {isElectionNight(now) && <NightCard races={e.battlegrounds} now={now} updated={e.updated} />}

      <section className="ocard">
        <h2>{battlegroundHeadline(races)}</h2>
        <p className="dek">Polling average in each race the forecasters do not call safe, from the widest Democratic lead to the widest Republican one. {sen.closest ? `The closest is ${sen.closest.state}, at ${fmtMargin(sen.closest.margin!)}.` : ''} Hover a race for the candidates.</p>
        <MarginDots races={races.map(r => ({ state: r.state + (r.special ? ' (special)' : ''), seat: `${r.incumbentParty} held${r.open ? ', open' : ''}`, margin: r.margin ?? null, dem: r.dem ?? undefined, rep: r.rep ?? undefined, rating: r.consensusLabel }))} tokens={SHEET_TOKENS} />
        <div className="osrc">
          Polling: <a href={e.pollsSource.url} target="_blank" rel="noreferrer">{e.pollsSource.name}</a>. Ratings: <a href={e.ratingsSource.url} target="_blank" rel="noreferrer">{e.ratingsSource.name}</a>{e.ratingsSource.asOf ? `, Cook as of ${e.ratingsSource.asOf}` : ''}. Updated automatically {dayShort(Date.parse(e.updated))} {hhmm(Date.parse(e.updated))}.
        </div>
      </section>

      <section className="ocard">
        <h2>What the forecasters say</h2>
        <p className="dek">Each cell is one forecaster's rating. The consensus averages all of them.</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="otable">
            <thead><tr><th>State</th><th>Candidates</th>{raterNames.map(n => <th key={n} className="n">{n}</th>)}<th className="n">Consensus</th><th className="n">Polls</th></tr></thead>
            <tbody>
              {e.battlegrounds.map(r => (
                <tr key={r.state + r.special}>
                  <td><b>{r.state}</b>{r.special ? <small style={{ color: 'var(--o-ink3)' }}> special</small> : null}<br /><small style={{ color: 'var(--o-ink3)' }}>{r.incumbentParty} held{r.open ? ', open' : ''}</small></td>
                  <td>{r.dem ?? '—'}<br /><small style={{ color: 'var(--o-ink3)' }}>vs {r.rep ?? '—'}</small></td>
                  {raterNames.map(n => <td key={n} className="n"><RatingChip score={r.raters[n]?.score} label={r.raters[n]?.label} /></td>)}
                  <td className="n"><RatingChip score={r.consensus} label={r.consensusLabel} strong /></td>
                  <td className="n" style={{ color: (r.margin ?? 0) >= 0 ? 'var(--o-dem)' : 'var(--o-rep)', fontWeight: 600 }}>{r.margin == null ? '—' : fmtMargin(r.margin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {!isElectionNight(now) && <NightCard races={e.battlegrounds} now={now} updated={e.updated} />}

      <section className="s-two">
        <div className="ocard">
          <div className="lab">Election night · Rome time</div>
          <h2 style={{ marginBottom: 10 }}>When the polls close</h2>
          <div className="closings">
            {closings.map(c => (
              <div key={c.et} className="r">
                <b>{hhmm(c.t)}</b>
                <div>{c.states}{c.note && <><br /><small>{c.note}</small></>}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
          <div className="ocard">
            <div className="lab">On the ballot</div>
            <div className="kpis">
              <div className="kpi"><b>{HOUSE_SEATS}</b><span>House seats · {HOUSE_MAJORITY} for a majority</span></div>
              <div className="kpi"><b>{SENATE_UP}</b><span>Senate seats</span></div>
              <div className="kpi"><b>{GOVERNORS_UP}</b><span>Governors</span></div>
            </div>
          </div>
          <div className="ocard">
            <div className="lab">Calendar</div>
            <div className="olist">{upcoming.map(x => <Row key={x.id} e={x} right={`in ${countdown(x.start - now)}`} />)}</div>
          </div>
        </div>
      </section>
    </>
  );
}

function NightCard({ races, now, updated }: { races: Race[]; now: number; updated: string }) {
  return (
    <section className="ocard">
      <div className="lab">{isElectionNight(now) ? <span style={{ color: '#ff453a' }}>● Election night · live</span> : 'Election night tracker'}</div>
      <h2>{isElectionNight(now) ? 'Results in the Senate battlegrounds' : 'What to watch on the night, in closing order'}</h2>
      <p className="dek">{isElectionNight(now)
        ? `Vote shares and winners from each race's Wikipedia page, refreshed every five minutes. Last update ${hhmm(Date.parse(updated))}.`
        : 'Each row turns into a live result bar on 3 November, once the polls in that state close.'}</p>
      <ElectionNight races={races} now={now} variant="sheet" />
    </section>
  );
}

/** Rating cell: blue for Democratic, red for Republican, stronger fill for safer seats. */
function RatingChip({ score, label, strong }: { score?: number; label?: string; strong?: boolean }) {
  if (score === undefined || !label) return <span style={{ color: 'var(--o-ink3)' }}>—</span>;
  const c = score > 0 ? 'var(--o-dem)' : score < 0 ? 'var(--o-rep)' : 'var(--o-ink3)';
  const pct = Math.min(100, Math.round((Math.abs(score) / 3) * 70 + 10));
  return (
    <span style={{ display: 'inline-block', minWidth: 62, padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: strong ? 700 : 500, background: `color-mix(in srgb, ${c} ${score === 0 ? 18 : pct}%, var(--o-card))`, color: Math.abs(score) >= 2 ? '#fff' : 'var(--o-ink)' }}>
      {label}
    </span>
  );
}
