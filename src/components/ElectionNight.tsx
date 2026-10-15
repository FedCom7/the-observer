import { ELECTION_NIGHT, pollsClose, type Race } from '../core/elections';
import { countdown, hhmm } from '../core/time';
import { Score } from './common';

type Variant = 'room' | 'sheet';

const T = {
  room: { ink: 'var(--ink)', ink3: 'var(--ink-3)', line: 'var(--grid)', dem: 'var(--dem)', rep: 'var(--rep)', track: 'var(--grid)', font: 'var(--f-mono)' },
  sheet: { ink: 'var(--o-ink)', ink3: 'var(--o-ink3)', line: 'var(--o-line)', dem: 'var(--o-dem)', rep: 'var(--o-rep)', track: 'var(--o-grid)', font: 'var(--f-chart)' },
};

export const isElectionNight = (now: number) => now >= ELECTION_NIGHT.from && now < ELECTION_NIGHT.to;
export const hasResults = (races: Race[]) => races.some(r => r.results?.sides.some(s => s.pct));

/**
 * One row per battleground: when its polls close (Rome time), then the vote
 * share as results arrive, with a check mark once Wikipedia records a winner.
 */
export function ElectionNight({ races, now, variant }: { races: Race[]; now: number; variant: Variant }) {
  const t = T[variant];
  const rows = races
    .map(r => ({ r, close: pollsClose(r.state) ?? Infinity }))
    .sort((a, b) => a.close - b.close || a.r.state.localeCompare(b.r.state));
  return (
    <div style={{ display: 'grid', fontFamily: t.font, fontSize: variant === 'room' ? 11.5 : 13 }}>
      {rows.map(({ r, close }) => {
        const res = r.results;
        const d = res?.sides.find(s => s.party === 'D') ?? res?.sides.find(s => s.party === 'I');
        const rep = res?.sides.find(s => s.party === 'R');
        const counted = Boolean(d?.pct || rep?.pct);
        const status = res?.winner
          ? `Winner: ${res.winner}`
          : counted ? 'Counting' : now >= close ? 'Polls closed · awaiting results' : `Polls close ${hhmm(close)}${now > ELECTION_NIGHT.from ? ` · in ${countdown(close - now)}` : ''}`;
        const dWin = res?.winner && d?.name && res.winner.includes(d.name.split(' ').pop() ?? '#');
        const rWin = res?.winner && rep?.name && res.winner.includes(rep.name.split(' ').pop() ?? '#');
        return (
          <div key={r.state + r.special} style={{ display: 'grid', gridTemplateColumns: variant === 'room' ? '92px 1fr' : '150px 1fr', gap: 10, padding: variant === 'room' ? '5px 0' : '9px 0', borderTop: `1px solid ${t.line}`, alignItems: 'center' }}>
            <div>
              <div style={{ color: t.ink, fontWeight: 600 }}>{r.state}</div>
              {variant === 'sheet' && <div style={{ color: t.ink3, fontSize: 11 }}>{r.dem ?? '—'} vs {r.rep ?? '—'}</div>}
            </div>
            <div style={{ minWidth: 0 }}>
              {counted ? (
                <>
                  <div style={{ display: 'flex', height: variant === 'room' ? 8 : 12, gap: 2, borderRadius: 3, overflow: 'hidden', background: t.track }}>
                    <div style={{ width: `${d?.pct ?? 0}%`, background: t.dem }} />
                    <div style={{ flex: 1 }} />
                    <div style={{ width: `${rep?.pct ?? 0}%`, background: t.rep }} />
                  </div>
                  <Score as="div">
                    <span style={{ display: 'flex', justifyContent: 'space-between', color: t.ink, marginTop: 3 }}>
                      <span>{dWin ? '✓ ' : ''}{d?.pct?.toFixed(1)}%{variant === 'sheet' && d?.votes ? ` · ${d.votes.toLocaleString('en-US')}` : ''}</span>
                      <span>{variant === 'sheet' && rep?.votes ? `${rep.votes.toLocaleString('en-US')} · ` : ''}{rep?.pct?.toFixed(1)}%{rWin ? ' ✓' : ''}</span>
                    </span>
                  </Score>
                </>
              ) : null}
              <div style={{ color: res?.winner ? t.ink : t.ink3, fontSize: 11, marginTop: counted ? 1 : 0 }}>
                {res?.winner ? <Score>{status}</Score> : status}
                {res?.url && variant === 'sheet' && <> · <a href={res.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>source</a></>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
