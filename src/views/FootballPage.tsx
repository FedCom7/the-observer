import { PointsBars } from '../components/charts';
import { Score } from '../components/common';
import { ScreenTabs, useTab } from '../components/tabs';
import { HistoryScreen, HowScreen as WcHowScreen, ItalyScreen, PowerScreen as WcPowerScreen, WC_TABS, useFootballSeason } from './FootballScreens';
import { Hero, ocol } from '../components/sheet';
import { useData } from '../core/store';
import { DAY, countdown, dayLong, dayShort, hhmm } from '../core/time';
import type { ObsEvent } from '../core/types';
import { COUNTRY, EURO_WINNERS, WC_WINNERS, type Euro, type FootballData, type NationsGroup, type NextWorldCup, type WcMatch, type WorldCup } from '../sources/football';

const cname = (code: string | null) => (code ? COUNTRY[code] ?? code : 'TBD');
const fmtSpan = (from: string, to: string) => `${dayShort(Date.parse(from))} – ${dayShort(Date.parse(to))}`;

/** Men's World Cup and Euros: Italy, the road to the next tournaments, the last World Cup. */
export function FootballPage() {
  const { football, news, now } = useData();
  const [tab, setTab] = useTab(WC_TABS);
  const fs = useFootballSeason(tab === 'power' || tab === 'italy');
  if (!football) return <Hero id="wc" dek="Loading…" />;
  const { worldCup: wc, euro, nextWorldCup: nwc } = football;
  const italyNext = football.italy.find(e => e.state !== 'post' && e.start > now - 3 * 3600e3);
  const italyPast = football.italy.filter(e => e.state === 'post').slice(-6).reverse();
  const draw = euro?.qualifying?.draw;
  const italyPot = euro?.qualifying?.pots.find(p => p.teams.some(t => t.code === 'ITA'))?.pot;
  const myNews = news.filter(n => n.passion === 'wc').slice(0, 8);

  return (
    <>
      <Hero id="wc" dek={<>
        {italyNext ? <>Italy next: {italyNext.title}, {italyNext.sub}, {dayLong(italyNext.start)}. </> : null}
        {draw && !draw.done && Date.parse(draw.date) > now ? <>The Euro {euro!.year} qualifying draw is in {draw.place} on {dayLong(Date.parse(draw.date))}. </> : null}
        {euro?.from ? <>Euro {euro.year} starts {dayLong(Date.parse(euro.from))} in {euro.hosts.join(', ')}. </> : null}
        {wc?.champion ? <>{wc.champion.name} are world champions.</> : null}
      </>} />
      <ScreenTabs tabs={WC_TABS} tab={tab} set={setTab} label="World Cup and Euros screens" />
      {tab !== 'now' ? (tab === 'history' ? <HistoryScreen wcLatest={football.worldCup?.champion ? { year: football.worldCup.year, abbr: football.worldCup.champion.abbr } : null} /> : tab === 'how' ? <WcHowScreen />
        : !fs ? <section className="ocard"><p className="dek">Loading…</p></section>
        : tab === 'power' ? <WcPowerScreen s={fs} /> : <ItalyScreen s={fs} />) : <>

      <section className="s-top">
        <div className="ocard s-next">
          <div className="lab">{italyNext?.state === 'in' ? <span style={{ color: '#ff453a' }}>● Italy live · {italyNext.clock}</span> : 'Italy · next match'}</div>
          {italyNext ? (
            <>
              <h3>{italyNext.title}</h3>
              <div className="when">{italyNext.sub} · {dayLong(italyNext.start)} · {hhmm(italyNext.start)} Rome</div>
              <div className="when">{italyNext.place}</div>
              {italyNext.state === 'in'
                ? <div className="s-cd"><Score>{italyNext.home?.score}–{italyNext.away?.score}</Score><small>{italyNext.clock}</small></div>
                : <div className="s-cd">{countdown(italyNext.start - now)}<small>Kick-off</small></div>}
            </>
          ) : <div>No match scheduled yet.</div>}
        </div>
        <div className="ocard">
          <div className="lab">Next milestone</div>
          {draw && Date.parse(draw.date) > now - DAY ? (
            <>
              <h3 style={{ margin: 0 }}>Euro {euro!.year} qualifying draw</h3>
              <div className="when">{draw.place} · {dayLong(Date.parse(draw.date))}{italyPot ? ` · Italy in ${italyPot}` : ''}</div>
              <div className="s-cd" style={{ fontSize: 30 }}>{countdown(Date.parse(draw.date) - now)}</div>
            </>
          ) : euro?.from ? (
            <>
              <h3 style={{ margin: 0 }}>Euro {euro.year}</h3>
              <div className="when">{fmtSpan(euro.from, euro.to!)} · {euro.hosts.join(', ')}</div>
              <div className="s-cd" style={{ fontSize: 30 }}>{Math.ceil((Date.parse(euro.from) - now) / DAY)} days</div>
            </>
          ) : <div>—</div>}
        </div>
        <div className="ocard">
          <div className="lab">The holders</div>
          <div className="kpis" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {wc?.champion && <div className="kpi"><Score as="b">{wc.champion.name}</Score><span>World Cup {wc.year}</span></div>}
            {euro?.holder && <div className="kpi"><b>{euro.holder}</b><span>Euro {EURO_WINNERS[EURO_WINNERS.length - 1][0]}</span></div>}
          </div>
          {nwc?.from && <p className="dek" style={{ marginTop: 10 }}>Next World Cup: {nwc.hosts.join(', ')}, {fmtSpan(nwc.from, nwc.to!)} {nwc.year}.</p>}
        </div>
      </section>

      <section className="s-two">
        <div className="ocard">
          <div className="lab">Italy · results and fixtures</div>
          <div className="olist">
            {football.italy.filter(e => e.state !== 'post').slice(0, 4).map(e => <ItalyRow key={e.id} e={e} />)}
            {italyPast.map(e => <ItalyRow key={e.id} e={e} />)}
          </div>
          <div className="osrc">Source: ESPN</div>
        </div>
        <NationsLeague groups={football.nations} />
      </section>

      {euro && <RoadToEuro euro={euro} now={now} />}
      {nwc && <NextWc w={nwc} now={now} />}
      {wc && <LastWorldCup wc={wc} />}
      <Honours wc={wc} />

      <section className="ocard">
        <div className="lab">From the wire</div>
        <div className="onews">{myNews.map(n => <a key={n.id} className="r" href={n.url} target="_blank" rel="noreferrer"><time>{dayShort(n.time)} · {n.source}</time><p>{n.title}</p></a>)}</div>
      </section>
      </>}
    </>
  );
}

