// Fashion Week screens beyond the home: each city's weeks and the density of its
// schedule, the brands (who shows where, and how often), the reviewed collections, and
// how the fashion calendar works. Data: fashion.json (the fashion collector).
import { useState, type ReactNode } from 'react';
import { Chips } from '../components/tabs';
import { dayShort, fmt, hhmm } from '../core/time';

export const FASHION_TABS = [['now', 'Now'], ['cities', 'Cities'], ['brands', 'Brands'], ['collections', 'Collections'], ['how', 'How it works']] as const;
export type FashionTab = typeof FASHION_TABS[number][0];

interface Week { id: string; city: string; kind: string; season: string; start: string; end: string; link: string; official: string }
interface Show { id: string; city: string; brand: string; start: string; type: string; note?: string; link?: string; week: string }
interface Coll { season: string; city: string; brand: string; url: string; vogue?: string }
export interface FashionFile { updated: string; weeks: Week[]; shows: Show[]; collections: Coll[] }

const Src = ({ children }: { children: ReactNode }) => <div className="osrc">{children}</div>;
const CITY: Record<string, string> = { 'New York': 'var(--o-s1)', London: 'var(--o-s3)', Milan: 'var(--o-s2)', Paris: 'var(--o-s4)' };
const KIND: Record<string, string> = { women: "Women's", men: "Men's", couture: 'Haute Couture' };
const brandName = (b: string) => (b === b.toUpperCase() ? b.toLowerCase().replace(/(^|[\s&-])(\p{L})/gu, (_, a, c) => a + c.toUpperCase()) : b);

export function CitiesScreen({ d, now }: { d: FashionFile; now: number }) {
  const cities = [...new Set(d.weeks.map(w => w.city))];
  const [city, setCity] = useState(cities.includes('Milan') ? 'Milan' : cities[0]);
  const weeks = d.weeks.filter(w => w.city === city).sort((a, b) => a.start.localeCompare(b.start));
  const withShows = weeks.filter(w => d.shows.some(s => s.week === w.id));
  const [wid, setWid] = useState<string | null>(null);
  const w = withShows.find(x => x.id === wid) ?? withShows.at(-1);
  const shows = w ? d.shows.filter(s => s.week === w.id).sort((a, b) => a.start.localeCompare(b.start)) : [];
  const days = [...new Set(shows.map(s => s.start.slice(0, 10)))].sort();
  const hours = Array.from({ length: 13 }, (_, i) => i + 8);
  const count = (day: string, h: number) => shows.filter(s => s.start.slice(0, 10) === day && Number(hhmm(Date.parse(s.start)).slice(0, 2)) === h).length;
  const max = Math.max(1, ...days.flatMap(dd => hours.map(h => count(dd, h))));
  return (
    <>
      <section className="ocard">
        <h2>The weeks of each city</h2>
        <Chips label="City" items={cities.map(c => ({ k: c, label: c }))} value={city} set={c => { setCity(c); setWid(null); }} />
        <table className="otable" style={{ fontSize: 12.5 }}><thead><tr><th>Week</th><th>Season</th><th>Dates</th><th>Organiser</th><th className="n">Shows on file</th></tr></thead>
          <tbody>{weeks.map(x => <tr key={x.id} className={Date.parse(x.start) <= now && now <= Date.parse(x.end) + 86400e3 ? 'me' : ''}><td>{KIND[x.kind] ?? x.kind}</td><td>{x.season}</td><td>{dayShort(Date.parse(x.start))} – {dayShort(Date.parse(x.end))}</td><td><a href={x.link} target="_blank" rel="noreferrer">{x.official}</a></td><td className="n">{d.shows.filter(s => s.week === x.id).length || ''}</td></tr>)}</tbody></table>
        <Src>Sources: CFDA, British Fashion Council, Camera della Moda, FHCM</Src>
      </section>
      {w && <section className="ocard">
        <h2>{city}, {KIND[w.kind]?.toLowerCase() ?? w.kind} {w.season}: hour by hour</h2>
        {withShows.length > 1 && <Chips label="Week" items={withShows.map(x => ({ k: x.id, label: `${KIND[x.kind] ?? x.kind} ${x.season}` }))} value={w.id} set={setWid} />}
        <p className="dek">How many shows and presentations start in each hour of each day (Rome time). The darker, the busier: the moments the whole industry is in the same room.</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="otable" style={{ fontSize: 11 }}><thead><tr><th />{hours.map(h => <th key={h} className="n">{h}</th>)}<th className="n">Total</th></tr></thead>
            <tbody>{days.map(dd => <tr key={dd}><td style={{ whiteSpace: 'nowrap' }}>{dayShort(Date.parse(`${dd}T12:00:00Z`))}</td>{hours.map(h => { const v = count(dd, h); return <td key={h} className="n" style={{ background: v ? `color-mix(in srgb, ${CITY[city] ?? 'var(--o-s1)'} ${Math.round((v / max) * 80) + 10}%, var(--o-card))` : undefined }}>{v || ''}</td>; })}<td className="n"><b>{shows.filter(s => s.start.slice(0, 10) === dd).length}</b></td></tr>)}</tbody></table>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6, marginTop: 12 }}>
          {shows.map(s => <div key={s.id} style={{ fontSize: 12, borderLeft: `3px solid ${s.type === 'show' ? CITY[city] ?? 'var(--o-s1)' : 'var(--o-other)'}`, paddingLeft: 6 }}><span style={{ color: 'var(--o-ink3)' }}>{dayShort(Date.parse(s.start))} {hhmm(Date.parse(s.start))}</span> {s.link ? <a href={s.link} target="_blank" rel="noreferrer">{brandName(s.brand)}</a> : brandName(s.brand)} <small style={{ color: 'var(--o-ink3)' }}>{s.type}</small></div>)}
        </div>
      </section>}
    </>
  );
}

