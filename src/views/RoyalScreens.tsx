// The Royal Family screens beyond the home: the family and the line of succession, who
// works how much and at what, the travels, the patronages and the ceremonial year.
// Data: royal.json (the royal collector) and royal-archive.json (scripts/collect/royalArchive.mjs).
import { useEffect, useState, type ReactNode } from 'react';
import { Chips } from '../components/tabs';
import { getJSON } from '../core/fetcher';
import { dayLong, dayShort, fmt } from '../core/time';
import type { RoyalData, RoyalPerson } from '../sources/royal';

export const ROYAL_TABS = [['now', 'Now'], ['family', 'Family & succession'], ['workload', 'Workload'], ['travels', 'Travels'], ['patronages', 'Patronages'], ['ceremonies', 'Ceremonies']] as const;
export type RoyalTab = typeof ROYAL_TABS[number][0];

export interface RoyalArchive {
  updated: string; since: string | null; total: number;
  recent: { id: string; people: string[]; start: string; title: string; kind: string; place: string | null }[];
  weeks: Record<string, Record<string, number>>; kinds: Record<string, Record<string, number>>; days: Record<string, number[]>; places: Record<string, [number, number][]>;
  patronages: Record<string, { title: string; org: string; n: number }[]>;
  trips: { who: string; kind: string; date: string; country: string; place: string }[];
}
export function useRoyalArchive(enabled = true) {
  const [d, setD] = useState<RoyalArchive | null>(null);
  useEffect(() => { if (!enabled) return; let on = true; getJSON<RoyalArchive>(`${import.meta.env.BASE_URL}data/royal-archive.json`, 30 * 60e3).then(x => on && setD(x)).catch(() => {}); return () => { on = false; }; }, [enabled]);
  return d;
}

const Src = ({ children }: { children: ReactNode }) => <div className="osrc">{children}</div>;
const P = ({ children }: { children: ReactNode }) => <p style={{ margin: '0 0 10px', lineHeight: 1.55, fontSize: 14 }}>{children}</p>;
const ROYAL = '#5b2a86';
const ageOn = (born: [number, number, number], t: number) => { const d = new Date(t); return d.getFullYear() - born[0] - (d.getMonth() + 1 < born[1] || (d.getMonth() + 1 === born[1] && d.getDate() < born[2]) ? 1 : 0); };
/** How a person is named in charts: the title ("The Princess Royal"), unambiguous unlike first names. */
const first = (p?: RoyalPerson) => p?.title ?? '';

/* ───────────────────────────── Family & succession ───────────────────────────── */

