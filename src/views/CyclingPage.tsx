import { useMemo, useState } from 'react';
import { useWidth } from '../components/charts';
import { Score } from '../components/common';
import { Hero } from '../components/sheet';
import { DEFAULT_COLORS, Jersey } from '../components/Jersey';
import { Theatre } from '../components/Theatre';
import { setCyView, useCyView } from '../core/cyclingView';
import { useData } from '../core/store';
import type { PassionId } from '../core/types';
import { DAY, countdown, dayLong, dayShort, fmt, hhmm } from '../core/time';
import { SECTIONS, TAG_LABEL, cyclingFocus, cyclingRoute, sectionOf, type CyNationals, type CyTab, type CyRace, type CyRank, type CyRankings, type CyStage, type CyTeamList } from '../sources/cycling';

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
/** "Falset . Costa Daurada" is the town and its region. */
const town = (t: string) => t.split(/\s+[-.]\s+|\.\s*/)[0].trim();
const at = (iso: string, approx: boolean) => `${approx ? '≈ ' : ''}${hhmm(Date.parse(iso))}`;

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** "Isaac del Toro", "I. DEL TORO" and "Isaac DEL TORO" are one key. */
const riderKey = (n: string) => { const [first, ...rest] = norm(n).replace(/\./g, ' ').split(/\s+/).filter(Boolean); return (first?.[0] ?? '') + rest.join(''); };
const teamKey = (t: string) => norm(t).replace(/[^a-z0-9]/g, '');

/** Team of every rider seen in start lists and official rankings of the season. */
function teamsOf(races: CyRace[]) {
  const by = new Map<string, string>();
  const add = (x?: { rider?: string | null; team?: string | null } | null) => { if (x?.rider && x.team) by.set(riderKey(x.rider), x.team); };
  for (const r of races) {
    r.startlist?.forEach(t => t.riders.forEach(x => by.set(riderKey(x.rider), t.team)));
    const rk = r.rankings;
    if (rk) { for (const k of ['result', 'stageResult', 'gc', 'points', 'mountains', 'youth'] as const) rk[k]?.forEach(add); rk.history?.forEach(h => { add(h.winner); h.gc.forEach(add); }); }
    r.podium?.forEach(add);
    const wk = r.wiki;
    if (wk) { [...wk.result, ...wk.podium, ...wk.classes.points, ...wk.classes.mountains, ...wk.classes.youth, ...wk.jerseys].forEach(add); }
  }
  return (rider: string) => by.get(riderKey(rider));
}

/** Colour of a classification's jersey in a race: the one its Wikipedia page names, else the usual one. */
const JERSEY_WORD = /pink|yellow|green|violet|purple|polka|dot|blue|azul|turquoise|red|orange|white|black|number/i;
const jerseyColor = (r: CyRace, key: string) => { const c = r.wiki?.colors?.[key]; return c && JERSEY_WORD.test(c) ? c : DEFAULT_COLORS[key] ?? null; };
const CLASS_LABEL: Record<string, string> = { gc: 'Leader', points: 'Points', mountains: 'Mountains', youth: 'Young rider', sprints: 'Sprints', combativity: 'Most combative', team: 'Best team' };

/** Who wears each classification's jersey: today's leaders while the race is on, the final winners after it. */
function jerseyHolders(r: CyRace) {
  const rk = r.rankings, wk = r.wiki;
  const lead = wk?.leaders?.[wk.leaders.length - 1];
  const over = Date.parse(r.end) < Date.now();
  const fromWiki = (k: string) => wk?.jerseys.find(j => j.key === k)?.rider;
  const pick = (k: 'points' | 'mountains' | 'youth') => (over ? fromWiki(k) : null) ?? rk?.[k]?.[0]?.rider ?? fromWiki(k) ?? lead?.[k] ?? null;
  const out: { key: string; rider: string | null; team: string | null }[] = [];
  const gc = (over ? wk?.podium[0]?.rider : null) ?? rk?.gc?.[0]?.rider ?? wk?.podium[0]?.rider ?? lead?.gc ?? null;
  if (gc) out.push({ key: 'gc', rider: gc, team: (over ? wk?.podium[0]?.team : null) ?? rk?.gc?.[0]?.team ?? wk?.podium[0]?.team ?? null });
  for (const k of ['points', 'mountains', 'youth'] as const) { const n = pick(k); if (n) out.push({ key: k, rider: n, team: null }); }
  for (const j of wk?.jerseys ?? []) if (j.key === 'combativity' || j.key === 'team') out.push({ key: j.key, rider: j.rider, team: j.team });
  return out;
}

const NATIONS = ['BEL', 'ITA', 'FRA', 'NED', 'ESP', 'SLO', 'DEN', 'GBR', 'GER', 'SUI', 'NOR', 'USA', 'AUS', 'COL', 'POR', 'AUT'];
const NAT_NAME: Record<string, string> = { BEL: 'Belgium', ITA: 'Italy', FRA: 'France', NED: 'Netherlands', ESP: 'Spain', SLO: 'Slovenia', DEN: 'Denmark', GBR: 'Great Britain', GER: 'Germany', SUI: 'Switzerland', NOR: 'Norway', USA: 'United States', AUS: 'Australia', COL: 'Colombia', POR: 'Portugal', AUT: 'Austria' };

