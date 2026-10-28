// Roster screens of the team pages: who is on the team, who plays, who produces.
import { Fragment, useState, type ReactNode } from 'react';
import { useWidth } from '../components/charts';
import { QuadrantScatter, goodBad, goodBadInk } from '../components/power';
import { Chips } from '../components/tabs';
import type { CfbRosterPlayer, Depth, NflRosterPlayer, RostersFile, SoccerRosterPlayer } from '../sources/rosters';

const Src = ({ children }: { children: ReactNode }) => <div className="osrc">{children}</div>;
const sg = (v: number, d = 1) => `${v > 0 ? '+' : ''}${v.toFixed(d)}`;
const pc = (v: number) => `${Math.round(v * 100)}%`;
const n0 = (v: number | null | undefined) => (v == null ? '–' : String(Math.round(v)));

function Face({ src, size = 30 }: { src: string | null; size?: number }) {
  return src ? <img src={src} alt="" loading="lazy" style={{ width: size, height: size * 0.73, objectFit: 'cover', objectPosition: 'top', borderRadius: 4, background: 'var(--o-grid)', verticalAlign: 'middle', marginRight: 8 }} />
    : <span style={{ display: 'inline-block', width: size, height: size * 0.73, borderRadius: 4, background: 'var(--o-grid)', verticalAlign: 'middle', marginRight: 8 }} />;
}

