import { useState } from 'react';
import { MultiLine, PointsBars, useWidth } from '../components/charts';
import { Score, Tbc } from '../components/common';
import { ScreenTabs, useTab } from '../components/tabs';
import { ClassicsScreen, FeederScreen, MORE_TABS, MotoGPScreen, VendeeScreen, WrcScreen, useMoreSeason } from './MoreScreens';
import { Hero, ocol } from '../components/sheet';
import { useData } from '../core/store';
import { DAY, countdown, dayLong, dayShort, hhmm } from '../core/time';
import type { Classic, Feeder, MgpRound, MgpSession, MoreData, Vendee, Wrc } from '../sources/more';

const COLORS = ['var(--o-s1)', 'var(--o-s2)', 'var(--o-s3)', 'var(--o-s4)', 'var(--oc-cul)'];
const SURFACE: Record<string, string> = { Gravel: 'var(--o-s3)', Tarmac: 'var(--o-s1)', Snow: 'var(--o-s2)', Mixed: 'var(--o-s4)' };
const surname = (n: string) => n.split(' ').slice(-1)[0];

/** The series that do not need a page of their own: MotoGP, F2, F3, WRC, the two 500s, the Vendée Globe. */
export function MorePage() {
  const { more, events, news, now } = useData();
  const [tab, setTab] = useTab(MORE_TABS);
  const mseason = useMoreSeason(tab === 'motogp');
  if (!more) return <Hero id="more" dek="Loading…" />;
  const upcoming = events.filter(e => e.passion === 'more' && e.start > now - 2 * 3600e3).slice(0, 8);
  const next = upcoming[0];
  const big = [...more.classics.map(c => ({ name: c.name, next: c.next })), ...(more.vendee ? [{ name: 'Vendée Globe', next: more.vendee.next }] : [])]
    .sort((a, b) => Date.parse(a.next.start) - Date.parse(b.next.start));
  const g = more.motogp;
  const myNews = news.filter(n => n.passion === 'more').slice(0, 10);

  return (
    <>
      <Hero id="more" dek={<>{next ? <>Next: {next.title}, {dayLong(next.start)}. </> : null}{big.map(b => `${b.name} ${b.next.tbc ? 'expected' : 'on'} ${dayShort(Date.parse(b.next.start))} ${b.next.year}`).join(' · ')}.</>} />
      <ScreenTabs tabs={MORE_TABS} tab={tab} set={setTab} label="More Sports screens" />
      {tab !== 'now' ? (tab === 'motogp' ? (mseason ? <MotoGPScreen s={mseason} more={more} /> : <section className="ocard"><p className="dek">Loading…</p></section>)
        : tab === 'feeder' ? <FeederScreen more={more} />
        : tab === 'wrc' ? <WrcScreen more={more} />
        : tab === 'classics' ? <ClassicsScreen more={more} />
        : <VendeeScreen more={more} />) : <>

      <section className="s-top">
        <div className="ocard s-next">
          <div className="lab">Next up</div>
          {next ? (
            <>
              <h3>{next.title}</h3>
              <div className="when">{dayLong(next.start)} · {next.approx ? '≈ ' : ''}{hhmm(next.start)} Rome{next.place ? ` · ${next.place}` : ''}</div>
              <div className="s-cd">{next.start > now ? countdown(next.start - now) : 'Under way'}<small>T-minus</small></div>
            </>
          ) : <div>Nothing scheduled.</div>}
        </div>
        {g && <MotoGpTitle g={g} now={now} />}
        <div className="ocard">
          <div className="lab">The big days</div>
          <div className="olist">
            {big.map(b => (
              <div key={b.name} className="r" style={{ gridTemplateColumns: '1fr auto' }}>
                <div><b>{b.name} {b.next.year}</b><Tbc e={b.next} /><small>{dayLong(Date.parse(b.next.start))}{b.next.approxTime ? '' : ` · ${hhmm(Date.parse(b.next.start))}`}</small></div>
                <span className="x" style={{ fontSize: 15, fontWeight: 600, color: 'var(--o-ink)' }}>{Math.max(0, Math.ceil((Date.parse(b.next.start) - now) / DAY))} days</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ocard">
        <h2>Coming up</h2>
        <p className="dek">Races across the series, in Rome time. Practice and qualifying are in each series' weekend below.</p>
        <div className="olist">
          {upcoming.map(e => (
            <div key={e.id} className="r">
              <time>{dayShort(e.start)}<small>{e.approx ? '≈ ' : ''}{hhmm(e.start)}</small></time>
              <div><b>{e.title}</b><Tbc e={e} /><small>{e.sub}</small></div>
              <span className="x">{e.start > now ? `in ${countdown(e.start - now)}` : 'live'}</span>
            </div>
          ))}
        </div>
      </section>

      {g && <MotoGpSection g={g} now={now} />}
      <FeederSection more={more} now={now} />
      {more.wrc && <WrcSection w={more.wrc} now={now} />}

      <section className="s-two">
        {more.classics.map(c => <ClassicCard key={c.id} c={c} now={now} />)}
      </section>

      {more.vendee && <VendeeSection v={more.vendee} now={now} />}

      <section className="ocard">
        <div className="lab">From the wire</div>
        <div className="onews">{myNews.map(n => <a key={n.id} className="r" href={n.url} target="_blank" rel="noreferrer"><time>{dayShort(n.time)} · {n.source}</time><p>{n.title}</p></a>)}</div>
      </section>
      </>}
    </>
  );
}

// ---------- MotoGP ----------
const raceOf = (r: MgpRound, key = 'RAC') => r.sessions.find(s => s.cls === 'MotoGP' && s.key === key);

function MotoGpTitle({ g, now }: { g: NonNullable<MoreData['motogp']>; now: number }) {
  const [p1, p2] = g.riders;
  const left = g.rounds.flatMap(r => r.sessions).filter(s => s.cls === 'MotoGP' && Date.parse(s.start) > now);
  const maxLeft = left.filter(s => s.key === 'RAC').length * 25 + left.filter(s => s.key === 'SPR').length * 12;
  const gap = p1 && p2 ? p1.points - p2.points : 0;
  return (
    <div className="ocard">
      <div className="lab">MotoGP title fight</div>
      {p1 && (
        <>
          <div className="kpis">
            <div className="kpi"><Score as="b">{p1.points}</Score><span>{surname(p1.name)}</span></div>
            <div className="kpi"><Score as="b">+{gap}</Score><span>Gap to {p2 ? surname(p2.name) : 'P2'}</span></div>
            <div className="kpi"><b>{maxLeft}</b><span>Points left</span></div>
          </div>
          <p className="dek" style={{ marginTop: 10 }}>{maxLeft === 0 ? `${p1.name} is the ${g.season} champion.` : gap > maxLeft ? `${p1.name} has the title won.` : gap > maxLeft - 37 ? `${surname(p1.name)} can clinch the title at the next round.` : `${maxLeft} points still on the table.`}</p>
        </>
      )}
    </div>
  );
}

function MotoGpSection({ g, now }: { g: NonNullable<MoreData['motogp']>; now: number }) {
  const weekend = g.rounds.find(r => now <= Date.parse(r.end) + 1.5 * DAY) ?? null;
  const done = g.rounds.filter(r => r.results?.race?.length || r.results?.sprint?.length);
  return (
    <>
      {weekend && (
        <section className="ocard">
          <h2>MotoGP · {weekend.name}</h2>
          <p className="dek">Round {weekend.round} of {g.rounds.length}, {weekend.circuit}. Every session of the three classes in Rome time; MotoGP in bold.</p>
          <MgpWeekend r={weekend} now={now} />
          <div className="osrc">Source: motogp.com</div>
        </section>
      )}
      <section className="s-two">
        <div className="ocard">
          <div className="lab">MotoGP riders · {g.season}</div>
          <PointsBars rows={g.riders.slice(0, 12).map(r => ({ name: surname(r.name), value: r.points, sub: `${r.wins} wins` }))} color={ocol('more')} labelWidth={120} />
          <div className="s-two" style={{ gap: 18, marginTop: 14, gridTemplateColumns: '1fr 1fr' }}>
            {(['moto2', 'moto3'] as const).map(k => (
              <div key={k}>
                <div className="lab">{k === 'moto2' ? 'Moto2' : 'Moto3'}</div>
                <table className="otable"><tbody>{g[k].slice(0, 3).map(r => <tr key={r.name}><td>{r.pos}</td><td><Score>{r.name}</Score></td><td className="n"><Score>{r.points}</Score></td></tr>)}</tbody></table>
              </div>
            ))}
          </div>
        </div>
        <div className="ocard">
          <div className="lab">{g.season} calendar · race and sprint winners</div>
          <div className="olist">
            {g.rounds.map(r => {
              const t = Date.parse(raceOf(r)?.start ?? r.end);
              return (
                <div key={r.id} className={`r${t < now ? ' past' : ''}`} style={{ gridTemplateColumns: '64px 1fr' }}>
                  <time>R{r.round}<small>{dayShort(t)}</small></time>
                  <div><b>{r.name}</b><small>{done.includes(r) ? <Score>{r.results!.race[0] ? `Race ${r.results!.race[0].name}` : ''}{r.results!.sprint[0] ? `${r.results!.race[0] ? ' · ' : ''}Sprint ${r.results!.sprint[0].name}` : ''}</Score> : r.circuit}</small></div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}

function MgpWeekend({ r, now }: { r: MgpRound; now: number }) {
  const days = new Map<string, MgpSession[]>();
  r.sessions.forEach(s => { const k = dayLong(Date.parse(s.start)); days.set(k, [...(days.get(k) ?? []), s]); });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 18 }}>
      {[...days.entries()].map(([day, list]) => (
        <div key={day}>
          <div className="lab">{day}</div>
          <div className="olist">
            {list.map(s => {
              const t = Date.parse(s.start), top = s.cls === 'MotoGP';
              const win = top && s.key === 'RAC' ? r.results?.race?.[0] : top && s.key === 'SPR' ? r.results?.sprint?.[0] : undefined;
              return (
                <div key={s.cls + s.key} className={`r${t < now ? ' past' : ''}`} style={{ gridTemplateColumns: '48px 1fr', opacity: top ? 1 : 0.7 }}>
                  <time>{hhmm(t)}</time>
                  <div>{top ? <b>{s.cls} · {s.name}</b> : <span>{s.cls} · {s.name}</span>}{win && <small><Score>Won by {win.name}</Score></small>}</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Formula 2 and 3 ----------
function FeederSection({ more, now }: { more: MoreData; now: number }) {
  const list = [more.f2, more.f3].filter((f): f is Feeder => Boolean(f));
  const [pick, setPick] = useState<'F2' | 'F3'>('F2');
  const f = list.find(x => x.series === pick) ?? list[0];
  if (!f) return null;
  // Races already run: the columns where someone scored
  const ran = f.races.map((_, i) => i).filter(i => f.drivers.some(d => d.perRace[i] !== null));
  const series = f.drivers.slice(0, 5).map((d, k) => { let acc = 0; return { name: d.name, color: COLORS[k], values: ran.map(i => (acc += d.perRace[i] ?? 0)) }; });
  const next = f.rounds.find(r => r.end && Date.parse(r.end) + DAY > now);
  const complete = !next;
  return (
    <section className="ocard">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <h2>Formula {f.series.slice(1)} · {f.season}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {list.map(x => <button key={x.series} className="btn" aria-pressed={x.series === f.series} onClick={() => setPick(x.series)} style={{ color: 'var(--o-ink)', background: x.series === f.series ? 'var(--o-accent-soft)' : 'transparent', borderColor: 'var(--o-line)' }}>{x.series}</button>)}
        </div>
      </div>
      <p className="dek">{complete ? <>Season complete. <Score>{f.drivers[0]?.name} is the champion with {f.drivers[0]?.points} points.</Score></> : <>Round {next.round} of {f.rounds.length}: {next.name}, {next.city}{next.start ? `, ${dayShort(Date.parse(next.start))}` : ''}. Points race by race (sprint and feature) for the top five.</>}</p>
      <div className="s-two">
        <div>{ran.length > 1 && <MultiLine steps={ran.map((_, i) => String(i + 1))} series={series} unit="points" />}</div>
        <div>
          {next && next.sessions.length > 0 && (
            <>
              <div className="lab">{next.name} weekend</div>
              <div className="olist" style={{ marginBottom: 14 }}>
                {next.sessions.map(s => (
                  <div key={s.name} className={`r${Date.parse(s.start) < now ? ' past' : ''}`} style={{ gridTemplateColumns: '110px 1fr' }}>
                    <time>{dayShort(Date.parse(s.start))}<small>{hhmm(Date.parse(s.start))}</small></time>
                    <div><b>{s.name}</b></div>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="lab">Standings</div>
          <table className="otable"><tbody>{f.drivers.slice(0, 8).map(d => <tr key={d.name}><td>{d.pos}</td><td><Score>{d.name}</Score></td><td className="n"><Score>{d.points}</Score></td></tr>)}</tbody></table>
        </div>
      </div>
      <div className="osrc">Source: fiaformula2.com, fiaformula3.com</div>
    </section>
  );
}

// ---------- WRC ----------
function WrcSection({ w, now }: { w: Wrc; now: number }) {
  const next = w.rounds.find(r => Date.parse(r.end) + DAY > now);
  return (
    <section className="ocard">
      <h2>World Rally Championship · {w.season}</h2>
      <p className="dek">{next ? `Next: ${next.name}, ${dayShort(Date.parse(next.start))}–${dayShort(Date.parse(next.end))} (${next.surface.toLowerCase()}).` : <Score>Season complete: {w.drivers[0]?.name} champion with {w.drivers[0]?.points} points.</Score>} Each rally by surface, with its winner.</p>
      <div className="s-two">
        <div className="olist">
          {w.rounds.map(r => (
            <div key={r.round} className={`r${Date.parse(r.end) < now ? ' past' : ''}`} style={{ gridTemplateColumns: '64px 1fr auto' }}>
              <time>R{r.round}<small>{dayShort(Date.parse(r.start))}</small></time>
              <div><b>{r.name}</b><small>{r.winner ? <Score>{r.winner.driver} / {r.winner.codriver}</Score> : r.hq}</small></div>
              <span className="x"><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: SURFACE[r.surface] ?? 'var(--o-ink3)', marginRight: 5 }} />{r.surface}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="lab">Drivers</div>
          <PointsBars rows={w.drivers.map(d => ({ name: surname(d.name), value: d.points, sub: d.nation }))} color={ocol('more')} labelWidth={110} />
          <div className="osrc">Source: Wikipedia</div>
        </div>
      </div>
    </section>
  );
}

// ---------- The two 500s ----------
function ClassicCard({ c, now }: { c: Classic; now: number }) {
  const t = Date.parse(c.next.start);
  return (
    <div className="ocard">
      <div className="lab">{c.name}</div>
      <h3 style={{ margin: '0 0 2px' }}>{c.next.year} · {dayLong(t)}<Tbc e={c.next} /></h3>
      <div className="when">{c.place} · green flag ≈ {hhmm(t)} Rome</div>
      <div className="s-cd" style={{ fontSize: 30 }}>{t > now ? countdown(t - now) : 'Race day'}</div>
      <div className="lab" style={{ marginTop: 14 }}>Recent winners</div>
      <table className="otable"><tbody>{c.past.map(p => (
        <tr key={p.year}><td>{p.year}</td><td><Score><b>{p.podium[0]?.name}</b></Score></td><td style={{ color: 'var(--o-ink3)' }}><Score>{p.podium.slice(1).map(x => surname(x.name)).join(', ')}</Score></td></tr>
      ))}</tbody></table>
      <div className="osrc">Results: ESPN · date: Wikipedia</div>
    </div>
  );
}

// ---------- Vendée Globe ----------
function VendeeSection({ v, now }: { v: Vendee; now: number }) {
  const t = Date.parse(v.next.start);
  const [last] = v.winners;
  return (
    <section className="ocard">
      <h2>Vendée Globe</h2>
      <p className="dek">Solo, non-stop, without assistance around the world from {v.place}, every four years. The {v.next.year} start is expected on {dayLong(t)} ({Math.ceil((t - now) / DAY)} days); the organiser confirms the date closer to the race.{last ? ` Last edition won by ${last.winner} on ${last.boat}.` : ''}</p>
      <VendeeTimes v={v} />
      <div className="osrc">Winner's time in days · Source: Wikipedia</div>
    </section>
  );
}

/** Winning time of every edition: the race got almost twice as fast in 35 years. */
function VendeeTimes({ v }: { v: Vendee }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const rows = [...v.winners].filter(x => x.days).sort((a, b) => a.year - b.year);
  if (!rows.length) return null;
  const H = 220, l = 34, b = 40, t = 18;
  const hi = Math.ceil(Math.max(...rows.map(r => r.days!)) / 20) * 20;
  const band = (W - l) / rows.length, bw = Math.min(34, band * 0.6);
  const y = (d: number) => t + ((hi - d) / hi) * (H - t - b);
  return (
    <div ref={ref} className="ochart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Vendée Globe winning times">
        {[0, hi / 2, hi].map(d => <g key={d}><line x1={l} x2={W} y1={y(d)} y2={y(d)} stroke="var(--o-grid)" /><text x={l - 6} y={y(d) + 4} textAnchor="end">{d}</text></g>)}
        {rows.map((r, i) => {
          const cx = l + band * i + band / 2;
          return (
            <g key={r.year}>
              <rect x={cx - bw / 2} y={y(r.days!)} width={bw} height={y(0) - y(r.days!)} rx={3} fill={i === rows.length - 1 ? 'var(--oc-mot)' : 'var(--o-grid)'}><title>{`${r.edition}: ${r.winner} (${r.boat}) in ${Math.floor(r.days!)} days ${Math.round((r.days! % 1) * 24)} h`}</title></rect>
              <text x={cx} y={y(r.days!) - 5} textAnchor="middle" style={{ fontSize: 10.5, fill: 'var(--o-ink2)' }}>{Math.round(r.days!)}</text>
              <text x={cx} y={H - 24} textAnchor="middle" style={{ fontSize: 10.5, fill: 'var(--o-ink2)' }}>{String(r.year)}</text>
              <text x={cx} y={H - 10} textAnchor="middle" style={{ fontSize: 9.5 }}>{surname(r.winner)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

