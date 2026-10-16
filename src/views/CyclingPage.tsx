import { useState } from 'react';
import { useWidth } from '../components/charts';
import { Score } from '../components/common';
import { Hero } from '../components/sheet';
import { useData } from '../core/store';
import { DAY, countdown, dayLong, dayShort, fmt, hhmm } from '../core/time';
import { TAG_LABEL, type CyRace, type CyRank, type CyRankings, type CyStage } from '../sources/cycling';

// Rows of the season chart, each with its own series color
const GROUPS: { key: string; label: string; color: string; test: (r: CyRace) => boolean }[] = [
  { key: 'monument', label: 'Monuments', color: 'var(--o-s2)', test: r => r.tag === 'monument' },
  { key: 'grand', label: 'Grand Tours', color: 'var(--o-s1)', test: r => r.tag === 'grand' },
  { key: 'classic', label: 'Major classics', color: 'var(--o-s3)', test: r => !r.tag && r.tier === 2 && r.kind === 'one-day' },
  { key: 'week', label: 'Week-long tours', color: 'var(--o-s4)', test: r => !r.tag && r.tier === 2 && r.kind === 'stage' },
  { key: 'champs', label: 'Championships', color: 'var(--oc-tech)', test: r => r.kind === 'champs' },
  { key: 'other', label: 'Other WorldTour', color: 'var(--o-other)', test: r => r.tier === 1 },
];
const groupOf = (r: CyRace) => GROUPS.find(g => g.test(r)) ?? GROUPS[GROUPS.length - 1];

const STAGE_COLOR = (type: string) => (/time.?trial|ITT|TTT|crono/i.test(type) ? 'var(--oc-tech)' : /mountain|montagna|alta/i.test(type) ? 'var(--o-s2)' : /hill|collin|medium|uphill/i.test(type) ? 'var(--o-s4)' : 'var(--o-s1)');
const STAGE_KIND = (type: string) => (/time.?trial|ITT|TTT|crono/i.test(type) ? 'Time trial' : /mountain|montagna|alta/i.test(type) ? 'Mountain' : /hill|collin|medium|uphill/i.test(type) ? 'Hilly' : 'Flat');
const rider = (x: CyRank | null | undefined) => x?.rider ?? x?.team ?? '–';
const teamCase = (t: string) => t.replace(/\b([A-Z]{4,})\b/g, w => w[0] + w.slice(1).toLowerCase());
const at = (iso: string, approx: boolean) => `${approx ? '≈ ' : ''}${hhmm(Date.parse(iso))}`;

