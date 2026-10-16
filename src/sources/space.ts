// People in orbit, as used by the control room. Launch Library is read by the
// collector (scripts/collect/space.mjs), not the browser, to respect its rate limit.
export interface InOrbit { total: number; byAgency: [string, number][]; names: string[] }
