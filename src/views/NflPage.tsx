import { useEffect, useState } from 'react';
import { useWidth } from '../components/charts';
import { Score } from '../components/common';
import { Hero } from '../components/sheet';
import { useData } from '../core/store';
import { countdown, dayLong, fmt, hhmm } from '../core/time';
import { nflLeaders, nflStandings, nflWeek, type NflGame, type NflLeader, type NflStandingRow, type NflWeek } from '../sources/nflLeague';

const DIVS = ['East', 'North', 'South', 'West'];

/** This week's games refresh every 30 s while any is live (2 minutes otherwise); standings and leaders every 15 minutes. */
function useNfl() {
  const [week, setWeek] = useState<NflWeek | null>(null);
  const [lastWeek, setLastWeek] = useState<NflWeek | null>(null);
  const [table, setTable] = useState<NflStandingRow[] | null>(null);
  const [leaders, setLeaders] = useState<NflLeader[] | null>(null);
  useEffect(() => {
    let on = true, timer = 0;
    const tick = async () => {
      const w = await nflWeek().catch(() => null);
      if (!on) return;
      if (w) setWeek(w);
      const live = w?.games.some(g => g.state === 'in' || (g.state === 'pre' && g.start - Date.now() < 10 * 60e3));
      timer = window.setTimeout(tick, live ? 30e3 : 120e3);
    };
    tick();
    return () => { on = false; clearTimeout(timer); };
  }, []);
  useEffect(() => {
    const load = () => { nflStandings().then(setTable).catch(() => {}); nflLeaders().then(setLeaders).catch(() => {}); };
    load();
    const t = setInterval(load, 15 * 60e3);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (week && week.week > 1 && !lastWeek) nflWeek(week.week - 1).then(setLastWeek).catch(() => {}); }, [week, lastWeek]);
  return { week, lastWeek, table, leaders };
}

/** The NFL: the weekend's games live, the season so far (standings, playoff picture, point differential, leaders). */
export function NflPage() {
  const { now } = useData();
  const { week, lastWeek, table, leaders } = useNfl();
  const live = week?.games.filter(g => g.state === 'in') ?? [];
  const next = week?.games.find(g => g.state === 'pre');
  const best = table ? [...table].sort((a, b) => b.pct - a.pct || b.diff - a.diff)[0] : null;
  const unbeaten = table?.filter(r => r.l === 0 && r.w > 0).map(r => r.abbr) ?? [];
  const winless = table?.filter(r => r.w === 0 && r.l > 0).map(r => r.abbr) ?? [];
  return (
    <>
      <Hero id="nfl" dek={<>
        {week ? `${week.label}. ` : 'Loading the NFL… '}
        {live.length ? `${live.length} game${live.length > 1 ? 's' : ''} live now. ` : next ? `Next kickoff: ${next.away.short} at ${next.home.short}, ${dayLong(next.start)} ${hhmm(next.start)}. ` : ''}
        {unbeaten.length ? `Still unbeaten: ${unbeaten.join(', ')}. ` : ''}{winless.length ? `Still winless: ${winless.join(', ')}.` : ''}
      </>} />

      <section className="s-top">
        <div className="ocard s-next">
          <div className="lab">{live.length ? <span style={{ color: '#ff453a' }}>● Live now</span> : 'Next kickoff'}</div>
          {live[0] ? <GameLine g={live[0]} big /> : next ? <>
            <h3>{next.away.short} @ {next.home.short}</h3>
            <div className="when">{dayLong(next.start)} · {hhmm(next.start)} Rome{next.tv ? ` · ${next.tv}` : ''}</div>
            <div className="s-cd">{countdown(next.start - now)}<small>T-minus</small></div>
          </> : <div>No game scheduled this week.</div>}
        </div>
        <div className="ocard">
          <div className="lab">The best record</div>
          {best && <><h3 style={{ margin: 0 }}>{best.name}</h3><div className="kpis" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginTop: 8 }}>
            <div className="kpi"><Score as="b">{best.w}-{best.l}{best.t ? `-${best.t}` : ''}</Score><span>Record</span></div>
            <div className="kpi"><Score as="b">{best.diff > 0 ? '+' : ''}{best.diff}</Score><span>Point diff.</span></div>
            <div className="kpi"><Score as="b">{best.streak || '–'}</Score><span>Streak</span></div>
          </div></>}
        </div>
        <div className="ocard">
          <div className="lab">This week</div>
          {week && <div className="kpis">
            <div className="kpi"><b>{week.games.length}</b><span>Games</span></div>
            <div className="kpi"><b>{week.games.filter(g => g.state === 'post').length}</b><span>Played</span></div>
            <div className="kpi"><b>{week.byes.length}</b><span>On bye{week.byes.length ? `: ${week.byes.join(', ')}` : ''}</span></div>
          </div>}
        </div>
      </section>

      {week && (
        <section className="ocard">
          <h2>{week.label}: every game</h2>
          <p className="dek">Kickoffs in Rome time. Live games refresh every 30 seconds with the score by quarter, possession, down and distance.</p>
          {groupByDay(week.games).map(([day, games]) => (
            <div key={day} style={{ marginBottom: 14 }}>
              <div className="lab">{day}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                {games.map(g => <GameCard key={g.id} g={g} />)}
              </div>
            </div>
          ))}
          <div className="osrc">Source: ESPN</div>
        </section>
      )}

      {table && <Playoffs table={table} />}

      {table && (
        <section className="ocard">
          <h2>Point differential, all 32 teams</h2>
          <p className="dek">Points scored minus points allowed so far, the best single measure of how good a team has been. Grouped by division; bars in each team's conference colour.</p>
          <DiffChart table={table} />
          <div className="osrc">Source: ESPN standings</div>
        </section>
      )}

      {table && <Divisions table={table} />}

      <section className="s-two">
        {leaders && (
          <div className="ocard">
            <h2>Statistical leaders</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
              {leaders.map(c => (
                <div key={c.cat}>
                  <div className="lab">{c.label}</div>
                  {c.rows.map((r, i) => <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '14px 1fr auto', gap: 6, fontSize: 12.5, padding: '2px 0' }}><span style={{ color: 'var(--o-ink3)' }}>{i + 1}</span><span>{r.name} <small style={{ color: 'var(--o-ink3)' }}>{r.team}</small></span><Score><b>{r.value}</b></Score></div>)}
                </div>
              ))}
            </div>
          </div>
        )}
        {lastWeek && (
          <div className="ocard">
            <h2>{lastWeek.label} results</h2>
            <div style={{ display: 'grid', gap: 6 }}>{lastWeek.games.map(g => <GameLine key={g.id} g={g} />)}</div>
          </div>
        )}
      </section>
    </>
  );
}

