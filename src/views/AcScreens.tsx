// America's Cup screens beyond the home: every race of the preliminary regattas, who
// sails fastest, the teams and Naples 2027, the history since 1851 and the rules.
// Data: ac.json (regattas, races) and ac-history.json (Wikipedia).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PercentileGrid, QuadrantScatter, type GridCol } from '../components/power';
import { Chips } from '../components/tabs';
import { getJSON } from '../core/fetcher';
import { dayShort } from '../core/time';
import type { AcData } from '../sources/ac';

export const AC_TABS = [['now', 'Now'], ['season', 'Races'], ['power', 'Power'], ['naples', 'Naples 2027'], ['history', 'History'], ['how', 'How it works']] as const;
export type AcTab = typeof AC_TABS[number][0];

export interface AcHistory { updated: string; matches: { year: number; venue: string; defendingClub: string; defendingNation: string | null; defender: string; score: string | null; challenger: string; challengingClub: string; challengingNation: string | null; winner: 'defender' | 'challenger' | null }[] }
export function useAcHistory(enabled = true) {
  const [d, setD] = useState<AcHistory | null>(null);
  useEffect(() => { if (!enabled) return; let on = true; getJSON<AcHistory>(`${import.meta.env.BASE_URL}data/ac-history.json`, 60 * 60e3).then(x => on && setD(x)).catch(() => {}); return () => { on = false; }; }, [enabled]);
  return d;
}

const Src = ({ children }: { children: ReactNode }) => <div className="osrc">{children}</div>;
const TEAM: [RegExp, string][] = [[/Luna Rossa/, '#c8102e'], [/New Zealand/, '#111'], [/Alinghi/, '#e30613'], [/Roche-Posay|K-Challenge|France/, '#0055a4'], [/GB|Britannia|INEOS/, '#1d3f73'], [/USA|American Magic/, '#3c6ad6'], [/Athena/, '#2a9d8f']];
const ink = (t: string) => TEAM.find(([re]) => re.test(t))?.[1] ?? 'var(--o-other)';
const youth = (t: string) => /Women|Youth|GB2|Luna Rossa \d|Pathway/i.test(t);

export function RacesScreen({ ac }: { ac: AcData }) {
  const [reg, setReg] = useState(ac.regattas.at(-1)?.name ?? '');
  const r = ac.regattas.find(x => x.name === reg);
  const races = ac.races.filter(x => x.regatta === reg);
  const teams = r?.standings.map(s => s.team) ?? [];
  return (
    <section className="ocard">
      <h2>Every race</h2>
      <Chips label="Regatta" items={ac.regattas.map(x => ({ k: x.name, label: x.name }))} value={reg} set={setReg} />
      <p className="dek">Finishing place of every boat in every race, teams in final order. Fleet racing: the winner of a race scores 10 points, the last 1 or so; the totals decide the regatta.</p>
      <div style={{ overflowX: 'auto' }}>
        <table className="otable" style={{ fontSize: 12 }}>
          <thead><tr><th>Team</th><th className="n">Pts</th>{races.map(x => <th key={x.id} className="n" title={dayShort(Date.parse(x.start))}>{x.name}</th>)}</tr></thead>
          <tbody>{teams.map(t => <tr key={t}><td style={{ whiteSpace: 'nowrap' }}><span style={{ display: 'inline-block', width: 4, height: 12, background: ink(t), marginRight: 6, verticalAlign: -1 }} />{t}</td><td className="n"><b>{r?.standings.find(s => s.team === t)?.total}</b></td>
            {races.map(x => { const p = x.teams.find(y => y.team === t)?.position; return <td key={x.id} className="n" style={{ background: p === 1 ? '#d4af37' : p === 2 ? '#a8a9ad' : p === 3 ? '#b0764a' : undefined, color: p && p <= 3 ? '#fff' : 'var(--o-ink2)', fontWeight: p && p <= 3 ? 700 : 400 }}>{p ?? '–'}</td>; })}</tr>)}</tbody>
        </table>
      </div>
      <Src>Source: americascup.com</Src>
    </section>
  );
}

