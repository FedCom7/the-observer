// Olympic screens beyond the home: where Italy is strong, Italy at every Games, the
// all-time medal table and how the Games work. Data: olympics-history.json (Wikipedia).
import { useEffect, useState, type ReactNode } from 'react';
import { Chips } from '../components/tabs';
import { getJSON } from '../core/fetcher';

export const OLY_TABS = [['now', 'Now'], ['power', 'Power'], ['italy', 'Italy at the Games'], ['history', 'All-time'], ['how', 'How it works']] as const;
export type OlyTab = typeof OLY_TABS[number][0];

type Medals = { gold: number; silver: number; bronze: number; total?: number };
export interface OlyHistory {
  updated: string;
  italy: { summer: ({ year: number; athletes: number; rank: number | null; host: boolean } & Medals)[]; winter: ({ year: number; athletes: number; rank: number | null; host: boolean } & Medals)[]; summerSports: ({ sport: string } & Medals)[]; winterSports: ({ sport: string } & Medals)[] } | null;
  allTime: { code: string; summer: { games: number } & Medals; winter: { games: number } & Medals; total: Medals }[];
}
export function useOlyHistory(enabled = true) {
  const [d, setD] = useState<OlyHistory | null>(null);
  useEffect(() => { if (!enabled) return; let on = true; getJSON<OlyHistory>(`${import.meta.env.BASE_URL}data/olympics-history.json`, 60 * 60e3).then(x => on && setD(x)).catch(() => {}); return () => { on = false; }; }, [enabled]);
  return d;
}

const Src = ({ children }: { children: ReactNode }) => <div className="osrc">{children}</div>;
const G = '#d4af37', S = '#a8a9ad', B = '#b0764a', AZZURRO = '#0066b3';
const tot = (m: Medals) => m.total ?? m.gold + m.silver + m.bronze;

function Stack({ m, max, h = 12 }: { m: Medals; max: number; h?: number }) {
  return <span style={{ display: 'flex', height: h, width: `${(tot(m) / (max || 1)) * 100}%`, borderRadius: 2, overflow: 'hidden' }}><span style={{ flex: m.gold, background: G }} /><span style={{ flex: m.silver, background: S }} /><span style={{ flex: m.bronze, background: B }} /></span>;
}

export function PowerScreen({ h }: { h: OlyHistory }) {
  const [season, setSeason] = useState<'summer' | 'winter'>('summer');
  const it = h.italy;
  if (!it) return null;
  const sports = (season === 'summer' ? it.summerSports : it.winterSports).sort((a, b) => b.gold - a.gold || tot(b) - tot(a));
  const max = Math.max(...sports.map(tot));
  const games = season === 'summer' ? it.summer : it.winter;
  const last3 = games.slice(-3);
  return (
    <>
      <section className="ocard">
        <h2>Where Italy is strong</h2>
        <Chips label="Season" items={[{ k: 'summer', label: 'Summer' }, { k: 'winter', label: 'Winter' }]} value={season} set={setSeason} />
        <p className="dek">Every Olympic medal Italy has won, sport by sport (gold, silver, bronze). The richest sports: {sports.slice(0, 4).map(x => `${x.sport} (${x.gold} gold)`).join(', ')}. Over the last three {season === 'summer' ? 'Summer' : 'Winter'} Games: {last3.map(g => `${g.year} ${tot(g)} medals (${g.gold} gold)`).join(', ')}.</p>
        {sports.map(x => <div key={x.sport} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 90px', gap: 8, alignItems: 'center', fontSize: 12.5, margin: '4px 0' }}><span>{x.sport}</span><Stack m={x} max={max} /><span style={{ color: 'var(--o-ink2)' }}><b>{x.gold}</b> · {x.silver} · {x.bronze}</span></div>)}
        <div className="olegend" style={{ marginTop: 8 }}><span><i style={{ background: G }} />Gold</span><span><i style={{ background: S }} />Silver</span><span><i style={{ background: B }} />Bronze</span></div>
        <Src>Source: Wikipedia, Italy at the Olympics</Src>
      </section>
    </>
  );
}

export function ItalyScreen({ h }: { h: OlyHistory }) {
  const [season, setSeason] = useState<'summer' | 'winter'>('summer');
  const it = h.italy;
  if (!it) return null;
  const games = season === 'summer' ? it.summer : it.winter;
  const max = Math.max(...games.map(tot));
  const best = [...games].sort((a, b) => b.gold - a.gold || tot(b) - tot(a))[0];
  return (
    <section className="ocard">
      <h2>Italy at every Games</h2>
      <Chips label="Season" items={[{ k: 'summer', label: 'Summer' }, { k: 'winter', label: 'Winter' }]} value={season} set={setSeason} />
      <p className="dek">Medals and place in the medal table at every edition; framed in blue when Italy was the host. The most golds: {best ? `${best.gold} in ${best.year}` : '–'}.</p>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 200, overflowX: 'auto', paddingBottom: 30, position: 'relative' }}>
        {games.map(g => (
          <div key={g.year} title={`${g.year}: ${g.gold} gold, ${g.silver} silver, ${g.bronze} bronze · ${g.athletes} athletes${g.rank ? ` · ${g.rank}th in the table` : ''}`} style={{ flex: '1 0 18px', display: 'flex', flexDirection: 'column-reverse', alignItems: 'stretch', height: `${(tot(g) / (max || 1)) * 100}%`, minHeight: 2, outline: g.host ? `2px solid ${AZZURRO}` : 'none', position: 'relative' }}>
            <span style={{ flex: g.bronze, background: B }} /><span style={{ flex: g.silver, background: S }} /><span style={{ flex: g.gold, background: G }} />
            <span style={{ position: 'absolute', bottom: -28, left: '50%', transform: 'translateX(-50%) rotate(-60deg)', fontSize: 9, color: 'var(--o-ink3)', whiteSpace: 'nowrap' }}>{g.year}</span>
          </div>
        ))}
      </div>
      <table className="otable" style={{ fontSize: 12.5, marginTop: 10 }}><thead><tr><th>Games</th><th className="n">Athletes</th><th className="n">Gold</th><th className="n">Silver</th><th className="n">Bronze</th><th className="n">Total</th><th className="n">Rank</th></tr></thead>
        <tbody>{[...games].reverse().map(g => <tr key={g.year} className={g.host ? 'me' : ''}><td>{g.year}{g.host ? ' (host)' : ''}</td><td className="n">{g.athletes}</td><td className="n">{g.gold}</td><td className="n">{g.silver}</td><td className="n">{g.bronze}</td><td className="n"><b>{tot(g)}</b></td><td className="n">{g.rank ?? '–'}</td></tr>)}</tbody></table>
      <Src>Source: Wikipedia, Italy at the Olympics</Src>
    </section>
  );
}