/** Road cycling: the season on one screen, then the Grand Tours one by one and the other races grouped. */
export function CyclingPage() {
  const { cycling, news, now } = useData();
  const view = useCyView();
  const { live, tab, grands, grand } = cyclingFocus(cycling, now, view);
  const years = [...new Set(cycling?.races.map(r => r.year) ?? [])].sort();
  const thisYear = new Date(now).getUTCFullYear();
  const season = view.year, setSeason = (y: number) => setCyView({ year: y });
  const teamOf = useMemo(() => teamsOf(cycling?.races ?? []), [cycling]);
  if (!cycling) return <Hero id="cicl" dek="Loading the UCI calendar…" />;
  const year = season ?? thisYear;
  const races = cycling.races;
  const upcoming = races.filter(r => Date.parse(r.end) > now).sort((a, b) => a.start.localeCompare(b.start));
  const next = upcoming.find(r => Date.parse(r.start) > now);
  const nextMonument = upcoming.find(r => r.tag === 'monument' && Date.parse(r.start) > now);
  const nextGrand = upcoming.find(r => r.tag === 'grand');
  const inSeason = races.filter(r => r.year === year);
  const myNews = news.filter(n => n.passion === 'cicl').slice(0, 8);
  const gYear = grand?.year ?? year;
  const section = SECTIONS.find(s => s.key === tab);

  return (
    <>
      <Hero id="cicl" dek={tab === 'grand' && grand
        ? <>{grand.name} {grand.year}: {Date.parse(grand.end) < now ? 'the race is over' : Date.parse(grand.start) <= now ? 'under way' : `starts ${dayLong(Date.parse(grand.start))}`}.</>
        : section ? <>{section.label}, {year}.</>
        : <>
          {live ? `${live.name} is under way. ` : next ? `Next: ${next.name}, ${dayLong(Date.parse(next.start))}. ` : ''}
          {nextMonument && `The next Monument, ${nextMonument.name}, is in ${Math.ceil((Date.parse(nextMonument.start) - now) / DAY)} days`}
          {nextGrand && `; the ${nextGrand.name} ${Date.parse(nextGrand.start) > now ? `starts in ${Math.ceil((Date.parse(nextGrand.start) - now) / DAY)} days` : 'is on'}.`}
        </>} />

      <nav className="ocard cy-nav" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '10px 12px', gridColumn: '1 / -1' }} aria-label="Cycling screens">
        {([['season', 'Season'], ...SECTIONS.map(s => [s.key, s.label])] as [CyTab, string][]).map(([k, label]) => <button key={k} className="btn" aria-pressed={tab === k} onClick={() => setCyView({ tab: k })} style={{ color: 'var(--o-ink)', background: tab === k ? 'var(--o-accent-soft)' : 'transparent', borderColor: tab === k ? 'var(--o-accent)' : 'var(--o-line)', fontSize: 12.5, letterSpacing: '.04em' }}>{label}{live && sectionOf(live) === k ? ' ●' : ''}</button>)}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tab === 'grand' && [...new Set(grands.map(g => g.name))].map(n => {
            const g = grands.find(x => x.name === n && x.year === gYear) ?? grands.find(x => x.name === n)!;
            return <button key={n} className="btn" aria-pressed={g.id === grand?.id} onClick={() => setCyView({ pick: g.id })} style={{ color: 'var(--o-ink)', background: g.id === grand?.id ? 'var(--o-accent-soft)' : 'transparent', borderColor: 'var(--o-line)', textTransform: 'none', letterSpacing: 0 }}>{n}</button>;
          })}
          {years.map(y => <button key={y} className="btn" aria-pressed={y === (tab === 'grand' ? gYear : year)} onClick={() => { setSeason(y); if (tab === 'grand' && grand) setCyView({ pick: grands.find(g => g.name === grand.name && g.year === y)?.id ?? grand.id }); }} style={{ color: 'var(--o-ink)', background: y === (tab === 'grand' ? gYear : year) ? 'var(--o-accent-soft)' : 'transparent', borderColor: 'var(--o-line)' }}>{y}</button>)}
        </span>
      </nav>

      {tab === 'grand' ? (grand && <RaceScreen r={grand} now={now} teamOf={teamOf} />)
        : section ? <SectionScreen races={inSeason.filter(r => sectionOf(r) === tab)} now={now} teamOf={teamOf} />
        : <>
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
            <h2>The {year} season at a glance</h2>
            <p className="dek">Every men's WorldTour race plus the World and European Championships. One-day races are dots, stage races are bars; races already run are faded, with the winner on hover.</p>
            <SeasonChart races={inSeason} year={year} now={now} />
            <div className="osrc">Source: UCI calendar · winners from the organisers and Wikipedia</div>
          </section>

          <Recap races={inSeason} now={now} teamOf={teamOf} />

          <JerseyWearers races={races} nationals={cycling.nationals ?? null} now={now} teamOf={teamOf} />

          <section className="ocard cy-1">
            <h2>Winners, {year}</h2>
            <table className="otable">
              <thead><tr><th>Date</th><th>Race</th><th>Winner</th></tr></thead>
              <tbody>{inSeason.filter(r => Date.parse(r.end) < now && (r.winner || r.events?.some(e => e.winner))).flatMap(r => r.kind === 'champs'
                ? (r.events ?? []).filter(e => e.winner).map(e => <tr key={r.id + e.title}><td>{dayShort(Date.parse(e.start))}</td><td><i className="cy-dot" style={{ background: groupOf(r).color }} />{r.name.replace('Championships', 'Champs')} · {e.title.replace("Men's ", '')}</td><td><Score>{e.winner}</Score></td></tr>)
                : [<tr key={r.id} style={{ fontWeight: r.tier === 3 ? 600 : 400 }}><td>{dayShort(Date.parse(r.start))}</td><td><i className="cy-dot" style={{ background: groupOf(r).color }} />{r.name}</td><td><Score>{r.winner}</Score></td></tr>],
              )}</tbody>
            </table>
            <div className="osrc">Sources: Wikipedia, official results of ASO races</div>
          </section>

          <div className="ocard cy-1">
            <div className="lab">From the wire</div>
            <div className="onews">{myNews.map(n => <a key={n.id} className="r" href={n.url} target="_blank" rel="noreferrer"><time>{dayShort(n.time)} · {n.source}</time><p>{n.title}</p></a>)}</div>
          </div>
        </>}
    </>
  );
}