/** Road cycling: the men's WorldTour season, Monuments and Grand Tours, official stage times and rankings. */
export function CyclingPage() {
  const { cycling, news, now } = useData();
  const years = [...new Set(cycling?.races.map(r => r.year) ?? [])].sort();
  const thisYear = new Date(now).getUTCFullYear();
  // After the last big race of the year, the page looks ahead to next season
  const seasonDone = cycling ? !cycling.races.some(r => r.year === thisYear && r.tier >= 2 && Date.parse(r.end) > now) : false;
  const [season, setSeason] = useState<number | null>(null);
  if (!cycling) return <Hero id="cicl" dek="Loading the UCI calendar…" />;
  const year = season ?? (seasonDone && years.includes(thisYear + 1) ? thisYear + 1 : thisYear);
  const races = cycling.races;
  const upcoming = races.filter(r => Date.parse(r.end) > now).sort((a, b) => a.start.localeCompare(b.start));
  const live = upcoming.find(r => Date.parse(r.start) <= now);
  const next = upcoming.find(r => Date.parse(r.start) > now);
  const nextMonument = upcoming.find(r => r.tag === 'monument' && Date.parse(r.start) > now);
  const nextGrand = upcoming.find(r => r.tag === 'grand');
  const inSeason = races.filter(r => r.year === year);
  // The stage race to analyse: the one under way, else the latest Grand Tour with official rankings
  const withGc = races.filter(r => r.rankings?.history?.length && Date.parse(r.start) <= now).sort((a, b) => b.start.localeCompare(a.start));
  const focus = withGc.find(r => Date.parse(r.end) > now - DAY) ?? withGc.find(r => r.tag === 'grand') ?? withGc[0];
  const route = upcoming.find(r => r.tag === 'grand' && r.stages?.length) ?? (focus?.stages?.length ? focus : undefined);
  const myNews = news.filter(n => n.passion === 'cicl').slice(0, 8);
  // Winners: the chosen season, or the last one with results before it starts
  const wYear = races.some(r => r.year === year && Date.parse(r.end) < now) ? year : year - 1;
  const wRaces = races.filter(r => r.year === wYear);

  return (
    <>
      <Hero id="cicl" dek={<>
        {live ? `${live.name} is under way. ` : next ? `Next: ${next.name}, ${dayLong(Date.parse(next.start))}. ` : ''}
        {nextMonument && `The next Monument, ${nextMonument.name}, is in ${Math.ceil((Date.parse(nextMonument.start) - now) / DAY)} days`}
        {nextGrand && `; the ${nextGrand.name} ${Date.parse(nextGrand.start) > now ? `starts in ${Math.ceil((Date.parse(nextGrand.start) - now) / DAY)} days` : 'is on'}.`}
      </>} />

      <section className="s-top">
        <div className="ocard s-next">
          <div className="lab">{live ? 'Racing now' : 'Next race'}</div>
          {(live ?? next) ? <NextCard r={(live ?? next)!} now={now} /> : <div>No race scheduled.</div>}
        </div>
        <div className="ocard">
          <div className="lab">Next Monument</div>
          {nextMonument ? <BigCard r={nextMonument} now={now} /> : <div>None left this season.</div>}
        </div>
        <div className="ocard">
          <div className="lab">Next Grand Tour</div>
          {nextGrand ? <BigCard r={nextGrand} now={now} /> : <div>None scheduled yet.</div>}
        </div>
      </section>

      <section className="ocard">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ marginRight: 'auto' }}>The {year} season at a glance</h2>
          {years.map(y => <button key={y} className="btn" aria-pressed={y === year} onClick={() => setSeason(y)} style={{ color: 'var(--o-ink)', background: y === year ? 'var(--o-accent-soft)' : 'transparent', borderColor: 'var(--o-line)' }}>{y}</button>)}
        </div>
        <p className="dek">Every men's WorldTour race plus the World and European Championships. One-day races are dots, stage races are bars; races already run are faded, with the winner on hover.</p>
        <SeasonChart races={inSeason} year={year} now={now} />
        <div className="osrc">Source: UCI calendar · winners from the organisers and Wikipedia</div>
      </section>

      <section className="ocard">
        <h2>Monuments and Grand Tours, {year}</h2>
        <p className="dek">The five oldest one-day classics and the three three-week tours. Start times are the organisers' own where published (≈ otherwise), in Rome time.</p>
        <div className="cy-grid">
          {inSeason.filter(r => r.tag === 'monument' || r.tag === 'grand').map(r => <BigTile key={r.id} r={r} now={now} />)}
        </div>
      </section>

      {focus?.rankings && <GcSection r={focus} rk={focus.rankings} now={now} />}

      {route?.stages && <RouteSection r={route} now={now} />}

      <section className="s-two">
        <div className="ocard">
          <h2>Winners, {wYear}</h2>
          <table className="otable">
            <thead><tr><th>Date</th><th>Race</th><th>Winner</th></tr></thead>
            <tbody>{wRaces.filter(r => Date.parse(r.end) < now && (r.winner || r.events?.some(e => e.winner))).flatMap(r => r.kind === 'champs'
              ? (r.events ?? []).filter(e => e.winner).map(e => <tr key={r.id + e.title}><td>{dayShort(Date.parse(e.start))}</td><td><i className="cy-dot" style={{ background: groupOf(r).color }} />{r.name.replace('Championships', 'Champs')} · {e.title.replace("Men's ", '')}</td><td><Score>{e.winner}</Score></td></tr>)
              : [<tr key={r.id} style={{ fontWeight: r.tier === 3 ? 600 : 400 }}><td>{dayShort(Date.parse(r.start))}</td><td><i className="cy-dot" style={{ background: groupOf(r).color }} />{r.name}</td><td><Score>{r.winner}</Score></td></tr>],
            )}</tbody>
          </table>
          <div className="osrc">Sources: Wikipedia, official results of ASO races</div>
        </div>
        <div className="ocard">
          <div className="lab">From the wire</div>
          <div className="onews">{myNews.map(n => <a key={n.id} className="r" href={n.url} target="_blank" rel="noreferrer"><time>{dayShort(n.time)} · {n.source}</time><p>{n.title}</p></a>)}</div>
        </div>
      </section>
    </>
  );
}

