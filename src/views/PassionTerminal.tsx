import { useEffect, useLayoutEffect, useRef } from 'react';
import { Theatre } from '../components/Theatre';
import type { PassionId } from '../core/types';
import { PassionBody } from './PassionSheet';

/** Passions whose events happen in many places: the terminal keeps the map for them. */
const MAP_PASSIONS: Partial<Record<PassionId, 'atl' | 'world'>> = { space: 'world', wec: 'world', dakar: 'world', cicl: 'atl', sci: 'atl', royal: 'world', f1: 'world' };

/**
 * One passion in the terminal: the same information as its page, laid out as dark panels
 * under the top bar (the map on top where the passion needs one).
 */
export function PassionTerminal({ id, open }: { id: PassionId; open: (p: PassionId) => void }) {
  useEffect(() => { window.scrollTo({ top: 0 }); }, [id]);
  const body = useMasonry(id);
  const map = MAP_PASSIONS[id];
  return (
    <div className="term">
      {map && <section className="panel map term-map"><Theatre key={id} open={open} only={id} initial={map} /></section>}
      <div className="obs term-body" ref={body}>
        <PassionBody id={id} />
      </div>
    </div>
  );
}

/**
 * Mosaic layout: the grid has 4 px rows and each panel spans as many as its height needs,
 * so tall panels do not leave holes next to them (CSS masonry is not available yet).
 */
function useMasonry(key: string) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const items = () => [...el.querySelectorAll<HTMLElement>('.ocard, .s-hero')].filter(x => !x.parentElement?.closest('.ocard'));
    const fit = (x: HTMLElement) => { x.style.gridRowEnd = `span ${Math.ceil((x.getBoundingClientRect().height + 8) / 4)}`; };
    const ro = new ResizeObserver(entries => entries.forEach(e => fit(e.target as HTMLElement)));
    const watch = () => items().forEach(x => { fit(x); ro.observe(x); });
    watch();
    // Pages render more panels once their data arrives
    const mo = new MutationObserver(watch);
    mo.observe(el, { childList: true, subtree: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [key]);
  return ref;
}