const groupByDay = (games: NflGame[]) => {
  const m = new Map<string, NflGame[]>();
  for (const g of games) { const k = fmt(g.start, { weekday: 'long', day: 'numeric', month: 'long' }); m.set(k, [...(m.get(k) ?? []), g]); }
  return [...m.entries()];
};

function GameLine({ g, big }: { g: NflGame; big?: boolean }) {
  const row = (t: NflGame['home'], other: NflGame['home']) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontWeight: t.winner || (g.state === 'in' && (t.score ?? 0) > (other.score ?? 0)) ? 700 : 400, color: g.state === 'post' && !t.winner ? 'var(--o-ink3)' : 'var(--o-ink)' }}>
      <span>{g.possession === t.abbr ? '🏈 ' : ''}{big ? t.name : t.short} <small style={{ color: 'var(--o-ink3)' }}>{t.record}</small></span><Score><b>{g.state === 'pre' ? '' : t.score ?? ''}</b></Score>
    </div>
  );
  return (
    <div style={{ fontSize: big ? 16 : 13 }}>
      {row(g.away, g.home)}{row(g.home, g.away)}
      <div style={{ fontSize: 11, color: g.state === 'in' ? '#ff453a' : 'var(--o-ink3)' }}>{g.state === 'pre' ? `${hhmm(g.start)} Rome${g.tv ? ` · ${g.tv}` : ''}` : g.shortDetail}{g.downDistance ? ` · ${g.downDistance}` : ''}</div>
    </div>
  );
}

function GameCard({ g }: { g: NflGame }) {
  const liveBg = g.state === 'in' ? 'color-mix(in srgb, #ff453a 7%, var(--o-card))' : 'var(--o-card)';
  return (
    <div style={{ border: `1px solid ${g.state === 'in' ? '#ff453a' : 'var(--o-line)'}`, borderRadius: 10, padding: '10px 12px', background: liveBg }}>
      <GameLine g={g} />
      {g.state !== 'pre' && g.home.lines.length > 0 && (
        <table style={{ width: '100%', fontSize: 11, marginTop: 6, color: 'var(--o-ink2)', fontVariantNumeric: 'tabular-nums' }}>
          <tbody>{[g.away, g.home].map(t => <tr key={t.id}><td>{t.abbr}</td>{t.lines.map((v, i) => <td key={i} style={{ textAlign: 'right' }}>{v}</td>)}<td style={{ textAlign: 'right', fontWeight: 700 }}><Score>{t.score}</Score></td></tr>)}</tbody>
        </table>
      )}
      {g.state === 'in' && g.lastPlay && <div style={{ fontSize: 11.5, marginTop: 6, color: 'var(--o-ink2)' }}>{g.redZone ? <b style={{ color: '#ff453a' }}>Red zone · </b> : null}<Score>{g.lastPlay}</Score></div>}
      {g.state !== 'pre' && g.leaders.length > 0 && <div style={{ fontSize: 11, marginTop: 6, color: 'var(--o-ink3)' }}><Score>{g.leaders.map(l => `${l.who} ${l.line}`).join(' · ')}</Score></div>}
      {g.state === 'pre' && <div style={{ fontSize: 11, marginTop: 4, color: 'var(--o-ink3)' }}>{g.venue}{g.note ? ` · ${g.note}` : ''}</div>}
    </div>
  );
}

