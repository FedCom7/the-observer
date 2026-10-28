import type { ReactNode } from 'react';
import { RoyalMap, type Pin } from '../components/RoyalMap';
import { Score, Tbc } from '../components/common';
import { PASSION, passionColor } from '../core/passions';
import { useData } from '../core/store';
import { DAY, HOUR, countdown, dayShort, hhmm, isNight } from '../core/time';
import type { NewsItem, ObsEvent, PassionId } from '../core/types';
import type { F1Race } from '../sources/f1';
import { productName } from '../sources/apple';
import { royalEvents } from '../sources/royal';
import { filmOf, tmdbImg } from '../sources/awards';
import { KIND_NAME, weekEnd, weekName, weekStart } from '../sources/fashion';
import { discShort, type SkiStanding } from '../sources/ski';
import { roundOf } from '../sources/wec';

export interface Win { from: number; to: number; liveOnly: boolean }
export const inWin = (w: Win, t: number) => !w.liveOnly && t >= w.from && t < w.to;
const keep = (w: Win, e: ObsEvent) => e.state === 'in' || inWin(w, e.start);

// ---------- Building blocks ----------
export function Block({ p, title, meta, live, wide, children, open }: { p: PassionId; title: ReactNode; meta?: ReactNode; live?: boolean; wide?: boolean; children: ReactNode; open: (p: PassionId) => void }) {
  return (
    <section className={`panel lw-block${wide ? ' wide' : ''}${live ? ' is-live' : ''}`} data-p={p}>
      <div className="ph">
        {live ? <span className="live-dot" /> : <i style={{ width: 8, height: 8, borderRadius: 2, background: passionColor(p), flex: 'none' }} />}
        <span className="lw-title">{title}</span>
        <span className="meta">{meta}</span>
        <button className="lw-open" onClick={() => open(p)} title={`Open ${PASSION[p].name}`}>›</button>
      </div>
      <div className="lw-body">{children}</div>
    </section>
  );
}

/** When an event is, relative to now: LIVE, a countdown, or done. */
export function When({ e, now, done }: { e: Pick<ObsEvent, 'start' | 'state' | 'clock' | 'approx'>; now: number; done?: ReactNode }) {
  if (e.state === 'in') return <span className="lw-live">{e.clock ?? 'LIVE'}</span>;
  if (e.state === 'post' || e.start < now) return <span className="lw-dim">{done ?? 'Done'}</span>;
  return <span className="lw-cdn">{e.start - now < DAY ? countdown(e.start - now) : dayShort(e.start)}</span>;
}

const time = (t: number, approx?: boolean) => `${approx ? '≈' : ''}${hhmm(t)}${isNight(t) ? ' ☾' : ''}`;

function EvRow({ e, now, right }: { e: ObsEvent; now: number; right?: ReactNode }) {
  return (
    <div className={`lw-ev${e.state === 'in' ? ' live' : ''}`}>
      <time>{dayShort(e.start).split(' ')[0]} {time(e.start, e.approx)}</time>
      <div><b>{e.title}<Tbc e={e} /></b>{e.sub && <small>{e.state === 'post' ? <Score>{e.sub}</Score> : e.sub}</small>}{e.place && <small className="lw-dim">{e.place}</small>}</div>
      <div className="lw-r">{right ?? <When e={e} now={now} />}</div>
    </div>
  );
}

function News({ items, now, title = 'From the wire' }: { items: NewsItem[]; now: number; title?: string }) {
  if (!items.length) return null;
  return (
    <div className="lw-sec"><h4>{title}</h4>
      <ul className="lw-news">{items.map(n => <li key={n.id}><a href={n.url} target="_blank" rel="noreferrer"><time>{now - n.time < DAY ? hhmm(n.time) : dayShort(n.time)} · {n.source}</time>{n.title}</a></li>)}</ul>
    </div>
  );
}