export function PowerScreen({ ac }: { ac: AcData }) {
  const stats = useMemo(() => {
    const m: Record<string, { pos: number[]; pts: number[] }> = {};
    for (const r of ac.races) for (const t of r.teams) { const x = (m[t.team] ??= { pos: [], pts: [] }); if (t.position) x.pos.push(t.position); x.pts.push(t.points); }
    return Object.entries(m).map(([team, x]) => {
      const avg = x.pos.reduce((a, b) => a + b, 0) / (x.pos.length || 1);
      const sd = Math.sqrt(x.pos.reduce((a, b) => a + (b - avg) ** 2, 0) / (x.pos.length || 1));
      return { team, races: x.pos.length, avg, wins: x.pos.filter(p => p === 1).length, podium: x.pos.filter(p => p <= 3).length / (x.pos.length || 1), sd, ptsPerRace: x.pts.reduce((a, b) => a + b, 0) / (x.pts.length || 1) };
    }).sort((a, b) => a.avg - b.avg);
  }, [ac]);
  const cols: GridCol[] = [{ key: 'avg', label: 'Avg place', fmt: v => v.toFixed(1), low: true }, { key: 'ptsPerRace', label: 'Pts/race', fmt: v => v.toFixed(1) }, { key: 'wins', label: 'Race wins', fmt: v => String(v) }, { key: 'podium', label: 'Top three', fmt: v => `${Math.round(v * 100)}%` }, { key: 'sd', label: 'Consistency', fmt: v => `±${v.toFixed(1)}`, low: true, title: 'Spread of the finishing places: lower is more consistent' }];
  const senior = stats.filter(s => !youth(s.team));
  return (
    <>
      <section className="ocard">
        <h2>Who sails fastest</h2>
        <p className="dek">Over the {ac.races.length} races of the {ac.edition} preliminary regattas the best average place belongs to <b>{senior[0]?.team}</b>; the most race wins to <b>{[...senior].sort((a, b) => b.wins - a.wins)[0]?.team}</b>. These regattas are sailed in one-design AC40 foiling boats, so they measure the crews, not the design of the AC75s that will race the Cup.</p>
        <QuadrantScatter height={380} invertY xLabel="Share of top-three finishes" yLabel="Average place (better ↑)" fmt={v => v.toFixed(1)} fmtX={v => `${Math.round(v * 100)}%`} corners={['Fast and steady', '', '', 'Off the pace']}
          points={stats.map(s => ({ id: s.team, label: s.team.replace(/Emirates Team /, 'ETNZ ').replace(/ Women & Youth( Team)?/, ' W&Y').replace(' Racing Team', ''), x: s.podium, y: s.avg, color: youth(s.team) ? undefined : ink(s.team), tip: <><div className="k">{s.team}</div>Average place {s.avg.toFixed(1)} over {s.races} races · {s.wins} wins · top three {Math.round(s.podium * 100)}%</> }))} />
        <p className="dek" style={{ fontSize: 11.5 }}>Grey: the women's and youth crews of the same teams.</p>
      </section>
      <section className="ocard">
        <h2>Every crew</h2>
        <PercentileGrid rows={stats.map(s => ({ id: s.team, label: s.team, values: { avg: s.avg, ptsPerRace: s.ptsPerRace, wins: s.wins, podium: s.podium, sd: s.sd } }))} cols={cols} initial="avg" />
        <Src>Computed from americascup.com results</Src>
      </section>
    </>
  );
}

export function NaplesScreen() {
  const P = ({ children }: { children: ReactNode }) => <p style={{ margin: '0 0 10px', lineHeight: 1.55, fontSize: 14 }}>{children}</p>;
  return (
    <section className="s-two">
      <div className="ocard">
        <h2>The 38th America's Cup</h2>
        <P><b>Naples, summer 2027:</b> the first America's Cup ever sailed in Italy, on the Bay of Naples. The defender is <b>Emirates Team New Zealand</b> (Royal New Zealand Yacht Squadron), winner in 2017, 2021 and 2024.</P>
        <P>The challengers first race each other in the <b>Louis Vuitton Cup</b>; the winner meets the defender in the <b>Match</b>, from 10 July 2027.</P>
        <P><b>Luna Rossa</b> (Circolo della Vela Sicilia) is the Italian challenger: Cup finalist in 2000 and 2021, winner of both 2026 preliminary regattas.</P>
      </div>
      <div className="ocard">
        <h2>The boats</h2>
        <P><b>AC75:</b> 75-foot monohulls that fly on hydrofoils, carried by two swinging foil arms, at over 50 knots (about 95 km/h). The crew is eight: helmsmen, trimmers and the cyclors who pedal to power the hydraulics.</P>
        <P><b>AC40:</b> the smaller one-design version used in the preliminary regattas and for the women's and youth events, so all teams race identical boats.</P>
      </div>
    </section>
  );
}

