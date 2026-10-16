import { useWidth } from '../components/charts';
import { Hero } from '../components/sheet';
import { useData } from '../core/store';
import { DAY, countdown, dayLong, dayShort, hhmm } from '../core/time';
import { productName, type AppleRelease } from '../sources/apple';

/** Apple: keynotes with their time in Rome, and every product's pre-order and in-store dates. */
export function ApplePage() {
  const { apple, now } = useData();
  if (!apple) return <Hero id="apple" dek="Loading Apple…" />;
  const next = apple.keynotes.find(k => !k.past);
  const last = [...apple.keynotes].reverse().find(k => k.past);
  const upcoming = apple.releases.filter(r => r.available && Date.parse(r.available) > now);
  return (
    <>
      <Hero id="apple" dek={`${next ? `Next keynote: ${next.title}, ${dayLong(Date.parse(next.start))} at ${hhmm(Date.parse(next.start))} Rome time.` : `No keynote announced${last ? `; the last was ${last.title} on ${dayShort(Date.parse(last.start))}` : ''}.`}${upcoming.length ? ` ${upcoming.length} product${upcoming.length > 1 ? 's' : ''} still to reach stores.` : ''}`} />
      <section className="s-top">
        <div className="ocard s-next">
          <div className="lab">Next keynote</div>
          {next ? (
            <>
              <h3>{next.title}</h3>
              <div className="when">{dayLong(Date.parse(next.start))} · {hhmm(Date.parse(next.start))} Rome · apple.com</div>
              <div className="s-cd">{countdown(Date.parse(next.start) - now)}<small>T-minus</small></div>
            </>
          ) : <div style={{ color: 'var(--o-ink2)' }}>Not announced yet. Apple usually announces events a week or two ahead; they appear here automatically.</div>}
        </div>
        <div className="ocard">
          <div className="lab">Next in stores</div>
          {upcoming[0] ? (
            <>
              <h3 style={{ margin: 0 }}>{productName(upcoming[0].title)}</h3>
              <div className="when">{dayLong(Date.parse(upcoming[0].available!))}{upcoming[0].price ? ` · from ${upcoming[0].price}` : ''}</div>
              <div className="s-cd" style={{ fontSize: 30 }}>{countdown(Date.parse(upcoming[0].available!) - now)}</div>
            </>
          ) : <div>Nothing pending.</div>}
        </div>
        <div className="ocard">
          <div className="lab">Keynotes</div>
          <div className="olist">{[...apple.keynotes].reverse().slice(0, 4).map(k => <div key={k.start} className="r" style={{ gridTemplateColumns: '80px 1fr' }}><time>{dayShort(Date.parse(k.start))}<small>{new Date(k.start).getUTCFullYear()}</small></time><div><b>{k.title}</b></div></div>)}</div>
        </div>
      </section>

      {apple.releases.length > 0 && (
        <section className="ocard">
          <h2>Release calendar</h2>
          <p className="dek">Each product from announcement to pre-orders to stores. Hover for the dates.</p>
          <ReleaseChart releases={apple.releases} now={now} />
        </section>
      )}

      <section className="ocard">
        <h2>Recent announcements</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {apple.releases.map(r => (
            <a key={r.url} href={r.url} target="_blank" rel="noreferrer" style={{ border: '1px solid var(--o-line)', borderRadius: 14, padding: 14, display: 'grid', gap: 6 }}>
              <b style={{ fontSize: 16 }}>{productName(r.title)}</b>
              <small style={{ color: 'var(--o-ink3)' }}>Announced {dayShort(Date.parse(r.published))}{r.price ? ` · from ${r.price}` : ''}</small>
              <div style={{ fontSize: 13 }}>{r.preorder ? `Pre-order ${dayShort(Date.parse(r.preorder))}` : ''}{r.preorder && r.available ? ' · ' : ''}{r.available ? `In stores ${dayShort(Date.parse(r.available))}` : 'Availability in the article'}</div>
            </a>
          ))}
        </div>
      </section>

      <section className="ocard">
        <div className="lab">Apple Newsroom</div>
        <div className="onews">{apple.news.slice(0, 12).map(n => <a key={n.url} className="r" href={n.url} target="_blank" rel="noreferrer"><time>{dayShort(Date.parse(n.time))}</time><p>{n.title}</p></a>)}</div>
      </section>
    </>
  );
}

/** One row per product: announcement, pre-order and store dates on a shared time axis. */
function ReleaseChart({ releases, now }: { releases: AppleRelease[]; now: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const rows = releases.filter(r => r.available || r.preorder);
  const ts = rows.flatMap(r => [r.published, r.preorder, r.available].filter(Boolean).map(d => Date.parse(d!)));
  const from = Math.min(...ts, now) - 4 * DAY, to = Math.max(...ts, now) + 6 * DAY;
  const l = 170, rr = 20, rowH = 30, H = rows.length * rowH + 30;
  const x = (t: number) => l + ((t - from) / (to - from)) * (W - l - rr);
  return (
    <div ref={ref} className="ochart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Apple release dates">
        <line x1={x(now)} x2={x(now)} y1={0} y2={H - 20} stroke="var(--o-accent)" strokeWidth={2} />
        <text x={x(now) + 4} y={H - 6} style={{ fill: 'var(--o-accent)', fontWeight: 700 }}>Today</text>
        {rows.map((r, i) => {
          const y = 16 + i * rowH, a = Date.parse(r.published), p = r.preorder ? Date.parse(r.preorder) : null, s = r.available ? Date.parse(r.available) : null;
          return (
            <g key={r.url}>
              <text x={0} y={y + 4} style={{ fill: 'var(--o-ink)', fontSize: 12 }}>{productName(r.title).slice(0, 26)}</text>
              <line x1={x(a)} x2={x(s ?? p ?? a)} y1={y} y2={y} stroke="var(--o-line)" strokeWidth={3} strokeLinecap="round" />
              <circle cx={x(a)} cy={y} r={4} fill="var(--o-ink3)"><title>{`Announced ${dayShort(a)}`}</title></circle>
              {p && <circle cx={x(p)} cy={y} r={5} fill="var(--o-card)" stroke="var(--oc-tech)" strokeWidth={2}><title>{`Pre-order ${dayShort(p)}`}</title></circle>}
              {s && <circle cx={x(s)} cy={y} r={6} fill="var(--oc-tech)"><title>{`In stores ${dayShort(s)}`}</title></circle>}
              {s && <text x={x(s) + 9} y={y + 4} style={{ fontSize: 11 }}>{dayShort(s)}</text>}
            </g>
          );
        })}
      </svg>
      <div className="olegend">
        <span><i style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--o-ink3)' }} />Announced</span>
        <span><i style={{ width: 10, height: 10, borderRadius: '50%', boxShadow: 'inset 0 0 0 2px var(--oc-tech)' }} />Pre-order</span>
        <span><i style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--oc-tech)' }} />In stores</span>
      </div>
    </div>
  );
}
