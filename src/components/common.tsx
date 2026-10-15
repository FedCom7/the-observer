import { createContext, useContext, useState, type ReactNode } from 'react';
import { CATS, PASSION, catColor } from '../core/passions';
import type { ObsEvent, PassionId } from '../core/types';

// ---------- Spoiler shield ----------
const SpoilerCtx = createContext<{ on: boolean; toggle: () => void }>({ on: false, toggle: () => {} });

export function SpoilerProvider({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem('obs:spoiler') === '1'; } catch { return false; }
  });
  const toggle = () => setOn(v => {
    try { localStorage.setItem('obs:spoiler', v ? '0' : '1'); } catch { /* storage blocked */ }
    return !v;
  });
  return <SpoilerCtx.Provider value={{ on, toggle }}>{children}</SpoilerCtx.Provider>;
}

export const useSpoiler = () => useContext(SpoilerCtx);

/** A result that blurs while the shield is on; a click reveals just this one. */
export function Score({ children, className = '', as: Tag = 'span' }: { children: ReactNode; className?: string; as?: 'span' | 'b' | 'div' }) {
  const { on } = useSpoiler();
  const [shown, setShown] = useState(false);
  const hidden = on && !shown;
  return (
    <Tag
      className={`score ${className}`}
      style={hidden ? { filter: 'blur(6px)', cursor: 'pointer', userSelect: 'none' } : undefined}
      onClick={hidden ? e => { e.stopPropagation(); setShown(true); } : undefined}
      title={hidden ? 'Click to reveal' : undefined}
    >
      {children}
    </Tag>
  );
}

// ---------- Small labels ----------
export function Tag({ passion }: { passion: PassionId }) {
  const c = PASSION[passion].cat;
  return <span className="tag"><i style={{ background: catColor(c) }} />{CATS[c]}</span>;
}

export const Tbc = ({ e }: { e: Pick<ObsEvent, 'tbc'> }) => (e.tbc ? <span className="tbc" title="Date to be confirmed">TBC</span> : null);

export function scoreLine(e: ObsEvent): string {
  if (!e.home || !e.away) return e.sub ?? '';
  return `${e.away.abbr || e.away.name} ${e.away.score ?? ''} · ${e.home.abbr || e.home.name} ${e.home.score ?? ''}`;
}