export function HistoryScreen({ h }: { h: OlyHistory }) {
  const [season, setSeason] = useState<'summer' | 'winter' | 'total'>('total');
  const rows = [...h.allTime].sort((a, b) => b[season].gold - a[season].gold || tot(b[season]) - tot(a[season])).slice(0, 30);
  const max = Math.max(...rows.map(r => tot(r[season])));
  return (
    <section className="ocard">
      <h2>The all-time medal table</h2>
      <Chips label="Games" items={[{ k: 'total', label: 'All Games' }, { k: 'summer', label: 'Summer' }, { k: 'winter', label: 'Winter' }]} value={season} set={setSeason} />
      <p className="dek">Ranked by gold medals, as the official tables are. Italy: {(() => { const i = [...h.allTime].sort((a, b) => b[season].gold - a[season].gold || tot(b[season]) - tot(a[season])).findIndex(r => r.code === 'ITA'); return i >= 0 ? `${i + 1}th` : '–'; })()}.</p>
      {rows.map((r, i) => <div key={r.code} style={{ display: 'grid', gridTemplateColumns: '22px 50px 1fr 140px', gap: 8, alignItems: 'center', fontSize: 12.5, margin: '3px 0', fontWeight: r.code === 'ITA' ? 700 : 400 }}><span style={{ color: 'var(--o-ink3)' }}>{i + 1}</span><span>{r.code}</span><Stack m={r[season]} max={max} h={10} /><span style={{ color: 'var(--o-ink2)' }}><b>{r[season].gold}</b> · {r[season].silver} · {r[season].bronze} = {tot(r[season])}</span></div>)}
      <Src>Source: Wikipedia, All-time Olympic Games medal table (defunct nations such as the Soviet Union listed apart)</Src>
    </section>
  );
}

export function HowScreen() {
  const P = ({ children }: { children: ReactNode }) => <p style={{ margin: '0 0 10px', lineHeight: 1.55, fontSize: 14 }}>{children}</p>;
  return (
    <section className="s-two">
      <div className="ocard">
        <h2>Los Angeles 2028</h2>
        <P>The third Games in Los Angeles (after 1932 and 1984), 14–30 July 2028. New or returning sports: <b>flag football</b>, <b>cricket</b> (T20), <b>lacrosse</b> (sixes), <b>squash</b>, and <b>baseball and softball</b>; breaking leaves the programme.</P>
        <P><b>Qualification</b> is sport by sport: world championships, continental events, rankings and qualifying tournaments in 2027 and the first half of 2028 hand out places to each national committee, which then names the athletes.</P>
      </div>
      <div className="ocard">
        <h2>French Alps 2030</h2>
        <P>The Winter Games return to France (after Chamonix 1924, Grenoble 1968 and Albertville 1992), 1–17 February 2030, spread over the Alps, with the ice events on the coast in Nice.</P>
        <P><b>The medal table</b> ranks nations by golds, then silvers, then bronzes; the Italy screen shows every edition, with the home Games framed.</P>
      </div>
    </section>
  );
}
