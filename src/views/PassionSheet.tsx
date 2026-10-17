import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DiffBars, SeasonStrip, type Bar } from '../components/charts';
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
import { CyclingPage } from './CyclingPage';
import { AwardsPage } from './AwardsPage';
import { TeamPage } from './TeamPage';
import { TennisPage } from './TennisPage';
import { ApplePage } from './ApplePage';
import { AcPage } from './AcPage';
import { WecPage } from './WecPage';
import { PASSION } from '../core/passions';
import { useData } from '../core/store';
import { DAY, countdown, dayLong, dayShort, hhmm, isNight } from '../core/time';
import type { ObsEvent, PassionId, Side, Standing } from '../core/types';
import { ElectionsPage } from './ElectionsPage';


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
        {passion.id === 'elez' ? <ElectionsPage /> : passion.id === 'mlb' ? <MlbPage /> : passion.id === 'f1' ? <F1Page /> : passion.id === 'nba' ? <NbaPage /> : passion.id === 'cfb' ? <CfbPage /> : passion.id === 'wec' ? <WecPage /> : passion.id === 'royal' ? <RoyalPage /> : passion.id === 'sci' ? <SkiPage /> : passion.id === 'space' ? <SpacePage /> : passion.id === 'dakar' ? <DakarPage /> : passion.id === 'apple' ? <ApplePage /> : passion.id === 'ac' ? <AcPage /> : passion.id === 'cicl' ? <CyclingPage /> : passion.id === 'awards' ? <AwardsPage /> : passion.id === 'milan' || passion.id === 'pats' || passion.id === 'texas' ? <TeamPage id={passion.id} /> : passion.id === 'tennis' ? <TennisPage /> : <GenericPage id={passion.id} />}
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