/** The map above the page: the season's races, the route of the Grand Tour on show, or the races of the open group. */
export function CyclingMap({ open }: { open: (p: PassionId) => void }) {
  const { cycling, now } = useData();
  const view = useCyView();
  const { all, tab, grand } = cyclingFocus(cycling, now, view);
  const route = useMemo(() => cyclingRoute(grand), [grand]);
  const year = view.year ?? new Date(now).getUTCFullYear();
  const keep = useMemo(() => new Set(all.filter(r => r.year === year && sectionOf(r) === tab).map(r => r.id)), [all, tab, year]);
  if (tab === 'grand' && route.length) return <Theatre key={grand!.id} open={open} only="cicl" initial="world" fit route={route} />;
  return <Theatre key={`${tab}${year}`} open={open} only="cicl" initial="world" keep={tab === 'season' || tab === 'grand' ? undefined : keep} />;
}

/** A group of races on one screen: the race under way in full, a card for every race run, what comes next, who wins most. */
function SectionScreen({ races, now, teamOf }: { races: CyRace[]; now: number; teamOf: (rider: string) => string | undefined }) {
  const done = races.filter(r => Date.parse(r.end) < now);
  const ahead = races.filter(r => Date.parse(r.start) > now);
  const live = races.find(r => Date.parse(r.start) <= now && Date.parse(r.end) > now - DAY);
  const wins = new Map<string, number>();
  for (const r of done) if (r.winner) wins.set(r.winner, (wins.get(r.winner) ?? 0) + 1);
  const top = [...wins].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const byTeam = new Map<string, { name: string; n: number }>();
  for (const r of done) { const t = r.winner ? teamOf(r.winner) : undefined; if (t) byTeam.set(teamKey(t), { name: t, n: (byTeam.get(teamKey(t))?.n ?? 0) + 1 }); }
  const topTeams = [...byTeam.values()].sort((a, b) => b.n - a.n).slice(0, 6);
  return (
    <>
      {live && <RaceScreen r={live} now={now} teamOf={teamOf} />}
      {races.length === 0 && <section className="ocard cy-1"><p className="dek">No race in this group.</p></section>}
      {done.filter(r => r !== live).map(r => <RaceCard key={r.id} r={r} teamOf={teamOf} />)}
      {ahead.length > 0 && (
        <div className="ocard cy-1">
          <div className="lab">Still to come</div>
          <NextCard r={ahead[0]} now={now} />
          {ahead.length > 1 && (
            <table className="otable" style={{ marginTop: 10 }}><tbody>{ahead.slice(1).map(r => (
              <tr key={r.id}><td>{dayShort(Date.parse(r.start))}</td><td>{r.name}</td><td className="n">in {Math.ceil((Date.parse(r.start) - now) / DAY)} days</td></tr>
            ))}</tbody></table>
          )}
        </div>
      )}
      {top.length > 0 && (
        <div className="ocard cy-1">
          <div className="lab">Most wins in this group</div>
          <table className="otable"><tbody>{top.map(([n, c]) => <tr key={n}><td><Score>{n}</Score>{teamOf(n) && <><br /><small style={{ color: 'var(--o-ink3)' }}>{teamCase(teamOf(n)!)}</small></>}</td><td className="n">{c}</td></tr>)}</tbody></table>
        </div>
      )}
      {topTeams.length > 0 && (
        <div className="ocard cy-1">
          <div className="lab">Wins by team</div>
          <table className="otable"><tbody>{topTeams.map(t => <tr key={t.name}><td>{teamCase(t.name)}</td><td className="n">{t.n}</td></tr>)}</tbody></table>
        </div>
      )}
    </>
  );
}