function NextCard({ r, now }: { r: CyRace; now: number }) {
  const stage = r.stages?.find(s => !s.rest && Date.parse(s.start) > now - 5 * 3600e3);
  const t = stage ? Date.parse(stage.start) : Date.parse(r.start);
  return (
    <>
      <h3>{r.name}{stage ? ` · Stage ${stage.num}` : ''}</h3>
      <div className="when">{dayLong(t)} · {stage ? `${stage.from} → ${stage.to}, ${stage.km} km` : r.venue || r.country}</div>
      <div className="when">{stage ? (stage.approx ? `≈ ${hhmm(t)} Rome` : `First start ${hhmm(t)}${stage.lastArrival ? ` · last arrival ${hhmm(Date.parse(stage.lastArrival))}` : ''} Rome`) : `${r.approx ? '≈ ' : 'Start '}${hhmm(t)} Rome`}</div>
      <div className="s-cd">{t > now ? countdown(t - now) : 'Racing'}<small>{r.tag ? TAG_LABEL[r.tag] : `UCI ${r.cls}`}</small></div>
    </>
  );
}

function BigCard({ r, now }: { r: CyRace; now: number }) {
  const t = Date.parse(r.start);
  const km = r.stages?.reduce((a, s) => a + (s.km ?? 0), 0);
  return (
    <>
      <h3 style={{ margin: 0 }}>{r.name}</h3>
      <div className="when">{r.kind === 'one-day' ? dayLong(t) : `${dayShort(t)} – ${dayShort(Date.parse(r.end))}`} · {at(r.start, r.approx)} Rome</div>
      {km ? <div className="when">{r.stages!.filter(s => !s.rest).length} stages · {Math.round(km).toLocaleString('en-US')} km</div> : null}
      <div className="s-cd" style={{ fontSize: 30 }}>{t > now ? countdown(t - now) : 'Under way'}</div>
    </>
  );
}

function BigTile({ r, now }: { r: CyRace; now: number }) {
  const done = Date.parse(r.end) < now;
  const t = Date.parse(r.start);
  return (
    <a className="cy-tile" href={r.site ?? r.uci} target="_blank" rel="noreferrer" style={{ borderTopColor: groupOf(r).color, opacity: done ? 0.85 : 1 }}>
      <small>{TAG_LABEL[r.tag!]}</small>
      <b>{r.name}</b>
      <span>{r.kind === 'one-day' ? dayShort(t) : `${dayShort(t)} – ${dayShort(Date.parse(r.end))}`}</span>
      {done ? <Score as="div" className="cy-win">{r.winner ?? '–'}</Score> : <div className="cy-win">{t > now ? `in ${Math.ceil((t - now) / DAY)} days · ${at(r.start, r.approx)}` : 'Under way'}</div>}
    </a>
  );
}

