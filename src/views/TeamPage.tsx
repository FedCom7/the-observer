import { useState } from 'react';
import { TrendLine, useWidth, type TrendPoint } from '../components/charts';
import { Score } from '../components/common';
import { NextGame } from '../components/NextGame';
import { SeasonMap } from '../components/SeasonMap';
import { Hero, Row, ocol } from '../components/sheet';
import { TrophyTimeline } from '../components/Trophies';
import { useData } from '../core/store';
import { DAY, countdown, dayLong, dayShort, hhmm } from '../core/time';
import type { ObsEvent, Side } from '../core/types';
import type { Rival, Season, TeamData } from '../sources/teams';
import { DODGERS } from '../sources/mlb';
import { Bracket, SeriesBox, seriesSentence } from './MlbPage';
import { ScreenTabs, useTab } from '../components/tabs';
import { TeamScreens, teamTabs } from './TeamScreens';

type TeamId = 'milan' | 'pats' | 'texas' | 'dodgers';
const GOLD = '#c9a227';
/** Home grounds, for home games the schedule gives no coordinates for */
const HOME: Record<TeamId, [number, number]> = { milan: [9.12, 45.48], pats: [-71.26, 42.09], texas: [-97.73, 30.28], dodgers: [-118.24, 34.07] };
/** What a score counts, by sport */
const UNIT = { soccer: 'goals', football: 'points', baseball: 'runs' } as const;

const mineOf = (e: ObsEvent): [Side, Side] | null => (!e.home || !e.away ? null : e.home.mine ? [e.home, e.away] : e.away.mine ? [e.away, e.home] : null);
const per = (v: number | null, gp: number | null) => (v == null || !gp ? null : v / gp);
const f1 = (v: number | null) => (v == null ? '–' : v.toFixed(1));
const f2 = (v: number | null) => (v == null ? '–' : v.toFixed(2));