/** A race already run, in one card: the result (top ten of a Monument, five of a classic), or podium, jerseys and stage winners of a stage race. */
function RaceCard({ r, teamOf }: { r: CyRace; teamOf: (rider: string) => string | undefined }) {
  const wk = r.wiki;
  const links = <div className="osrc">{wk && <a href={wk.url} target="_blank" rel="noreferrer">Wikipedia ↗</a>}{wk && ' · '}<a href={r.site ?? r.uci} target="_blank" rel="noreferrer">{r.site ? 'Official site' : 'UCI'} ↗</a></div>;
  const head = <><div className="lab">{dayShort(Date.parse(r.start))}{r.kind === 'stage' ? ` – ${dayShort(Date.parse(r.end))}` : ''} · {r.tag ? TAG_LABEL[r.tag] : `UCI ${r.cls}`}</div><h2>{r.name}</h2></>;

  if (r.kind === 'champs') {
    const color = r.tag === 'worlds' ? 'rainbow' : 'european';
    return (
      <section className="ocard cy-1">
        {head}
        {(r.events ?? []).map(e => <div key={e.title} className="cy-champ big" style={{ marginTop: 8 }}><Jersey color={color} size={30} /><div><small>{e.title}</small><Score as="b">{e.winner ?? '–'}</Score>{e.winner && teamOf(e.winner) && <span>{teamCase(teamOf(e.winner)!)}</span>}</div></div>)}
        {links}
      </section>
    );
  }

  if (r.kind === 'one-day') {
    // Wikipedia's full names ("Tadej Pogačar") read better than the organisers' upper-case ones
    const fromWiki = (wk?.result ?? []).map(x => ({ pos: x.pos, rider: x.rider, team: x.team ?? '', time: x.time, gap: x.pos > 1 ? x.time : null, gapS: null, points: null }));
    const rows = fromWiki.length ? fromWiki : r.rankings?.result ?? [];
    const n = r.tag === 'monument' ? 10 : r.tier >= 2 ? 5 : 3;
    return (
      <section className="ocard cy-1">
        {head}
        {rows.length ? <ResultList rows={rows.slice(0, n)} /> : <Score as="b">{r.winner ?? '–'}</Score>}
        {links}
      </section>
    );
  }

  // Stage race
  const gc = (r.rankings?.gc ?? []).slice(0, 3);
  const pod = gc.length ? gc.map(x => ({ pos: x.pos, rider: x.rider, team: x.team, gap: x.pos > 1 ? x.gap : x.time })) : (wk?.podium ?? []).map(x => ({ pos: x.pos, rider: x.rider, team: x.team, gap: null as string | null }));
  const stageWins = new Map<string, number>();
  for (const s of wk?.stages ?? []) if (s.winner) stageWins.set(s.winner, (stageWins.get(s.winner) ?? 0) + 1);
  const bestStages = [...stageWins].sort((a, b) => b[1] - a[1]).filter(([, c]) => c > 1).slice(0, 3);
  return (
    <section className="ocard cy-1">
      {head}
      <table className="otable"><tbody>{pod.map(x => (
        <tr key={x.pos}>
          <td style={{ width: 26 }}>{x.pos === 1 ? <Jersey color={jerseyColor(r, 'gc')} size={20} title="Overall winner" /> : <span className="cy-pos">{x.pos}</span>}</td>
          <td><Score><b>{x.rider}</b></Score>{x.team && <><br /><small style={{ color: 'var(--o-ink3)' }}>{teamCase(x.team)}</small></>}</td>
          <td className="n"><Score>{x.pos > 1 ? fmtGap(x.gap) : ''}</Score></td>
        </tr>
      ))}</tbody></table>
      <div className="cy-champs" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
        {jerseyHolders(r).filter(j => j.key !== 'gc' && j.key !== 'team' && j.rider).map(j => (
          <div key={j.key} className="cy-champ"><Jersey color={jerseyColor(r, j.key)} size={20} title={CLASS_LABEL[j.key]} /><div><small>{CLASS_LABEL[j.key]}</small><Score as="b">{j.rider}</Score></div></div>
        ))}
      </div>
      {bestStages.length > 0 && <div className="when" style={{ marginTop: 8 }}>Stage wins: <Score>{bestStages.map(([n, c]) => `${surname(n)} ${c}`).join(' · ')}</Score> of {(wk?.stages ?? []).filter(s => !s.rest).length}</div>}
      {links}
    </section>
  );
}

function ResultList({ rows }: { rows: CyRank[] }) {
  return (
    <table className="otable"><tbody>{rows.map(x => (
      <tr key={x.pos}>
        <td style={{ width: 22 }}>{x.pos}</td>
        <td><Score><b style={{ fontWeight: x.pos === 1 ? 700 : 500 }}>{rider(x)}</b></Score>{x.rider && x.team && <><br /><small style={{ color: 'var(--o-ink3)' }}>{teamCase(x.team)}</small></>}</td>
        <td className="n"><Score>{x.pos === 1 ? x.time ?? '' : fmtGap(x.gap)}</Score></td>
      </tr>
    ))}</tbody></table>
  );
}