function Playoffs({ table }: { table: NflStandingRow[] }) {
  return (
    <section className="ocard">
      <h2>If the season ended today</h2>
      <p className="dek">The seven playoff teams in each conference: four division leaders, then three wild cards. The top seed has a bye.</p>
      <div className="s-two" style={{ gap: 24 }}>
        {(['AFC', 'NFC'] as const).map(conf => {
          const seeds = table.filter(r => r.conf === conf && r.seed && r.seed <= 7).sort((a, b) => a.seed! - b.seed!);
          const hunt = table.filter(r => r.conf === conf && (!r.seed || r.seed > 7)).sort((a, b) => b.pct - a.pct || b.diff - a.diff).slice(0, 3);
          return (
            <div key={conf}>
              <div className="lab">{conf}</div>
              <table className="otable"><tbody>
                {seeds.map(r => <tr key={r.id}><td style={{ width: 24 }}><b>{r.seed}</b></td><td>{r.name}<small style={{ color: 'var(--o-ink3)' }}>{r.seed! <= 4 ? ` · ${r.div.replace(`${conf} `, '')} leader` : ' · wild card'}{r.seed === 1 ? ' · bye' : ''}</small></td><td className="n"><Score>{r.w}-{r.l}{r.t ? `-${r.t}` : ''}</Score></td></tr>)}
                {hunt.map(r => <tr key={r.id} style={{ color: 'var(--o-ink3)' }}><td /><td>{r.name} <small>· in the hunt</small></td><td className="n">{r.w}-{r.l}</td></tr>)}
              </tbody></table>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DiffChart({ table }: { table: NflStandingRow[] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const order = (['AFC', 'NFC'] as const).flatMap(c => DIVS.flatMap(d => table.filter(r => r.div === `${c} ${d}`).sort((a, b) => b.diff - a.diff)));
  const max = Math.max(10, ...order.map(r => Math.abs(r.diff)));
  const H = 260, l = 34, b = 46, t = 10;
  const band = (W - l) / order.length, bw = Math.min(18, band * 0.7);
  const y = (v: number) => t + ((max - v) / (2 * max)) * (H - t - b);
  return (
    <div ref={ref} className="ochart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Point differential by team">
        {[-max, 0, max].map(v => <g key={v}><line x1={l} x2={W} y1={y(v)} y2={y(v)} stroke={v === 0 ? 'var(--o-ink3)' : 'var(--o-grid)'} /><text x={l - 6} y={y(v) + 4} textAnchor="end">{v > 0 ? `+${Math.round(v)}` : Math.round(v)}</text></g>)}
        {order.map((r, i) => {
          const cx = l + band * i + band / 2;
          const divStart = i === 0 || order[i - 1].div !== r.div;
          return (
            <g key={r.id}>
              {divStart && <><line x1={l + band * i} x2={l + band * i} y1={t} y2={H - 14} stroke="var(--o-grid)" /><text x={l + band * i + 3} y={H - 4} style={{ fontSize: 10 }}>{r.div}</text></>}
              <rect x={cx - bw / 2} y={Math.min(y(r.diff), y(0))} width={bw} height={Math.abs(y(r.diff) - y(0))} rx={2} fill={r.conf === 'AFC' ? 'var(--o-rep)' : 'var(--o-dem)'}><title>{`${r.name} ${r.w}-${r.l} · ${r.pf}–${r.pa} (${r.diff > 0 ? '+' : ''}${r.diff})`}</title></rect>
              <text x={cx} y={H - 22} textAnchor="middle" style={{ fontSize: 9.5, fill: 'var(--o-ink2)' }} transform={`rotate(-90 ${cx} ${H - 22})`}>{r.abbr}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Divisions({ table }: { table: NflStandingRow[] }) {
  return (
    <section className="ocard">
      <h2>The eight divisions</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 16 }}>
        {(['AFC', 'NFC'] as const).flatMap(c => DIVS.map(d => `${c} ${d}`)).map(div => (
          <div key={div}>
            <div className="lab">{div}</div>
            <table className="otable">
              <thead><tr><th>Team</th><th className="n">W-L</th><th className="n">PF</th><th className="n">PA</th><th className="n">Strk</th></tr></thead>
              <tbody>{table.filter(r => r.div === div).sort((a, b) => b.pct - a.pct || b.diff - a.diff).map(r => (
                <tr key={r.id} className={r.abbr === 'NE' ? 'me' : ''}><td>{r.name.split(' ').slice(-1)[0]}{r.seed && r.seed <= 7 ? <small style={{ color: 'var(--o-ink3)' }}> ({r.seed})</small> : null}</td><td className="n"><Score>{r.w}-{r.l}{r.t ? `-${r.t}` : ''}</Score></td><td className="n">{r.pf}</td><td className="n">{r.pa}</td><td className="n">{r.streak}</td></tr>
              ))}</tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}
