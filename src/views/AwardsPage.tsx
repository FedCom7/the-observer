import { useMemo, useState } from 'react';
import { useWidth } from '../components/charts';
import { Score } from '../components/common';
import { Hero } from '../components/sheet';
import { useData } from '../core/store';
import { DAY, countdown, dayLong, dayShort, fmt, hhmm } from '../core/time';
import { AwardsTabs, ForecastScreen, RaceScreen, StudyScreen, TrackerScreen, useHistory, type AwardsTab } from './AwardsScreens';
import { KIND_LABEL, PERSON_CATS, filmOf, personOf, sameContender, tmdbImg, type Award, type AwardDate, type AwardsData, type OddsRow, type RadarItem, type TmdbFilm } from '../sources/awards';

const GROUPS: { id: Award['group']; label: string; color: string }[] = [
  { id: 'festival', label: 'Festivals', color: 'var(--o-s3)' },
  { id: 'critics', label: 'Critics', color: 'var(--o-s4)' },
  { id: 'major', label: 'Globes & BAFTA', color: 'var(--o-s2)' },
  { id: 'guild', label: 'Guilds', color: 'var(--o-s1)' },
  { id: 'oscars', label: 'Oscars', color: 'var(--oc-cul)' },
];
const colorOf = (g: Award['group']) => GROUPS.find(x => x.id === g)!.color;
/** Shows that start after midnight in Rome: "the night between Sunday 14 and Monday 15 March, 00:00". */
const nightOf = (t: number) => {
  const h = Number(fmt(t, { hour: 'numeric', hourCycle: 'h23' }));
  return h < 7 ? `in the night between ${dayLong(t - DAY).split(' ').slice(0, 2).join(' ')} and ${dayLong(t)}, ${hhmm(t)} Rome time` : `on ${dayLong(t)} at ${hhmm(t)} Rome time`;
};
const when = (d: AwardDate) => `${d.approx ? '≈ ' : ''}${hhmm(Date.parse(d.date))}`;
// The prizes worth showing from each festival
const FESTIVAL_TOP = /^(?!.*(?:runner|international people|documentar|midnight|platform))(?:.*)(?:palme|grand prix|jury prize|best director|golden lion|silver lion|people's choice|volpi|best actor|best actress|prix d'interpr|screenplay|^u\.s\. dramatic|^world cinema dramatic|^u\.s\. documentary)/i;