/** Dots of one value (age…) for each group, with the group's average: a strip plot. */
function AgeStrips({ groups, unit = 'yrs' }: { groups: { label: string; values: { v: number; name: string }[] }[]; unit?: string }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hot, setHot] = useState<string | null>(null);
  const all = groups.flatMap(g => g.values.map(x => x.v));
  if (!all.length) return null;
  const lo = Math.floor(Math.min(...all)), hi = Math.ceil(Math.max(...all));
  const row = 34, l = 120, r = 60, H = groups.length * row + 24;
  const x = (v: number) => l + ((v - lo) / (hi - lo || 1)) * (W - l - r);
  return (
    <div ref={ref} className="ochart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Distribution by group">
        {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).filter(v => (hi - lo > 12 ? v % 2 === 0 : true)).map(v => <g key={v}><line x1={x(v)} x2={x(v)} y1={4} y2={H - 18} stroke="var(--o-grid)" /><text x={x(v)} y={H - 4} textAnchor="middle">{v}</text></g>)}
        {groups.map((g, i) => {
          const yy = 16 + i * row, avg = g.values.reduce((a, b) => a + b.v, 0) / (g.values.length || 1);
          return (
            <g key={g.label}>
              <text x={0} y={yy + 4} style={{ fill: 'var(--o-ink)', fontSize: 12 }}>{g.label}</text>
              {g.values.map((p, k) => <circle key={k} cx={x(p.v)} cy={yy + ((k % 3) - 1) * 4} r={4} fill="var(--o-s1)" opacity={hot && hot !== p.name ? 0.25 : 0.6} onPointerEnter={() => setHot(p.name)} onPointerLeave={() => setHot(null)}><title>{`${p.name}: ${p.v}`}</title></circle>)}
              {g.values.length > 0 && <><line x1={x(avg)} x2={x(avg)} y1={yy - 10} y2={yy + 10} stroke="var(--o-ink)" strokeWidth={2} /><text x={W} y={yy + 4} textAnchor="end" style={{ fill: 'var(--o-ink)', fontWeight: 700 }}>{avg.toFixed(1)} {unit}</text></>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Horizontal bars, one per row, with optional stacked parts. */
function StackBars({ rows, parts, fmt = (v: number) => v.toFixed(1) }: { rows: { label: ReactNode; values: Record<string, number>; total: number }[]; parts: [string, string, string][]; fmt?: (v: number) => string }) {
  const max = Math.max(1e-9, ...rows.map(r => Math.max(0, ...parts.map(([k]) => r.values[k] ?? 0)) && parts.reduce((a, [k]) => a + Math.max(0, r.values[k] ?? 0), 0)));
  const minNeg = Math.min(0, ...rows.map(r => parts.reduce((a, [k]) => a + Math.min(0, r.values[k] ?? 0), 0)));
  const span = max - minNeg;
  return (
    <div>
      <div className="olegend">{parts.map(([, l, c]) => <span key={l}><i style={{ background: c }} />{l}</span>)}</div>
      {rows.map((r, i) => {
        let pos = 0, neg = 0;
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 54px', gap: 8, alignItems: 'center', fontSize: 12, margin: '3px 0' }}>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
            <div style={{ position: 'relative', height: 14 }}>
              <div style={{ position: 'absolute', left: `${(-minNeg / span) * 100}%`, top: -3, bottom: -3, borderLeft: '1px solid var(--o-ink3)' }} />
              {parts.map(([k, l, c]) => {
                const v = r.values[k] ?? 0;
                if (!v) return null;
                const w = (Math.abs(v) / span) * 100, left = v > 0 ? ((pos - minNeg) / span) * 100 : ((neg + v - minNeg) / span) * 100;
                if (v > 0) pos += v; else neg += v;
                return <div key={k} title={`${l}: ${fmt(v)}`} style={{ position: 'absolute', left: `${left}%`, width: `${w}%`, top: 0, bottom: 0, background: c, borderRadius: 2 }} />;
              })}
            </div>
            <b style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.total)}</b>
          </div>
        );
      })}
    </div>
  );
}

/** Depth chart: one card per position, starter first. */
function DepthChart({ depth, players, photo }: { depth: Depth[]; players: Record<string, { name: string; jersey: string | null; photo: string | null; injury: { status: string } | null }>; photo?: boolean }) {
  const [f, setF] = useState(0);
  if (!depth.length) return null;
  // Offence, then defence, then special teams
  const kind = (n: string) => (/special/i.test(n) ? 2 : /\bD\b|defen/i.test(n) ? 1 : 0);
  const order = [...depth].sort((a, b) => kind(a.name) - kind(b.name));
  const cur = order[Math.min(f, order.length - 1)];
  return (
    <>
      <Chips label="Unit" items={order.map((x, i) => ({ k: i, label: kind(x.name) === 2 ? 'Special teams' : kind(x.name) === 1 ? `Defence · ${x.name}` : `Offence · ${x.name}` }))} value={f} set={setF} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
        {cur.positions.map(p => (
          <div key={p.key} style={{ border: '1px solid var(--o-line)', borderRadius: 8, padding: '8px 10px' }}>
            <div className="lab" style={{ marginBottom: 4 }}>{p.pos} · {p.name}</div>
            {p.players.slice(0, 3).map((id, i) => {
              const x = players[id];
              return x ? <div key={id} style={{ fontSize: i === 0 ? 13 : 12, fontWeight: i === 0 ? 700 : 400, color: i === 0 ? 'var(--o-ink)' : 'var(--o-ink2)', padding: '2px 0', display: 'flex', alignItems: 'center' }}>
                {photo && i === 0 && <Face src={x.photo} size={34} />}
                <span><span style={{ color: 'var(--o-ink3)', fontWeight: 400 }}>{x.jersey ? `#${x.jersey} ` : ''}</span>{x.name}{x.injury && <small style={{ color: 'var(--o-s2)', fontWeight: 600 }}> · {x.injury.status}</small>}</span>
              </div> : null;
            })}
          </div>
        ))}
      </div>
    </>
  );
}

/* ───────────────────────────── Patriots ───────────────────────────── */

const NFL_GROUPS: [string, string][] = [['offense', 'Offence'], ['defense', 'Defence'], ['specialTeam', 'Special teams'], ['injuredReserveOrOut', 'Injured reserve / out'], ['suspended', 'Suspended'], ['practiceSquad', 'Practice squad']];

export function PatsRoster({ r }: { r: RostersFile['pats'] }) {
  const P = r.players;
  const byId = Object.fromEntries(P.map(p => [p.espn, p]));
  const weeks = [...new Set(P.flatMap(p => p.snaps.map(s => s.wk)))].sort((a, b) => a - b);
  const snapTable = (side: 'off' | 'def') => P.map(p => ({ p, total: p.snaps.reduce((a, s) => a + (s[side] ?? 0), 0) })).filter(x => x.total > 0.3).sort((a, b) => b.total - a.total).slice(0, side === 'off' ? 16 : 18);
  const epa = P.filter(p => p.season && (p.season.passing_epa || p.season.rushing_epa || p.season.receiving_epa)).map(p => ({ p, pass: p.season!.passing_epa ?? 0, rush: p.season!.rushing_epa ?? 0, rec: p.season!.receiving_epa ?? 0 }))
    .map(x => ({ ...x, total: x.pass + x.rush + x.rec })).sort((a, b) => Math.abs(b.total) - Math.abs(a.total)).slice(0, 14).sort((a, b) => b.total - a.total);
  const receivers = P.filter(p => (p.season?.targets ?? 0) >= 8);
  const defenders = P.filter(p => p.season && (p.season.def_tackles_solo || p.season.def_sacks || p.season.def_interceptions)).sort((a, b) => ((b.season!.def_sacks ?? 0) * 3 + (b.season!.def_tackles_solo ?? 0) + (b.season!.def_tackle_assists ?? 0) / 2 + (b.season!.def_interceptions ?? 0) * 4) - ((a.season!.def_sacks ?? 0) * 3 + (a.season!.def_tackles_solo ?? 0) + (a.season!.def_tackle_assists ?? 0) / 2 + (a.season!.def_interceptions ?? 0) * 4)).slice(0, 15);
  const [grp, setGrp] = useState('offense');
  const draftLabel = (p: NflRosterPlayer) => (p.draft?.pick ? `#${p.draft.pick}${p.draft.club && p.draft.club !== 'NE' ? ` ${p.draft.club}` : ''} · ${p.draft.year}` : p.draft?.year ? `Undrafted · ${p.draft.year}` : '–');
  const out = P.filter(p => p.injury || p.group === 'injuredReserveOrOut');
  return (
    <>
      <section className="ocard">
        <h2>The depth chart</h2>
        <p className="dek">Starters first, then the backups, as the team lists them this week. Injury status from ESPN.</p>
        <DepthChart depth={r.depth} players={byId} photo />
        <Src>Source: ESPN depth chart</Src>
      </section>

      {weeks.length > 0 && <section className="ocard">
        <h2>Who plays</h2>
        <p className="dek">Share of the team's snaps each player was on the field for, week by week. A full column of dark cells is an every-down player.</p>
        <div className="s-two" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {(['off', 'def'] as const).map(side => (
            <div key={side} style={{ overflowX: 'auto' }}>
              <div className="lab">{side === 'off' ? 'Offence' : 'Defence'}</div>
              <table className="otable" style={{ fontSize: 11 }}>
                <thead><tr><th>Player</th>{weeks.map(w => <th key={w} className="n">{w}</th>)}</tr></thead>
                <tbody>{snapTable(side).map(({ p }) => (
                  <tr key={p.espn}><td style={{ whiteSpace: 'nowrap' }}><span style={{ color: 'var(--o-ink3)' }}>{p.pos}</span> {p.short}</td>
                    {weeks.map(w => { const v = p.snaps.find(s => s.wk === w)?.[side]; return <td key={w} className="n" style={{ background: v ? `color-mix(in srgb, var(--o-s1) ${Math.round(v * 85)}%, var(--o-card))` : undefined, color: v && v > 0.6 ? '#fff' : 'var(--o-ink2)', padding: '4px 2px' }}>{v ? Math.round(v * 100) : ''}</td>; })}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ))}
        </div>
        <Src>Source: nflverse snap counts (Pro Football Reference)</Src>
      </section>}

      {epa.length > 0 && <section className="s-two">
        <div className="ocard">
          <h2>Who drives the offence</h2>
          <p className="dek">Expected points added this season by each player, as passer, runner and receiver. Bars left of the line cost the team points.</p>
          <StackBars fmt={v => sg(v)} parts={[['pass', 'Passing', 'var(--o-s1)'], ['rush', 'Rushing', 'var(--o-s3)'], ['rec', 'Receiving', 'var(--o-s4)']]}
            rows={epa.map(x => ({ label: <><span style={{ color: 'var(--o-ink3)' }}>{x.p.pos}</span> {x.p.name}</>, values: { pass: x.pass, rush: x.rush, rec: x.rec }, total: x.total }))} />
          <Src>Source: nflverse player stats</Src>
        </div>
        {receivers.length > 0 && <div className="ocard">
          <h2>The receivers</h2>
          <p className="dek">Share of the team's targets against value per target (receiving EPA ÷ targets). Top right: the go-to players who also deliver.</p>
          <QuadrantScatter height={340} xLabel="Share of team targets" yLabel="Receiving EPA per target" fmt={v => v.toFixed(2)} corners={['Go-to and efficient', 'Efficient, few looks', 'Busy, inefficient', 'Role players']}
            points={receivers.map(p => ({ id: p.espn, label: p.short, x: p.season!.target_share ?? 0, y: (p.season!.receiving_epa ?? 0) / (p.season!.targets || 1), tip: <><div className="k">{p.name} · {p.pos}</div>{p.season!.receptions ?? 0} catches on {p.season!.targets} targets, {p.season!.receiving_yards ?? 0} yards, {p.season!.receiving_tds ?? 0} TD · target share {pc(p.season!.target_share ?? 0)} · air-yards share {pc(p.season!.air_yards_share ?? 0)}</> }))} />
        </div>}
      </section>}

      {defenders.length > 0 && <section className="ocard">
        <h2>The defence, player by player</h2>
        <table className="otable" style={{ fontSize: 12 }}>
          <thead><tr><th>Player</th><th className="n">Tackles</th><th className="n">For loss</th><th className="n">Sacks</th><th className="n">QB hits</th><th className="n">INT</th><th className="n">Passes def.</th><th className="n">Forced fum.</th></tr></thead>
          <tbody>{defenders.map(p => { const s = p.season!; return <tr key={p.espn}><td><Face src={p.photo} size={26} /><span style={{ color: 'var(--o-ink3)' }}>{p.pos}</span> {p.name}</td><td className="n">{(s.def_tackles_solo ?? 0) + (s.def_tackle_assists ?? 0)}</td><td className="n">{n0(s.def_tackles_for_loss)}</td><td className="n">{s.def_sacks ?? '–'}</td><td className="n">{n0(s.def_qb_hits)}</td><td className="n">{n0(s.def_interceptions)}</td><td className="n">{n0(s.def_pass_defended)}</td><td className="n">{n0(s.def_fumbles_forced)}</td></tr>; })}</tbody>
        </table>
        <Src>Source: nflverse player stats</Src>
      </section>}

      {out.length > 0 && <section className="ocard">
        <h2>Injuries and absences</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>
          {out.map(p => <div key={p.espn} style={{ fontSize: 12.5, display: 'flex', alignItems: 'center' }}><Face src={p.photo} /><span><b>{p.name}</b> <span style={{ color: 'var(--o-ink3)' }}>{p.pos}</span><br /><span style={{ color: 'var(--o-s2)' }}>{p.injury?.status ?? 'Injured reserve'}</span>{p.injury?.detail ? ` · ${p.injury.detail}` : ''}</span></div>)}
        </div>
        <Src>Source: ESPN</Src>
      </section>}

      <section className="ocard">
        <h2>The roster</h2>
        <Chips label="Group" items={NFL_GROUPS.filter(([k]) => P.some(p => p.group === k)).map(([k, label]) => ({ k, label: `${label} (${P.filter(p => p.group === k).length})` }))} value={grp} set={setGrp} />
        <div style={{ overflowX: 'auto' }}>
          <table className="otable" style={{ fontSize: 12 }}>
            <thead><tr><th className="n">#</th><th>Player</th><th>Pos</th><th className="n">Age</th><th className="n">Height</th><th className="n">Weight</th><th className="n">Exp.</th><th>College</th><th>Drafted</th><th>Status</th></tr></thead>
            <tbody>{P.filter(p => p.group === grp).sort((a, b) => (a.pos ?? '').localeCompare(b.pos ?? '') || +(a.jersey ?? 99) - +(b.jersey ?? 99)).map(p => (
              <tr key={p.espn}><td className="n">{p.jersey}</td><td style={{ whiteSpace: 'nowrap' }}><Face src={p.photo} />{p.name}</td><td>{p.pos}</td><td className="n">{p.age ?? '–'}</td><td className="n">{p.ht}</td><td className="n">{p.wt?.replace(' lbs', '')}</td><td className="n">{p.exp === 0 ? 'R' : p.exp ?? '–'}</td><td>{p.college}</td><td style={{ whiteSpace: 'nowrap' }}>{draftLabel(p)}</td><td style={{ color: p.injury ? 'var(--o-s2)' : 'var(--o-ink3)' }}>{p.injury?.status ?? p.status}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <Src>Sources: ESPN roster, nflverse (draft)</Src>
      </section>

      <section className="ocard">
        <h2>How old is the team</h2>
        <p className="dek">Every player's age by unit; the black line is the unit's average.</p>
        <AgeStrips groups={NFL_GROUPS.slice(0, 3).map(([k, label]) => ({ label, values: P.filter(p => p.group === k && p.age).map(p => ({ v: p.age!, name: p.name })) }))} />
      </section>
    </>
  );
}

/* ───────────────────────────── Texas ───────────────────────────── */

const CLASSES = ['Freshman', 'Sophomore', 'Junior', 'Senior'];

export function TexasRoster({ r }: { r: RostersFile['texas'] }) {
  const P = r.players;
  const [grp, setGrp] = useState('offense');
  const top = (key: string, n = 6) => P.filter(p => (p.season?.[key] ?? 0) > 0).sort((a, b) => b.season![key] - a.season![key]).slice(0, n);
  const LEAD: [string, string, (p: CfbRosterPlayer) => string][] = [
    ['passing.YDS', 'Passing yards', p => `${p.season!['passing.COMPLETIONS'] ?? 0}/${p.season!['passing.ATT'] ?? 0}, ${p.season!['passing.TD'] ?? 0} TD, ${p.season!['passing.INT'] ?? 0} INT`],
    ['rushing.YDS', 'Rushing yards', p => `${p.season!['rushing.CAR'] ?? 0} carries, ${p.season!['rushing.TD'] ?? 0} TD`],
    ['receiving.YDS', 'Receiving yards', p => `${p.season!['receiving.REC'] ?? 0} catches, ${p.season!['receiving.TD'] ?? 0} TD`],
    ['defensive.TOT', 'Tackles', p => `${p.season!['defensive.TFL'] ?? 0} for loss`],
    ['defensive.SACKS', 'Sacks', p => `${p.season!['defensive.QB HUR'] ?? 0} hurries`],
    ['interceptions.INT', 'Interceptions', p => `${p.season!['defensive.PD'] ?? 0} passes defended`],
  ];
  const ppa = P.filter(p => p.ppa?.total != null && Math.abs(p.ppa.total) > 0.5).sort((a, b) => b.ppa!.total! - a.ppa!.total!).slice(0, 14);
  const states = Object.entries(P.reduce<Record<string, number>>((a, p) => { const s = p.state ?? 'Other'; a[s] = (a[s] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const byClass = (g: string) => CLASSES.map(c => P.filter(p => p.group === g && String(p.exp ?? '').includes(c)).length);
  return (
    <>
      {r.depth.length > 0 && <section className="ocard"><h2>The depth chart</h2><DepthChart depth={r.depth} players={Object.fromEntries(P.map(p => [p.espn, p]))} /></section>}
      <section className="ocard">
        <h2>Season leaders</h2>
        {!r.cfbd && <p className="dek">CollegeFootballData key missing: statistics not available.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 18 }}>
          {LEAD.map(([k, label, sub]) => top(k).length > 0 && (
            <div key={k}>
              <div className="lab">{label}</div>
              {top(k).map((p, i) => <div key={p.espn} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, fontSize: 12.5, padding: '3px 0', borderBottom: '1px solid var(--o-line)' }}>
                <span>{i === 0 && <Face src={p.photo} size={30} />}<b>{p.name}</b> <span style={{ color: 'var(--o-ink3)' }}>{p.pos}</span><br /><small style={{ color: 'var(--o-ink3)' }}>{sub(p)}</small></span>
                <b style={{ fontVariantNumeric: 'tabular-nums' }}>{p.season![k]}</b>
              </div>)}
            </div>
          ))}
        </div>
        <Src>Source: CollegeFootballData</Src>
      </section>
      {ppa.length > 0 && <section className="ocard">
        <h2>Who adds the most</h2>
        <p className="dek">Total predicted points added (PPA, college football's EPA) this season, split into passing and rushing plays the player was involved in.</p>
        <StackBars fmt={v => sg(v)} parts={[['pass', 'On passing plays', 'var(--o-s1)'], ['rush', 'On running plays', 'var(--o-s3)']]}
          rows={ppa.map(p => ({ label: <><span style={{ color: 'var(--o-ink3)' }}>{p.pos}</span> {p.name}</>, values: { pass: p.ppa!.pass ?? 0, rush: p.ppa!.rush ?? 0 }, total: p.ppa!.total! }))} />
        <Src>Source: CollegeFootballData PPA</Src>
      </section>}
      <section className="s-two" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="ocard">
          <h2>Experience</h2>
          <p className="dek">Players by class in each unit. Redshirts count with the class ESPN lists.</p>
          <table className="otable"><thead><tr><th>Unit</th>{CLASSES.map(c => <th key={c} className="n">{c.slice(0, 2)}</th>)}</tr></thead>
            <tbody>{[['offense', 'Offence'], ['defense', 'Defence'], ['specialTeam', 'Special teams']].map(([g, label]) => { const cs = byClass(g), tot = cs.reduce((a, b) => a + b, 0) || 1; return <tr key={g}><td>{label}</td>{cs.map((c, i) => <td key={i} className="n" style={{ background: goodBad(0.5 + (c / tot) * 0.5), color: goodBadInk(0.5 + (c / tot) * 0.5) }}>{c}</td>)}</tr>; })}</tbody></table>
        </div>
        <div className="ocard">
          <h2>Where they come from</h2>
          <p className="dek">Home state of the {P.length} players.</p>
          {states.slice(0, 10).map(([s, c]) => <div key={s} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 28px', gap: 8, alignItems: 'center', fontSize: 12, margin: '3px 0' }}><span>{s}</span><span style={{ height: 10, width: `${(c / states[0][1]) * 100}%`, background: s === 'TX' ? '#bf5700' : 'var(--o-other)', borderRadius: 2 }} /><b>{c}</b></div>)}
        </div>
      </section>
      <section className="ocard">
        <h2>The roster</h2>
        <Chips label="Group" items={[['offense', 'Offence'], ['defense', 'Defence'], ['specialTeam', 'Special teams']].map(([k, label]) => ({ k, label: `${label} (${P.filter(p => p.group === k).length})` }))} value={grp} set={setGrp} />
        <div style={{ overflowX: 'auto' }}>
          <table className="otable" style={{ fontSize: 12 }}>
            <thead><tr><th className="n">#</th><th>Player</th><th>Pos</th><th>Class</th><th className="n">Height</th><th className="n">Weight</th><th>Hometown</th></tr></thead>
            <tbody>{P.filter(p => p.group === grp).sort((a, b) => (a.pos ?? '').localeCompare(b.pos ?? '') || +(a.jersey ?? 99) - +(b.jersey ?? 99)).map(p => <tr key={p.espn}><td className="n">{p.jersey}</td><td style={{ whiteSpace: 'nowrap' }}><Face src={p.photo} />{p.name}</td><td>{p.pos}</td><td>{p.exp}</td><td className="n">{p.ht}</td><td className="n">{p.wt?.replace(' lbs', '')}</td><td>{p.from}</td></tr>)}</tbody>
          </table>
        </div>
        <Src>Source: ESPN roster</Src>
      </section>
    </>
  );
}

/* ───────────────────────────── Dodgers ───────────────────────────── */

const f3 = (v: number | null | undefined) => (v == null ? '–' : v.toFixed(3).replace(/^0/, ''));
const f2 = (v: number | null | undefined) => (v == null ? '–' : v.toFixed(2));

export function DodgersRoster({ r }: { r: RostersFile['dodgers'] }) {
  const P = r.players;
  const hitters = P.filter(p => p.hitting && p.hitting.pa >= 10).sort((a, b) => b.hitting!.pa - a.hitting!.pa);
  const pitchers = P.filter(p => p.pitching).sort((a, b) => b.pitching!.ip - a.pitching!.ip);
  const out = P.filter(p => p.status && p.status !== 'Active');
  const teamOps = hitters.reduce((a, p) => a + p.hitting!.ops * p.hitting!.pa, 0) / (hitters.reduce((a, p) => a + p.hitting!.pa, 0) || 1);
  return (
    <>
      <section className="s-two" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="ocard">
          <h2>The lineup</h2>
          <p className="dek">On-base plus slugging (OPS) against playing time, {r.season}. The team's OPS is {f3(teamOps)}; above .800 is a very good hitter.</p>
          <QuadrantScatter height={360} xLabel="Plate appearances" yLabel="OPS" fmtX={v => v.toFixed(0)} fmt={f3} corners={['Everyday stars', 'Good in a part-time role', 'Everyday, struggling', 'Bench']}
            points={hitters.map(p => ({ id: String(p.id), label: p.name.split(' ').slice(-1)[0], x: p.hitting!.pa, y: p.hitting!.ops, color: p.hitting!.ops >= 0.85 && p.hitting!.pa > 300 ? 'var(--o-accent)' : undefined, tip: <><div className="k">{p.name} · {p.pos}</div>{f3(p.hitting!.avg)}/{f3(p.hitting!.obp)}/{f3(p.hitting!.slg)} · {p.hitting!.hr} HR, {p.hitting!.rbi} RBI, {p.hitting!.sb} SB in {p.hitting!.pa} PA</> }))} />
        </div>
        <div className="ocard">
          <h2>The staff</h2>
          <p className="dek">Strikeouts against walks per nine innings: stuff against control. Top right misses bats and limits free passes.</p>
          <QuadrantScatter height={360} xLabel="Strikeouts per 9" yLabel="Walks per 9 (fewer ↑)" invertY fmt={v => v.toFixed(1)} corners={['Dominant', 'Control, little swing-and-miss', 'Power, wild', 'Hittable']}
            points={pitchers.filter(p => p.pitching!.ip >= 15).map(p => ({ id: String(p.id), label: p.name.split(' ').slice(-1)[0], x: p.pitching!.k9, y: p.pitching!.bb9, color: p.pitching!.gs >= 10 ? 'var(--o-accent)' : undefined, tip: <><div className="k">{p.name} · {p.pitching!.gs >= 5 ? 'starter' : 'reliever'}</div>{p.pitching!.ip} IP · ERA {f2(p.pitching!.era)} · WHIP {f2(p.pitching!.whip)} · {p.pitching!.so} K, {p.pitching!.bb} BB</> }))} />
          <p className="dek" style={{ fontSize: 11.5 }}>In blue: starters (10+ starts).</p>
        </div>
      </section>
      <section className="ocard">
        <h2>Hitting, {r.season}</h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="otable" style={{ fontSize: 12 }}>
            <thead><tr><th>Player</th><th>Pos</th><th className="n">G</th><th className="n">PA</th><th className="n">AVG</th><th className="n">OBP</th><th className="n">SLG</th><th className="n">OPS</th><th className="n">HR</th><th className="n">RBI</th><th className="n">R</th><th className="n">SB</th><th className="n">BB%</th><th className="n">K%</th></tr></thead>
            <tbody>{hitters.map(p => { const h = p.hitting!; return <tr key={p.id}><td style={{ whiteSpace: 'nowrap' }}><Face src={p.photo} />{p.name}</td><td>{p.pos}</td><td className="n">{h.g}</td><td className="n">{h.pa}</td><td className="n">{f3(h.avg)}</td><td className="n">{f3(h.obp)}</td><td className="n">{f3(h.slg)}</td><td className="n" style={{ fontWeight: 700 }}>{f3(h.ops)}</td><td className="n">{h.hr}</td><td className="n">{h.rbi}</td><td className="n">{h.r}</td><td className="n">{h.sb}</td><td className="n">{pc(h.bb / h.pa)}</td><td className="n">{pc(h.so / h.pa)}</td></tr>; })}</tbody>
          </table>
        </div>
        <Src>Source: MLB Stats API</Src>
      </section>
      <section className="ocard">
        <h2>Pitching, {r.season}</h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="otable" style={{ fontSize: 12 }}>
            <thead><tr><th>Pitcher</th><th className="n">T</th><th className="n">G</th><th className="n">GS</th><th className="n">IP</th><th className="n">W-L</th><th className="n">SV</th><th className="n">HLD</th><th className="n">ERA</th><th className="n">WHIP</th><th className="n">K/9</th><th className="n">BB/9</th><th className="n">Opp AVG</th></tr></thead>
            <tbody>{pitchers.map(p => { const q = p.pitching!; return <tr key={p.id}><td style={{ whiteSpace: 'nowrap' }}><Face src={p.photo} />{p.name}</td><td className="n">{p.throws}</td><td className="n">{q.g}</td><td className="n">{q.gs}</td><td className="n">{q.ip}</td><td className="n">{q.w}-{q.l}</td><td className="n">{q.sv || ''}</td><td className="n">{q.hld || ''}</td><td className="n" style={{ fontWeight: 700 }}>{f2(q.era)}</td><td className="n">{f2(q.whip)}</td><td className="n">{f2(q.k9)}</td><td className="n">{f2(q.bb9)}</td><td className="n">{f3(q.avg)}</td></tr>; })}</tbody>
          </table>
        </div>
        <Src>Source: MLB Stats API</Src>
      </section>
      <section className="s-two" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="ocard">
          <h2>The 40-man roster</h2>
          <table className="otable" style={{ fontSize: 12 }}>
            <thead><tr><th className="n">#</th><th>Player</th><th>Pos</th><th className="n">Age</th><th className="n">B/T</th><th>From</th><th>Debut</th></tr></thead>
            <tbody>{[...P].sort((a, b) => a.posType.localeCompare(b.posType) || a.name.localeCompare(b.name)).map(p => <tr key={p.id}><td className="n">{p.jersey}</td><td style={{ whiteSpace: 'nowrap' }}>{p.name}</td><td>{p.pos}</td><td className="n">{p.age}</td><td className="n">{p.bats}/{p.throws}</td><td>{p.from}</td><td>{p.debut?.slice(0, 4) ?? '–'}</td></tr>)}</tbody>
          </table>
          <Src>Source: MLB Stats API</Src>
        </div>
        <div className="ocard">
          <h2>How old is the team</h2>
          <AgeStrips groups={[['Pitcher', 'Pitchers'], ['Catcher', 'Catchers'], ['Infielder', 'Infielders'], ['Outfielder', 'Outfielders'], ['Two-Way Player', 'Two-way']].map(([k, label]) => ({ label, values: P.filter(p => p.posType === k && p.age).map(p => ({ v: p.age!, name: p.name })) })).filter(g => g.values.length)} />
          {out.length > 0 && <><div className="lab" style={{ marginTop: 12 }}>Not active</div>{out.map(p => <div key={p.id} style={{ fontSize: 12 }}>{p.name} <span style={{ color: 'var(--o-s2)' }}>{p.status}</span></div>)}</>}
        </div>
      </section>
    </>
  );
}

/* ───────────────────────────── Milan ───────────────────────────── */

const POS: [string, string][] = [['G', 'Goalkeepers'], ['D', 'Defenders'], ['M', 'Midfielders'], ['F', 'Forwards']];

export function MilanRoster({ r }: { r: RostersFile['milan'] }) {
  const P = r.players;
  const played = P.filter(p => p.xg && p.xg.min > 0);
  const totalMin = Math.max(1, ...played.map(p => p.xg!.min));
  const attackers = played.filter(p => p.xg!.shots > 0 || p.xg!.xa > 0.2);
  const nations = Object.entries(P.reduce<Record<string, number>>((a, p) => { const n = p.nation ?? '–'; a[n] = (a[n] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const st = (p: SoccerRosterPlayer, k: string) => p.stats?.[k] ?? null;
  return (
    <>
      <section className="s-two" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="ocard">
          <h2>Finishing</h2>
          <p className="dek">Serie A goals against expected goals (xG, the quality of the chances). Green: at least one goal more than the chances were worth; orange: at least one fewer.</p>
          <QuadrantScatter height={340} xLabel="Expected goals (xG)" yLabel="Goals" fmt={v => v.toFixed(1)} corners={['Scoring a lot', 'Clinical', 'Wasteful', 'Few chances']}
            points={attackers.map(p => ({ id: p.espn, label: p.short.split(' ').slice(-1)[0], x: p.xg!.xg, y: p.xg!.goals, color: p.xg!.goals - p.xg!.xg >= 1 ? 'var(--o-s3)' : p.xg!.xg - p.xg!.goals >= 1 ? 'var(--o-s2)' : undefined, tip: <><div className="k">{p.name}</div>{p.xg!.goals} goals from {p.xg!.xg.toFixed(2)} xG, {p.xg!.shots} shots · {p.xg!.assists} assists from {p.xg!.xa.toFixed(2)} xA</> }))} />
        </div>
        <div className="ocard">
          <h2>Who builds the attacks</h2>
          <p className="dek">xG chain: the expected goals of every possession a player touches. Build-up leaves out his own shots and key passes, so it shows who starts the moves.</p>
          {[...played].sort((a, b) => b.xg!.chain - a.xg!.chain).slice(0, 12).map(p => {
            const max = Math.max(...played.map(x => x.xg!.chain)) || 1;
            return <div key={p.espn} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 44px', gap: 8, alignItems: 'center', fontSize: 12, margin: '4px 0' }}>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><span style={{ color: 'var(--o-ink3)' }}>{p.pos}</span> {p.short}</span>
              <span style={{ position: 'relative', height: 12 }}><span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(p.xg!.chain / max) * 100}%`, background: 'color-mix(in srgb, #fb090b 35%, var(--o-card))', borderRadius: 2 }} /><span style={{ position: 'absolute', left: 0, top: 3, bottom: 3, width: `${(p.xg!.buildup / max) * 100}%`, background: '#fb090b', borderRadius: 2 }} /></span>
              <b style={{ textAlign: 'right' }}>{p.xg!.chain.toFixed(1)}</b>
            </div>;
          })}
          <div className="olegend" style={{ marginTop: 6 }}><span><i style={{ background: 'color-mix(in srgb, #fb090b 35%, var(--o-card))' }} />xG chain</span><span><i style={{ background: '#fb090b' }} />of which build-up</span></div>
        </div>
      </section>
      <section className="ocard">
        <h2>Squad profile</h2>
        <p className="dek">Age against Serie A minutes played. A squad in good shape has its regulars in the peak years, roughly 24 to 29.</p>
        <QuadrantScatter height={340} xLabel="Age" yLabel="Serie A minutes" fmt={v => v.toFixed(0)} corners={['Experienced regulars', 'Young regulars', 'Experienced, little used', 'Young, little used']}
          points={P.filter(p => p.age).map(p => ({ id: p.espn, label: p.short.split(' ').slice(-1)[0], x: p.age!, y: p.xg?.min ?? 0, color: (p.xg?.min ?? 0) > totalMin * 0.6 ? '#fb090b' : undefined, tip: <><div className="k">{p.name} · {p.pos}</div>{p.age} years · {p.nation} · {p.xg?.min ?? 0} minutes in {p.xg?.games ?? 0} games</> }))} />
      </section>
      <section className="ocard">
        <h2>The squad</h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="otable" style={{ fontSize: 12 }}>
            <thead><tr><th className="n">#</th><th>Player</th><th className="n">Age</th><th>Nation</th><th className="n">Apps</th><th className="n">Min</th><th className="n">Goals</th><th className="n">xG</th><th className="n">Assists</th><th className="n">xA</th><th className="n">Shots</th><th className="n">Key passes</th><th className="n">Cards</th><th className="n">Saves</th></tr></thead>
            <tbody>{POS.map(([k, label]) => (
              <Fragment key={k}>
                <tr><td colSpan={14} style={{ fontWeight: 700, background: 'var(--o-grid)' }}>{label}</td></tr>
                {P.filter(p => p.pos === k).sort((a, b) => (b.xg?.min ?? 0) - (a.xg?.min ?? 0)).map(p => (
                  <tr key={p.espn}><td className="n">{p.jersey}</td><td style={{ whiteSpace: 'nowrap' }}>{p.name}{p.injury && <small style={{ color: 'var(--o-s2)' }}> · {p.injury.status}</small>}</td><td className="n">{p.age}</td><td>{p.nation}</td>
                    <td className="n">{n0(st(p, 'appearances'))}{st(p, 'subIns') ? <small style={{ color: 'var(--o-ink3)' }}> ({st(p, 'subIns')})</small> : ''}</td><td className="n">{p.xg?.min ?? '–'}</td><td className="n">{n0(st(p, 'totalGoals'))}</td><td className="n">{p.xg ? p.xg.xg.toFixed(1) : '–'}</td><td className="n">{n0(st(p, 'goalAssists'))}</td><td className="n">{p.xg ? p.xg.xa.toFixed(1) : '–'}</td><td className="n">{n0(st(p, 'totalShots'))}</td><td className="n">{p.xg?.keyPasses ?? '–'}</td>
                    <td className="n">{st(p, 'yellowCards') || st(p, 'redCards') ? `${st(p, 'yellowCards') ?? 0}${st(p, 'redCards') ? `+${st(p, 'redCards')}R` : ''}` : ''}</td><td className="n">{k === 'G' ? n0(st(p, 'saves')) : ''}</td></tr>
                ))}
              </Fragment>
            ))}</tbody>
          </table>
        </div>
        <Src>Sources: ESPN (Serie A appearances, goals, cards), Understat (minutes, xG, xA, key passes)</Src>
      </section>
      <section className="s-two" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="ocard">
          <h2>How old is the squad</h2>
          <AgeStrips groups={POS.map(([k, label]) => ({ label, values: P.filter(p => p.pos === k && p.age).map(p => ({ v: p.age!, name: p.name })) }))} />
        </div>
        <div className="ocard">
          <h2>Nationalities</h2>
          <p className="dek">{nations.length} countries in a squad of {P.length}.</p>
          {nations.map(([n, c]) => <div key={n} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 24px', gap: 8, alignItems: 'center', fontSize: 12, margin: '2px 0' }}><span>{n}</span><span style={{ height: 9, width: `${(c / nations[0][1]) * 100}%`, background: n === 'Italy' ? '#fb090b' : 'var(--o-other)', borderRadius: 2 }} /><b>{c}</b></div>)}
        </div>
      </section>
    </>
  );
}