function SeasonChart({ races, year, now }: { races: CyRace[]; year: number; now: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const groups = GROUPS.filter(g => races.some(g.test));
  const l = Math.min(130, W * 0.28), r = 10, t = 22, rowH = 30;
  const H = t + groups.length * rowH + 8;
  const y0 = Date.UTC(year, 0, 1), y1 = Date.UTC(year, 11, 31);
  const x = (ms: number) => l + ((ms - y0) / (y1 - y0)) * (W - l - r);
  return (
    <div ref={ref} className="ochart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`UCI WorldTour calendar ${year}`}>
        {Array.from({ length: 12 }, (_, m) => {
          const xm = x(Date.UTC(year, m, 1));
          return <g key={m}><line x1={xm} x2={xm} y1={t - 6} y2={H - 4} stroke="var(--o-grid)" />{(W > 520 || m % 2 === 0) && <text x={xm + 3} y={12}>{fmt(Date.UTC(year, m, 15), { month: 'short' })}</text>}</g>;
        })}
        {now > y0 && now < y1 && <g><line x1={x(now)} x2={x(now)} y1={t - 8} y2={H - 4} stroke="var(--o-ink)" strokeDasharray="2 3" /></g>}
        {groups.map((g, gi) => {
          const cy = t + gi * rowH + rowH / 2;
          return (
            <g key={g.key}>
              <text x={0} y={cy + 4} style={{ fill: 'var(--o-ink2)', fontSize: 12 }}>{g.label}</text>
              <line x1={l} x2={W - r} y1={cy} y2={cy} stroke="var(--o-grid)" />
              {races.filter(g.test).map(rc => {
                const s = Date.parse(rc.start), e = Date.parse(rc.end), done = e < now;
                const tip = `${rc.name} · ${dayShort(s)}${rc.kind !== 'one-day' ? ` – ${dayShort(e)}` : ''}${rc.winner ? ` · winner ${rc.winner}` : ''}${rc.events?.length ? ' · ' + rc.events.map(ev => `${ev.title}${ev.winner ? ` ${ev.winner}` : ''}`).join(', ') : ''}`;
                return rc.kind === 'one-day'
                  ? <circle key={rc.id} cx={x(s)} cy={cy} r={rc.tier === 3 ? 6 : 4.5} fill={g.color} opacity={done ? 0.4 : 1} stroke="var(--o-card)" strokeWidth={2}><title>{tip}</title></circle>
                  : <rect key={rc.id} x={x(s)} y={cy - 6} width={Math.max(6, x(e) - x(s))} height={12} rx={4} fill={g.color} opacity={done ? 0.4 : 1} stroke="var(--o-card)" strokeWidth={2}><title>{tip}</title></rect>;
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function RankList({ title, rows, mode = 'gap' }: { title: string; rows: CyRank[]; mode?: 'gap' | 'points' | 'time' }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="lab">{title}</div>
      <table className="otable">
        <tbody>{rows.map(x => (
          <tr key={x.pos + rider(x)}>
            <td>{x.pos}</td>
            <td><Score><b>{rider(x)}</b></Score>{x.rider && <><br /><small style={{ color: 'var(--o-ink3)' }}>{teamCase(x.team)}</small></>}</td>
            <td className="n"><Score>{mode === 'points' ? `${x.points} pts` : x.pos === 1 || mode === 'time' ? x.time : x.gap ?? 's.t.'}</Score></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function GcSection({ r, rk, now }: { r: CyRace; rk: CyRankings; now: number }) {
  const running = Date.parse(r.end) > now - DAY;
  const h = rk.history ?? [];
  const finalTop = (rk.gc ?? []).slice(0, 5).map(x => x.rider!);
  const colors = ['var(--o-s1)', 'var(--o-s2)', 'var(--o-s3)', 'var(--o-s4)', 'var(--oc-tech)'];
  return (
    <section className="ocard">
      <h2>{r.name} {r.year}: {running ? `general classification after stage ${rk.stage}` : 'how the race was won'}</h2>
      <p className="dek">Official rankings from {r.source}. The chart follows the final top five: their gap to the yellow jersey of the day after every stage, in minutes.</p>
      <GapChart stages={h.map(s => s.stage)} series={finalTop.map((name, i) => ({ name, color: colors[i], values: h.map(s => { const row = s.gc.find(g => g.rider === name); return row?.gapS != null ? row.gapS / 60 : null; }) }))} />
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', margin: '14px 0 18px' }}>
        {[['Points', rk.points], ['Mountains', rk.mountains], ['Youth', rk.youth], ['Teams', rk.teams]].map(([k, rows]) => (rows as CyRank[] | undefined)?.[0] && (
          <div key={k as string} className="kpi"><Score as="b">{(rows as CyRank[])[0].rider ? rider((rows as CyRank[])[0]).replace(/^(\w)\w* /, '$1. ') : teamCase((rows as CyRank[])[0].team)}</Score><span>{k as string}</span></div>
        ))}
      </div>
      <div className="s-two" style={{ gap: 24 }}>
        <RankList title="General classification" rows={(rk.gc ?? []).slice(0, 10)} />
        <div style={{ minWidth: 0 }}>
          <div className="lab">Stage winners</div>
          <table className="otable"><tbody>{h.map(s => {
            const st = r.stages?.find(x => x.num === s.stage);
            return <tr key={s.stage}><td>{s.stage}</td><td><Score>{rider(s.winner)}</Score>{st && <><br /><small style={{ color: 'var(--o-ink3)' }}><i className="cy-dot" style={{ background: STAGE_COLOR(st.type) }} />{st.from} → {st.to}</small></>}</td><td className="n"><small>{s.gc[0] ? `GC: ${rider(s.gc[0]).split(' ').pop()}` : ''}</small></td></tr>;
          })}</tbody></table>
        </div>
      </div>
    </section>
  );
}

/** Gap to the leader over the stages: zero at the top, the bigger the deficit the lower the line. */
function GapChart({ stages, series }: { stages: number[]; series: { name: string; color: string; values: (number | null)[] }[] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 260, l = 34, r = 110, t = 12, b = 24, n = stages.length;
  const max = Math.max(1, ...series.flatMap(s => s.values.filter((v): v is number => v != null)));
  const cap = Math.min(max, 15); // beyond 15 minutes the race for the podium is no longer readable
  const step = cap > 8 ? 5 : cap > 3 ? 2 : 1;
  const hi = Math.ceil(cap / step) * step;
  const x = (i: number) => l + (i / Math.max(1, n - 1)) * (W - l - r);
  const y = (v: number) => t + (Math.min(v, hi) / hi) * (H - t - b);
  const ends = series.map(s => ({ s, v: s.values[n - 1] })).filter(e => e.v != null).map(e => ({ ...e, yy: y(e.v!) })).sort((a, c) => a.yy - c.yy);
  for (let k = 1; k < ends.length; k++) if (ends[k].yy - ends[k - 1].yy < 13) ends[k].yy = ends[k - 1].yy + 13;
  return (
    <div ref={ref} className="ochart" style={{ position: 'relative' }}
      onPointerMove={ev => { const box = ev.currentTarget.getBoundingClientRect(); const i = Math.round(((ev.clientX - box.left - l) / (W - l - r)) * (n - 1)); setHover(i >= 0 && i < n ? i : null); }}
      onPointerLeave={() => setHover(null)}>
      <div className="olegend">{series.map(s => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Gap to the leader after each stage">
        {Array.from({ length: hi / step + 1 }, (_, k) => k * step).map(v => <g key={v}><line x1={l} x2={W - r} y1={y(v)} y2={y(v)} stroke="var(--o-grid)" /><text x={l - 6} y={y(v) + 4} textAnchor="end">{v ? `+${v}′` : '0'}</text></g>)}
        {stages.map((s, i) => (i % Math.ceil(n / Math.max(1, Math.floor((W - l - r) / 26))) === 0 || i === n - 1) && <text key={s} x={x(i)} y={H - 6} textAnchor="middle">{s}</text>)}
        {series.map(s => {
          let d = '', pen = false;
          s.values.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i)},${y(v)} `; pen = true; });
          return <path key={s.name} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />;
        })}
        {ends.map(e => <text key={e.s.name} x={W - r + 6} y={e.yy + 4} style={{ fill: 'var(--o-ink2)', fontSize: 11 }}>{e.s.name.split(' ').pop()} {e.v ? `+${fmtMin(e.v)}` : ''}</text>)}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={t} y2={H - b} stroke="var(--o-ink3)" />}
        {hover != null && series.map(s => s.values[hover] != null && <circle key={s.name} cx={x(hover)} cy={y(s.values[hover]!)} r={4} fill={s.color} stroke="var(--o-card)" strokeWidth={2} />)}
      </svg>
      {hover != null && (
        <div className="tip obs" style={{ position: 'absolute', left: Math.min(x(hover) + 10, W - 190), top: 30 }}>
          <b>After stage {stages[hover]}</b>
          {series.map(s => <div key={s.name}><i style={{ background: s.color }} /> {s.name.split(' ').pop()} {s.values[hover] == null ? '–' : s.values[hover] === 0 ? 'leader' : `+${fmtMin(s.values[hover]!)}`}</div>)}
        </div>
      )}
    </div>
  );
}
const fmtMin = (m: number) => { const s = Math.round(m * 60); return `${Math.floor(s / 60)}′${String(s % 60).padStart(2, '0')}″`; };

function RouteSection({ r, now }: { r: CyRace; now: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const stages = r.stages as CyStage[];
  const H = 230, l = 38, b = 40, t = 14;
  const hi = Math.ceil(Math.max(100, ...stages.map(s => s.km ?? 0)) / 50) * 50;
  const band = (W - l) / stages.length, bw = Math.min(24, band * 0.62);
  const y = (v: number) => t + ((hi - v) / hi) * (H - t - b);
  const nextStage = stages.find(s => !s.rest && Date.parse(s.start) > now - 5 * 3600e3);
  const kinds = [...new Set(stages.filter(s => !s.rest).map(s => STAGE_KIND(s.type)))];
  return (
    <section className="ocard">
      <h2>The {r.name} {r.year} route</h2>
      <p className="dek">Distance of every stage, colored by terrain{r.stages?.some(s => !s.approx) ? '; official first start and last arrival from the organiser' : ''}. Hover a bar for the details.</p>
      <div className="olegend">{kinds.map(k => <span key={k}><i style={{ background: STAGE_COLOR(k), height: 10 }} />{k}</span>)}</div>
      <div ref={ref} className="ochart">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Stage distances">
          {[0, hi / 2, hi].map(v => <g key={v}><line x1={l} x2={W} y1={y(v)} y2={y(v)} stroke="var(--o-grid)" /><text x={l - 6} y={y(v) + 4} textAnchor="end">{v}</text></g>)}
          {stages.map((s, i) => {
            const cx = l + band * i + band / 2, done = Date.parse(s.start) < now - 6 * 3600e3;
            return (
              <g key={i} opacity={done ? 0.45 : 1}>
                {s.km != null && <rect x={cx - bw / 2} y={y(s.km)} width={bw} height={y(0) - y(s.km)} rx={3} fill={STAGE_COLOR(s.type)} stroke={s === nextStage ? 'var(--o-ink)' : 'none'} strokeWidth={1.5}><title>{`Stage ${s.num} · ${dayShort(Date.parse(s.start))} · ${s.from} → ${s.to} · ${s.km} km · ${s.type} · ${s.approx ? '≈ ' : 'first start '}${hhmm(Date.parse(s.start))}${s.lastArrival ? `, last arrival ${hhmm(Date.parse(s.lastArrival))}` : ''} Rome`}</title></rect>}
                {s.rest && <text x={cx} y={y(0) - 6} textAnchor="middle" style={{ fontSize: 10 }}>Rest</text>}
                <text x={cx} y={H - 24} textAnchor="middle" style={{ fontSize: 10.5, fill: 'var(--o-ink2)' }}>{s.rest ? '–' : s.num}</text>
                {(band > 30 || i % 3 === 0) && <text x={cx} y={H - 10} textAnchor="middle" style={{ fontSize: 9.5 }}>{dayShort(Date.parse(s.start)).split(' ')[1]}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      {nextStage && <p className="dek" style={{ marginTop: 10 }}>Next: <b>stage {nextStage.num}</b>, {dayLong(Date.parse(nextStage.start))}, {nextStage.from} → {nextStage.to} ({nextStage.km} km, {nextStage.type.toLowerCase()}) · {nextStage.approx ? `≈ ${hhmm(Date.parse(nextStage.start))}` : `first start ${hhmm(Date.parse(nextStage.start))}`} Rome</p>}
      <div className="osrc">Source: {r.source ?? 'organiser'}</div>
    </section>
  );
}