export function BrandsScreen({ d }: { d: FashionFile }) {
  const all = new Map<string, { brand: string; cities: Set<string>; weeks: Set<string>; shows: number; reviews: number }>();
  const key = (b: string) => b.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const s of d.shows) { const k = key(s.brand); const x = all.get(k) ?? { brand: brandName(s.brand), cities: new Set(), weeks: new Set(), shows: 0, reviews: 0 }; x.cities.add(s.city); x.weeks.add(s.week); if (s.type === 'show') x.shows++; all.set(k, x); }
  for (const c of d.collections) { const k = key(c.brand); const x = all.get(k) ?? { brand: c.brand, cities: new Set([c.city]), weeks: new Set(), shows: 0, reviews: 0 }; x.reviews++; all.set(k, x); }
  const list = [...all.values()];
  const multi = list.filter(x => x.cities.size > 1);
  const top = [...list].sort((a, b) => b.reviews - a.reviews || b.weeks.size - a.weeks.size).slice(0, 30);
  const byCity = [...new Set(d.shows.map(s => s.city))].map(c => ({ c, shows: d.shows.filter(s => s.city === c && s.type === 'show').length, other: d.shows.filter(s => s.city === c && s.type !== 'show').length, brands: new Set(d.shows.filter(s => s.city === c).map(s => key(s.brand))).size }));
  const max = Math.max(1, ...byCity.map(x => x.shows + x.other));
  return (
    <>
      <section className="ocard">
        <h2>The size of each fashion week</h2>
        <p className="dek">Runway shows and presentations on the official calendars on file, and how many houses show.</p>
        {byCity.map(x => <div key={x.c} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 150px', gap: 8, alignItems: 'center', fontSize: 12.5, margin: '5px 0' }}><span>{x.c}</span><span style={{ display: 'flex', height: 14, width: `${((x.shows + x.other) / max) * 100}%` }}><span style={{ flex: x.shows, background: CITY[x.c] ?? 'var(--o-s1)' }} /><span style={{ flex: x.other, background: 'var(--o-other)' }} /></span><span style={{ color: 'var(--o-ink2)' }}>{x.shows} shows · {x.other} other · {x.brands} houses</span></div>)}
        <div className="olegend" style={{ marginTop: 6 }}><span><i style={{ background: 'var(--o-s2)' }} />Runway show</span><span><i style={{ background: 'var(--o-other)' }} />Presentation and other</span></div>
      </section>
      <section className="s-two">
        <div className="ocard">
          <h2>The most reviewed houses</h2>
          <p className="dek">Collections reviewed by WWD and Vogue Runway on file, and the weeks each house appears in.</p>
          <table className="otable" style={{ fontSize: 12.5 }}><thead><tr><th>House</th><th>Cities</th><th className="n">Weeks</th><th className="n">Reviews</th></tr></thead>
            <tbody>{top.map(x => <tr key={x.brand}><td>{x.brand}</td><td style={{ color: 'var(--o-ink3)' }}>{[...x.cities].join(', ')}</td><td className="n">{x.weeks.size || ''}</td><td className="n">{x.reviews || ''}</td></tr>)}</tbody></table>
        </div>
        <div className="ocard">
          <h2>Showing in more than one city</h2>
          <p className="dek">Houses on the calendar of two cities or more (often a men's show in one and a women's in another).</p>
          {multi.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{multi.map(x => <span key={x.brand} style={{ fontSize: 12, border: '1px solid var(--o-line)', borderRadius: 4, padding: '2px 6px' }}>{x.brand} <small style={{ color: 'var(--o-ink3)' }}>{[...x.cities].join(' · ')}</small></span>)}</div> : <p className="dek">None on file this season.</p>}
        </div>
      </section>
      <Src>Sources: official calendars, WWD, Vogue Runway</Src>
    </>
  );
}

export function CollectionsScreen({ d }: { d: FashionFile }) {
  const seasons = [...new Set(d.collections.map(c => c.season))];
  const [season, setSeason] = useState(seasons[0] ?? '');
  const cities = [...new Set(d.collections.filter(c => c.season === season).map(c => c.city))];
  return (
    <section className="ocard">
      <h2>The reviewed collections</h2>
      <Chips label="Season" items={seasons.map(s => ({ k: s, label: s.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ') }))} value={season} set={setSeason} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
        {cities.map(c => (
          <div key={c}>
            <div className="lab" style={{ color: CITY[c] }}>{c}</div>
            {d.collections.filter(x => x.season === season && x.city === c).map(x => <div key={x.url} style={{ fontSize: 12.5, padding: '3px 0', borderBottom: '1px solid var(--o-line)' }}>{x.brand} <a href={x.url} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>WWD</a>{x.vogue && <> · <a href={x.vogue} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>Vogue</a></>}</div>)}
          </div>
        ))}
      </div>
      <Src>Sources: WWD Runway, Vogue Runway · updated {fmt(Date.parse(d.updated), { day: 'numeric', month: 'short' })}</Src>
    </section>
  );
}

export function HowScreen() {
  const P = ({ children }: { children: ReactNode }) => <p style={{ margin: '0 0 10px', lineHeight: 1.55, fontSize: 14 }}>{children}</p>;
  return (
    <section className="s-two">
      <div className="ocard">
        <h2>The fashion calendar</h2>
        <P><b>Women's ready-to-wear</b> twice a year: in February–March (autumn/winter collections) and September–October (spring/summer), always in the same order, the "Big Four": New York, London, Milan, Paris.</P>
        <P><b>Men's</b> weeks in January and June, Milan then Paris. <b>Haute Couture</b> in Paris in January and July, right after the men's.</P>
        <P>Collections are shown about six months before they reach the shops.</P>
      </div>
      <div className="ocard">
        <h2>Shows, presentations, houses</h2>
        <P>A <b>runway show</b> lasts ten to fifteen minutes; a <b>presentation</b> is a static display, often for smaller brands. Places are by invitation; the official calendars are set by the CFDA (New York), the British Fashion Council, the Camera Nazionale della Moda (Milan) and the Fédération de la Haute Couture et de la Mode (Paris).</P>
        <P><b>Haute Couture</b> is a protected title in France: only houses approved by the Fédération, with ateliers in Paris and hand-made pieces, can use it.</P>
      </div>
    </section>
  );
}