/** One race: header, jerseys, rankings and stage list for a stage race, result for a one-day race, route and start list. */
function RaceScreen({ r, now, teamOf }: { r: CyRace; now: number; teamOf: (rider: string) => string | undefined }) {
  const start = Date.parse(r.start), end = Date.parse(r.end);
  const state = end < now ? 'over' : start <= now ? 'live' : 'ahead';
  const rk = r.rankings, wk = r.wiki;
  const racing = (r.stages ?? []).filter(s => !s.rest);
  const km = racing.reduce((a, s) => a + (s.km ?? 0), 0);
  const winners = new Map((rk?.history ?? []).map(h => [h.stage, h.winner]));
  const wikiStage = new Map((wk?.stages ?? []).filter(s => !s.rest).map(s => [s.num, s]));
  const leaders = new Map((wk?.leaders ?? []).map(l => [l.stage, l]));
  const results = rk?.result ?? r.podium;
  const wTeam = r.winner ? teamOf(r.winner) : undefined;
  return (
    <>
      <section className="ocard cy-1">
        <div className="lab">{r.tag ? TAG_LABEL[r.tag] : `UCI ${r.cls}`} · {r.country}</div>
        <h2 style={{ fontSize: 20 }}>{r.name} {r.year}</h2>
        <div className="when">{r.kind === 'one-day' ? dayLong(start) : `${dayShort(start)} – ${dayShort(end)}`}{racing.length ? ` · ${racing.length} stages · ${Math.round(km).toLocaleString('en-US')} km` : ''}</div>
        <div className="s-cd" style={{ fontSize: 26, display: 'flex', alignItems: 'center', gap: 10 }}>{state === 'over' && r.kind === 'stage' && <Jersey color={jerseyColor(r, 'gc')} size={34} title="Overall winner" />}{state === 'ahead' ? countdown(start - now) : state === 'live' ? 'Under way' : r.winner ?? 'Finished'}<small>{state === 'ahead' ? `starts ${at(r.start, r.approx)} Rome` : state === 'live' ? (rk?.stage ? `after stage ${rk.stage}` : 'live') : 'winner'}</small></div>
        {state === 'over' && wTeam && <div className="when">{teamCase(wTeam)}</div>}
        <div className="when"><a href={r.site ?? r.uci} target="_blank" rel="noreferrer">Official page ↗</a>{wk && <> · <a href={wk.url} target="_blank" rel="noreferrer">Wikipedia ↗</a></>}</div>
      </section>

      {rk?.history?.length ? <GcCards r={r} rk={rk} now={now} /> : results?.length ? (
        <section className="ocard cy-1"><h2>{r.name}: result</h2><RankList title={rk?.final ? 'Final' : 'Top places'} rows={results.slice(0, 10)} mode="time" /></section>
      ) : state !== 'ahead' ? <section className="ocard cy-1"><h2>{r.name}</h2><p className="dek">Rankings appear here after the first stage{r.winner ? `; winner ${r.winner}` : ''}.</p></section> : null}

      {r.kind === 'stage' && state !== 'ahead' && <JerseyCards r={r} />}

      {racing.length > 0 && (
        <section className="ocard cy-1">
          <h2>Stages</h2>
          <table className="otable">
            <thead><tr><th>#</th><th>Day</th><th>Route</th><th className="n">km</th><th>Winner</th>{leaders.size > 0 && <th>Leader</th>}</tr></thead>
            <tbody>{racing.map(s => {
              const w = winners.get(s.num ?? -1), ws = wikiStage.get(s.num);
              const name = w ? rider(w) : ws?.winner ?? ws?.winnerTeam ?? null;
              const lead = leaders.get(s.num ?? -1)?.gc;
              return <tr key={s.num}><td>{s.num || 'P'}</td><td>{dayShort(Date.parse(s.start))}</td><td><i className="cy-dot" style={{ background: STAGE_COLOR(s.type) }} />{town(s.from)}{s.to !== s.from ? ` → ${town(s.to)}` : ''}<br /><small style={{ color: 'var(--o-ink3)' }}>{STAGE_KIND(s.type)}</small></td><td className="n">{s.km ?? '–'}</td><td>{name ? <Score>{name}</Score> : '–'}</td>{leaders.size > 0 && <td>{lead ? <span className="cy-jr small"><Jersey color={jerseyColor(r, 'gc')} size={14} /><Score>{surname(lead)}</Score></span> : ''}</td>}</tr>;
            })}</tbody>
          </table>
          <div className="osrc">Source: {[r.source, wk && 'Wikipedia'].filter(Boolean).join(', ') || 'organiser'}</div>
        </section>
      )}

      {r.stages?.length ? <RouteSection r={r} now={now} /> : null}

      {r.startlist?.length ? (
        <section className="ocard cy-1">
          <h2>Start list</h2>
          <p className="dek">{r.startlist.length} teams, {r.startlist.reduce((n, t) => n + t.riders.length, 0)} riders, from {r.source}.</p>
          <StartList teams={r.startlist} />
        </section>
      ) : null}
    </>
  );
}

