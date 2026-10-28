import { useSearchParams } from 'react-router-dom';

/**
 * Screens of a section, kept in the address (?tab=power) so a screen can be
 * linked and survives a reload. The first tab is the section's home and has no parameter.
 */
export function useTab<K extends string>(tabs: readonly (readonly [K, string])[]): [K, (t: K) => void] {
  const [params, setParams] = useSearchParams();
  const home = tabs[0][0];
  const tab = tabs.find(([k]) => k === params.get('tab'))?.[0] ?? home;
  const set = (t: K) => setParams(p => { if (t === home) p.delete('tab'); else p.set('tab', t); p.delete('pick'); return p; }, { replace: true });
  return [tab, set];
}

/** A second-level choice inside a screen (a team, a week, a game), also kept in the address. */
export function usePick(name = 'pick'): [string | null, (v: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const set = (v: string | null) => setParams(p => { if (v == null) p.delete(name); else p.set(name, v); return p; }, { replace: true });
  return [params.get(name), set];
}

export function ScreenTabs<K extends string>({ tabs, tab, set, label }: { tabs: readonly (readonly [K, string])[]; tab: K; set: (t: K) => void; label: string }) {
  return (
    <nav className="ocard" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 12px', gridColumn: '1 / -1' }} aria-label={label}>
      {tabs.map(([k, name]) => <button key={k} className="btn" aria-pressed={tab === k} onClick={() => set(k)} style={{ color: 'var(--o-ink)', background: tab === k ? 'var(--o-accent-soft)' : 'transparent', borderColor: tab === k ? 'var(--o-accent)' : 'var(--o-line)', fontSize: 12.5, letterSpacing: '.04em' }}>{name}</button>)}
    </nav>
  );
}

/** A row of small toggle buttons (weeks, teams, metrics). */
export function Chips<T extends string | number>({ items, value, set, label }: { items: { k: T; label: string }[]; value: T; set: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', gap: 4, flexWrap: 'wrap', margin: '4px 0 12px' }}>
      {items.map(it => <button key={String(it.k)} className="btn" aria-pressed={value === it.k} onClick={() => set(it.k)} style={{ color: 'var(--o-ink)', background: value === it.k ? 'var(--o-accent-soft)' : 'transparent', borderColor: value === it.k ? 'var(--o-accent)' : 'var(--o-line)', fontSize: 11.5, padding: '3px 8px', textTransform: 'none', letterSpacing: 0 }}>{it.label}</button>)}
    </div>
  );
}