interface Node { name: string; years: string; spouse?: string; note?: string; kids?: Node[]; line?: number; working?: boolean }
// The descendants of Elizabeth II. Stable facts: change them only for a birth, a marriage or a death.
const TREE: Node = {
  name: 'Queen Elizabeth II', years: '1926–2022', spouse: 'Prince Philip, Duke of Edinburgh (1921–2021)', note: 'Queen 1952–2022, the longest reign in British history',
  kids: [
    { name: 'King Charles III', years: 'b. 1948', spouse: 'Queen Camilla (m. 2005); first marriage to Diana, Princess of Wales (1981–1996, d. 1997)', working: true, kids: [
      { name: 'William, Prince of Wales', years: 'b. 1982', spouse: 'Catherine, Princess of Wales (m. 2011)', line: 1, working: true, kids: [
        { name: 'Prince George', years: 'b. 2013', line: 2 }, { name: 'Princess Charlotte', years: 'b. 2015', line: 3 }, { name: 'Prince Louis', years: 'b. 2018', line: 4 }] },
      { name: 'Prince Harry, Duke of Sussex', years: 'b. 1984', spouse: 'Meghan, Duchess of Sussex (m. 2018)', line: 5, note: 'Stepped back from royal duties in 2020; lives in California', kids: [
        { name: 'Prince Archie', years: 'b. 2019', line: 6 }, { name: 'Princess Lilibet', years: 'b. 2021', line: 7 }] },
    ] },
    { name: 'Anne, Princess Royal', years: 'b. 1950', spouse: 'Sir Timothy Laurence (m. 1992); first marriage to Mark Phillips (1973–1992)', line: 18, working: true, kids: [
      { name: 'Peter Phillips', years: 'b. 1977', line: 19, kids: [{ name: 'Savannah Phillips', years: 'b. 2010', line: 20 }, { name: 'Isla Phillips', years: 'b. 2012', line: 21 }] },
      { name: 'Zara Tindall', years: 'b. 1981', spouse: 'Mike Tindall (m. 2011)', line: 22, kids: [{ name: 'Mia Tindall', years: 'b. 2014', line: 23 }, { name: 'Lena Tindall', years: 'b. 2018', line: 24 }, { name: 'Lucas Tindall', years: 'b. 2021', line: 25 }] },
    ] },
    { name: 'Andrew Mountbatten Windsor', years: 'b. 1960', spouse: 'Sarah Ferguson (1986–1996)', line: 8, note: 'Stripped of his titles, including “Prince”, in 2025; still in the line of succession', kids: [
      { name: 'Princess Beatrice', years: 'b. 1988', spouse: 'Edoardo Mapelli Mozzi (m. 2020)', line: 9, kids: [{ name: 'Sienna Mapelli Mozzi', years: 'b. 2021', line: 10 }, { name: 'Athena Mapelli Mozzi', years: 'b. 2025', line: 11 }] },
      { name: 'Princess Eugenie', years: 'b. 1990', spouse: 'Jack Brooksbank (m. 2018)', line: 12, kids: [{ name: 'August Brooksbank', years: 'b. 2021', line: 13 }, { name: 'Ernest Brooksbank', years: 'b. 2023', line: 14 }] },
    ] },
    { name: 'Prince Edward, Duke of Edinburgh', years: 'b. 1964', spouse: 'Sophie, Duchess of Edinburgh (m. 1999)', line: 15, working: true, kids: [
      { name: 'Lady Louise Mountbatten-Windsor', years: 'b. 2003', line: 17 }, { name: 'James, Earl of Wessex', years: 'b. 2007', line: 16 }] },
  ],
};

