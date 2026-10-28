import { useState } from 'react';
import { useWidth } from '../components/charts';
import { Score } from '../components/common';
import { DAY, countdown, dayShort, fmt, hhmm } from '../core/time';
import { GROUPS, KIND_LABEL, PERSON_CATS, colorOf, filmOf, personOf, tmdbImg, type Award, type AwardCategory, type AwardDate, type AwardsData, type Nominee } from '../sources/awards';

// What each row of the chart shows: the festival itself, or the announcements and the ceremony
const SHOWN = new Set(['festival', 'longlist', 'shortlist', 'nominations', 'ceremony']);
// Categories that are not about films: kept, but folded at the bottom
const NOT_FILM = /television|\btv\b|series|episod|daytime|quiz|children|broadway|theat(?:re|er)|commercial|sports|short[- ]form|interactive|video game|podcast|radio|news script|regional|new media|student|sponsored/i;
// Categories won by people: the name comes first, the film second
const BY_PERSON = /act(?:or|ress)|perform|direct(?:or|ing)|breakthrough|young/i;

/** The dates of an award on the chart; the Oscars use the Academy's own calendar. */
const datesOf = (d: AwardsData, a: Award) => (a.id === 'oscars' ? d.oscarSteps : a.dates).filter(x => SHOWN.has(x.kind));
const when = (x: AwardDate) => `${dayShort(Date.parse(x.date))} · ${x.approx ? '≈ ' : ''}${hhmm(Date.parse(x.date))}`;

/** Every event of the season on one chart; pick one to see its categories, nominees and winners. */
export function EventsScreen({ d, now }: { d: AwardsData; now: number }) {
  // Start from the event closest to today: the one just announced or the next one
  const [pick, setPick] = useState<string | null>(null);
  const closest = d.awards.map(a => ({ a, gap: Math.min(...datesOf(d, a).map(x => Math.abs(Date.parse(x.date) - now)), Infinity) })).sort((p, q) => p.gap - q.gap)[0]?.a.id;
  const sel = d.awards.find(a => a.id === (pick ?? closest)) ?? d.awards[0];
  return (
    <>
      <section className="ocard" style={{ gridColumn: '1 / -1' }}>
        <h2>Every event of the season</h2>
        <p className="dek">From Cannes to the Oscars: bars are the festivals, rings the nominations, dots the ceremonies. Click a row to see its categories below; nominees appear on the day they are announced, winners on the night.</p>
        <Gantt d={d} now={now} sel={sel.id} onPick={setPick} />
      </section>
      <EventDetail d={d} a={sel} now={now} />
    </>
  );
}