/** Movie awards season: every date to the Oscars, nominees and winners, and who is favoured. */
export function AwardsPage() {
  const { awards: d, news, now } = useData();
  const [cat, setCat] = useState('picture');
  const [tab, setTab] = useState<AwardsTab>('overview');
  const hist = useHistory(tab !== 'overview');
  if (!d) return <Hero id="awards" dek="Loading the awards season…" />;
  const all = [...d.awards.flatMap(a => a.dates), ...d.oscarSteps].sort((a, b) => a.date.localeCompare(b.date));
  const next = all.filter(x => Date.parse(x.date) > now && x.award !== 'oscars' || (x.award === 'oscars' && Date.parse(x.date) > now && ['nominations', 'ceremony', 'shortlist', 'governors'].includes(x.kind))).slice(0, 1)[0];
  const ceremony = d.oscarSteps.find(s => s.kind === 'ceremony');
  const noms = d.oscarSteps.find(s => s.kind === 'nominations');
  const byId = Object.fromEntries(d.awards.map(a => [a.id, a]));
  const bp = d.odds?.categories.picture?.experts?.[0];
  const myNews = news.filter(n => n.passion === 'awards').slice(0, 8);
  return (
    <>
      <Hero id="awards" dek={<>
        The {d.season}–{String(d.ceremonyYear).slice(2)} awards season. {noms && Date.parse(noms.date) > now ? `Oscar nominations in ${Math.ceil((Date.parse(noms.date) - now) / DAY)} days, ` : ''}
        {ceremony ? `the ${d.ceremonyYear - 1928}th Oscars ${nightOf(Date.parse(ceremony.date))}.` : ''}
        {bp ? ` Gold Derby's experts currently rank ${bp.name} first for Best Picture.` : ''}
      </>} />
      <AwardsTabs tab={tab} set={setTab} />
      {tab === 'tracker' ? <TrackerScreen d={d} h={hist} now={now} /> : tab === 'forecast' ? <ForecastScreen d={d} h={hist} now={now} /> : tab === 'race' ? <RaceScreen d={d} h={hist} /> : tab === 'study' ? <StudyScreen d={d} h={hist} /> : <>
      <section className="s-top">
        <div className="ocard s-next">
          <div className="lab">Next on the calendar</div>
          {next ? (
            <>
              <h3>{byId[next.award]?.name ?? 'Academy Awards'} · {KIND_LABEL[next.kind] ?? next.kind}</h3>
              <div className="when">{dayLong(Date.parse(next.date))} · {when(next)} Rome</div>
              <div className="s-cd">{countdown(Date.parse(next.date) - now)}<small>{next.title}</small></div>
            </>
          ) : <div>The season is over.</div>}
        </div>
        <div className="ocard">
          <div className="lab">The {d.ceremonyYear - 1928}th Oscars</div>
          {ceremony && <>
            <h3 style={{ margin: 0 }}>{dayLong(Date.parse(ceremony.date) - 8 * 3600e3)} in Hollywood</h3>
            <div className="when">{nightOf(Date.parse(ceremony.date))} · Dolby Theatre</div>
            <div className="s-cd" style={{ fontSize: 30 }}>{Date.parse(ceremony.date) > now ? countdown(Date.parse(ceremony.date) - now) : 'Done'}</div>
          </>}
          {noms && <div className="osrc">Nominations: {dayLong(Date.parse(noms.date))}, {when(noms)}</div>}
        </div>
        <div className="ocard">
          <div className="lab">Best Picture · Gold Derby experts</div>
          {(d.odds?.categories.picture?.experts ?? []).slice(0, 5).map((r, i) => (
            <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '18px 1fr 52px', gap: 6, fontSize: 13, padding: '3px 0' }}>
              <span style={{ color: 'var(--o-ink3)' }}>{i + 1}</span><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Thumb src={tmdbImg(filmOf(d, r.name)?.poster, 'w92')} h={22} /><b>{r.name}</b></span><Score><span style={{ textAlign: 'right', display: 'block' }}>{r.pct.toFixed(0)}%</span></Score>
            </div>
          ))}
          <div className="osrc">{d.odds?.stage === 'winners' ? 'Chance to win' : 'Chance of a nomination'} · <a href={d.odds?.url} target="_blank" rel="noreferrer">Gold Derby</a></div>
        </div>
      </section>

      <Announcements items={d.radar ?? []} byId={byId} now={now} />

      <Contenders d={d} />

      <section className="ocard">
        <h2>The road to the {d.ceremonyYear - 1928}th Oscars</h2>
        <p className="dek">Every step of the Academy's calendar, from the honorary awards to the ceremony. Times are Rome time; ≈ marks the usual hour where the Academy has not given one.</p>
        <OscarRoad steps={d.oscarSteps} now={now} />
      </section>

      <section className="ocard">
        <h2>The season at a glance</h2>
        <p className="dek">Each row is an award: hollow rings are nominations or shortlists, solid dots the ceremonies, bars the festivals. Hover for the date and time.</p>
        <SeasonChart d={d} now={now} />
        <div className="osrc">Dates: <a href={d.calendarUrl ?? '#'} target="_blank" rel="noreferrer">Gold Derby season calendar</a> and Wikipedia</div>
      </section>

      <section className="ocard">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}><h2 style={{ marginRight: 'auto' }}>Category by category</h2></div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 16px' }}>
          {d.categories.map(c => <button key={c.id} className="btn" aria-pressed={cat === c.id} onClick={() => setCat(c.id)} style={{ color: 'var(--o-ink)', background: cat === c.id ? 'var(--o-accent-soft)' : 'transparent', borderColor: 'var(--o-line)', textTransform: 'none', letterSpacing: 0 }}>{c.name}</button>)}
        </div>
        <CategoryView d={d} cat={cat} now={now} />
      </section>

      <section className="s-two">
        <div className="ocard">
          <h2>The festivals</h2>
          <p className="dek">Where the season's contenders premiered and what they won; Telluride and New York give no prizes, so their official programme is shown.</p>
          {d.awards.filter(a => a.group === 'festival').map(a => {
            const prizes = (a.edition?.categories ?? []).filter(c => FESTIVAL_TOP.test(c.name)).slice(0, 6);
            const span = a.dates[0];
            return (
              <div key={a.id} style={{ marginBottom: 14 }}>
                <div className="lab">{a.name}{span ? ` · ${dayShort(Date.parse(span.date))}${span.end ? ` – ${dayShort(Date.parse(span.end))}` : ''}` : ''}</div>
                {prizes.length ? prizes.map(p => <div key={p.name} style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: 8, fontSize: 13, padding: '2px 0', alignItems: 'center' }}><span style={{ color: 'var(--o-ink3)' }}>{p.name}</span><Score><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Thumb src={tmdbImg(filmOf(d, p.nominees[0].film)?.poster, 'w92')} h={24} /><span><b>{p.nominees[0].film ?? p.nominees[0].people}</b>{p.nominees[0].film && p.nominees[0].people ? <small style={{ color: 'var(--o-ink3)' }}> · {p.nominees[0].people}</small> : null}</span></span></Score></div>)
                  : a.edition?.lineup?.length ? <Lineup d={d} titles={a.edition.lineup} />
                  : <small style={{ color: 'var(--o-ink3)' }}>No prizes yet.</small>}
              </div>
            );
          })}
        </div>
        <div className="ocard">
          <div className="lab">Coming up</div>
          <div className="olist">
            {all.filter(x => Date.parse(x.date) > now).slice(0, 12).map(x => (
              <div key={x.award + x.kind + x.date} className="r">
                <time>{dayShort(Date.parse(x.date))}<small>{when(x)}</small></time>
                <div><b>{byId[x.award]?.short ?? 'Oscars'} · {KIND_LABEL[x.kind] ?? x.kind}</b><small>{x.award === 'oscars' ? x.title : byId[x.award]?.name}{x.source ? ` · source: ${x.source}` : ''}</small></div>
                <span className="x"><i className="cy-dot" style={{ background: colorOf(byId[x.award]?.group ?? 'oscars') }} /></span>
              </div>
            ))}
          </div>
          <div className="lab" style={{ marginTop: 16 }}>From the wire</div>
          <div className="onews">{myNews.map(n => <a key={n.id} className="r" href={n.url} target="_blank" rel="noreferrer"><time>{dayShort(n.time)} · {n.source}</time><p>{n.title}</p></a>)}</div>
        </div>
      </section>

      <section className="ocard">
        <h2>Every award followed</h2>
        <div className="cy-grid">
          {d.awards.map(a => {
            const nm = a.dates.find(x => x.kind === 'nominations'), cer = a.dates.find(x => x.kind === 'ceremony' || x.kind === 'festival');
            return (
              <a key={a.id} className="cy-tile" href={a.edition?.url ?? '#'} target="_blank" rel="noreferrer" style={{ borderTopColor: colorOf(a.group) }}>
                <small>{GROUPS.find(g => g.id === a.group)!.label}</small>
                <b>{a.short}</b>
                <span>{nm ? `Noms ${dayShort(Date.parse(nm.date))}` : ''}{nm && cer ? ' · ' : ''}{cer ? `${a.group === 'festival' ? '' : 'Awards '}${dayShort(Date.parse(cer.date))}` : ''}</span>
                <div className="cy-win" style={{ color: a.state === 'pending' ? 'var(--o-ink3)' : 'var(--o-ink)' }}>{a.state === 'winners' ? 'Winners out' : a.state === 'nominations' ? 'Nominations out' : 'Not yet announced'}</div>
                {a.news?.find(n => n.kind !== 'news') && <small style={{ textTransform: 'none', letterSpacing: 0 }}>{a.news.find(n => n.kind !== 'news')!.source}: {a.news.find(n => n.kind !== 'news')!.title.slice(0, 70)}</small>}
              </a>
            );
          })}
        </div>
        <div className="osrc">Nominees and winners from each edition's Wikipedia page, re-read as soon as the trade press reports an announcement · dates from the official sites, Gold Derby and Wikipedia · updated {dayShort(Date.parse(d.updated))} {hhmm(Date.parse(d.updated))}</div>
      </section>
      </>}
    </>
  );
}

