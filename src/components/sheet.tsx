// Building blocks shared by the passion pages.
import type { ReactNode } from 'react';
import { CATS, PASSION } from '../core/passions';
import { dayShort, hhmm, isNight } from '../core/time';
import type { ObsEvent, PassionId } from '../core/types';
import { Tbc } from './common';

export const ocol = (id: PassionId) => `var(--oc-${PASSION[id].cat})`;

export function Hero({ id, dek }: { id: PassionId; dek: ReactNode }) {
  const p = PASSION[id];
  return (
    <header className="s-hero">
      <div className="s-eyebrow"><i style={{ background: ocol(id) }} />{CATS[p.cat]}</div>
      <h1 id="sheetTitle">{p.name}</h1>
      <p>{dek}</p>
    </header>
  );
}

export function Row({ e, right, past }: { e: ObsEvent; right: ReactNode; past?: boolean }) {
  return (
    <div className={`r${past ? ' past' : ''}`}>
      <time>{dayShort(e.start)}<small>{e.approx ? '≈ ' : ''}{hhmm(e.start)}{isNight(e.start) ? ' · night' : ''}</small></time>
      <div><b>{e.title}</b><Tbc e={e} />{(e.sub || e.tv) && <small>{[e.sub, e.tv].filter(Boolean).join(' · ')}</small>}{!e.espn && e.link && <small><a href={e.link} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Source</a></small>}</div>
      <span className="x">{right}</span>
    </div>
  );
}