function Gantt({ d, now, sel, onPick }: { d: AwardsData; now: number; sel: string; onPick: (id: string) => void }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const t0 = Date.UTC(d.season, 4, 1), t1 = Date.UTC(d.ceremonyYear, 2, 31);
  const l = W < 520 ? 92 : 150, r = 10, top = 22, rowH = 24;
  const H = top + d.awards.length * rowH + 4;
  const x = (t: number) => l + ((Math.min(Math.max(t, t0), t1) - t0) / (t1 - t0)) * (W - l - r);
  const months = Array.from({ length: 11 }, (_, k) => Date.UTC(d.season, 4 + k, 1));
  return (
    <div ref={ref} className="ochart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="listbox" aria-label="Awards season events">
        {months.map(m => <g key={m}><line x1={x(m)} x2={x(m)} y1={top - 6} y2={H} stroke="var(--o-grid)" /><text x={x(m) + 3} y={12}>{fmt(m + 15 * DAY, { month: W < 520 ? 'narrow' : 'short' })}</text></g>)}
        {d.awards.map((a, i) => {
          const y = top + i * rowH, cy = y + rowH / 2, c = colorOf(a.group), on = a.id === sel;
          const dates = datesOf(d, a).filter(s => Date.parse(s.date) >= t0 && Date.parse(s.date) <= t1);
          const first = dates.find(s => s.kind !== 'festival'), cer = dates.find(s => s.kind === 'ceremony');
          const mark = a.state === 'winners' ? '★' : a.state === 'nominations' ? '●' : '';
          return (
            <g key={a.id} role="option" aria-selected={on} tabIndex={0} style={{ cursor: 'pointer', outline: 'none' }} onClick={() => onPick(a.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(a.id); } }}>
              <title>{`${a.name}${dates.length ? ' · ' + dates.map(s => `${KIND_LABEL[s.kind] ?? s.kind} ${dayShort(Date.parse(s.date))}`).join(' · ') : ' · dates not announced'}`}</title>
              <rect x={0} y={y + 1} width={W} height={rowH - 2} rx={5} fill={on ? 'var(--o-accent-soft)' : 'transparent'} />
              <text x={6} y={cy + 4} style={{ fontSize: 12, fill: on || a.group === 'oscars' ? 'var(--o-ink)' : 'var(--o-ink2)', fontWeight: on || a.group === 'oscars' ? 700 : 400 }}>{a.short}</text>
              {mark && <text x={l - 8} y={cy + 4} textAnchor="end" style={{ fontSize: 10.5, fill: a.state === 'winners' ? 'var(--oc-cul)' : c }}>{mark}</text>}
              <line x1={l} x2={W - r} y1={cy} y2={cy} stroke="var(--o-grid)" strokeOpacity={0.5} />
              {first && cer && first !== cer && <line x1={x(Date.parse(first.date))} x2={x(Date.parse(cer.date))} y1={cy} y2={cy} stroke={c} strokeWidth={3} strokeOpacity={0.3} />}
              {dates.map(s => {
                const t = Date.parse(s.date), past = t < now;
                if (s.kind === 'festival') return <rect key={s.kind + s.date} x={x(t)} y={cy - 6} width={Math.max(6, x(s.end ? Date.parse(s.end) : t) - x(t))} height={12} rx={3} fill={c} opacity={past ? 0.55 : 1} />;
                const filled = s.kind === 'ceremony';
                return <circle key={s.kind + s.date} cx={x(t)} cy={cy} r={filled ? 5.5 : s.kind === 'nominations' ? 4.5 : 3.5} fill={filled ? c : 'var(--o-card)'} stroke={c} strokeWidth={2} opacity={past ? 0.55 : 1} />;
              })}
              {!dates.length && <text x={l + 6} y={cy + 4} style={{ fontSize: 10.5, fontStyle: 'italic' }}>dates not announced</text>}
            </g>
          );
        })}
        {now > t0 && now < t1 && <><line x1={x(now)} x2={x(now)} y1={top - 8} y2={H} stroke="var(--o-ink)" strokeDasharray="2 3" pointerEvents="none" /><text x={x(now)} y={top - 9} textAnchor="middle" style={{ fontSize: 9.5, fill: 'var(--o-ink)' }}>today</text></>}
      </svg>
      <div className="olegend">{GROUPS.map(g => <span key={g.id}><i style={{ background: g.color, height: 10, width: 10, borderRadius: 5 }} />{g.label}</span>)}<span>● nominations out · ★ winners out</span></div>
    </div>
  );
}