const RADAR_LABEL: Record<RadarItem['kind'], string> = { nominations: 'Nominations', winners: 'Winners', date: 'Date', news: 'News' };

/** What was announced in the last days, as the trade press and awards blogs report it. */
function Announcements({ items, byId, now }: { items: RadarItem[]; byId: Record<string, Award>; now: number }) {
  const hot = items.filter(i => i.kind !== 'news').slice(0, 8);
  const rest = items.filter(i => i.kind === 'news').slice(0, Math.max(0, 8 - hot.length));
  const list = [...hot, ...rest].slice(0, 8);
  if (!list.length) return null;
  return (
    <section className="ocard">
      <h2>Latest announcements</h2>
      <p className="dek">Nominations, winners and dates as soon as Variety, The Hollywood Reporter, IndieWire, Gold Derby and the awards blogs report them; each announcement also triggers a fresh read of the nominees.</p>
      <div className="onews">
        {list.map(i => (
          <a key={i.url + i.title} className="r" href={i.url} target="_blank" rel="noreferrer">
            <time>{dayShort(Date.parse(i.time))} {hhmm(Date.parse(i.time))} · {i.source}{now - Date.parse(i.time) < DAY ? ' · new' : ''}</time>
            <p><span className="tag" style={{ marginRight: 6, background: i.kind === 'winners' ? 'var(--oc-cul)' : i.kind === 'nominations' ? 'var(--o-s1)' : i.kind === 'date' ? 'var(--o-s4)' : 'var(--o-other)', color: '#fff', padding: '1px 6px', borderRadius: 4, fontSize: 10.5 }}>{byId[i.award]?.short ?? 'Oscars'} · {RADAR_LABEL[i.kind]}</span>{i.title}</p>
          </a>
        ))}
      </div>
    </section>
  );
}