function ItalyRow({ e }: { e: ObsEvent }) {
  const me = e.home?.mine ? e.home : e.away, them = e.home?.mine ? e.away : e.home;
  const done = e.state === 'post';
  const res = done && me?.score != null && them?.score != null ? (Number(me.score) > Number(them.score) ? 'W' : Number(me.score) < Number(them.score) ? 'L' : 'D') : null;
  const color = res === 'W' ? 'var(--oc-spa)' : res === 'L' ? '#e5484d' : 'var(--o-ink3)';
  return (
    <div className={`r${done ? ' past' : ''}`}>
      <time>{dayShort(e.start)}<small>{done ? e.start < Date.now() - 300 * DAY ? new Date(e.start).getFullYear() : '' : hhmm(e.start)}</small></time>
      <div><b>{e.home?.name} – {e.away?.name}</b><small>{e.sub}</small></div>
      <span className="x">{done ? <Score><b style={{ color: 'var(--o-ink)' }}>{e.home?.score}–{e.away?.score}</b> <span style={{ color, fontWeight: 700 }}>{res}</span></Score> : e.state === 'in' ? <span className="tag-live">{e.clock}</span> : ''}</span>
    </div>
  );
}

function NationsLeague({ groups }: { groups: NationsGroup[] }) {
  const mine = groups.find(g => g.rows.some(r => r.mine));
  const leagueA = groups.filter(g => /^Group A/.test(g.name));
  if (!groups.length) return null;
  return (
    <div className="ocard">
      <div className="lab">UEFA Nations League · League A</div>
      <p className="dek">The interim ranking seeds the Euro qualifying draw; League A group winners go to the quarter-finals, and the Nations League also hands out play-off places.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {(leagueA.length ? leagueA : mine ? [mine] : []).map(g => (
          <div key={g.name}>
            <div className="lab">{g.name}</div>
            <table className="otable">
              <thead><tr><th>#</th><th>Team</th><th className="n">P</th><th className="n">GD</th><th className="n">Pts</th></tr></thead>
              <tbody>{g.rows.map(r => <tr key={r.abbr} className={r.mine ? 'me' : ''}><td>{r.rank}</td><td>{r.name}</td><td className="n">{r.p}</td><td className="n"><Score>{r.gd}</Score></td><td className="n"><Score>{r.pts}</Score></td></tr>)}</tbody>
            </table>
          </div>
        ))}
      </div>
      <div className="osrc">Source: ESPN</div>
    </div>
  );
}