export function HistoryScreen({ h }: { h: AcHistory }) {
  const done = h.matches.filter(m => m.winner);
  const nation = (m: AcHistory['matches'][number]) => (m.winner === 'defender' ? m.defendingNation : m.challengingNation) ?? '–';
  const club = (m: AcHistory['matches'][number]) => (m.winner === 'defender' ? m.defendingClub : m.challengingClub);
  const byNation = Object.entries(done.reduce<Record<string, number>>((a, m) => { const n = nation(m) === 'US' ? 'USA' : nation(m) === 'NZ' ? 'NZL' : nation(m); a[n] = (a[n] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const defWins = done.filter(m => m.winner === 'defender').length;
  return (
    <>
      <section className="ocard">
        <h2>Since 1851</h2>
        <p className="dek">The oldest trophy in international sport. {done.length} matches: the defender has kept the Cup {defWins} times; the challenger has taken it {done.length - defWins} times. The New York Yacht Club held it for 132 years, until Australia II in 1983.</p>
        <div className="lab">Cups won, by nation</div>
        {byNation.map(([n, k]) => <div key={n} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 28px', gap: 8, alignItems: 'center', fontSize: 12.5, margin: '3px 0' }}><span>{n}</span><span style={{ height: 10, width: `${(k / byNation[0][1]) * 100}%`, background: 'var(--o-s1)', borderRadius: 2 }} /><b>{k}</b></div>)}
      </section>
      <section className="ocard">
        <h2>Every match</h2>
        <table className="otable" style={{ fontSize: 12 }}><thead><tr><th>Year</th><th>Venue</th><th>Winner</th><th className="n">Score</th><th>Loser</th></tr></thead>
          <tbody>{[...h.matches].reverse().map(m => { const w = m.winner === 'challenger' ? m.challenger : m.defender, l = m.winner === 'challenger' ? m.defender : m.challenger; return <tr key={m.year}><td>{m.year}</td><td>{m.venue}</td><td>{m.winner ? <><b>{w}</b> <small style={{ color: 'var(--o-ink3)' }}>{club(m)}{m.winner === 'challenger' ? ' · challenger' : ''}</small></> : <span style={{ color: 'var(--o-ink3)' }}>{m.defender} (defender) vs {m.challenger}</span>}</td><td className="n">{m.score}</td><td style={{ color: 'var(--o-ink2)' }}>{m.winner ? l : ''}</td></tr>; })}</tbody></table>
        <Src>Source: Wikipedia, America's Cup</Src>
      </section>
    </>
  );
}

export function HowScreen() {
  const P = ({ children }: { children: ReactNode }) => <p style={{ margin: '0 0 10px', lineHeight: 1.55, fontSize: 14 }}>{children}</p>;
  return (
    <section className="s-two">
      <div className="ocard">
        <h2>The rules of the Cup</h2>
        <P>The Cup is a <b>challenge</b>: the holder (the defending yacht club) sets the venue and, with the first challenger to sign up (the Challenger of Record), writes the rules of the next edition in the <b>Protocol</b>, including the class of boat.</P>
        <P><b>The Match</b> is one boat against another, first to seven race wins (2024). Starts are a duel: the boats enter the box two minutes before the gun and fight for the favoured side.</P>
      </div>
      <div className="ocard">
        <h2>The road to the Match</h2>
        <P><b>Preliminary regattas</b> (2026): fleet racing in AC40s, points for every race, a warm-up that counts for nothing but prestige and data.</P>
        <P><b>Louis Vuitton Cup</b>: the challengers race in AC75s, round robins then knock-out, to choose the one that meets the defender.</P>
        <P>The <b>women's</b> and <b>youth</b> America's Cups run alongside, in AC40s.</P>
      </div>
    </section>
  );
}