function TreeNode({ n, depth = 0 }: { n: Node; depth?: number }) {
  return (
    <div style={{ marginLeft: depth ? 18 : 0, borderLeft: depth ? '2px solid var(--o-line)' : 'none', paddingLeft: depth ? 12 : 0, marginTop: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        {n.line && <span title="Place in the line of succession" style={{ display: 'inline-block', minWidth: 22, textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#fff', background: n.line <= 5 ? ROYAL : 'var(--o-ink3)', borderRadius: 10, padding: '0 5px' }}>{n.line}</span>}
        <b style={{ fontSize: depth ? 13.5 : 15 }}>{n.name}</b><span style={{ color: 'var(--o-ink3)', fontSize: 12 }}>{n.years}</span>
        {n.working && <span style={{ fontSize: 10.5, color: ROYAL, border: `1px solid ${ROYAL}`, borderRadius: 4, padding: '0 4px' }}>working royal</span>}
      </div>
      {n.spouse && <div style={{ fontSize: 12, color: 'var(--o-ink2)' }}>∞ {n.spouse}</div>}
      {n.note && <div style={{ fontSize: 11.5, color: 'var(--o-ink3)' }}>{n.note}</div>}
      {n.kids?.map(k => <TreeNode key={k.name} n={k} depth={depth + 1} />)}
    </div>
  );
}

const flatLine = (n: Node): Node[] => [...(n.line ? [n] : []), ...(n.kids ?? []).flatMap(flatLine)];

export function FamilyScreen({ royal, now }: { royal: RoyalData; now: number }) {
  const line = flatLine(TREE).sort((a, b) => a.line! - b.line!);
  const working = (royal.roster ?? []).filter(p => p.working);
  const others = (royal.roster ?? []).filter(p => !p.working);
  const avg = working.reduce((a, p) => a + ageOn(p.born, now), 0) / (working.length || 1);
  return (
    <>
      <section className="ocard">
        <h2>The working royals</h2>
        <p className="dek">The members of the family who carry out official duties for the King: {working.length} people, average age {avg.toFixed(0)}. They are not paid a salary; the Sovereign Grant, from the profits of the Crown Estate, funds the official work.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
          {working.map(p => (
            <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              {p.photo ? <img src={p.photo} alt="" loading="lazy" style={{ width: 56, height: 70, objectFit: 'cover', objectPosition: 'top', borderRadius: 6, background: 'var(--o-grid)' }} /> : <span style={{ width: 56, height: 70, borderRadius: 6, background: 'var(--o-grid)' }} />}
              <div><b style={{ fontSize: 13 }}>{p.name}</b><div style={{ fontSize: 11.5, color: 'var(--o-ink3)' }}>{ageOn(p.born, now)} · born {fmt(Date.UTC(p.born[0], p.born[1] - 1, p.born[2]), { day: 'numeric', month: 'short', year: 'numeric' })}</div><div style={{ fontSize: 12, color: 'var(--o-ink2)', marginTop: 2 }}>{p.role}</div>{p.homes && <div style={{ fontSize: 11, color: 'var(--o-ink3)', marginTop: 2 }}>{p.homes}</div>}</div>
            </div>
          ))}
        </div>
        {others.length > 0 && <p className="dek" style={{ marginTop: 12 }}>Not working royals: {others.map(p => `${p.name} (${ageOn(p.born, now)})`).join(', ')}.</p>}
        <Src>Source: royal.uk, Wikipedia (portraits)</Src>
      </section>
      <section className="s-two">
        <div className="ocard">
          <h2>The family of Elizabeth II</h2>
          <p className="dek">Her four children and their descendants. The number is the place in the line of succession.</p>
          <TreeNode n={TREE} />
        </div>
        <div className="ocard">
          <h2>The line of succession</h2>
          <p className="dek">Set by law: the Sovereign's descendants in order of birth, a child's line before a younger sibling. Since 2015 boys no longer go ahead of older sisters.</p>
          <ol style={{ margin: 0, paddingLeft: 24, fontSize: 13, lineHeight: 1.7 }}>
            {line.map(n => <li key={n.name} style={{ fontWeight: n.line! <= 5 ? 700 : 400 }}>{n.name} <span style={{ color: 'var(--o-ink3)', fontWeight: 400 }}>{n.years}</span></li>)}
          </ol>
          <p className="dek" style={{ fontSize: 11.5, marginTop: 8 }}>The first 25 of a line that runs to thousands of people. A new birth among the King's descendants shifts everyone below.</p>
        </div>
      </section>
    </>
  );
}

/* ───────────────────────────── Workload ───────────────────────────── */

const KINDS: [string, string][] = [['Visit', 'var(--o-s1)'], ['Event', 'var(--o-s3)'], ['Reception', 'var(--o-s4)'], ['Audience', 'var(--o-s2)'], ['Diplomatic audience', 'color-mix(in srgb, var(--o-s2) 55%, var(--o-card))'], ['Meeting', 'var(--oc-tech)'], ['Armed forces', '#4f6b3a'], ['Service or commemoration', 'var(--o-ink3)'], ['Investiture', ROYAL], ['State business', '#b8860b'], ['Travel', 'var(--o-grid)'], ['Other', 'var(--o-other)']];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function WorkloadScreen({ royal, a }: { royal: RoyalData; a: RoyalArchive }) {
  const byId = new Map((royal.roster ?? []).map(p => [p.id, p]));
  const people = Object.keys(a.kinds).sort((x, y) => sum(a.kinds[y]) - sum(a.kinds[x]));
  const max = Math.max(1, ...people.map(p => sum(a.kinds[p])));
  const weeks = [...new Set(Object.values(a.weeks).flatMap(w => Object.keys(w)))].sort();
  const wmax = Math.max(1, ...Object.values(a.weeks).flatMap(w => Object.values(w)));
  const since = a.since ? Date.parse(a.since) : null;
  const top = people[0];
  return (
    <>
      <section className="ocard">
        <h2>Who works the most</h2>
        <p className="dek">Every engagement in the Court Circular, the official daily record, since {since ? dayLong(since) : '–'}: {a.total} entries so far. The Observer keeps them as they come, so this grows week by week. The busiest so far: <b>{first(byId.get(top))}</b> with {sum(a.kinds[top] ?? {})}.</p>
        <div className="olegend">{KINDS.map(([k, c]) => <span key={k}><i style={{ background: c }} />{k}</span>)}</div>
        {people.map(p => (
          <div key={p} style={{ display: 'grid', gridTemplateColumns: '170px 1fr 36px', gap: 10, alignItems: 'center', fontSize: 12.5, margin: '5px 0' }}>
            <span>{first(byId.get(p)) || p}</span>
            <div style={{ display: 'flex', height: 16, width: `${(sum(a.kinds[p]) / max) * 100}%`, borderRadius: 3, overflow: 'hidden' }}>
              {KINDS.map(([k, c]) => a.kinds[p][k] ? <div key={k} title={`${k}: ${a.kinds[p][k]}`} style={{ flex: a.kinds[p][k], background: c }} /> : null)}
            </div>
            <b style={{ textAlign: 'right' }}>{sum(a.kinds[p])}</b>
          </div>
        ))}
        <Src>Source: the Court Circular (royal.uk), archived by The Observer</Src>
      </section>
      {weeks.length > 1 && <section className="ocard">
        <h2>Week by week</h2>
        <p className="dek">Engagements per person each week (weeks start on Monday). Gaps are holidays, illness or travel days.</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="otable" style={{ fontSize: 11 }}>
            <thead><tr><th />{weeks.map(w => <th key={w} className="n">{fmt(Date.parse(w), { day: 'numeric', month: 'short' })}</th>)}</tr></thead>
            <tbody>{people.map(p => <tr key={p}><td style={{ whiteSpace: 'nowrap' }}>{first(byId.get(p)) || p}</td>{weeks.map(w => { const v = a.weeks[p]?.[w] ?? 0; return <td key={w} className="n" style={{ background: v ? `color-mix(in srgb, ${ROYAL} ${Math.round((v / wmax) * 85) + 10}%, var(--o-card))` : undefined, color: v / wmax > 0.5 ? '#fff' : 'var(--o-ink2)' }}>{v || ''}</td>; })}</tr>)}</tbody>
          </table>
        </div>
      </section>}
      <section className="s-two">
        <div className="ocard">
          <h2>Which days</h2>
          <table className="otable" style={{ fontSize: 11.5 }}>
            <thead><tr><th />{DOW.map(d => <th key={d} className="n">{d}</th>)}</tr></thead>
            <tbody>{people.map(p => { const ds = a.days[p] ?? [], m = Math.max(1, ...ds); return <tr key={p}><td style={{ whiteSpace: 'nowrap' }}>{first(byId.get(p)) || p}</td>{ds.map((v, i) => <td key={i} className="n" style={{ background: v ? `color-mix(in srgb, ${ROYAL} ${Math.round((v / m) * 70) + 8}%, var(--o-card))` : undefined, color: v / m > 0.6 ? '#fff' : 'var(--o-ink2)' }}>{v || ''}</td>)}</tr>; })}</tbody>
          </table>
        </div>
        <div className="ocard">
          <h2>The latest entries</h2>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {[...a.recent].reverse().slice(0, 40).map(e => <div key={e.id} style={{ fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--o-line)' }}><span style={{ color: 'var(--o-ink3)' }}>{dayShort(Date.parse(e.start))} · {e.people.map(x => first(byId.get(x)) || x).join(', ')}</span><br /><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: KINDS.find(k => k[0] === e.kind)?.[1], marginRight: 5 }} />{e.title}{e.place ? <span style={{ color: 'var(--o-ink3)' }}> · {e.place}</span> : null}</div>)}
          </div>
        </div>
      </section>
    </>
  );
}
const sum = (o: Record<string, number> = {}) => Object.values(o).reduce((a, b) => a + b, 0);

/* ───────────────────────────── Travels ───────────────────────────── */

const WHO: Record<string, string> = { king: 'The King', william: 'The Prince of Wales', catherine: 'The Princess of Wales' };

export function TravelsScreen({ a, now }: { a: RoyalArchive; now: number }) {
  const [who, setWho] = useState('king');
  const mine = a.trips.filter(t => t.who === who && (who !== 'king' || t.kind !== 'State visit received'));
  const years = [...new Set(mine.map(t => +t.date.slice(0, 4)))].sort();
  const perYear = years.map(y => ({ y, n: mine.filter(t => +t.date.slice(0, 4) === y).length }));
  const ymax = Math.max(1, ...perYear.map(x => x.n));
  const countries = Object.entries(mine.reduce<Record<string, number>>((acc, t) => { acc[t.country] = (acc[t.country] ?? 0) + 1; return acc; }, {})).sort((x, y) => y[1] - x[1]);
  const received = a.trips.filter(t => t.kind === 'State visit received');
  const next = mine.filter(t => Date.parse(t.date) >= now - 86400e3).slice(0, 5);
  return (
    <>
      <section className="ocard">
        <h2>Abroad</h2>
        <Chips label="Who" items={Object.entries(WHO).map(([k, l]) => ({ k, label: l }))} value={who} set={setWho} />
        <p className="dek">{mine.length} official trips and state visits on record{who === 'king' ? ', as Prince of Wales and, since September 2022, as King' : ''}, to {countries.length} countries.{next.length ? ` Next: ${next.map(t => `${t.country} (${dayShort(Date.parse(t.date))})`).join(', ')}.` : ''}</p>
        <div style={{ display: 'flex', alignItems: 'end', gap: 3, height: 120, margin: '8px 0' }}>
          {perYear.map(x => <div key={x.y} title={`${x.y}: ${x.n}`} style={{ flex: 1, textAlign: 'center', fontSize: 9.5, color: 'var(--o-ink3)' }}><div style={{ height: (x.n / ymax) * 90, background: x.y >= 2022 && who === 'king' ? ROYAL : 'var(--o-s1)', borderRadius: '2px 2px 0 0' }} />{String(x.y).slice(2)}</div>)}
        </div>
        <p className="dek" style={{ fontSize: 11.5 }}>Trips per year{who === 'king' ? '; purple since he became King' : ''}.</p>
        <div className="s-two" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <div className="lab">Most visited</div>
            {countries.slice(0, 15).map(([c, n]) => <div key={c} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 24px', gap: 8, alignItems: 'center', fontSize: 12, margin: '2px 0' }}><span>{c}</span><span style={{ height: 9, width: `${(n / countries[0][1]) * 100}%`, background: 'var(--o-s1)', borderRadius: 2 }} /><b>{n}</b></div>)}
          </div>
          <div>
            <div className="lab">Every trip, latest first</div>
            <div style={{ maxHeight: 380, overflowY: 'auto' }}>
              <table className="otable" style={{ fontSize: 12 }}><tbody>{[...mine].reverse().map((t, i) => <tr key={i}><td style={{ whiteSpace: 'nowrap' }}>{fmt(Date.parse(t.date), { day: 'numeric', month: 'short', year: 'numeric' })}</td><td>{t.country}{t.place ? <span style={{ color: 'var(--o-ink3)' }}> · {t.place}</span> : null}</td><td style={{ color: 'var(--o-ink3)' }}>{t.kind}</td></tr>)}</tbody></table>
            </div>
          </div>
        </div>
        <Src>Source: Wikipedia, lists of official overseas trips and state visits</Src>
      </section>
      {received.length > 0 && <section className="ocard">
        <h2>State visits to the United Kingdom</h2>
        <p className="dek">Heads of state the King has welcomed with a full state visit: a ceremonial welcome, usually at Windsor or on Horse Guards Parade, and a state banquet.</p>
        <table className="otable" style={{ fontSize: 12.5, maxWidth: 520 }}><tbody>{[...received].reverse().map((t, i) => <tr key={i}><td>{fmt(Date.parse(t.date), { day: 'numeric', month: 'long', year: 'numeric' })}</td><td>{t.country}</td></tr>)}</tbody></table>
      </section>}
    </>
  );
}

/* ───────────────────────────── Patronages ───────────────────────────── */

const CAT: [string, RegExp][] = [
  ['Armed forces', /Regiment|Colonel|Navy|Royal Marines|Air Force|\bRAF\b|Army|Corps|Squadron|Guards|Commando|Battalion|Brigade|Rifles|Yeomanry|Veterans/i],
  ['Health and care', /Hospital|Hospice|Health|Medic|Nursing|Nurses|Cancer|Surgeons|Physicians|Emergency|Care|Ambulance|St\.? John/i],
  ['Education and science', /University|College|School|Academy|Science|Institute|Research|Chancellor/i],
  ['Arts and heritage', /Museum|Gallery|Opera|Theatre|Ballet|Music|Arts|Heritage|Library|Trust|Society of Arts/i],
  ['Sport', /Rugby|Football|Cricket|Golf|Equestrian|Equine|Sailing|Yacht|Racing|Sport|Club|Riding/i],
  ['Environment', /Wildlife|Conservation|Nature|Environment|Earthshot|Forest|Ocean|Garden|Botanic/i],
];
const catOf = (org: string) => CAT.find(([, re]) => re.test(org))?.[0] ?? 'Charity and other';

export function PatronagesScreen({ royal, a }: { royal: RoyalData; a: RoyalArchive }) {
  const byId = new Map((royal.roster ?? []).map(p => [p.id, p]));
  const people = Object.keys(a.patronages).sort((x, y) => a.patronages[y].length - a.patronages[x].length);
  const [who, setWho] = useState(people[0] ?? 'anne');
  const list = a.patronages[who] ?? [];
  const cats = Object.entries(list.reduce<Record<string, number>>((acc, p) => { const c = catOf(p.org); acc[c] = (acc[c] ?? 0) + 1; return acc; }, {})).sort((x, y) => y[1] - x[1]);
  return (
    <section className="ocard">
      <h2>Patronages and military roles</h2>
      <p className="dek">Each working royal is patron, president or honorary colonel of hundreds of organisations; the King alone of more than 400. These are the roles the Court Circular has named since {a.since ? dayLong(Date.parse(a.since)) : '–'}, so the list fills in as engagements come; the number is how many engagements in that role.</p>
      <Chips label="Who" items={people.map(p => ({ k: p, label: `${first(byId.get(p)) || p} (${a.patronages[p].length})` }))} value={who} set={setWho} />
      {cats.length > 0 && <div style={{ display: 'flex', height: 18, borderRadius: 4, overflow: 'hidden', margin: '6px 0 12px' }}>{cats.map(([c, n], i) => <div key={c} title={`${c}: ${n}`} style={{ flex: n, background: ['var(--o-s1)', 'var(--o-s2)', 'var(--o-s3)', 'var(--o-s4)', ROYAL, 'var(--oc-tech)', 'var(--o-other)'][i % 7], color: '#fff', fontSize: 10, display: 'grid', placeItems: 'center', overflow: 'hidden', whiteSpace: 'nowrap' }}>{c}</div>)}</div>}
      <table className="otable" style={{ fontSize: 12.5 }}>
        <thead><tr><th>Role</th><th>Organisation</th><th>Field</th><th className="n">Engagements</th></tr></thead>
        <tbody>{list.map(p => <tr key={p.title + p.org}><td style={{ whiteSpace: 'nowrap' }}>{p.title}</td><td>{p.org}</td><td style={{ color: 'var(--o-ink3)' }}>{catOf(p.org)}</td><td className="n">{p.n}</td></tr>)}</tbody>
      </table>
      <Src>Source: the Court Circular (royal.uk), archived by The Observer</Src>
    </section>
  );
}

/* ───────────────────────────── Ceremonies ───────────────────────────── */

const CEREMONIES: { key: RegExp; name: string; when: string; what: string }[] = [
  { key: /Commonwealth Day/i, name: 'Commonwealth Day', when: 'Second Monday of March', what: 'A service at Westminster Abbey for the 56 nations of the Commonwealth, with the King as its head.' },
  { key: /Maundy/i, name: 'Royal Maundy', when: 'The Thursday before Easter', what: 'The King gives specially minted Maundy money to as many men and women as his years of age, in a different cathedral each year.' },
  { key: /Easter/i, name: 'Easter Matins', when: 'Easter Sunday', what: 'The family attends the morning service at St George’s Chapel, Windsor.' },
  { key: /Trooping/i, name: 'Trooping the Colour', when: 'A Saturday in June', what: 'The King’s official birthday parade on Horse Guards Parade: over 1,400 soldiers, 200 horses, then the RAF fly-past over the Buckingham Palace balcony.' },
  { key: /Garter/i, name: 'Garter Day', when: 'The Monday of Royal Ascot week', what: 'The Order of the Garter, the oldest order of chivalry (1348), processes in robes to St George’s Chapel; new knights are installed.' },
  { key: /Ascot/i, name: 'Royal Ascot', when: 'Five days in June', what: 'The race meeting the family arrives at in a carriage procession every afternoon.' },
  { key: /Holyrood|Scotland/i, name: 'Holyrood Week', when: 'Late June or early July', what: 'The King’s week in Scotland at the Palace of Holyroodhouse, with the Ceremony of the Keys.' },
  { key: /Braemar/i, name: 'Braemar Gathering', when: 'First Saturday of September', what: 'Highland games near Balmoral, attended by the family during the summer in Scotland.' },
  { key: /State Opening/i, name: 'State Opening of Parliament', when: 'At the start of each session', what: 'The King reads the government’s programme, the King’s Speech, from the throne in the House of Lords.' },
  { key: /Festival of Remembrance/i, name: 'Festival of Remembrance', when: 'Saturday before Remembrance Sunday', what: 'The Royal British Legion’s evening at the Royal Albert Hall for the war dead.' },
  { key: /Remembrance Sunday|Cenotaph/i, name: 'Remembrance Sunday', when: 'Second Sunday of November', what: 'Two minutes’ silence and the laying of wreaths at the Cenotaph in Whitehall.' },
  { key: /Christmas Day|Sandringham/i, name: 'Christmas at Sandringham', when: '25 December', what: 'The family walks to church at Sandringham in the morning.' },
  { key: /Christmas Broadcast|King's Speech|Christmas Message/i, name: 'The Christmas Broadcast', when: '25 December, 15:00 UK', what: 'The King’s message to the nation and the Commonwealth, recorded in advance.' },
];

export function CeremoniesScreen({ royal, now }: { royal: RoyalData; now: number }) {
  const ev = royal.events.filter(e => e.kind === 'ceremony' || e.kind === 'state-visit' || e.kind === 'state-visit-in').map(e => ({ ...e, t: Date.parse(e.start) })).filter(e => e.t > now - 86400e3);
  return (
    <>
      <section className="ocard">
        <h2>The ceremonial year</h2>
        <p className="dek">The fixed points of the royal calendar, what they are, and the next date The Observer has for each (dates worked out from the rules are marked TBC until announced).</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {CEREMONIES.map(c => { const next = ev.find(e => c.key.test(e.title)); return (
            <div key={c.name} style={{ borderTop: `3px solid ${ROYAL}`, paddingTop: 8 }}>
              <b>{c.name}</b>
              <div style={{ fontSize: 12, color: 'var(--o-ink3)' }}>{c.when}</div>
              <div style={{ fontSize: 13, color: 'var(--o-ink2)', margin: '4px 0', lineHeight: 1.45 }}>{c.what}</div>
              {next && <div style={{ fontSize: 12 }}>Next: <b>{dayLong(next.t)}</b>{next.approxTime ? ' (TBC)' : ''}</div>}
            </div>
          ); })}
        </div>
      </section>
      <section className="s-two">
        <div className="ocard">
          <h2>State visits</h2>
          <P><b>Incoming:</b> the government invites a head of state; the King welcomes them with a ceremonial welcome and a state banquet at Windsor Castle or Buckingham Palace, usually two a year.</P>
          <P><b>Outgoing:</b> the King travels on the government’s advice, as head of state of the United Kingdom, or as King of one of the 14 other Commonwealth realms.</P>
        </div>
        <div className="ocard">
          <h2>Other duties</h2>
          <P><b>Investitures:</b> about 25 a year, at Buckingham Palace, Windsor or Holyroodhouse, where the King, the Prince of Wales or the Princess Royal hand out the honours of the New Year and Birthday lists.</P>
          <P><b>Audiences:</b> the King sees the Prime Minister every week and receives new ambassadors, who present their credentials.</P>
          <P><b>Garden parties:</b> three at Buckingham Palace and one at Holyroodhouse every summer, about 30,000 guests in all.</P>
        </div>
      </section>
    </>
  );
}