// ---------- Euro ----------
function RoadToEuro({ euro, now }: { euro: Euro; now: number }) {
  const q = euro.qualifying;
  const steps = [
    ...(q?.draw ? [{ label: 'Qualifying draw', sub: q.draw.place, from: q.draw.date, to: q.draw.date }] : []),
    ...(q?.schedule ?? []).reduce<{ label: string; sub: string; from: string; to: string }[]>((acc, s) => {
      // One window per international break: consecutive matchdays merge
      const last = acc[acc.length - 1];
      if (last && last.sub === s.stage && Date.parse(s.from) - Date.parse(last.to) < 6 * DAY) { last.to = s.to; last.label = `${last.label.split(' – ')[0]} – ${s.label.replace('Matchday ', '')}`; }
      else acc.push({ label: s.label, sub: s.stage, from: s.from, to: s.to });
      return acc;
    }, []),
    ...(euro.from ? [{ label: `Euro ${euro.year}`, sub: euro.hosts.join(', '), from: euro.from, to: euro.to ?? euro.from }] : []),
  ];
  const groups = q?.groups ?? [];
  return (
    <section className="ocard">
      <h2>The road to Euro {euro.year}</h2>
      <p className="dek">From the qualifying draw to the tournament in {euro.hosts.join(', ')}. Group winners and the best runners-up qualify; the rest go through the play-offs in March {euro.year}.</p>
      <ol style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(130px, 1fr))`, gap: 10, listStyle: 'none', padding: 0, margin: '0 0 16px' }}>
        {steps.map(s => {
          const done = Date.parse(s.to) + DAY < now, current = !done && Date.parse(s.from) <= now;
          return (
            <li key={s.label + s.from} style={{ borderTop: `3px solid ${done ? 'var(--o-grid)' : current ? ocol('wc') : 'var(--o-line)'}`, paddingTop: 6, opacity: done ? 0.55 : 1 }}>
              <b style={{ fontSize: 13 }}>{s.label}</b>
              <div style={{ fontSize: 12, color: 'var(--o-ink2)' }}>{s.from === s.to ? dayShort(Date.parse(s.from)) : fmtSpan(s.from, s.to)} {s.from.slice(0, 4)}</div>
              <div style={{ fontSize: 11.5, color: 'var(--o-ink3)' }}>{s.sub}</div>
            </li>
          );
        })}
      </ol>
      {groups.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          {groups.map(g => (
            <div key={g.name}>
              <div className="lab">{g.name}</div>
              <table className="otable"><tbody>{[...g.teams].sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga)).map(t => (
                <tr key={t.code ?? `${g.name}${t.p}${t.pts}`} className={t.code === 'ITA' ? 'me' : ''}><td>{cname(t.code)}</td><td className="n">{t.p}</td><td className="n"><Score>{t.gf - t.ga > 0 ? '+' : ''}{t.gf - t.ga}</Score></td><td className="n"><Score>{t.pts}</Score></td></tr>
              ))}</tbody></table>
            </div>
          ))}
        </div>
      ) : q?.pots.length ? (
        <>
          <div className="lab">Seeding pots for the draw (provisional, from the Nations League ranking)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 14 }}>
            {q.pots.map(p => (
              <div key={p.pot}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{p.pot}</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--o-ink2)' }}>{p.teams.map((t, i) => <span key={t.code}>{i ? ', ' : ''}<span style={t.code === 'ITA' ? { fontWeight: 700, color: 'var(--o-ink)' } : undefined}>{cname(t.code)}</span>{t.note ? <small style={{ color: 'var(--o-ink3)' }}> ({t.note})</small> : null}</span>)}</div>
              </div>
            ))}
          </div>
        </>
      ) : null}
      {euro.venues.length > 0 && (
        <>
          <div className="lab" style={{ marginTop: 18 }}>Host stadiums</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '4px 16px', fontSize: 13 }}>
            {euro.venues.map(v => <div key={v.stadium}><b style={{ fontWeight: 600 }}>{v.city}</b> <span style={{ color: 'var(--o-ink3)' }}>{v.stadium}{euro.opening?.venue === v.stadium ? ' · opening match' : ''}</span></div>)}
          </div>
        </>
      )}
      <div className="osrc">Source: Wikipedia (UEFA regulations and schedule)</div>
    </section>
  );
}

// ---------- Next World Cup ----------
function NextWc({ w, now }: { w: NextWorldCup; now: number }) {
  const uefa = w.formats.find(f => f.conf === 'UEFA');
  return (
    <section className="ocard">
      <h2>World Cup {w.year}</h2>
      <p className="dek">{w.hosts.join(', ')}{w.centenary.length ? `, with centenary matches in ${w.centenary.map(cname).join(', ')}` : ''}{w.from ? ` · ${fmtSpan(w.from, w.to!)} ${w.year} · in ${Math.ceil((Date.parse(w.from) - now) / DAY)} days` : ''}.</p>
      <div className="s-two">
        <div>
          {uefa && <><div className="lab">How Europe qualifies</div><p style={{ fontSize: 14, lineHeight: 1.5, margin: '0 0 12px' }}>{uefa.text}</p></>}
          {w.formats.filter(f => f !== uefa).map(f => <details key={f.conf} style={{ marginBottom: 8 }}><summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{f.conf}</summary><p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--o-ink2)' }}>{f.text}</p></details>)}
        </div>
        <div>
          <div className="lab">Qualified so far · {w.qualified.length}</div>
          <table className="otable"><tbody>{w.qualified.map(q => <tr key={q.code}><td>{cname(q.code)}</td><td style={{ color: 'var(--o-ink3)' }}>{q.note}</td></tr>)}</tbody></table>
        </div>
      </div>
      <div className="osrc">Source: Wikipedia</div>
    </section>
  );
}

// ---------- Last World Cup ----------
const ROUNDS = ['round-of-32', 'round-of-16', 'quarterfinals', 'semifinals', 'final'];

/** Knockout matches in bracket order: walk back from the final through the winners. */
function bracket(ms: WcMatch[]): WcMatch[][] {
  const by = ROUNDS.map(r => ms.filter(m => m.stage === r));
  const final = by[4][0];
  if (!final) return by;
  const cols: WcMatch[][] = [[final]];
  for (let k = 3; k >= 0; k--) {
    const feeders = cols[0].flatMap(m => [m.home, m.away].map(side => by[k].find(x => [x.home, x.away].some(s => s?.winner && s.abbr === side?.abbr))));
    if (feeders.some(f => !f)) return by;
    cols.unshift(feeders as WcMatch[]);
  }
  return cols;
}

function LastWorldCup({ wc }: { wc: WorldCup }) {
  const final = wc.matches.find(m => m.stage === 'final');
  const cols = bracket(wc.matches);
  return (
    <section className="ocard">
      <h2>World Cup {wc.year} · how it ended</h2>
      <p className="dek">{wc.champion && final ? <Score>{wc.champion.name} beat {wc.runnerUp?.name} {final.home?.score}–{final.away?.score}{/AET/.test(final.detail) ? ' after extra time' : ''}{final.home?.pens != null ? ` (${final.home.pens}–${final.away?.pens} on penalties)` : ''} in the final at {final.venue}. {wc.third ? `${wc.third.name} finished third.` : ''}</Score> : null} {wc.matches.length} matches, {wc.goals} goals ({(wc.goals / Math.max(1, wc.matches.filter(m => m.state === 'post').length)).toFixed(2)} per game).</p>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols.length}, minmax(120px, 1fr))`, gap: 12, minWidth: 680 }}>
          {cols.map((col, k) => (
            <div key={k} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', gap: 6 }}>
              <div className="lab" style={{ textAlign: 'center' }}>{col[0]?.round}</div>
              {col.map(m => <BracketMatch key={m.id} m={m} />)}
            </div>
          ))}
        </div>
      </div>
      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Group tables</summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginTop: 10 }}>
          {wc.groups.map(g => (
            <div key={g.name}>
              <div className="lab">{g.name}</div>
              <table className="otable"><tbody>{g.rows.map(r => <tr key={r.abbr}><td>{r.rank}</td><td>{r.name}</td><td className="n"><Score>{r.gd}</Score></td><td className="n"><Score>{r.pts}</Score></td></tr>)}</tbody></table>
            </div>
          ))}
        </div>
      </details>
      <div className="osrc">Source: ESPN</div>
    </section>
  );
}