/** The jerseys of a stage race: who wears (or won) each one, who wore it day by day, the other classifications. */
function JerseyCards({ r }: { r: CyRace }) {
  const rk = r.rankings, wk = r.wiki;
  const holders = jerseyHolders(r);
  const lead = wk?.leaders ?? [];
  const final = Date.parse(r.end) < Date.now();
  const classes = (['points', 'mountains', 'youth'] as const).map(k => ({ k, rows: rk?.[k]?.length ? rk[k]! : [] })).filter(c => c.rows.length);
  return (
    <>
      {holders.length > 0 && (
        <section className="ocard cy-1">
          <h2>{final ? 'Jersey winners' : 'Who wears the jerseys'}</h2>
          <div className="cy-champs">
            {holders.map(j => (
              <div key={j.key} className="cy-champ big">
                <Jersey color={jerseyColor(r, j.key)} size={32} title={CLASS_LABEL[j.key]} />
                <div><small>{CLASS_LABEL[j.key]}</small><Score as="b">{j.rider ?? (j.team ? teamCase(j.team) : '–')}</Score>{j.rider && j.team && <span>{teamCase(j.team)}</span>}</div>
              </div>
            ))}
          </div>
        </section>
      )}
      {lead.length > 1 && (
        <section className="ocard cy-1">
          <h2>Who wore the jerseys, stage by stage</h2>
          <p className="dek">Each band is one rider's spell in the jersey; hover for the stages.</p>
          {(['gc', 'points', 'mountains', 'youth'] as const).filter(k => lead.some(l => l[k])).map(k => <JerseyStrip key={k} r={r} k={k} />)}
          <div className="osrc">Source: Wikipedia</div>
        </section>
      )}
      {classes.length > 0 && (
        <section className="ocard cy-1">
          <h2>Other classifications</h2>
          {classes.map(c => (
            <div key={c.k} style={{ marginBottom: 10 }}>
              <div className="cy-jr" style={{ marginBottom: 4 }}><Jersey color={jerseyColor(r, c.k)} size={18} /><span className="lab" style={{ margin: 0 }}>{CLASS_LABEL[c.k]}</span></div>
              <RankList title="" rows={c.rows.slice(0, 5)} mode={c.k === 'youth' ? 'gap' : 'points'} />
            </div>
          ))}
        </section>
      )}
    </>
  );
}