/** A team I follow: next game and live score, this season, the rivals, the whole history. */
export function TeamPage({ id }: { id: TeamId }) {
  const { events, news, now, teams, standings } = useData();
  const ap = id === 'texas' ? standings.ap?.rows.find(r => r.mine)?.rank ?? null : null;
  const t = teams?.[id];
  const mine = events.filter(e => e.passion === id);
  const live = mine.find(e => e.state === 'in');
  const upcoming = mine.filter(e => e.state === 'pre' && e.start > now);
  const past = mine.filter(e => e.state === 'post').sort((a, b) => b.start - a.start);
  const next = upcoming[0];
  const myNews = news.filter(n => n.passion === id).slice(0, 8);
  const tabs = teamTabs(id);
  const [tab, setTab] = useTab(tabs);
  const screens = tabs.length > 1;
  if (!t) return <Hero id={id} dek={next ? `Next: ${next.title}, ${dayLong(next.start)}.` : 'Loading the team…'} />;
  const soccer = t.sport === 'soccer';
  const unit = UNIT[t.sport];
  const c = t.card;
  // The trophies that matter most first (Milan's honours table also lists Serie B and the Supercoppa)
  const PRIORITY = [/^Serie A/, /Champions League|European Cup$|European Cup \//, /^Coppa Italia/, /Intercontinental|Club World/, /Super Bowl/, /World Series/, /AFC/, /pennants/, /Division/, /National/, /Conference/];
  const titles = t.trophies.filter(h => h.type !== 'Seasons').sort((a, b) => (PRIORITY.findIndex(re => re.test(a.competition)) + 99) % 99 - (PRIORITY.findIndex(re => re.test(b.competition)) + 99) % 99).slice(0, 4);

  return (
    <>
      <Hero id={id} dek={<>
        {c?.standing ? `${c.standing}, ${soccer ? `${c.w}-${c.d}-${c.l}` : c.record}. ` : ''}
        {live ? `Live now: ${live.title}. ` : next ? `Next: ${next.title}, ${dayLong(next.start)} at ${hhmm(next.start)}. ` : ''}
        {titles[0] ? `${titles.map(h => `${h.titles} ${h.competition}`).slice(0, 2).join(', ')} in ${t.history.length} seasons.` : ''}
      </>} />
      {screens && <ScreenTabs tabs={tabs} tab={tab} set={setTab} label={`${PASSION_NAME[id]} screens`} />}
      {screens && tab !== 'now' ? <TeamScreens id={id} tab={tab} /> : <>

      <section className="s-top">
        {live ? <LiveCard e={live} /> : next ? (
          <NextGame e={next} now={now} rival={t.rivals.find(r => r.id === (next.home?.mine ? next.away : next.home)?.id)} />
        ) : <div className="ocard"><div className="lab">Next up</div><div>Nothing scheduled.</div></div>}
        <div className="ocard">
          <div className="lab">This season</div>
          {c && (
            <div className="kpis">
              <div className="kpi"><Score as="b">{soccer ? `${c.pos ?? '–'}${ord(c.pos)}` : c.record}</Score><span>{soccer ? 'Serie A' : c.standing}</span></div>
              <div className="kpi"><Score as="b">{soccer ? c.pts : id === 'texas' ? (ap ? `#${ap}` : 'NR') : c.seed ? `#${c.seed}` : '–'}</Score><span>{soccer ? 'Points' : id === 'texas' ? 'AP rank' : 'Playoff seed'}</span></div>
              <div className="kpi"><Score as="b"><span style={{ fontSize: '0.8em', whiteSpace: 'nowrap' }}>{c.pf ?? '–'}–{c.pa ?? '–'}</span></Score><span>{unit[0].toUpperCase() + unit.slice(1)} for–against</span></div>
            </div>
          )}
          <FormStrip games={past.slice(0, 10).reverse()} />
        </div>
        <div className="ocard">
          <div className="lab">Trophy cabinet</div>
          <div className="kpis" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            {titles.map(h => <div key={h.competition} className="kpi"><b style={{ color: GOLD }}>{h.titles}</b><span>{h.competition.replace('European Cup / UEFA Champions League', 'European Cups')}</span></div>)}
          </div>
        </div>
      </section>

      {soccer && t.competitions && <Competitions t={t} />}

      {id === 'dodgers' && <DodgersSeason />}

      <section className="ocard">
        <h2>The season on the map</h2>
        <p className="dek">Every game of the season, home and away. Filled dots are played, hollow ones are still to come, the pulsing one is next.</p>
        <SeasonMap games={mine.filter(e => e.home && e.away)} next={next} home={HOME[id]} color={ocol(id)} />
      </section>

      <section className="ocard">
        <h2>{t.name} and the rivals, this season</h2>
        <p className="dek">{soccer ? 'Goals scored and conceded per game in Serie A' : `${unit[0].toUpperCase() + unit.slice(1)} scored and allowed per game`}: the further right and higher, the better. {t.card?.short ?? t.name} in color, the historic rivals in grey, the strongest teams of the moment outlined.</p>
        <AttackDefense t={t} id={id} />
        <CompareTable t={t} />
        <div className="osrc">Source: ESPN, {soccer ? 'league games' : 'regular season'} to date</div>
      </section>

      <section className="ocard">
        <h2>{t.history.length} seasons of {t.card?.short ?? t.name}</h2>
        <p className="dek">{soccer ? 'League finish every season since 1899: top-flight seasons on top, Serie B below; gold marks a title.' : id === 'pats' ? 'Winning percentage every season since 1960: playoff seasons in color, the six Super Bowl titles starred, a ring for the conference titles.' : id === 'dodgers' ? `Winning percentage every season since ${t.history[0]?.start ?? 1883}, Brooklyn to Los Angeles: postseason seasons in color, the World Series titles starred, a ring for the other pennants.` : 'Winning percentage every season since 1893: bowl seasons in color, the national titles starred.'}</p>
        <HistoryChart t={t} id={id} />
        <div className="osrc">Source: Wikipedia season lists{soccer ? '' : ' · ESPN since 2001'}</div>
      </section>

      {soccer && (
        <section className="ocard">
          <h2>Trophies, year by year</h2>
          <p className="dek">Every title won since 1899, placed in the year its season began. Hover a year to see what was won.</p>
          <TrophyTimeline honours={t.trophies} />
          <div className="osrc">Source: Wikipedia honours tables</div>
        </section>
      )}

      <section className="ocard">
        <h2>The rivals</h2>
        <p className="dek">All-time record from Wikipedia's rivalry pages where one exists; game by game from ESPN since 2001{t.sport === 'baseball' ? ' (regular season)' : ''}.</p>
        <div className="cy-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
          {t.rivals.map(r => <RivalCard key={r.id} r={r} soccer={soccer} unit={unit} color={ocol(id)} />)}
        </div>
      </section>

      <section className="s-two">
        <div className="ocard">
          <h2>Honours</h2>
          <table className="otable">
            <tbody>{t.trophies.map(h => (
              <tr key={h.competition}><td><b>{h.competition}</b><br /><small style={{ color: 'var(--o-ink3)' }}>{h.seasons.slice(-6).join(', ')}{h.seasons.length > 6 ? ' …' : ''}</small></td><td className="n"><b style={{ color: h.type === 'Seasons' ? 'var(--o-ink)' : GOLD, fontSize: 18 }}>{h.titles}</b></td></tr>
            ))}</tbody>
          </table>
        </div>
        <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
          <div className="ocard">
            <div className="lab">Schedule · Rome time</div>
            <div className="olist">
              {upcoming.slice(0, 6).map(e => <Row key={e.id} e={e} right={`in ${countdown(e.start - now)}`} />)}
              {past.slice(0, 5).map(e => { const m = mineOf(e); return <Row key={e.id} e={e} past right={<Score>{m ? `${m[0].score}–${m[1].score}` : 'Done'}</Score>} />; })}
            </div>
          </div>
          {myNews.length > 0 && (
            <div className="ocard">
              <div className="lab">From the wire</div>
              <div className="onews">{myNews.map(n => <a key={n.id} className="r" href={n.url} target="_blank" rel="noreferrer"><time>{now - n.time < DAY ? `Today ${hhmm(n.time)}` : dayShort(n.time)} · {n.source}</time><p>{n.title}</p></a>)}</div>
            </div>
          )}
        </div>
      </section>
      </>}
    </>
  );
}

const PASSION_NAME: Record<TeamId, string> = { milan: 'AC Milan', pats: 'Patriots', texas: 'Texas Longhorns', dodgers: 'Dodgers' };

const ord = (n: number | null) => (n == null ? '' : n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');

function LiveCard({ e }: { e: ObsEvent }) {
  return (
    <div className="ocard s-last">
      <div className="lab"><span style={{ color: '#ff453a' }}>● Live now</span> · {e.clock ?? ''}</div>
      <div style={{ color: 'var(--o-ink3)', fontSize: 12 }}>{e.title}</div>
      <Score as="div" className="big">{e.away?.abbr} {e.away?.score ?? 0} – {e.home?.score ?? 0} {e.home?.abbr}</Score>
      {e.tv && <div style={{ color: 'var(--o-ink2)', marginTop: 4 }}>{e.tv}</div>}
    </div>
  );
}

/** The last games as W/D/L squares, oldest first. */
function FormStrip({ games }: { games: ObsEvent[] }) {
  const rows = games.map(e => ({ e, m: mineOf(e) })).filter(x => x.m && x.m[0].score !== undefined);
  if (!rows.length) return null;
  return (
    <div style={{ display: 'flex', gap: 3, marginTop: 12 }} aria-label="Recent form">
      {rows.map(({ e, m }) => {
        const d = Number(m![0].score) - Number(m![1].score);
        return <span key={e.id} title={`${dayShort(e.start)} · ${m![0].name} ${m![0].score}–${m![1].score} ${m![1].name}`} style={{ flex: 1, height: 20, borderRadius: 3, display: 'grid', placeItems: 'center', fontSize: 10.5, fontWeight: 700, color: '#fff', background: d > 0 ? 'var(--o-s3)' : d < 0 ? 'var(--o-s2)' : 'var(--o-other)' }}>{d > 0 ? 'W' : d < 0 ? 'L' : 'D'}</span>;
      })}
    </div>
  );
}

function Competitions({ t }: { t: TeamData }) {
  return (
    <section className="ocard">
      <h2>Every competition</h2>
      <div className="cy-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {t.competitions!.map(c => {
          const played = c.games.filter(g => g.us != null), next = c.games.find(g => g.us == null);
          return (
            <div key={c.name} className="cy-tile" style={{ borderTopColor: 'var(--oc-mil)' }}>
              <small>{c.phase ?? 'Season'}</small>
              <b>{c.name.replace('Italian ', '')}</b>
              <span><Score>{c.w}W {c.d}D {c.l}L · goals {c.gf}–{c.ga}</Score></span>
              <div style={{ display: 'flex', gap: 3, margin: '6px 0' }}>{played.slice(-8).map((g, i) => <i key={i} title={`${g.home ? 'vs' : 'at'} ${g.opp} ${g.us}–${g.them}`} style={{ width: 14, height: 14, borderRadius: 3, background: g.us! > g.them! ? 'var(--o-s3)' : g.us! < g.them! ? 'var(--o-s2)' : 'var(--o-other)' }} />)}</div>
              {next ? <small style={{ textTransform: 'none', letterSpacing: 0 }}>Next: {next.home ? 'vs' : 'at'} {next.opp}, {dayShort(Date.parse(next.date))} {hhmm(Date.parse(next.date))}</small> : <small style={{ textTransform: 'none', letterSpacing: 0 }}>No game scheduled</small>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Attack against defence per game: one dot per team. */
function AttackDefense({ t, id }: { t: TeamData; id: TeamId }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const pts = [{ id: t.id, name: t.card?.short ?? t.name, card: t.card, kind: 'me' as const }, ...t.rivals.map(r => ({ id: r.id, name: r.name, card: r.card, kind: r.kind }))]
    .map(p => ({ ...p, x: per(p.card?.pf ?? null, p.card?.gp ?? null), y: per(p.card?.pa ?? null, p.card?.gp ?? null) }))
    .filter((p): p is typeof p & { x: number; y: number } => p.x != null && p.y != null);
  if (pts.length < 2) return <p className="dek">The season has not started yet.</p>;
  const H = 300, l = 44, r = 20, top = 16, b = 34;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const pad = (a: number, z: number) => Math.max(0.2, (z - a) * 0.15);
  const x0 = Math.min(...xs) - pad(Math.min(...xs), Math.max(...xs)), x1 = Math.max(...xs) + pad(Math.min(...xs), Math.max(...xs));
  const y0 = Math.min(...ys) - pad(Math.min(...ys), Math.max(...ys)), y1 = Math.max(...ys) + pad(Math.min(...ys), Math.max(...ys));
  const x = (v: number) => l + ((v - x0) / (x1 - x0)) * (W - l - r);
  const y = (v: number) => top + ((v - y0) / (y1 - y0)) * (H - top - b); // fewer conceded = higher
  const ticks = (a: number, z: number) => { const s = (z - a) > 10 ? 5 : (z - a) > 4 ? 1 : 0.5; const out = []; for (let v = Math.ceil(a / s) * s; v <= z; v += s) out.push(+v.toFixed(2)); return out; };
  return (
    <div ref={ref} className="ochart" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Scored and conceded per game">
        {ticks(x0, x1).map(v => <g key={`x${v}`}><line x1={x(v)} x2={x(v)} y1={top} y2={H - b} stroke="var(--o-grid)" /><text x={x(v)} y={H - b + 14} textAnchor="middle">{v}</text></g>)}
        {ticks(y0, y1).map(v => <g key={`y${v}`}><line x1={l} x2={W - r} y1={y(v)} y2={y(v)} stroke="var(--o-grid)" /><text x={l - 6} y={y(v) + 4} textAnchor="end">{v}</text></g>)}
        <text x={W - r} y={H - 4} textAnchor="end" style={{ fontSize: 11, fill: 'var(--o-ink2)' }}>Scored per game →</text>
        <text x={l} y={11} style={{ fontSize: 11, fill: 'var(--o-ink2)' }}>↑ Fewer conceded</text>
        {pts.map(p => (
          <g key={p.id} onPointerEnter={() => setHover(p.id)} onPointerLeave={() => setHover(null)}>
            <circle cx={x(p.x)} cy={y(p.y)} r={p.kind === 'me' ? 8 : 6} fill={p.kind === 'me' ? ocol(id) : p.kind === 'historic' ? 'var(--o-other)' : 'var(--o-card)'} stroke={p.kind === 'current' ? 'var(--o-ink2)' : 'var(--o-card)'} strokeWidth={2} />
            <text x={x(p.x) + 10} y={y(p.y) + 4} style={{ fontSize: 11.5, fill: p.kind === 'me' ? 'var(--o-ink)' : 'var(--o-ink2)', fontWeight: p.kind === 'me' ? 700 : 400 }}>{p.name}</text>
          </g>
        ))}
      </svg>
      {hover && (() => { const p = pts.find(q => q.id === hover)!; return <div className="tip obs" style={{ position: 'absolute', left: Math.min(x(p.x) + 12, W - 200), top: Math.max(0, y(p.y) - 10) }}><b>{p.card?.name ?? p.name}</b><div>{p.card?.record} · {p.card?.standing ?? ''}</div><div>{f1(p.x)} scored, {f1(p.y)} conceded per game</div></div>; })()}
    </div>
  );
}

function CompareTable({ t }: { t: TeamData }) {
  const soccer = t.sport === 'soccer', baseball = t.sport === 'baseball';
  const rows = [{ name: t.card?.short ?? t.name, card: t.card, stats: t.stats, kind: 'me' }, ...t.rivals.map(r => ({ name: r.name, card: r.card, stats: r.stats, kind: r.kind }))];
  return (
    <div style={{ overflowX: 'auto', marginTop: 12 }}>
      <table className="otable">
        <thead><tr><th>Team</th><th>Standing</th><th className="n">Record</th>{soccer ? <><th className="n">Pts</th><th className="n">GF</th><th className="n">GA</th></> : baseball ? <><th className="n">Runs/g</th><th className="n">Allowed</th><th className="n">Run diff.</th></> : <><th className="n">PPG</th><th className="n">Allowed</th><th className="n">Yds/g</th><th className="n">TO diff</th></>}</tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.name} className={r.kind === 'me' ? 'me' : ''}>
            <td>{r.name}{r.kind === 'current' ? <small style={{ color: 'var(--o-ink3)' }}> · top now</small> : null}</td>
            <td><small>{r.card?.standing ?? '–'}</small></td>
            <td className="n"><Score>{soccer && r.card ? `${r.card.w}-${r.card.d}-${r.card.l}` : r.card?.record ?? '–'}</Score></td>
            {soccer ? <><td className="n"><b>{r.card?.pts ?? '–'}</b></td><td className="n">{r.card?.pf ?? '–'}</td><td className="n">{r.card?.pa ?? '–'}</td></>
              : baseball ? <><td className="n">{f2(per(r.card?.pf ?? null, r.card?.gp ?? null))}</td><td className="n">{f2(per(r.card?.pa ?? null, r.card?.gp ?? null))}</td><td className="n">{r.card?.pf != null && r.card?.pa != null ? `${r.card.pf - r.card.pa > 0 ? '+' : ''}${r.card.pf - r.card.pa}` : '–'}</td></>
              : <><td className="n">{f1(per(r.card?.pf ?? null, r.card?.gp ?? null))}</td><td className="n">{f1(per(r.card?.pa ?? null, r.card?.gp ?? null))}</td><td className="n">{f1(r.stats?.ypg ?? null)}</td><td className="n">{r.stats?.toDiff ?? '–'}</td></>}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function HistoryChart({ t, id }: { t: TeamData; id: TeamId }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<Season | null>(null);
  const h = t.history;
  if (!h.length) return null;
  const soccer = t.sport === 'soccer';
  const H = 260, l = 34, r = 10, top = 14, b = 24;
  const y0 = h[0].start, y1 = h[h.length - 1].start;
  const x = (yr: number) => l + ((yr - y0) / Math.max(1, y1 - y0)) * (W - l - r);
  const bw = Math.max(2, (W - l - r) / h.length - 1);
  const decades = []; for (let d = Math.ceil(y0 / 10) * 10; d <= y1; d += 10) decades.push(d);
  if (soccer) {
    // Positions 1–20 in the top flight; Serie B in a band underneath
    const topH = H - top - b - 46;
    const yPos = (p: number) => top + ((p - 1) / 19) * topH;
    const yB = (p: number) => top + topH + 18 + ((p - 1) / 19) * 26;
    const isB = (s: Season) => /Serie B/.test(s.division);
    const pts = h.filter(s => s.pos != null);
    return (
      <div ref={ref} className="ochart" style={{ position: 'relative' }} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="League finish by season">
          {[1, 5, 10, 15, 20].map(p => <g key={p}><line x1={l} x2={W - r} y1={yPos(p)} y2={yPos(p)} stroke="var(--o-grid)" /><text x={l - 6} y={yPos(p) + 4} textAnchor="end">{p}</text></g>)}
          <text x={l - 6} y={yB(10) + 4} textAnchor="end" style={{ fontSize: 10 }}>B</text>
          {decades.map(d => <text key={d} x={x(d)} y={H - 6} textAnchor="middle">{d}</text>)}
          <path d={pts.filter(s => !isB(s)).map((s, i) => `${i ? 'L' : 'M'}${x(s.start)},${yPos(Math.min(20, s.pos!))}`).join(' ')} fill="none" stroke="var(--o-line)" strokeWidth={1} />
          {pts.map(s => {
            const cy = isB(s) ? yB(Math.min(20, s.pos!)) : yPos(Math.min(20, s.pos!));
            return <circle key={s.season} cx={x(s.start)} cy={cy} r={s.champion ? 5 : 3} fill={s.champion ? GOLD : isB(s) ? 'var(--o-other)' : ocol(id)} stroke={hover === s ? 'var(--o-ink)' : 'none'} onPointerEnter={() => setHover(s)} />;
          })}
        </svg>
        {hover && <SeasonTip s={hover} soccer x={Math.min(x(hover.start) + 10, W - 230)} />}
      </div>
    );
  }
  const wp = (s: Season) => ((s.w ?? 0) + (s.t ?? 0) / 2) / Math.max(1, (s.w ?? 0) + (s.l ?? 0) + (s.t ?? 0));
  const y = (v: number) => top + (1 - v) * (H - top - b);
  return (
    <div ref={ref} className="ochart" style={{ position: 'relative' }} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Winning percentage by season">
        {[0, 0.5, 1].map(v => <g key={v}><line x1={l} x2={W - r} y1={y(v)} y2={y(v)} stroke={v === 0.5 ? 'var(--o-ink3)' : 'var(--o-grid)'} strokeDasharray={v === 0.5 ? '3 3' : undefined} /><text x={l - 6} y={y(v) + 4} textAnchor="end">{Math.round(v * 100)}%</text></g>)}
        {decades.map(d => <text key={d} x={x(d)} y={H - 6} textAnchor="middle">{d}</text>)}
        {h.map(s => {
          const v = wp(s), post = id === 'texas' ? Boolean(s.bowl) : s.playoffs;
          return (
            <g key={s.season} onPointerEnter={() => setHover(s)}>
              <rect x={x(s.start) - bw / 2} y={y(v)} width={bw} height={y(0) - y(v)} rx={Math.min(2, bw / 2)} fill={s.champion ? 'var(--o-ink)' : post ? ocol(id) : 'var(--o-other)'} opacity={hover && hover !== s ? 0.6 : 1} />
              {s.champion && <text x={x(s.start)} y={y(v) - 4} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--o-ink)' }}>★</text>}
              {s.conferenceChampion && id !== 'texas' && !s.champion && <circle cx={x(s.start)} cy={y(v) - 6} r={3} fill="none" stroke={ocol(id)} strokeWidth={1.5} />}
            </g>
          );
        })}
      </svg>
      <div className="olegend"><span><i style={{ background: ocol(id), height: 10 }} />{id === 'texas' ? 'Bowl season' : 'Playoffs'}</span><span><i style={{ background: 'var(--o-ink)', height: 10 }} />★ {id === 'pats' ? 'Super Bowl champions' : id === 'dodgers' ? 'World Series champions' : 'National champions'}</span>{id !== 'texas' && <span><i style={{ border: `1.5px solid ${ocol(id)}`, width: 8, height: 8, borderRadius: 5 }} />{id === 'pats' ? 'AFC champions' : 'NL pennant'}</span>}<span><i style={{ background: 'var(--o-other)', height: 10 }} />Other seasons</span></div>
      {hover && <SeasonTip s={hover} soccer={false} x={Math.min(x(hover.start) + 10, W - 230)} />}
    </div>
  );
}

function SeasonTip({ s, soccer, x }: { s: Season; soccer: boolean; x: number }) {
  return (
    <div className="tip obs" style={{ position: 'absolute', left: x, top: 10, maxWidth: 230 }}>
      <b>{s.season}{s.champion ? ' · champions' : ''}</b>
      {soccer ? <>
        <div>{s.division}: {s.pos}{ord(s.pos)}{s.pts != null ? `, ${s.pts} pts` : ''}</div>
        {s.pld != null && <div>{s.w}W {s.d}D {s.l}L · {s.gf}–{s.ga}</div>}
        {s.cup && <div>Cup: {s.cup}</div>}
        {s.europe?.filter(e => e.comp).map(e => <div key={e.comp}>{e.comp}: {e.result}</div>)}
        {s.scorer && <div className="k">Top scorer: {s.scorer} ({s.goals})</div>}
      </> : <>
        <div>{s.w}–{s.l}{s.t ? `–${s.t}` : ''}{s.coach ? ` · ${s.coach}` : ''}</div>
        {s.postseason && <div>{s.postseason}</div>}
        {s.bowl && <div>{s.bowl} {s.bowlResult ? `(${s.bowlResult})` : ''}</div>}
        {s.apRank && <div>Final AP rank: {s.apRank}</div>}
      </>}
    </div>
  );
}

function RivalCard({ r, soccer, unit, color }: { r: Rival; soccer: boolean; unit: string; color: string }) {
  const a = r.allTime;
  const s = r.since2001;
  const bar = (w: number, d: number, l: number) => {
    const tot = Math.max(1, w + d + l);
    return (
      <div style={{ display: 'flex', gap: 2, height: 10, borderRadius: 3, overflow: 'hidden', margin: '4px 0' }}>
        <div style={{ flex: w / tot, background: color }} />{d > 0 && <div style={{ flex: d / tot, background: 'var(--o-other)' }} />}<div style={{ flex: l / tot, background: 'var(--o-ink3)' }} />
      </div>
    );
  };
  return (
    <div className="cy-tile" style={{ borderTopColor: r.kind === 'historic' ? color : 'var(--o-ink3)' }}>
      <small>{r.kind === 'historic' ? r.label ?? 'Historic rival' : 'Among the strongest now'}</small>
      <b>{r.card?.name ?? r.name}</b>
      <span>{r.card?.standing ?? ''}{r.card?.record ? ` · ${soccer ? `${r.card.w}-${r.card.d}-${r.card.l}` : r.card.record}` : ''}</span>
      {a?.wins != null ? <>
        <div style={{ fontSize: 12, marginTop: 6 }}>All time · {a.total} games</div>
        {bar(a.wins, a.draws ?? 0, a.losses ?? 0)}
        <Score><small style={{ textTransform: 'none', letterSpacing: 0 }}>{a.wins} wins{soccer || a.draws ? ` · ${a.draws} ${soccer ? 'draws' : 'ties'}` : ''} · {a.losses} losses</small></Score>
      </> : null}
      <div style={{ fontSize: 12, marginTop: 6 }}>Since 2001 · {s.w + s.d + s.l} games</div>
      {s.w + s.d + s.l > 0 ? <>{bar(s.w, s.d, s.l)}<Score><small style={{ textTransform: 'none', letterSpacing: 0 }}>{s.w}-{soccer ? `${s.d}-` : ''}{s.l} · {unit} {s.gf}–{s.ga}</small></Score></> : <small style={{ textTransform: 'none', letterSpacing: 0 }}>No meetings</small>}
      {r.recent.length > 0 && (
        <div style={{ display: 'flex', gap: 3, marginTop: 8, flexWrap: 'wrap' }}>
          {r.recent.slice(0, 6).map(g => <span key={g.date} title={`${g.date} · ${g.home ? 'home' : 'away'} ${g.us}–${g.them}`} style={{ fontSize: 10.5, padding: '1px 5px', borderRadius: 3, color: '#fff', background: g.result === 'W' ? 'var(--o-s3)' : g.result === 'L' ? 'var(--o-s2)' : 'var(--o-other)' }}>{g.us}–{g.them}</span>)}
        </div>
      )}
    </div>
  );
}

/** The Dodgers' year: October series by series, and the regular season game by game. */
function DodgersSeason() {
  const { mlb } = useData();
  if (!mlb) return null;
  const mine = mlb.series.filter(s => s.teams.some(t => t.id === DODGERS));
  const last = mine[mine.length - 1];
  let net = 0;
  const trend: TrendPoint[] = mlb.dodgers.map((g, i) => {
    net += g.win ? 1 : -1;
    return { x: g.date, y: net, tip: `Game ${i + 1} · ${dayShort(g.date)} · ${g.win ? 'W' : 'L'} ${g.rs}–${g.ra} ${g.home ? 'vs' : '@'} ${g.opp} · ${net >= 0 ? '+' : ''}${net}` };
  });
  return (
    <>
      {mine.length > 0 && (
        <section className="ocard">
          <h2>The Dodgers in October</h2>
          <p className="dek">{seriesSentence(mlb, last)}{last.done && last.winner !== DODGERS ? ' Their postseason is over.' : ''}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {mine.map(s => <div key={s.key}><div className="lab">{s.league !== 'MLB' ? `${s.league} ` : ''}{s.round}</div><SeriesBox s={s} /></div>)}
          </div>
          <details style={{ marginTop: 14 }}><summary className="lab" style={{ cursor: 'pointer' }}>The whole bracket</summary><Bracket series={mlb.series} /></details>
        </section>
      )}
      {trend.length > 1 && (
        <section className="ocard">
          <h2>The {mlb.season} regular season, game by game</h2>
          <p className="dek">Wins minus losses after each regular-season game. Hover for the result.</p>
          <TrendLine points={trend} color={ocol('dodgers')} unit="games over .500" />
          <div className="osrc">Source: ESPN</div>
        </section>
      )}
    </>
  );
}