function EventDetail({ d, a, now }: { d: AwardsData; a: Award; now: number }) {
  const dates = datesOf(d, a);
  const noms = dates.find(x => x.kind === 'nominations'), cer = dates.find(x => x.kind === 'ceremony' || x.kind === 'festival');
  const next = dates.find(x => Date.parse(x.date) > now);
  const real = a.edition?.categories ?? [];
  const tpl = !real.length;
  const cats: AwardCategory[] = real.length ? real : (a.template?.categories ?? []).map(c => ({ ...c, nominees: [] }));
  const rank = (c: AwardCategory) => { const k = d.categories.findIndex(x => x.id === c.oscar); return k < 0 ? 99 : k; };
  const film = cats.filter(c => !NOT_FILM.test(c.name)).map((c, i) => ({ c, i })).sort((p, q) => rank(p.c) - rank(q.c) || p.i - q.i).map(p => p.c);
  const other = cats.filter(c => NOT_FILM.test(c.name));
  // What fills the empty cards next: the nominations, or straight the winners (critics, festivals)
  const pending = noms && Date.parse(noms.date) > now ? `Nominees ${dayShort(Date.parse(noms.date))}` : cer && Date.parse(cer.date) > now ? `${a.group === 'festival' ? 'Prizes' : 'Winners'} ${dayShort(Date.parse(cer.date))}` : 'Not announced yet';
  const count = real.reduce((s, c) => s + c.nominees.length, 0);
  return (
    <section className="ocard" style={{ gridColumn: '1 / -1', borderTop: `3px solid ${colorOf(a.group)}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>{a.name}</h2>
        <span className="lab" style={{ margin: 0 }}>{GROUPS.find(g => g.id === a.group)!.label}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: a.state === 'pending' ? 'var(--o-ink3)' : a.state === 'winners' ? 'var(--oc-cul)' : colorOf(a.group) }}>{a.state === 'winners' ? '★ Winners out' : a.state === 'nominations' ? '● Nominations out' : 'Not yet announced'}</span>
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', margin: '8px 0 4px', fontSize: 13 }}>
        {dates.map(x => (
          <span key={x.kind + x.date} style={{ color: Date.parse(x.date) < now ? 'var(--o-ink3)' : 'var(--o-ink)' }}>
            <b>{KIND_LABEL[x.kind] ?? x.kind}</b> {x.kind === 'festival' && x.end ? `${dayShort(Date.parse(x.date))} – ${dayShort(Date.parse(x.end))}` : when(x)}
          </span>
        ))}
        {!dates.length && <span style={{ color: 'var(--o-ink3)' }}>Dates not announced yet</span>}
        {next && <span style={{ color: 'var(--o-ink2)' }}>{KIND_LABEL[next.kind] ?? next.kind} in <b>{countdown(Date.parse(next.date) - now)}</b></span>}
      </div>
      <p className="dek" style={{ marginTop: 6 }}>
        {tpl && cats.length ? `This year's nominees are not out yet: the cards follow last year's categories (${a.template?.page}) and fill in as soon as they are announced.`
          : real.length ? `${real.length} categories, ${count} ${a.state === 'winners' && real.every(c => c.nominees.length <= 1) ? 'winners' : 'names'}.` : ''}
        {a.edition?.url && <> Source: <a href={a.edition.url} target="_blank" rel="noreferrer">{a.edition.page}</a>.</>}
      </p>

      {!cats.length && a.edition?.lineup?.length ? <Lineup d={d} titles={a.edition.lineup} />
        : !cats.length ? <p className="dek">No categories known yet for this event.</p>
        : <div className="aw-cards">{film.map(c => <CategoryCard key={c.name} d={d} c={c} empty={pending} />)}</div>}
      {other.length > 0 && (
        <details style={{ marginTop: 14 }}>
          <summary className="lab" style={{ cursor: 'pointer' }}>Television, theatre and other categories ({other.length})</summary>
          <div className="aw-cards" style={{ marginTop: 10 }}>{other.map(c => <CategoryCard key={c.name} d={d} c={c} empty={pending} />)}</div>
        </details>
      )}
      <div className="osrc">Nominees and winners from the edition's Wikipedia page, re-read as soon as the trade press reports an announcement. Times are Rome time; ≈ marks the usual hour.</div>
    </section>
  );
}

function CategoryCard({ d, c, empty }: { d: AwardsData; c: AwardCategory; empty: string }) {
  const won = c.nominees.some(n => n.winner);
  const oscar = c.oscar ? d.categories.find(x => x.id === c.oscar)?.name : null;
  const person = (c.oscar != null && PERSON_CATS.has(c.oscar)) || (BY_PERSON.test(c.name) && !/cast|ensemble/i.test(c.name));
  // Winners first
  const list = [...c.nominees].sort((p, q) => Number(q.winner) - Number(p.winner));
  const body = list.map((n, i) => <NomineeRow key={i} d={d} n={n} person={person} dim={won && !n.winner} />);
  return (
    <div className="aw-card">
      <div className="aw-cat">{c.name}</div>
      {oscar && <div className="aw-osc">Oscar · {oscar}</div>}
      {!list.length ? <div className="aw-empty">{empty}</div> : won ? <Score as="div">{body}</Score> : body}
    </div>
  );
}

function NomineeRow({ d, n, person, dim }: { d: AwardsData; n: Nominee; person: boolean; dim: boolean }) {
  const byName = person && n.people;
  const main = byName ? n.people : n.song ? `“${n.song}”` : n.film ?? n.people;
  const sub = byName ? [n.film, n.role ? `as ${n.role}` : null].filter(Boolean).join(' · ') : n.song ? n.film : n.film ? n.people : null;
  const src = (byName ? tmdbImg(personOf(d, n.people)?.photo, 'w92') : null) ?? tmdbImg(filmOf(d, n.film)?.poster, 'w92');
  return (
    <div className={`aw-nom${n.winner ? ' won' : ''}`} style={{ opacity: dim ? 0.55 : 1 }}>
      <Thumb src={src} round={Boolean(byName && personOf(d, n.people)?.photo)} />
      <span style={{ minWidth: 0 }}>
        <b>{n.winner ? '★ ' : ''}{main}</b>
        {sub && <small>{sub}</small>}
      </span>
    </div>
  );
}

function Thumb({ src, round }: { src: string | null; round: boolean }) {
  const h = 30, w = round ? h : 20;
  if (!src) return <span style={{ width: w, height: h, flex: 'none', borderRadius: round ? '50%' : 3, background: 'var(--o-grid)' }} />;
  return <img src={src} alt="" loading="lazy" style={{ width: w, height: h, flex: 'none', objectFit: 'cover', borderRadius: round ? '50%' : 3, background: 'var(--o-grid)' }} />;
}

/** A festival's programme (no prizes): the films, with their posters. */
function Lineup({ d, titles }: { d: AwardsData; titles: string[] }) {
  return (
    <div className="aw-cards">
      {titles.map(t => <div key={t} className="aw-nom" title={filmOf(d, t)?.director ? `${t} · ${filmOf(d, t)!.director}` : t}><Thumb src={tmdbImg(filmOf(d, t)?.poster, 'w92')} round={false} /><span><b>{t}</b>{filmOf(d, t)?.director && <small>{filmOf(d, t)!.director}</small>}</span></div>)}
    </div>
  );
}