/** One classification's leaders as bands along the stages, coloured like the jersey. */
function JerseyStrip({ r, k }: { r: CyRace; k: 'gc' | 'points' | 'mountains' | 'youth' }) {
  const lead = r.wiki?.leaders ?? [];
  const spells: { rider: string; from: number; to: number; n: number }[] = [];
  for (const l of lead) {
    const who = l[k] ?? '–';
    const last = spells[spells.length - 1];
    if (last && last.rider === who) { last.to = l.stage; last.n++; } else spells.push({ rider: who, from: l.stage, to: l.stage, n: 1 });
  }
  const color = jerseyColor(r, k) ?? 'white';
  const bg = /pink|rosa/i.test(color) ? '#f49ac1' : /yellow/i.test(color) ? '#ffd200' : /green/i.test(color) ? '#14a04a' : /violet|purple|cyclamen/i.test(color) ? '#a83b8f' : /red(?! number)/i.test(color) && !/dot/i.test(color) ? '#d7262e' : /orange/i.test(color) ? '#f28a1d' : /blue|azul|turquoise/i.test(color) && !/dot/i.test(color) ? '#29a7de' : /dot/i.test(color) ? '#f3f3f3' : '#f3f3f3';
  const dark = /^#(14|a8|d7|29)/.test(bg);
  return (
    <div className="cy-jr" style={{ marginBottom: 6 }}>
      <Jersey color={color} size={20} title={CLASS_LABEL[k]} />
      <div className="cy-strip">
        {spells.map(s => (
          <div key={s.from} title={`${s.rider}: ${s.from === s.to ? `stage ${s.from}` : `stages ${s.from}–${s.to}`}`} style={{ flex: s.n, background: bg, color: dark ? '#fff' : '#1d1d1f', backgroundImage: /dot/i.test(color) ? `radial-gradient(${/blue/i.test(color) ? '#1f5fbf' : '#d7262e'} 1.4px, transparent 1.6px)` : undefined, backgroundSize: '7px 7px' }}>
            {s.n >= 2 ? surname(s.rider) : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The season in review: how many races, who and which team won the most, the Grand Tour podiums. */
function Recap({ races, now, teamOf }: { races: CyRace[]; now: number; teamOf: (rider: string) => string | undefined }) {
  const done = races.filter(r => r.kind !== 'champs' && Date.parse(r.end) < now);
  if (!done.length) return null;
  const riders = new Map<string, { races: number; stages: number }>();
  const teams = new Map<string, { name: string; races: number; stages: number }>();
  const bump = (n: string | null | undefined, k: 'races' | 'stages') => {
    if (!n) return;
    riders.set(n, { ...(riders.get(n) ?? { races: 0, stages: 0 }), [k]: (riders.get(n)?.[k] ?? 0) + 1 });
    const t = teamOf(n);
    if (t) { const key = teamKey(t); teams.set(key, { name: t, races: 0, stages: 0, ...teams.get(key), [k]: (teams.get(key)?.[k] ?? 0) + 1 }); }
  };
  for (const r of done) { bump(r.winner, 'races'); r.rankings?.history?.forEach(h => bump(h.winner?.rider, 'stages')); }
  const rank = <T extends { races: number; stages: number }>(m: Map<string, T>) => [...m].sort((a, b) => b[1].races - a[1].races || b[1].stages - a[1].stages);
  const topRiders = rank(riders).slice(0, 8), topTeams = rank(teams).slice(0, 8);
  const grands = races.filter(r => r.tag === 'grand' && Date.parse(r.end) < now);
  const classics = races.filter(r => (sectionOf(r) === 'monument' || sectionOf(r) === 'classic') && Date.parse(r.end) < now);
  const year = races[0]?.year;
  const total = races.filter(r => r.kind !== 'champs').length;
  const distinct = new Set(done.map(r => r.winner).filter(Boolean)).size;
  return (
    <>
      <section className="ocard cy-1">
        <h2>{year} in numbers</h2>
        <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', margin: '4px 0 0' }}>
          <div className="kpi"><b>{done.length}<small> / {total}</small></b><span>races run</span></div>
          <div className="kpi"><b>{distinct}</b><span>different winners</span></div>
          {topRiders[0] && <div className="kpi"><Score as="b">{topRiders[0][0].split(' ').slice(-1)[0]}</Score><span>{topRiders[0][1].races} wins</span></div>}
          {topTeams[0] && <div className="kpi"><Score as="b">{teamCase(topTeams[0][1].name)}</Score><span>{topTeams[0][1].races} wins</span></div>}
        </div>
      </section>

      <section className="ocard cy-1">
        <h2>Which teams are going well</h2>
        <p className="dek">Race wins and stage wins of the season, by the winner's team.</p>
        <table className="otable">
          <thead><tr><th>Team</th><th className="n">Race wins</th><th className="n">Stage wins</th></tr></thead>
          <tbody>{topTeams.map(([k, v]) => <tr key={k}><td>{teamCase(v.name)}</td><td className="n">{v.races || '–'}</td><td className="n">{v.stages || '–'}</td></tr>)}</tbody>
        </table>
      </section>

      <section className="ocard cy-1">
        <h2>Most wins</h2>
        <table className="otable">
          <thead><tr><th>Rider</th><th className="n">Race wins</th><th className="n">Stage wins</th></tr></thead>
          <tbody>{topRiders.map(([n, v]) => <tr key={n}><td><Score>{n}</Score>{teamOf(n) && <><br /><small style={{ color: 'var(--o-ink3)' }}>{teamCase(teamOf(n)!)}</small></>}</td><td className="n">{v.races || '–'}</td><td className="n">{v.stages || '–'}</td></tr>)}</tbody>
        </table>
        <div className="osrc">Stage wins are counted for the races with official stage results.</div>
      </section>

      {(grands.length > 0 || classics.length > 0) && (
        <section className="ocard cy-1">
          <h2>Grand Tours, {year}</h2>
          <p className="dek">Podium and jersey winners. Click one for the whole race.</p>
          <div className="cy-grid">
            {grands.map(r => {
              const gc = r.wiki?.podium.length ? r.wiki.podium : (r.rankings?.gc ?? []).slice(0, 3);
              return (
                <div key={r.id} role="button" tabIndex={0} className="cy-tile" onClick={() => setCyView({ tab: 'grand', pick: r.id })} onKeyDown={e => e.key === 'Enter' && setCyView({ tab: 'grand', pick: r.id })} style={{ borderTopColor: groupOf(r).color, cursor: 'pointer' }}>
                  <small>{r.name}</small>
                  {gc.length ? gc.map(x => <div key={x.pos} className="cy-jr">{x.pos === 1 ? <Jersey color={jerseyColor(r, 'gc')} size={18} /> : <span className="cy-pos">{x.pos}</span>}<Score>{x.rider}</Score></div>) : <Score as="b">{r.winner ?? '–'}</Score>}
                  {jerseyHolders(r).filter(j => j.key !== 'gc' && j.key !== 'team' && j.rider).map(j => <div key={j.key} className="cy-jr small"><Jersey color={jerseyColor(r, j.key)} size={15} title={CLASS_LABEL[j.key]} /><Score>{j.rider}</Score></div>)}
                </div>
              );
            })}
          </div>
          {classics.length > 0 && <>
          <h2 style={{ marginTop: 18 }}>Classics, {year}</h2>
          <p className="dek">The Monuments and the major one-day races: winner and podium.</p>
          <table className="otable">
            <tbody>{classics.map(r => {
              const pod = podiumOf(r);
              return (
                <tr key={r.id} style={{ fontWeight: r.tier === 3 ? 600 : 400 }}>
                  <td>{dayShort(Date.parse(r.start))}</td>
                  <td><i className="cy-dot" style={{ background: groupOf(r).color }} />{r.name}</td>
                  <td><Score>{pod[0]?.rider ?? r.winner ?? '–'}</Score>{pod.length > 1 && <><br /><small style={{ color: 'var(--o-ink3)', fontWeight: 400 }}><Score>{pod.slice(1, 3).map(x => `${x.pos}. ${surname(x.rider)}`).join(' · ')}</Score></small></>}</td>
                </tr>
              );
            })}</tbody>
          </table>
          </>}
        </section>
      )}
    </>
  );
}

/** "Mathieu van der Poel" -> "van der Poel", "T. Pogacar" -> "Pogacar" */
const surname = (n: string | null) => { const p = (n ?? '').split(' '); return p.length > 1 ? p.slice(1).join(' ') : p[0]; };
/** "+00h 04' 23''" -> "+4' 23\"", "+00h 00' 54''" -> "+54\"" */
const fmtGap = (g: string | null | undefined) => {
  if (!g) return g ?? '';
  const m = g.replace(/''|″/g, '"').replace(/′/g, "'").match(/^\s*\+?\s*(?:(\d+)h)?\s*(?:(\d+)')?\s*(?:(\d+)")?\s*$/);
  if (!m) return g;
  const [h, mi, se] = [Number(m[1] ?? 0), Number(m[2] ?? 0), Number(m[3] ?? 0)];
  if (!h && !mi && !se) return 's.t.';
  return `+${h ? `${h}h ` : ''}${h || mi ? `${h ? String(mi).padStart(2, '0') : mi}' ` : ''}${String(se).padStart(h || mi ? 2 : 1, '0')}"`;
};
/** Top three of a race, from the official result or Wikipedia. */
const podiumOf = (r: CyRace): { pos: number; rider: string | null; team?: string | null }[] =>
  r.wiki?.podium.length ? r.wiki.podium : (r.rankings?.result ?? r.rankings?.gc ?? r.podium ?? []).slice(0, 3).map(x => ({ pos: x.pos, rider: x.rider, team: x.team }));

/** Who wears a special jersey this season: world and European champions, national champions of the big cycling nations. */
function JerseyWearers({ races, nationals, now, teamOf }: { races: CyRace[]; nationals: CyNationals | null; now: number; teamOf: (rider: string) => string | undefined }) {
  // The jersey passes to the next champion only when the next championship is run
  const latest = (tag: 'worlds' | 'euros', re: RegExp) => races.filter(r => r.tag === tag).flatMap(r => (r.events ?? []).filter(e => re.test(e.title) && e.winner && Date.parse(e.start) < now).map(e => ({ ...e, year: r.year }))).sort((a, b) => b.start.localeCompare(a.start))[0];
  const champs = [
    { label: 'World champion', sub: 'road race', e: latest('worlds', /road race/i), color: 'rainbow' },
    { label: 'World champion', sub: 'time trial', e: latest('worlds', /time trial/i), color: 'rainbow' },
    { label: 'European champion', sub: 'road race', e: latest('euros', /road race/i), color: 'european' },
    { label: 'European champion', sub: 'time trial', e: latest('euros', /time trial/i), color: 'european' },
  ].filter(c => c.e);
  const nat = NATIONS.map(n => nationals?.rows.find(r => r.nat === n)).filter((x): x is CyNationals['rows'][number] => !!x?.rr);
  if (!champs.length && !nat.length) return null;
  return (
    <section className="ocard cy-1">
      <h2>Who wears the special jerseys</h2>
      <p className="dek">The rainbow and European jerseys until the next championships, and the national champions' jerseys{nationals ? ` (${nationals.year})` : ''}.</p>
      <div className="cy-champs">
        {champs.map(c => (
          <div key={c.label + c.sub} className="cy-champ big">
            <Jersey color={c.color} size={34} title={`${c.label}, ${c.sub}`} />
            <div><small>{c.label} · {c.sub}</small><Score as="b">{c.e!.winner}</Score><span>{teamOf(c.e!.winner!) ? teamCase(teamOf(c.e!.winner!)!) : `${c.e!.year}`}</span></div>
          </div>
        ))}
      </div>
      {nat.length > 0 && <>
        <div className="lab" style={{ marginTop: 12 }}>National champions, road race</div>
        <div className="cy-champs">
          {nat.map(n => (
            <div key={n.nat} className="cy-champ">
              <Jersey nat={n.nat} size={24} title={`${NAT_NAME[n.nat] ?? n.nat} champion`} />
              <div><small>{NAT_NAME[n.nat] ?? n.nat}</small><Score as="b">{n.rr}</Score>{n.rrTeam && <span>{teamCase(n.rrTeam)}</span>}</div>
            </div>
          ))}
        </div>
      </>}
      <div className="osrc">Source: Wikipedia</div>
    </section>
  );
}

function StartList({ teams }: { teams: CyTeamList[] }) {
  return (
    <div className="cy-start">
      {teams.map(t => (
        <div key={t.team} className="cy-team">
          <h4>{teamCase(t.team)}</h4>
          <ol>{t.riders.map(x => <li key={x.bib}><span className="bib">{x.bib}</span>{x.rider}<small>{x.nat}</small></li>)}</ol>
        </div>
      ))}
    </div>
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
            <td className="n"><Score>{mode === 'points' ? `${x.points} pts` : x.pos === 1 || mode === 'time' ? x.time : x.gap ? fmtGap(x.gap) : 's.t.'}</Score></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function GcCards({ r, rk, now }: { r: CyRace; rk: CyRankings; now: number }) {
  const running = Date.parse(r.end) > now - DAY;
  const h = rk.history ?? [];
  const finalTop = (rk.gc ?? []).slice(0, 5).map(x => x.rider!);
  const colors = ['var(--o-s1)', 'var(--o-s2)', 'var(--o-s3)', 'var(--o-s4)', 'var(--oc-tech)'];
  return (
    <>
      <section className="ocard cy-1">
        <h2>{running ? `General classification after stage ${rk.stage}` : 'How the race was won'}</h2>
        <p className="dek">{rk.source === 'Wikipedia' ? 'Rankings from Wikipedia' : `Official rankings from ${r.source}`}. The chart follows the top five: their gap to the leader of the day after every stage, in minutes.</p>
        <GapChart stages={h.map(s => s.stage)} series={finalTop.map((name, i) => ({ name, color: colors[i], values: h.map(s => { const row = s.gc.find(g => g.rider === name); return row?.gapS != null ? row.gapS / 60 : null; }) }))} />
      </section>
      <section className="ocard cy-1">
        <RankList title="General classification" rows={(rk.gc ?? []).slice(0, 10)} />
      </section>
    </>
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
    <section className="ocard cy-1">
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