function OscarRoad({ steps, now }: { steps: AwardDate[]; now: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const list = steps.filter(s => s.kind !== 'scitech' || Date.parse(s.date) > now - 30 * DAY);
  if (!list.length) return null;
  const t0 = Date.parse(list[0].date) - 7 * DAY, t1 = Date.parse(list[list.length - 1].date) + 7 * DAY;
  const narrow = W < 640;
  if (narrow) {
    return <div className="olist">{list.map(s => <div key={s.kind + s.date} className={`r${Date.parse(s.date) < now ? ' past' : ''}`}><time>{dayShort(Date.parse(s.date))}<small>{when(s)}</small></time><div><b>{KIND_LABEL[s.kind] ?? s.kind}</b><small>{s.title}</small></div><span className="x" /></div>)}</div>;
  }
  const x = (t: number) => 10 + ((t - t0) / (t1 - t0)) * (W - 20);
  const H = 150, base = 74;
  return (
    <div ref={ref} className="ochart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Oscar calendar">
        <line x1={10} x2={W - 10} y1={base} y2={base} stroke="var(--o-grid)" strokeWidth={3} strokeLinecap="round" />
        {now > t0 && <line x1={10} x2={x(Math.min(now, t1))} y1={base} y2={base} stroke="var(--oc-cul)" strokeWidth={3} strokeLinecap="round" />}
        {list.map((s, i) => {
          const t = Date.parse(s.date), cx = x(t), up = i % 2 === 0, big = s.kind === 'ceremony' || s.kind === 'nominations';
          return (
            <g key={s.kind + s.date}>
              <line x1={cx} x2={cx} y1={base} y2={up ? base - 24 : base + 24} stroke="var(--o-line)" />
              <circle cx={cx} cy={base} r={big ? 7 : 5} fill={t < now ? 'var(--oc-cul)' : 'var(--o-card)'} stroke="var(--oc-cul)" strokeWidth={2}><title>{`${s.title} · ${dayLong(t)} ${when(s)} Rome`}</title></circle>
              <text x={cx} y={up ? base - 40 : base + 38} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--o-ink)', fontWeight: big ? 700 : 500 }}>{KIND_LABEL[s.kind] ?? s.kind}</text>
              <text x={cx} y={up ? base - 27 : base + 51} textAnchor="middle" style={{ fontSize: 10.5 }}>{dayShort(t).split(' ').slice(1).join(' ')}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function SeasonChart({ d, now }: { d: AwardsData; now: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const rows = [...d.awards];
  const t0 = Date.UTC(d.season, 4, 1), t1 = Date.UTC(d.ceremonyYear, 2, 31);
  const l = Math.min(130, W * 0.28), r = 10, top = 22, rowH = 19;
  const H = top + rows.length * rowH + 6;
  const x = (t: number) => l + ((t - t0) / (t1 - t0)) * (W - l - r);
  const months = Array.from({ length: 11 }, (_, k) => Date.UTC(d.season, 4 + k, 1));
  return (
    <div ref={ref} className="ochart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Awards season calendar">
        {months.map(m => <g key={m}><line x1={x(m)} x2={x(m)} y1={top - 6} y2={H} stroke="var(--o-grid)" /><text x={x(m) + 3} y={12}>{fmt(m + 15 * DAY, { month: 'short' })}</text></g>)}
        {now > t0 && now < t1 && <line x1={x(now)} x2={x(now)} y1={top - 8} y2={H} stroke="var(--o-ink)" strokeDasharray="2 3" />}
        {rows.map((a, i) => {
          const cy = top + i * rowH + rowH / 2, c = colorOf(a.group);
          const dates = a.id === 'oscars' ? d.oscarSteps.filter(s => ['shortlist', 'nominations', 'ceremony'].includes(s.kind)) : a.dates;
          return (
            <g key={a.id}>
              <text x={0} y={cy + 4} style={{ fontSize: 11.5, fill: a.group === 'oscars' ? 'var(--o-ink)' : 'var(--o-ink2)', fontWeight: a.group === 'oscars' ? 700 : 400 }}>{a.short}</text>
              <line x1={l} x2={W - r} y1={cy} y2={cy} stroke="var(--o-grid)" strokeOpacity={0.5} />
              {dates.map(s => {
                const t = Date.parse(s.date), past = t < now;
                if (t < t0 || t > t1) return null;
                const tip = `${a.name} · ${KIND_LABEL[s.kind] ?? s.kind} · ${dayLong(t)} ${when(s)} Rome`;
                if (s.kind === 'festival' && s.end) return <rect key={s.date} x={x(t)} y={cy - 5} width={Math.max(6, x(Date.parse(s.end)) - x(t))} height={10} rx={3} fill={c} opacity={past ? 0.45 : 1}><title>{tip}</title></rect>;
                const filled = s.kind === 'ceremony' || s.kind === 'festival';
                return <circle key={s.kind + s.date} cx={x(t)} cy={cy} r={filled ? 5 : 4} fill={filled ? c : 'var(--o-card)'} stroke={c} strokeWidth={2} opacity={past ? 0.45 : 1}><title>{tip}</title></circle>;
              })}
            </g>
          );
        })}
      </svg>
      <div className="olegend">{GROUPS.map(g => <span key={g.id}><i style={{ background: g.color, height: 10, width: 10, borderRadius: 5 }} />{g.label}</span>)}</div>
    </div>
  );
}

function CategoryView({ d, cat, now }: { d: AwardsData; cat: string; now: number }) {
  const o = d.odds?.categories[cat];
  const experts = o?.experts ?? [], users = o?.users ?? [];
  const contenders = useMemo(() => {
    const names = [...experts.slice(0, 10)];
    for (const u of users.slice(0, 10)) if (!names.some(n => n.name === u.name)) names.push(u);
    return names.slice(0, 12);
  }, [experts, users]);
  // Awards with results in this category, in date order
  const columns = d.awards.filter(a => a.id !== 'oscars' && a.edition?.categories.some(c => c.oscar === cat))
    .map(a => ({ a, cats: a.edition!.categories.filter(c => c.oscar === cat), t: Date.parse((a.dates.find(x => x.kind === 'ceremony' || x.kind === 'festival') ?? a.dates[0])?.date ?? `${d.season}-12-31`) }))
    .sort((p, q) => p.t - q.t);
  const oscarCat = d.awards.find(a => a.id === 'oscars')?.edition?.categories.find(c => c.oscar === cat);
  const name = d.categories.find(c => c.id === cat)?.name ?? cat;
  const stage = d.odds?.stage === 'winners' ? 'win' : 'be nominated';
  return (
    <>
      {o ? (
        <div className="s-two" style={{ gap: 24 }}>
          <div style={{ minWidth: 0 }}>
            <div className="lab">Chance to {stage} · Gold Derby</div>
            <OddsBars d={d} rows={contenders} experts={experts} users={users} person={PERSON_CATS.has(cat)} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="lab">How the experts' odds moved</div>
            <OddsTrend history={d.odds?.history[cat]?.experts ?? []} names={experts.slice(0, 5).map(e => e.name)} />
          </div>
        </div>
      ) : <p className="dek">Gold Derby has no odds for {name} yet.</p>}

      <div className="lab" style={{ marginTop: 18 }}>The precursors · {name}</div>
      {columns.length ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="otable">
            <thead><tr><th>Contender</th>{columns.map(c => <th key={c.a.id} className="n" title={c.cats.map(x => x.name).join(' · ')}>{c.a.short}</th>)}{oscarCat && <th className="n">Oscar</th>}</tr></thead>
            <tbody>{(contenders.length ? contenders : columns.flatMap(c => c.cats.flatMap(x => x.nominees.map(n => ({ name: (PERSON_CATS.has(cat) ? n.people : n.film) ?? '', film: n.film })))).filter((v, i, all) => v.name && all.findIndex(z => z.name === v.name) === i).slice(0, 15)).map(r => (
              <tr key={r.name}>
                <td><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Thumb src={PERSON_CATS.has(cat) ? tmdbImg(personOf(d, r.name)?.photo, 'w92') : tmdbImg(filmOf(d, r.name)?.poster, 'w92')} h={24} round={PERSON_CATS.has(cat)} /><span><b>{r.name}</b>{r.film && r.film !== r.name ? <small style={{ color: 'var(--o-ink3)' }}> · {r.film}</small> : null}</span></span></td>
                {columns.map(c => {
                  const hit = c.cats.flatMap(x => x.nominees).filter(n => sameContender(cat, n, r));
                  const won = hit.some(n => n.winner);
                  return <td key={c.a.id} className="n" style={{ color: won ? 'var(--oc-cul)' : 'var(--o-ink2)', fontWeight: won ? 700 : 400, fontSize: 15, textAlign: 'center' }}>{won ? '★' : hit.length ? '●' : ''}</td>;
                })}
                {oscarCat && (() => { const hit = oscarCat.nominees.filter(n => sameContender(cat, n, r)); return <td className="n" style={{ fontWeight: 700, color: 'var(--oc-cul)', fontSize: 15, textAlign: 'center' }}>{hit.some(n => n.winner) ? '★' : hit.length ? '●' : ''}</td>; })()}
              </tr>
            ))}</tbody>
          </table>
          <div className="osrc">★ won · ● nominated. Hover a column for the categories counted.</div>
        </div>
      ) : <p className="dek">No precursor has announced {name.toLowerCase()} nominees yet{Date.parse(d.calendar[0]?.date ?? '') > now ? '' : ': they start arriving with the critics in late November'}.</p>}

      {columns.length > 0 && (
        <div className="cy-grid" style={{ marginTop: 14 }}>
          {columns.slice(-6).reverse().map(c => (
            <div key={c.a.id} className="cy-tile" style={{ borderTopColor: colorOf(c.a.group) }}>
              <small>{c.a.short}</small>
              {c.cats.slice(0, 2).map(x => (
                <div key={x.name} style={{ fontSize: 12.5 }}>
                  <div style={{ color: 'var(--o-ink3)', fontSize: 11 }}>{x.name}</div>
                  {x.nominees.slice(0, 6).map((n, i) => <div key={i} style={{ fontWeight: n.winner ? 700 : 400 }}><Score>{n.winner ? '★ ' : ''}{PERSON_CATS.has(cat) ? n.people : n.song ?? n.film ?? n.people}</Score></div>)}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function OddsBars({ d, rows, experts, users, person }: { d: AwardsData; rows: OddsRow[]; experts: OddsRow[]; users: OddsRow[]; person: boolean }) {
  const pctOf = (list: OddsRow[], n: string) => list.find(r => r.name === n)?.pct ?? null;
  return (
    <div style={{ display: 'grid', gap: 7 }}>
      <div className="olegend"><span><i style={{ background: 'var(--oc-cul)', height: 8 }} />Experts</span><span><i style={{ background: 'var(--o-other)', height: 8 }} />Users</span></div>
      {rows.map(r => {
        const e = pctOf(experts, r.name), u = pctOf(users, r.name), ex = experts.find(x => x.name === r.name);
        const delta = ex ? ex.pct - ex.was : 0;
        return (
          <div key={r.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr) 64px', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}><Thumb src={person ? tmdbImg(personOf(d, r.name)?.photo, 'w92') : tmdbImg(filmOf(d, r.name)?.poster, 'w92')} h={26} round={person} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}><b>{r.name}</b>{person && r.film ? <small style={{ color: 'var(--o-ink3)' }}> · {r.film}</small> : null}</span></div>
            <div style={{ display: 'grid', gap: 2 }}>
              <div style={{ height: 6, borderRadius: 3, width: `${e ?? 0}%`, background: 'var(--oc-cul)' }} />
              <div style={{ height: 6, borderRadius: 3, width: `${u ?? 0}%`, background: 'var(--o-other)' }} />
            </div>
            <Score><span style={{ textAlign: 'right', display: 'block' }}>{e == null ? '–' : `${Math.round(e)}%`}{Math.abs(delta) >= 1 ? <small style={{ color: delta > 0 ? 'var(--o-s3)' : 'var(--o-s2)' }}> {delta > 0 ? '▲' : '▼'}{Math.abs(Math.round(delta))}</small> : null}</span></Score>
          </div>
        );
      })}
    </div>
  );
}

function OddsTrend({ history, names }: { history: { d: string; v: Record<string, number> }[]; names: string[] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  if (history.length < 2) return <div ref={ref}><p className="dek">The line chart fills in day by day: the collector keeps one reading of Gold Derby's odds per day from {history[0] ? dayShort(Date.parse(history[0].d)) : 'today'}.</p></div>;
  const H = 220, l = 34, r = 110, t = 10, b = 22;
  const colors = ['var(--oc-cul)', 'var(--o-s1)', 'var(--o-s3)', 'var(--o-s4)', 'var(--o-s2)'];
  const t0 = Date.parse(history[0].d), t1 = Date.parse(history[history.length - 1].d);
  const x = (d: string) => l + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (W - l - r);
  const y = (v: number) => t + ((100 - v) / 100) * (H - t - b);
  const ends = names.map((n, i) => ({ n, c: colors[i], yy: y(history[history.length - 1].v[n] ?? 0) })).sort((p, q) => p.yy - q.yy);
  for (let k = 1; k < ends.length; k++) if (ends[k].yy - ends[k - 1].yy < 13) ends[k].yy = ends[k - 1].yy + 13;
  return (
    <div ref={ref} className="ochart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Odds over time">
        {[0, 50, 100].map(v => <g key={v}><line x1={l} x2={W - r} y1={y(v)} y2={y(v)} stroke="var(--o-grid)" /><text x={l - 6} y={y(v) + 4} textAnchor="end">{v}%</text></g>)}
        {names.map((n, i) => <path key={n} d={history.filter(h => h.v[n] != null).map((h, k) => `${k ? 'L' : 'M'}${x(h.d)},${y(h.v[n])}`).join(' ')} fill="none" stroke={colors[i]} strokeWidth={2} />)}
        {ends.map(e => <text key={e.n} x={W - r + 6} y={e.yy + 4} style={{ fontSize: 11, fill: 'var(--o-ink2)' }}>{e.n.length > 16 ? e.n.slice(0, 15) + '…' : e.n}</text>)}
        <text x={l} y={H - 4}>{dayShort(t0)}</text><text x={W - r} y={H - 4} textAnchor="end">{dayShort(t1)}</text>
      </svg>
    </div>
  );
}

/** A small poster (2:3) or a round portrait; a grey placeholder when TMDB has no image. */
function Thumb({ src, h, round }: { src: string | null; h: number; round?: boolean }) {
  const w = round ? h : Math.round(h * 0.67);
  if (!src) return <span style={{ width: w, height: h, flex: 'none', borderRadius: round ? '50%' : 3, background: 'var(--o-grid)', display: 'inline-block' }} />;
  return <img src={src} alt="" loading="lazy" style={{ width: w, height: h, flex: 'none', objectFit: 'cover', borderRadius: round ? '50%' : 3, background: 'var(--o-grid)' }} />;
}

/** The leading Best Picture contenders as posters; one click opens the film's card. */
function Contenders({ d }: { d: AwardsData }) {
  const rows = d.odds?.categories.picture?.experts?.slice(0, 10) ?? [];
  const [pick, setPick] = useState<string | null>(null);
  if (!rows.length || !d.tmdb) return null;
  const sel = pick ?? rows[0].name;
  const film = filmOf(d, sel);
  return (
    <section className="ocard">
      <h2>The Best Picture contenders</h2>
      <p className="dek">Gold Derby's experts' top ten, with their chance of a {d.odds?.stage === 'winners' ? 'win' : 'nomination'}. Click a poster for the film.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 10 }}>
        {rows.map(r => {
          const f = filmOf(d, r.name);
          return (
            <button key={r.name} onClick={() => setPick(r.name)} style={{ all: 'unset', cursor: 'pointer', display: 'grid', gap: 4, opacity: sel === r.name ? 1 : 0.8 }}>
              <div style={{ position: 'relative', aspectRatio: '2 / 3', borderRadius: 6, overflow: 'hidden', background: 'var(--o-grid)', outline: sel === r.name ? '2px solid var(--oc-cul)' : 'none', outlineOffset: 2 }}>
                {f?.poster && <img src={tmdbImg(f.poster, 'w185')!} alt={r.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                <span style={{ position: 'absolute', right: 4, bottom: 4, background: 'rgba(0,0,0,.72)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '1px 5px', borderRadius: 4 }}>{Math.round(r.pct)}%</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>{r.name}</span>
            </button>
          );
        })}
      </div>
      {film && <FilmCard f={film} />}
      <div className="osrc">Posters and details: TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.</div>
    </section>
  );
}

function FilmCard({ f }: { f: TmdbFilm }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', gap: 16, marginTop: 16, alignItems: 'start' }}>
      {f.poster ? <img src={tmdbImg(f.poster, 'w342')!} alt={f.title} style={{ width: 120, borderRadius: 8 }} /> : <div />}
      <div style={{ minWidth: 0 }}>
        <h3 style={{ margin: 0 }}>{f.title}{f.original ? <small style={{ color: 'var(--o-ink3)', fontWeight: 400 }}> · {f.original}</small> : null}</h3>
        <div style={{ color: 'var(--o-ink3)', fontSize: 12.5, margin: '2px 0 8px' }}>{[f.director ? `Directed by ${f.director}` : null, f.release ? dayLong(Date.parse(f.release)) : null, f.runtime ? `${f.runtime} min` : null, f.genres?.slice(0, 3).join(', ')].filter(Boolean).join(' · ')}</div>
        {f.overview && <p style={{ margin: '0 0 10px', fontSize: 13.5, lineHeight: 1.45, maxWidth: '70ch' }}>{f.overview}</p>}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {(f.cast ?? []).slice(0, 6).map(c => (
            <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <Thumb src={tmdbImg(c.photo, 'w92')} h={30} round />
              <span><b>{c.name}</b><br /><small style={{ color: 'var(--o-ink3)' }}>{c.role}</small></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A festival's programme (no prizes): the films, with their posters. */
function Lineup({ d, titles }: { d: AwardsData; titles: string[] }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
      {titles.slice(0, 24).map(t => {
        const f = filmOf(d, t);
        return <span key={t} title={f?.director ? `${t} · ${f.director}` : t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, border: '1px solid var(--o-line)', borderRadius: 4, padding: '2px 6px 2px 2px' }}><Thumb src={tmdbImg(f?.poster, 'w92')} h={22} />{t}</span>;
      })}
    </div>
  );
}
