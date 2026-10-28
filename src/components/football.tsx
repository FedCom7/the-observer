// American football diagrams: where a team throws and runs (on a sketch of the
// field), how its drives end. Cells are coloured by rank in the league.
import { Fragment } from 'react';
import { goodBad, goodBadInk, ordinal, ranks } from './power';

type Split = [number, number, number];
type SplitTeams = Record<string, { splits: { off: Record<string, Split>; def: Record<string, Split> } }>;
type Side = 'off' | 'def';

/** League rank (1 = best) of one team in one situation; for a defence, less EPA allowed is better. */
export function splitRank(teams: SplitTeams, side: Side, key: string, abbr: string, minPlays = 5) {
  const vals = Object.fromEntries(Object.entries(teams).map(([a, t]) => [a, (t.splits[side][key]?.[2] ?? 0) >= minPlays ? t.splits[side][key][0] : null]));
  const rk = ranks(vals, side === 'def')[abbr];
  const n = Object.values(vals).filter(v => v != null).length;
  return { rank: rk ?? null, n, p: rk ? 1 - (rk - 1) / Math.max(1, n - 1) : null };
}

const sgn = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}`;

function Cell({ teams, side, k, abbr, label, minPlays = 5 }: { teams: SplitTeams; side: Side; k: string; abbr: string; label?: string; minPlays?: number }) {
  const s = teams[abbr]?.splits[side][k];
  const { rank, n, p } = splitRank(teams, side, k, abbr, minPlays);
  const ok = s && s[2] >= minPlays;
  return (
    <div title={s ? `${s[2]} plays · EPA ${sgn(s[0])} · success ${Math.round(s[1] * 100)}%${rank ? ` · ${ordinal(rank)} of ${n}` : ''}` : 'No plays'}
      style={{ background: ok ? goodBad(p) : 'var(--o-grid)', color: ok ? goodBadInk(p) : 'var(--o-ink3)', borderRadius: 6, padding: '8px 4px', textAlign: 'center', fontFamily: 'var(--f-chart)', minWidth: 0 }}>
      {label && <div style={{ fontSize: 10, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>}
      <div style={{ fontSize: 15, fontWeight: 700 }}>{ok ? sgn(s[0]) : '–'}</div>
      <div style={{ fontSize: 10.5, opacity: 0.85 }}>{s ? `${s[2]} ${s[2] === 1 ? 'play' : 'plays'}` : '0 plays'}{ok && rank ? ` · ${ordinal(rank)}` : ''}</div>
    </div>
  );
}

/** Passing by direction and depth, drawn as the field seen from behind the quarterback. */
export function PassField({ teams, abbr, side }: { teams: SplitTeams; abbr: string; side: Side }) {
  const rows: [string, string][] = [['deep', 'Deep · 20+ yards'], ['mid', 'Intermediate · 10–19'], ['short', 'Short · under 10']];
  return (
    <div style={{ position: 'relative', background: 'color-mix(in srgb, var(--o-s3) 10%, var(--o-card))', border: '1px solid var(--o-line)', borderRadius: 10, padding: '10px 10px 6px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '92px repeat(3, minmax(0, 1fr))', gap: 6, alignItems: 'stretch' }}>
        <span />{['Left', 'Middle', 'Right'].map(c => <div key={c} className="lab" style={{ textAlign: 'center', margin: 0 }}>{c}</div>)}
        {rows.map(([k, label]) => <Fragment key={k}>
          <div style={{ fontSize: 11, color: 'var(--o-ink2)', alignSelf: 'center' }}>{label}</div>
          {['left', 'middle', 'right'].map(c => <Cell key={k + c} teams={teams} side={side} k={`pz_${c}_${k}`} abbr={abbr} minPlays={3} />)}
        </Fragment>)}
      </div>
      <div style={{ borderTop: '2px dashed var(--o-ink3)', margin: '8px 0 2px 98px', textAlign: 'center', fontSize: 10, color: 'var(--o-ink3)', paddingTop: 2 }}>line of scrimmage · quarterback</div>
    </div>
  );
}

/** Runs by gap, left to right along the offensive line. */
export function RunGaps({ teams, abbr, side }: { teams: SplitTeams; abbr: string; side: Side }) {
  const gaps: [string, string][] = [['run_left_end', 'Left end'], ['run_left_tackle', 'Left tackle'], ['run_left_guard', 'Left guard'], ['run_middle', 'Middle'], ['run_right_guard', 'Right guard'], ['run_right_tackle', 'Right tackle'], ['run_right_end', 'Right end']];
  return (
    <div style={{ background: 'color-mix(in srgb, var(--o-s3) 10%, var(--o-card))', border: '1px solid var(--o-line)', borderRadius: 10, padding: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 5 }}>
        {gaps.map(([k, label]) => <Cell key={k} teams={teams} side={side} k={k} abbr={abbr} label={label} minPlays={4} />)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 8, fontSize: 12, color: 'var(--o-ink3)' }} aria-hidden>
        {['LT', 'LG', 'C', 'RG', 'RT'].map(x => <span key={x} style={{ width: 26, height: 26, borderRadius: '50%', border: '1.5px solid var(--o-ink3)', display: 'grid', placeItems: 'center', fontSize: 9.5 }}>{x}</span>)}
      </div>
    </div>
  );
}

const ENDS: [string, string, string][] = [['td', 'Touchdown', 'var(--o-s3)'], ['fg', 'Field goal', 'var(--o-s4)'], ['punt', 'Punt', 'var(--o-other)'], ['to', 'Turnover', 'var(--o-s2)'], ['downs', 'On downs', 'color-mix(in srgb, var(--o-s2) 55%, var(--o-card))'], ['missed', 'Missed FG', 'color-mix(in srgb, var(--o-s4) 45%, var(--o-card))'], ['half', 'End of half', 'var(--o-grid)']];

/** How drives end, as 100% bars: the team against the league average. */
export function DriveEnds({ rows }: { rows: { label: string; end: Record<string, number>; bold?: boolean; note?: string }[] }) {
  return (
    <div>
      <div className="olegend">{ENDS.map(([, l, c]) => <span key={l}><i style={{ background: c }} />{l}</span>)}</div>
      {rows.map(r => (
        <div key={r.label} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10, alignItems: 'center', margin: '6px 0' }}>
          <div style={{ fontSize: 12, fontWeight: r.bold ? 700 : 400 }}>{r.label}{r.note && <div style={{ fontSize: 10.5, color: 'var(--o-ink3)', fontWeight: 400 }}>{r.note}</div>}</div>
          <div style={{ display: 'flex', height: 22, borderRadius: 4, overflow: 'hidden' }}>
            {ENDS.map(([k, l, c]) => (r.end[k] ?? 0) > 0 && (
              <div key={k} title={`${l}: ${Math.round((r.end[k] ?? 0) * 100)}%`} style={{ width: `${(r.end[k] ?? 0) * 100}%`, background: c, color: k === 'td' || k === 'to' ? '#fff' : 'var(--o-ink)', fontSize: 10.5, fontWeight: 600, display: 'grid', placeItems: 'center', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {(r.end[k] ?? 0) >= 0.08 ? `${Math.round(r.end[k] * 100)}%` : ''}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
