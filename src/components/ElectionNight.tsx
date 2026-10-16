import { ELECTION_NIGHT, RESULTS_WINDOW, fmtMargin, pollsClose, STATE_NAME, type ModelRace } from '../core/elections';
import { countdown, hhmm } from '../core/time';
import type { LiveData, LiveRace } from '../sources/electionsLive';
import { Score } from './common';

type Variant = 'room' | 'sheet';

const T = {
  room: { ink: 'var(--ink)', ink3: 'var(--ink-3)', line: 'var(--grid)', dem: 'var(--dem)', rep: 'var(--rep)', ind: 'var(--c-tech)', track: 'var(--grid)', font: 'var(--f-mono)' },
  sheet: { ink: 'var(--o-ink)', ink3: 'var(--o-ink3)', line: 'var(--o-line)', dem: 'var(--o-dem)', rep: 'var(--o-rep)', ind: 'var(--oc-tech)', track: 'var(--o-grid)', font: 'var(--f-chart)' },
};

export const isElectionNight = (now: number) => now >= ELECTION_NIGHT.from && now < ELECTION_NIGHT.to;
export const inResultsWindow = (now: number) => now >= RESULTS_WINDOW.from && now < RESULTS_WINDOW.to;
export const hasResults = (live?: LiveData | null) => Boolean(live && [...live.senate, ...live.house, ...live.governor].some(r => r.reporting > 0));

/** Model races joined with their live results, by state (and district for the House). */
export function joinLive(model: ModelRace[], live: LiveRace[] | undefined) {
  return model.map(m => ({ m, r: live?.find(l => l.st === m.st && (m.office !== 'house' || l.district === (m.district ?? 0))) }));
}

/**
 * One row per race, in poll-closing order: when its polls close (Rome time), the
 * forecast margin before results, then the vote shares and the call.
 */
export function ElectionNight({ rows, now, variant }: { rows: { m: ModelRace; r?: LiveRace }[]; now: number; variant: Variant }) {
  const t = T[variant];
  const sorted = rows.map(x => ({ ...x, close: pollsClose(x.m.st) ?? Infinity })).sort((a, b) => a.close - b.close || a.m.state.localeCompare(b.m.state));
  return (
    <div style={{ display: 'grid', fontFamily: t.font, fontSize: variant === 'room' ? 11.5 : 13 }}>
      {sorted.map(({ m, r, close }) => {
        const dem = r?.cands.find(c => c.party === 'D') ?? r?.cands.find(c => c.party === 'I');
        const rep = r?.cands.find(c => c.party === 'R');
        const counted = Boolean(r && r.reporting > 0 && (dem?.pct || rep?.pct));
        const status = r?.winnerName
          ? `Called: ${r.winnerName}`
          : counted ? `Counting · ${Math.round(r!.reporting)}% in` : now >= close ? 'Polls closed · awaiting results' : `Polls close ${hhmm(close)}${now > ELECTION_NIGHT.from ? ` · in ${countdown(close - now)}` : ''} · forecast ${fmtMargin(m.margin)}`;
        const dCol = dem?.party === 'I' ? t.ind : t.dem;
        return (
          <div key={m.id} style={{ display: 'grid', gridTemplateColumns: variant === 'room' ? '92px 1fr' : '150px 1fr', gap: 10, padding: variant === 'room' ? '5px 0' : '9px 0', borderTop: `1px solid ${t.line}`, alignItems: 'center' }}>
            <div>
              <div style={{ color: t.ink, fontWeight: 600 }}>{variant === 'room' ? STATE_NAME[m.st] : m.name.replace(/ Senate| Governor/, '')}</div>
              {variant === 'sheet' && <div style={{ color: t.ink3, fontSize: 11 }}>{m.dem} vs {m.gop}</div>}
            </div>
            <div style={{ minWidth: 0 }}>
              {counted ? (
                <>
                  <div style={{ display: 'flex', height: variant === 'room' ? 8 : 12, gap: 2, borderRadius: 3, overflow: 'hidden', background: t.track }}>
                    <div style={{ width: `${dem?.pct ?? 0}%`, background: dCol }} />
                    <div style={{ flex: 1 }} />
                    <div style={{ width: `${rep?.pct ?? 0}%`, background: t.rep }} />
                  </div>
                  <Score as="div">
                    <span style={{ display: 'flex', justifyContent: 'space-between', color: t.ink, marginTop: 3 }}>
                      <span>{dem?.winner ? '✓ ' : ''}{dem?.pct.toFixed(1)}%{variant === 'sheet' && dem ? ` · ${dem.votes.toLocaleString('en-US')}` : ''}</span>
                      <span>{variant === 'sheet' && rep ? `${rep.votes.toLocaleString('en-US')} · ` : ''}{rep?.pct.toFixed(1)}%{rep?.winner ? ' ✓' : ''}</span>
                    </span>
                  </Score>
                </>
              ) : null}
              <div style={{ color: r?.winnerName ? t.ink : t.ink3, fontSize: 11, marginTop: counted ? 1 : 0 }}>
                {r?.winnerName ? <Score>{status}</Score> : status}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
