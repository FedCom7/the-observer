import { useSyncExternalStore } from 'react';
import type { CyTab } from '../sources/cycling';

/** Which cycling screen is open and which race it is on: shared by the page and the map above it. */
interface CyView { tab: CyTab | null; pick: string | null; year: number | null }
// ?cy=monument opens that screen straight away, ?cy=grand&race=<UCI id> one Grand Tour
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
let view: CyView = { tab: (params?.get('cy') ?? null) as CyTab | null, pick: params?.get('race') ?? null, year: null };
const subs = new Set<() => void>();

export const useCyView = () => useSyncExternalStore(cb => { subs.add(cb); return () => { subs.delete(cb); }; }, () => view);
export const setCyView = (p: Partial<CyView>) => { view = { ...view, ...p }; subs.forEach(f => f()); };
