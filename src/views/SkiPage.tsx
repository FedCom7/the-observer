import { PointsBars, useWidth } from '../components/charts';
import { Score } from '../components/common';
import { Hero, ocol } from '../components/sheet';
import { ScreenTabs, useTab } from '../components/tabs';
import { useData } from '../core/store';
import { DAY, countdown, dayLong, dayShort, fmt, hhmm } from '../core/time';
import { discShort, type SkiRace, type SkiStanding } from '../sources/ski';
import { useSkiSeason } from '../sources/skiSeason';
import { AthletesScreen, HistoryScreen, HowScreen, PowerScreen, SKI_TABS, SeasonScreen, VenuesScreen, WorldsScreen } from './SkiScreens';

const DISC_COLOR: Record<string, string> = { DH: 'var(--o-s1)', SG: 'var(--o-s3)', GS: 'var(--o-s2)', SL: 'var(--o-s4)', AC: 'var(--oc-tech)', PAR: 'var(--oc-cul)' };
const nameCase = (n: string) => n.replace(/\b([A-ZÀ-Ý'-]{2,})\b/g, w => w[0] + w.slice(1).toLowerCase());
const gLabel = (g: SkiRace['gender']) => (g === 'men' ? 'Men' : g === 'women' ? 'Women' : 'Mixed');

/** Alpine skiing: every race with official run times, the World Championships, the Cup standings. */
export function SkiPage() {
  const { ski, news, now } = useData();
  const [tab, setTab] = useTab(SKI_TABS);
  const season = useSkiSeason(tab !== 'now');
  if (!ski) return <Hero id="sci" dek="Loading the World Cup…" />;
  const races = ski.races.filter(r => !r.cancelled);
  const upcoming = races.filter(r => Date.parse(r.start) > now - 3 * 3600e3);
  const next = upcoming[0];
  const recent = races.filter(r => r.results?.length).slice(-4).reverse();
  const worlds = races.filter(r => r.category === 'WSC');
  const wFrom = ski.worlds ? Date.parse(ski.worlds.from) : null;
  const st = ski.standings;
  const myNews = news.filter(n => n.passion === 'sci').slice(0, 8);
  const weeks = new Map<string, SkiRace[]>();
  upcoming.filter(r => r.category === 'WC').slice(0, 24).forEach(r => {
    const k = `${r.place} (${r.country})`;
    weeks.set(k, [...(weeks.get(k) ?? []), r]);
  });

  return (
    <>
      <Hero id="sci" dek={`${next ? `Next: ${next.place}, ${gLabel(next.gender).toLowerCase()}'s ${next.discipline.toLowerCase()} on ${dayLong(Date.parse(next.start))}. ` : ''}${ski.worlds && wFrom && wFrom > now ? `The World Championships in ${ski.worlds.place} start in ${Math.round((wFrom - now) / DAY)} days.` : ''}`} />
      <ScreenTabs tabs={SKI_TABS} tab={tab} set={setTab} label="Alpine skiing screens" />
      {tab !== 'now' ? (tab === 'how' ? <HowScreen /> : !season ? <section className="ocard"><p className="dek">Loading the season…</p></section>
        : tab === 'season' ? <SeasonScreen d={season} cal={ski} now={now} />
        : tab === 'power' ? <PowerScreen d={season} />
        : tab === 'athletes' ? <AthletesScreen d={season} />
        : tab === 'venues' ? <VenuesScreen d={season} cal={ski} />
        : tab === 'worlds' ? <WorldsScreen d={season} cal={ski} now={now} />
        : <HistoryScreen d={season} />) : <>

      <section className="s-top">
        <div className="ocard s-next">
          <div className="lab">Next race</div>
          {next ? (
            <>
              <h3><Chip d={next.discipline} /> {gLabel(next.gender)}'s {next.discipline}</h3>
              <div className="when">{next.place} ({next.country}) · {dayLong(Date.parse(next.start))}</div>
              <div className="when">{next.runs.length ? next.runs.map(r => `${r.run} run ${hhmm(Date.parse(r.start))}`).join(' · ') + ' Rome' : `≈ ${hhmm(Date.parse(next.start))} Rome · official times a few days before`}</div>
              <div className="s-cd">{countdown(Date.parse(next.start) - now)}<small>T-minus</small></div>
            </>
          ) : <div>Season complete.</div>}
        </div>
        <div className="ocard">
          <div className="lab">World Championships</div>
          {ski.worlds && wFrom ? (
            <>
              <h3 style={{ margin: 0 }}>{ski.worlds.place}</h3>
              <div className="when">{dayShort(wFrom)} – {dayShort(Date.parse(ski.worlds.to))} · {worlds.length} races</div>
              <div className="s-cd" style={{ fontSize: 30 }}>{wFrom > now ? countdown(wFrom - now) : 'Under way'}</div>
            </>
          ) : <div>Not scheduled this season.</div>}
        </div>
        <div className="ocard">
          <div className="lab">{st.final ? `${st.season - 1}–${String(st.season).slice(2)} champions` : 'World Cup leaders'}</div>
          <div className="kpis" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {st.men[0] && <div className="kpi"><Score as="b">{nameCase(st.men[0].name).split(' ')[0]}</Score><span>Men · {st.men[0].points} pts</span></div>}
            {st.women[0] && <div className="kpi"><Score as="b">{nameCase(st.women[0].name).split(' ')[0]}</Score><span>Women · {st.women[0].points} pts</span></div>}
          </div>
        </div>
      </section>

      {worlds.length > 0 && (
        <section className="ocard">
          <h2>{ski.worlds!.place} World Championships</h2>
          <p className="dek">Every medal race, day by day, in Rome time. Colors by discipline; the top row is women, the bottom row men.</p>
          <WorldsGrid races={worlds} now={now} />
        </section>
      )}

      <section className="ocard">
        <h2>The World Cup calendar</h2>
        <p className="dek">Upcoming races by venue. Times are official once FIS publishes them; until then the usual start time is shown with ≈.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 18 }}>
          {[...weeks.entries()].map(([venue, list]) => (
            <div key={venue}>
              <div className="lab">{venue}</div>
              <div className="olist">
                {list.map(r => (
                  <div key={r.raceid} className="r" style={{ gridTemplateColumns: '78px 1fr' }}>
                    <time>{dayShort(Date.parse(r.start))}<small>{r.approxTime ? '≈ ' : ''}{hhmm(Date.parse(r.start))}{r.runs[1] ? ` / ${hhmm(Date.parse(r.runs[1].start))}` : ''}</small></time>
                    <div><b><Chip d={r.discipline} /> {gLabel(r.gender)}</b><small>{r.discipline}</small></div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {recent.length > 0 && (
        <section className="ocard">
          <h2>Latest results</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>
            {recent.map(r => (
              <div key={r.raceid}>
                <div className="lab"><Chip d={r.discipline} /> {r.place} · {gLabel(r.gender)} · {dayShort(Date.parse(r.start))}</div>
                <table className="otable"><tbody>{r.results!.slice(0, 10).map(x => (
                  <tr key={x.rank + x.name} className={x.nation === 'ITA' ? 'me' : ''}><td>{x.rank}</td><td><Score>{nameCase(x.name)}</Score></td><td>{x.nation}</td><td className="n"><Score>{x.rank === 1 ? x.time : x.gap}</Score></td></tr>
                ))}</tbody></table>
              </div>
            ))}
          </div>
          <div className="osrc">Italians highlighted · Source: FIS</div>
        </section>
      )}

      <section className="ocard">
        <h2>{st.final ? `Final World Cup standings, ${st.season - 1}–${String(st.season).slice(2)}` : 'World Cup standings'}</h2>
        <p className="dek">Overall points and the leaders of each discipline. {st.final ? 'This season\'s table appears after the first race.' : ''}</p>
        <div className="s-two" style={{ gap: 24 }}>
          <div><div className="lab">Women</div><PointsBars rows={st.women.slice(0, 10).map(x => ({ name: nameCase(x.name), value: x.points, sub: x.nation }))} color={ocol('sci')} labelWidth={170} /></div>
          <div><div className="lab">Men</div><PointsBars rows={st.men.slice(0, 10).map(x => ({ name: nameCase(x.name), value: x.points, sub: x.nation }))} color={ocol('sci')} labelWidth={170} /></div>
        </div>
        <div className="s-two" style={{ gap: 24, marginTop: 18 }}>
          <DisciplineLeaders title="Women · discipline leaders" rows={st.women} />
          <DisciplineLeaders title="Men · discipline leaders" rows={st.men} />
        </div>
      </section>

      <section className="ocard">
        <div className="lab">From the wire</div>
        <div className="onews">{myNews.map(n => <a key={n.id} className="r" href={n.url} target="_blank" rel="noreferrer"><time>{dayShort(n.time)} · {n.source}</time><p>{n.title}</p></a>)}</div>
      </section>
      </>}
    </>
  );
}

function Chip({ d }: { d: string }) {
  const k = discShort(d);
  return <span style={{ display: 'inline-block', fontFamily: 'var(--f-chart)', fontSize: 10.5, fontWeight: 700, color: '#fff', background: DISC_COLOR[k] ?? 'var(--o-ink3)', borderRadius: 4, padding: '1px 5px', verticalAlign: 2 }}>{k}</span>;
}

function DisciplineLeaders({ title, rows }: { title: string; rows: SkiStanding[] }) {
  const top = (k: 'DH' | 'SG' | 'GS' | 'SL') => [...rows].filter(r => r[k]).sort((a, b) => (b[k] ?? 0) - (a[k] ?? 0)).slice(0, 3);
  return (
    <div>
      <div className="lab">{title}</div>
      <table className="otable">
        <tbody>
          {(['DH', 'SG', 'GS', 'SL'] as const).map(k => (
            <tr key={k}><td><Chip d={k === 'DH' ? 'Downhill' : k === 'SG' ? 'Super G' : k === 'GS' ? 'Giant Slalom' : 'Slalom'} /></td>
              <td>{top(k).map((r, i) => <span key={r.name} style={{ marginRight: 10 }}>{i + 1}. <Score>{nameCase(r.name).split(' ')[0]}</Score> <small style={{ color: 'var(--o-ink3)' }}>{r[k]}</small></span>)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Day-by-day grid of the championships: women on top, men below, one tile per race. */
function WorldsGrid({ races, now }: { races: SkiRace[]; now: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const first = Date.parse(races[0].start), last = Date.parse(races[races.length - 1].start);
  const days = Math.round((last - first) / DAY) + 1;
  const start0 = new Date(fmt(first, { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-') + 'T00:00:00').getTime();
  const col = Math.max(48, (W - 70) / days), H = 150;
  const rowOf = (g: SkiRace['gender']) => (g === 'women' ? 0 : g === 'men' ? 1 : 0.5);
  return (
    <div ref={ref} style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${70 + col * days} ${H}`} width={Math.max(W, 70 + col * days)} height={H} style={{ display: 'block', fontFamily: 'var(--f-chart)' }}>
        {Array.from({ length: days }, (_, i) => {
          const t = start0 + i * DAY;
          return (
            <g key={i}>
              <text x={70 + col * i + col / 2} y={12} textAnchor="middle" style={{ fill: 'var(--o-ink3)', fontSize: 10 }}>{fmt(t, { weekday: 'short' })}</text>
              <text x={70 + col * i + col / 2} y={26} textAnchor="middle" style={{ fill: 'var(--o-ink)', fontSize: 12, fontWeight: 600 }}>{fmt(t, { day: 'numeric' })}</text>
              <line x1={70 + col * i} x2={70 + col * i} y1={32} y2={H - 4} stroke="var(--o-grid)" />
            </g>
          );
        })}
        <text x={0} y={62} style={{ fill: 'var(--o-ink2)', fontSize: 12 }}>Women</text>
        <text x={0} y={122} style={{ fill: 'var(--o-ink2)', fontSize: 12 }}>Men</text>
        {races.map(r => {
          const t = Date.parse(r.start);
          const i = Math.floor((t - start0) / DAY);
          const y = 38 + rowOf(r.gender) * 58;
          const k = discShort(r.discipline);
          return (
            <g key={r.raceid} opacity={t < now ? 0.5 : 1}>
              <rect x={70 + col * i + 3} y={y} width={col - 6} height={44} rx={6} fill={DISC_COLOR[k] ?? 'var(--o-ink3)'} />
              <text x={70 + col * i + col / 2} y={y + 19} textAnchor="middle" style={{ fill: '#fff', fontWeight: 700, fontSize: 12 }}>{k}</text>
              <text x={70 + col * i + col / 2} y={y + 34} textAnchor="middle" style={{ fill: '#fff', fontSize: 10 }}>{r.approxTime ? '≈' : ''}{hhmm(t)}</text>
              <title>{`${dayShort(t)} · ${gLabel(r.gender)}'s ${r.discipline}${r.results?.[0] ? ` · gold ${r.results[0].name}` : ''}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