export interface BlockDef { key: string; live: boolean; start: number; done: boolean; node: ReactNode }
const def = (key: string, evs: ObsEvent[], node: ReactNode): BlockDef => ({
  key, node, live: evs.some(e => e.state === 'in'),
  start: Math.min(...evs.filter(e => e.state !== 'post').map(e => e.start), Infinity),
  done: evs.every(e => e.state === 'post'),
});

// ---------- Formula 1: the race weekend ----------
function F1Block({ r, now, open }: { r: F1Race; now: number; open: (p: PassionId) => void }) {
  const { f1, news } = useData();
  const live = r.sessions.find(s => s.state === 'in');
  const shown = live ?? [...r.sessions].reverse().find(s => s.state === 'post' && s.order.length);
  return (
    <Block p="f1" title={`${r.short} · Round ${r.round}`} meta={`${r.circuit}, ${r.city}`} live={Boolean(live)} open={open}>
      <div className="lw-sessions">
        {r.sessions.map(s => (
          <div key={s.key} className={`lw-ev${s.state === 'in' ? ' live' : ''}`}>
            <time>{dayShort(s.start).split(' ')[0]} {time(s.start)}</time>
            <div><b>{s.name}</b>{s.state === 'post' && s.order[0] && <Score as="div" className="lw-dim">P1 {s.order[0]}</Score>}</div>
            <div className="lw-r"><When e={{ ...s, clock: s.detail || 'LIVE' }} now={now} done="Done" /></div>
          </div>
        ))}
      </div>
      {shown && (
        <div className="lw-sec"><h4>{shown.state === 'in' ? `${shown.name} · running order` : `${shown.name} · classification`}</h4>
          <Score as="div"><ol className="lw-order">{shown.order.slice(0, 10).map((n, i) => <li key={n}><span>{i + 1}</span>{n}</li>)}</ol></Score>
        </div>
      )}
      {f1 && (
        <div className="lw-sec"><h4>Drivers' championship</h4>
          <ol className="lw-order">{f1.drivers.slice(0, 5).map(d => <li key={d.name}><span>{d.rank}</span>{d.name}<Score className="lw-pts">{d.points}</Score></li>)}</ol>
        </div>
      )}
      <News items={news.filter(n => n.passion === 'f1').slice(0, 3)} now={now} />
    </Block>
  );
}

// ---------- The Royal Family: the diary of the day, the Palace's photographs ----------
const initials = (s: string) => s.replace(/^The /, '').split(/\s+/).filter(w => /^[A-Z]/.test(w)).slice(0, 2).map(w => w[0]).join('');