function BracketMatch({ m }: { m: WcMatch }) {
  const line = (s: WcMatch['home']) => s && (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontWeight: s.winner ? 700 : 400, color: s.winner ? 'var(--o-ink)' : 'var(--o-ink3)' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>{s.logo && <img src={s.logo} alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} loading="lazy" />}<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span></span>
      <Score>{s.score}{s.pens != null ? <small> ({s.pens})</small> : null}</Score>
    </div>
  );
  return (
    <div style={{ border: '1px solid var(--o-line)', borderRadius: 6, padding: '4px 7px', fontSize: 12, fontFamily: 'var(--f-chart)' }} title={`${dayShort(Date.parse(m.date))} · ${m.venue}, ${m.city}`}>
      {line(m.home)}{line(m.away)}
    </div>
  );
}

// ---------- Honours ----------
function Honours({ wc }: { wc: FootballData['worldCup'] }) {
  const merge = (code: string) => (code === 'FRG' ? 'GER' : code);
  const wcList: [number, string][] = [...WC_WINNERS, ...(wc?.champion && !WC_WINNERS.some(([y]) => y === wc.year) ? [[wc.year, wc.champion.abbr] as [number, string]] : [])];
  const count = (list: [number, string][]) => {
    const m = new Map<string, number[]>();
    list.forEach(([y, c]) => m.set(merge(c), [...(m.get(merge(c)) ?? []), y]));
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length || Math.min(...a[1]) - Math.min(...b[1])).map(([c, ys]) => ({ name: cname(c), value: ys.length, sub: ys.map(y => `'${String(y).slice(2)}`).join(' ') }));
  };
  return (
    <section className="s-two">
      <div className="ocard">
        <div className="lab">World Cup titles</div>
        <PointsBars rows={count(wcList)} color={ocol('wc')} unit="titles" labelWidth={120} />
        <div className="osrc">West Germany counted with Germany</div>
      </div>
      <div className="ocard">
        <div className="lab">European Championship titles</div>
        <PointsBars rows={count(EURO_WINNERS)} color={ocol('wc')} unit="titles" labelWidth={120} />
      </div>
    </section>
  );
}