function RoyalBlock({ evs, w, now, open }: { evs: ObsEvent[]; w: Win; now: number; open: (p: PassionId) => void }) {
  const { royal } = useData();
  if (!royal) return null;
  const roster = Object.fromEntries((royal.roster ?? []).map(p => [p.id, p]));
  const full = Object.fromEntries(royal.events.map(e => [e.id, e]));
  const done = (royal.recent ?? []).filter(r => Date.parse(r.start) >= w.from - DAY && Date.parse(r.start) < w.to);
  const news = (royal.news ?? []).filter(n => Date.parse(n.date) >= w.from - 2 * DAY).slice(0, 4);
  const shownNews = news.length ? news : (royal.news ?? []).slice(0, 2);
  const pins: Pin[] = [
    ...evs.map(e => ({ e, r: full[e.id] })).filter(x => x.r?.loc).map(({ e, r }) => ({ id: e.id, t: e.start, who: r.who, title: r.title, place: r.place, loc: r.loc!, weight: r.weight, rough: !r.locPrecise })),
    ...done.filter(r => r.loc).map(r => ({ id: r.id, t: Date.parse(r.start), who: r.who, title: r.title, place: r.place, loc: r.loc!, done: true, rough: !r.locPrecise })),
  ];
  const faces = (people: string[] | undefined, who: string) => (
    <div className="lw-faces">{(people?.length ? people : ['?']).slice(0, 2).map(id => roster[id]?.photo
      ? <img key={id} src={roster[id].photo!} alt={roster[id].name} title={roster[id].name} loading="lazy" />
      : <span key={id} className="lw-ini">{initials(roster[id]?.title ?? who)}</span>)}</div>
  );
  const days = [w.from, w.from + DAY].filter(d => evs.some(e => e.start >= d && e.start < d + DAY) || evs.some(e => e.state === 'in'));
  return (
    <Block p="royal" title="The Royal Family" meta={`${evs.length} on the diary`} open={open}>
      {days.map(d => (
        <div key={d} className="lw-sec"><h4>{d === w.from ? 'Today' : 'Tomorrow'} · {dayShort(d)}</h4>
          <ul className="lw-royal">
            {evs.filter(e => e.start >= d && e.start < d + DAY).map(e => {
              const r = full[e.id];
              return (
                <li key={e.id}>
                  {faces(r?.people, r?.who ?? e.title)}
                  <div>
                    <small>{r?.who ?? ''}{r?.dayOnly || e.approx ? '' : ` · ${hhmm(e.start)}`}</small>
                    <b>{r?.title ?? e.title}</b>
                    {r?.role && <small className="lw-dim">{r.role}</small>}
                    {(r?.place ?? e.place) && <small>📍 {r?.place ?? e.place}</small>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {shownNews.length > 0 && (
        <div className="lw-sec"><h4>From the Palace · royal.uk</h4>
          <div className="lw-photos">
            {shownNews.map(n => (
              <a key={n.url} href={n.url} target="_blank" rel="noreferrer" className="lw-photo">
                {n.image && <img src={n.image} alt={n.alt ?? ''} loading="lazy" />}
                <small>{n.kind} · {dayShort(Date.parse(n.date))}</small><b>{n.title}</b>
              </a>
            ))}
          </div>
        </div>
      )}
      {done.length > 0 && (
        <div className="lw-sec"><h4>Court Circular · what they did</h4>
          <ul className="lw-royal small">
            {done.slice(0, 6).map(r => <li key={r.id}>{faces(r.people, r.who)}<div><small>{r.who} · {dayShort(Date.parse(r.start))}</small><b>{r.title}</b>{r.place && <small>📍 {r.place}</small>}</div></li>)}
          </ul>
        </div>
      )}
      {pins.length > 0 && <div className="lw-map"><RoyalMap pins={pins} now={now} /></div>}
      {(royal.press ?? []).length > 0 && <News title="In the press" now={now} items={(royal.press ?? []).slice(0, 3).map(a => ({ id: a.url, passion: 'royal', title: a.title, source: a.source, time: Date.parse(a.time), url: a.url }))} />}
    </Block>
  );
}

// ---------- Apple: the event first, then the Newsroom ----------
function AppleBlock({ evs, now, open }: { evs: ObsEvent[]; now: number; open: (p: PassionId) => void }) {
  const { apple } = useData();
  if (!apple) return null;
  const keynote = evs.find(e => e.id.startsWith('apple:keynote:'));
  const day = keynote ? new Date(keynote.start).toISOString().slice(0, 10) : null;
  const inv = day ? apple.invites?.find(i => i.date === day) : undefined;
  const press = day ? apple.pressEvents?.find(p => p.date === day) : undefined;
  const others = evs.filter(e => e !== keynote);
  const started = keynote && keynote.start <= now;
  return (
    <Block p="apple" title={keynote ? keynote.title : 'Apple'} meta={keynote ? `${hhmm(keynote.start)} Rome` : `${evs.length} today`} live={evs.some(e => e.state === 'in')} wide={Boolean(keynote)} open={open}>
      {keynote && (
        <div className="lw-apple">
          {inv?.image && <img className="lw-invite" src={inv.image} alt={inv.tagline ?? 'Invitation'} />}
          <div>
            <small>{dayShort(keynote.start)} · {hhmm(keynote.start)} Rome · {press?.city ?? inv?.location ?? 'Apple Park'}</small>
            <h3>{inv?.tagline ? `“${inv.tagline}”` : keynote.title}</h3>
            <div className="lw-cd-big">{started ? <span className="lw-live">{keynote.state === 'in' ? 'LIVE NOW' : 'Done'}</span> : countdown(keynote.start - now)}</div>
            <div className="lw-links">
              <a href="https://www.apple.com/apple-events/" target="_blank" rel="noreferrer">Watch on apple.com ›</a>
              {inv?.youtube && <a href={inv.youtube} target="_blank" rel="noreferrer">YouTube ›</a>}
            </div>
            {press?.sources.length ? <small className="lw-dim">Invitation reported by {press.sources.map(s => s.source).join(', ')}</small> : null}
          </div>
        </div>
      )}
      {keynote && started && apple.lead?.announced.length ? (
        <div className="lw-sec"><h4>Announced</h4>
          <div className="lw-photos">{apple.lead.announced.map(a => <a key={a.name} className="lw-photo" href={a.url ?? undefined} target="_blank" rel="noreferrer">{a.image && <img src={a.image} alt="" loading="lazy" />}<b>{a.name}</b>{a.copy && <small>{a.copy}</small>}</a>)}</div>
        </div>
      ) : keynote ? (
        <div className="lw-sec"><h4>What to expect</h4>
          <ul className="lw-news">
            {[...(apple.gurman ?? []).slice(0, 2).map(g => ({ t: g.title, u: g.url, s: g.source, time: g.time })), ...apple.rumors.filter(r => r.rumor).slice(0, 4).map(r => ({ t: r.title, u: r.url, s: r.source, time: r.time }))]
              .map(r => <li key={r.u}><a href={r.u} target="_blank" rel="noreferrer"><time>{dayShort(Date.parse(r.time))} · {r.s}</time>{r.t}</a></li>)}
          </ul>
        </div>
      ) : null}
      {others.map(e => {
        const rel = apple.releases.find(r => r.url === e.link);
        return rel ? (
          <a key={e.id} className="lw-release" href={rel.url} target="_blank" rel="noreferrer">
            {rel.image && <img src={rel.image} alt="" loading="lazy" />}
            <div><small>{/pre-orders/.test(e.title) ? 'Pre-orders open' : 'In stores'} · {dayShort(e.start)} {e.approx ? '' : hhmm(e.start)}</small><b>{productName(rel.title)}</b>{rel.price && <small>{rel.price}</small>}{rel.summary && <p>{rel.summary}</p>}</div>
          </a>
        ) : <EvRow key={e.id} e={e} now={now} right={e.id.startsWith('apple:earnings') && apple.stock ? <span className="lw-dim">AAPL ${apple.stock.price.toFixed(2)}</span> : undefined} />;
      })}
      <div className="lw-sec"><h4>Apple Newsroom</h4>
        <div className="lw-photos">
          {apple.news.slice(0, keynote ? 6 : 4).map(n => (
            <a key={n.url} href={n.url} target="_blank" rel="noreferrer" className="lw-photo">
              {n.image && <img src={n.image} alt="" loading="lazy" />}
              <small>{n.kind ? `${n.kind.toLowerCase()} · ` : ''}{now - Date.parse(n.time) < DAY ? hhmm(Date.parse(n.time)) : dayShort(Date.parse(n.time))}</small><b>{n.title}</b>
            </a>
          ))}
        </div>
      </div>
    </Block>
  );
}

// ---------- Human spaceflight ----------
function SpaceBlock({ evs, now, open }: { evs: ObsEvent[]; now: number; open: (p: PassionId) => void }) {
  const { space, orbit, news } = useData();
  const launches = new Map([...(space?.crewed ?? []), ...(space?.starship?.upcoming ?? []), ...(space?.artemis ?? []), ...(space?.recentCrewed ?? [])].map(l => [`ll:${l.id}`, l]));
  const stEvents = new Map((space?.events ?? []).map(x => [`llev:${x.id}`, x]));
  return (
    <Block p="space" title="Human spaceflight" meta={orbit ? `${orbit.total} in orbit` : undefined} live={evs.some(e => e.state === 'in')} open={open}>
      {evs.map(e => {
        const l = launches.get(e.id), s = stEvents.get(e.id);
        return (
          <div key={e.id} className="lw-launch">
            <EvRow e={e} now={now} />
            {l && <div className="lw-kv"><span>{l.rocket} · {l.provider}</span><span>{l.pad}, {l.location}</span><span>{l.statusName}{l.precision && l.precision !== 'Second' && l.precision !== 'Minute' ? ` · time to the ${l.precision.toLowerCase()}` : ''}</span>{l.crewed && <span className="lw-badge">Crewed</span>}{l.webcast && <span className="lw-badge">Webcast</span>}</div>}
            {(l?.description || s?.description) && <p className="lw-p">{(l?.description ?? s?.description ?? '').split('\n').slice(0, 4).join(' ')}</p>}
          </div>
        );
      })}
      <News items={news.filter(n => n.passion === 'space').slice(0, 3)} now={now} />
    </Block>
  );
}

// ---------- Alpine skiing ----------
const discPts = (x: SkiStanding, d: string) => (d === 'DH' || d === 'SG' || d === 'GS' || d === 'SL' ? x[d] : null);

function SkiBlock({ evs, now, open }: { evs: ObsEvent[]; now: number; open: (p: PassionId) => void }) {
  const { ski } = useData();
  const races = new Map((ski?.races ?? []).map(r => [`ski:${r.raceid}`, r]));
  return (
    <Block p="sci" title="Alpine Ski World Cup" meta={[...new Set(evs.map(e => races.get(e.id)?.place).filter(Boolean))].join(' · ')} live={evs.some(e => e.state === 'in')} open={open}>
      {evs.map(e => {
        const r = races.get(e.id);
        const table = r ? (r.gender === 'women' ? ski?.standings.women : ski?.standings.men) : undefined;
        const d = r ? discShort(r.discipline) : '';
        return (
          <div key={e.id} className="lw-sec">
            <EvRow e={e} now={now} />
            {r && r.runs.length > 1 && <div className="lw-kv">{r.runs.map(x => <span key={x.run}>Run {x.run}: {hhmm(Date.parse(x.start))}</span>)}</div>}
            {r?.results?.length ? (
              <Score as="div"><ol className="lw-order">{r.results.slice(0, 10).map(x => <li key={x.name}><span>{x.rank}</span>{x.name} <small>{x.nation}</small><b className="lw-pts">{x.rank === 1 ? x.time : x.gap}</b></li>)}</ol></Score>
            ) : table?.length ? (
              <><h4 className="lw-h">World Cup · {r!.gender} · overall and {d}</h4>
                <ol className="lw-order">{table.slice(0, 5).map(x => <li key={x.name}><span>{x.rank}</span>{x.name} <small>{x.nation}</small><b className="lw-pts">{x.points}{discPts(x, d) ? <small> · {d} {discPts(x, d)}</small> : null}</b></li>)}</ol></>
            ) : null}
          </div>
        );
      })}
    </Block>
  );
}

// ---------- Cycling ----------
function CyclingBlock({ evs, now, open }: { evs: ObsEvent[]; now: number; open: (p: PassionId) => void }) {
  const { cycling } = useData();
  return (
    <Block p="cicl" title="Cycling" meta={`${evs.length} race${evs.length > 1 ? 's' : ''}`} live={evs.some(e => e.state === 'in')} open={open}>
      {evs.map(e => {
        const r = cycling?.races.find(x => e.id === `cy:${x.id}` || e.id.startsWith(`cy:${x.id}:`));
        const gc = r?.rankings?.gc ?? r?.rankings?.result;
        return (
          <div key={e.id} className="lw-sec">
            <EvRow e={e} now={now} />
            {gc?.length ? (
              <><h4 className="lw-h">{r?.rankings?.gc ? 'General classification' : 'Result'}{r?.rankings?.final ? ' · final' : ''}</h4>
                <Score as="div"><ol className="lw-order">{gc.slice(0, 5).map(x => <li key={x.pos}><span>{x.pos}</span>{x.rider ?? x.team}<small> {x.team}</small><b className="lw-pts">{x.pos === 1 ? x.time : x.gap}</b></li>)}</ol></Score></>
            ) : null}
          </div>
        );
      })}
    </Block>
  );
}

// ---------- Tennis: the order of play ----------
function TennisBlock({ w, open }: { w: Win; open: (p: PassionId) => void }) {
  const { tennis } = useData();
  const matches = (tennis?.draw?.matches ?? []).filter(m => m.state === 'in' || (m.date && inWin(w, Date.parse(m.date))));
  if (!matches.length) return null;
  return (
    <Block p="tennis" title={tennis?.draw?.slam?.name ?? tennis?.draw?.name ?? 'Tennis'} meta="Men's singles" live={matches.some(m => m.state === 'in')} open={open}>
      <div className="lw-matches">
        {matches.slice(0, 16).map(m => (
          <div key={m.id} className={`lw-match${m.state === 'in' ? ' live' : ''}`}>
            <small>{m.round}{m.court ? ` · ${m.court}` : ''} · {m.state === 'in' ? <span className="lw-live">{m.detail || 'LIVE'}</span> : m.state === 'post' ? 'Final' : m.date ? time(Date.parse(m.date)) : ''}</small>
            {m.players.map(p => (
              <div key={p.id} className={`lw-tp${m.state === 'post' && !p.winner ? ' lose' : ''}`}>
                <span>{p.seed ? <small>[{p.seed}] </small> : null}{p.name}{p.country ? <small> {p.country}</small> : null}</span>
                <Score className="lw-sets">{p.sets.map((s, i) => <i key={i} className={s.won ? 'won' : ''}>{s.g}{s.tb !== null ? <sup>{s.tb}</sup> : null}</i>)}</Score>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Block>
  );
}

// ---------- Fashion weeks: the shows of the day ----------
function FashionBlock({ w, now, open }: { w: Win; now: number; open: (p: PassionId) => void }) {
  const { fashion } = useData();
  if (!fashion) return null;
  const weeks = fashion.weeks.filter(x => !w.liveOnly && weekStart(x) < w.to && weekEnd(x) > w.from);
  const shows = fashion.shows.filter(s => inWin(w, Date.parse(s.start)) || (Date.parse(s.start) <= now && Date.parse(s.start) > now - HOUR));
  if (!weeks.length && !shows.length) return null;
  return (
    <Block p="fashion" title={weeks.map(x => weekName(x)).join(' · ') || 'Fashion weeks'} meta={weeks[0] ? `${weeks[0].season} · ${KIND_NAME[weeks[0].kind]}` : undefined} live={shows.some(s => Date.parse(s.start) <= now && Date.parse(s.start) > now - HOUR)} open={open}>
      {shows.length ? (
        <div className="lw-shows">
          {shows.map(s => {
            const t = Date.parse(s.start), on = t <= now && t > now - HOUR;
            return (
              <a key={s.id} className={`lw-ev${on ? ' live' : ''}`} href={s.link} target="_blank" rel="noreferrer">
                <time>{dayShort(t).split(' ')[0]} {hhmm(t)}</time>
                <div><b>{s.brand}</b><small>{s.type === 'presentation' ? 'Presentation' : 'Show'}{s.place ? ` · ${s.place}` : ''}{s.note ? ` · ${s.note}` : ''}</small></div>
                <div className="lw-r">{on ? <span className="lw-live">{s.live ? 'Streaming' : 'On now'}</span> : t > now ? <span className="lw-cdn">{countdown(t - now)}</span> : <span className="lw-dim">Done</span>}</div>
              </a>
            );
          })}
        </div>
      ) : <p className="lw-p">The week is on; the organiser has not published a show schedule for these days.</p>}
    </Block>
  );
}

// ---------- Awards season ----------
function AwardsBlock({ evs, now, open }: { evs: ObsEvent[]; now: number; open: (p: PassionId) => void }) {
  const { awards } = useData();
  return (
    <Block p="awards" title="Awards season" meta={`${evs.length} date${evs.length > 1 ? 's' : ''}`} live={evs.some(e => e.state === 'in')} wide={evs.some(e => /ceremony|nominations/.test(e.id))} open={open}>
      {evs.map(e => {
        const [, id, kind] = e.id.split(':');
        const a = awards?.awards.find(x => x.id === id);
        const cats = (a?.edition?.categories ?? []).slice(0, 6);
        const show = (kind === 'ceremony' || kind === 'nominations') && cats.length > 0;
        return (
          <div key={e.id} className="lw-sec">
            <EvRow e={e} now={now} />
            {show && (
              <div className="lw-cats">
                {cats.map(c => {
                  const win = c.nominees.find(n => n.winner);
                  return (
                    <div key={c.name} className="lw-cat">
                      <h5>{c.name}</h5>
                      <ul>{c.nominees.slice(0, 6).map((n, i) => {
                        const poster = awards && n.film ? tmdbImg(filmOf(awards, n.film)?.poster, 'w92') : null;
                        return <li key={i} className={n.winner ? 'won' : win ? 'lost' : ''}>{poster && <img src={poster} alt="" loading="lazy" />}<span>{n.people ?? n.film}{n.people && n.film ? <small> · {n.film}</small> : null}</span>{n.winner && <Score className="lw-star">★</Score>}</li>;
                      })}</ul>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </Block>
  );
}

// ---------- WEC ----------
function WecBlock({ evs, now, open }: { evs: ObsEvent[]; now: number; open: (p: PassionId) => void }) {
  const { wec } = useData();
  const race = wec?.races.find(r => evs.some(e => e.id.startsWith(`wec:${r.slug}:`)));
  const res = race && wec && race.year === wec.season ? wec.results[String(roundOf(wec, race))] : undefined;
  const last = res?.sessions.filter(s => s.rows.length).slice(-1)[0];
  return (
    <Block p="wec" title={race?.name ?? 'WEC'} meta={race ? `Round ${roundOf(wec!, race)}` : undefined} live={evs.some(e => e.state === 'in')} open={open}>
      {evs.map(e => <EvRow key={e.id} e={e} now={now} />)}
      {last && (
        <div className="lw-sec"><h4>{last.session}{last.hour !== null && !last.final ? ` · hour ${last.hour}` : ''}{last.final ? ' · final' : ''}</h4>
          <Score as="div"><ol className="lw-order">{last.rows.slice(0, 8).map(x => <li key={x.number}><span>{x.pos}</span>#{x.number} {x.team} <small>{x.cls}</small><b className="lw-pts">{x.pos === 1 ? `${x.laps ?? ''} laps` : x.gap}</b></li>)}</ol></Score>
        </div>
      )}
    </Block>
  );
}

// ---------- Anything else: the events and the wire ----------
function GenericBlock({ p, evs, now, open }: { p: PassionId; evs: ObsEvent[]; now: number; open: (p: PassionId) => void }) {
  const { news } = useData();
  return (
    <Block p={p} title={PASSION[p].name} meta={`${evs.length} event${evs.length > 1 ? 's' : ''}`} live={evs.some(e => e.state === 'in')} open={open}>
      {evs.map(e => <EvRow key={e.id} e={e} now={now} />)}
      <News items={news.filter(n => n.passion === p).slice(0, 3)} now={now} />
    </Block>
  );
}

/** The blocks of every passion that is not a ball game, for the window. */
export function passionBlocks(events: ObsEvent[], w: Win, now: number, open: (p: PassionId) => void, data: ReturnType<typeof useData>): BlockDef[] {
  const out: BlockDef[] = [];
  const by = new Map<PassionId, ObsEvent[]>();
  for (const e of events) {
    if (e.espn || !keep(w, e)) continue;
    if (!by.has(e.passion)) by.set(e.passion, []);
    by.get(e.passion)!.push(e);
  }
  // The Royal Family: every engagement of the diary (the calendar keeps only the notable ones)
  if (data.royal) {
    const evs = royalEvents({ ...data.royal, events: data.royal.events.filter(e => e.kind === 'engagement' || e.kind === 'birthday' || e.kind === 'anniversary').map(e => ({ ...e, weight: Math.max(2, e.weight ?? 1) })) })
      .concat(events.filter(e => e.passion === 'royal'))
      .filter((e, i, all) => all.findIndex(x => x.id === e.id) === i && keep(w, e))
      .sort((a, b) => a.start - b.start);
    by.delete('royal');
    if (evs.length) out.push(def('royal', evs, <RoyalBlock evs={evs} w={w} now={now} open={open} />));
  }
  for (const [p, evs] of by) {
    if (p === 'f1' || p === 'fashion' || p === 'tennis') continue;
    const node = p === 'apple' ? <AppleBlock evs={evs} now={now} open={open} />
      : p === 'space' ? <SpaceBlock evs={evs} now={now} open={open} />
      : p === 'sci' ? <SkiBlock evs={evs} now={now} open={open} />
      : p === 'cicl' ? <CyclingBlock evs={evs} now={now} open={open} />
      : p === 'awards' ? <AwardsBlock evs={evs} now={now} open={open} />
      : p === 'wec' ? <WecBlock evs={evs} now={now} open={open} />
      : <GenericBlock p={p} evs={evs} now={now} open={open} />;
    out.push(def(p, evs, node));
  }
  // F1: one block per race weekend with a session in the window (the whole weekend is shown)
  for (const r of data.f1?.races ?? []) {
    const evs = events.filter(e => e.passion === 'f1' && e.id.startsWith(`f1:${data.f1!.season}:${r.round}:`));
    if (evs.some(e => keep(w, e))) out.push(def(`f1:${r.round}`, evs.filter(e => keep(w, e)), <F1Block r={r} now={now} open={open} />));
  }
  // Tennis and fashion read their own data (matches and shows are not calendar events)
  const tennisEvs = (data.tennis?.draw?.matches ?? []).filter(m => m.state === 'in' || (m.date && inWin(w, Date.parse(m.date))));
  if (tennisEvs.length) out.push({ key: 'tennis', live: tennisEvs.some(m => m.state === 'in'), start: Math.min(...tennisEvs.filter(m => m.state !== 'post').map(m => Date.parse(m.date ?? '')), Infinity), done: tennisEvs.every(m => m.state === 'post'), node: <TennisBlock w={w} open={open} /> });
  if (data.fashion) {
    const shows = data.fashion.shows.filter(s => inWin(w, Date.parse(s.start)));
    const weeks = data.fashion.weeks.filter(x => !w.liveOnly && weekStart(x) < w.to && weekEnd(x) > w.from);
    if (shows.length || weeks.length) out.push({ key: 'fashion', live: shows.some(s => Date.parse(s.start) <= now && Date.parse(s.start) > now - HOUR), start: Math.min(...shows.map(s => Date.parse(s.start)).filter(t => t > now), weeks.length ? now : Infinity), done: false, node: <FashionBlock w={w} now={now} open={open} /> });
  }
  return out;
}
