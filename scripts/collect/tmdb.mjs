// TMDB (themoviedb.org): posters, details and cast of the season's films, photos of the
// actors and directors. The key stays on the collector's side (.env locally, a GitHub
// secret online); the data files keep only the image paths, served by image.tmdb.org.
const API = 'https://api.themoviedb.org/3';

/** Comparable form of a title or a name (same rule as the page). */
export const tkey = s => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function tmdbKey() {
  return (process.env.TMDB_KEY ?? '').trim() || null;
}

async function api(key, path, params = {}) {
  const v4 = key.startsWith('eyJ');
  const q = new URLSearchParams({ ...params, ...(v4 ? {} : { api_key: key }) });
  const res = await fetch(`${API}${path}?${q}`, { headers: { Accept: 'application/json', ...(v4 ? { Authorization: `Bearer ${key}` } : {}) } });
  if (res.status === 429) { await new Promise(r => setTimeout(r, 2000)); return api(key, path, params); }
  if (!res.ok) throw new Error(`TMDB ${res.status} ${path}`);
  return res.json();
}

const FRESH = 14 * 86400e3;

/** Film details by title (and the season's years), cached between runs. */
export async function films(key, wanted, prev = {}, budget = 150) {
  const out = { ...prev };
  let used = 0;
  for (const { title, years } of wanted) {
    const k = tkey(title);
    if (!k || (out[k] && Date.now() - Date.parse(out[k].at) < FRESH) || used >= budget) continue;
    used++;
    try {
      let hit = null;
      for (const y of [...years, null]) {
        const j = await api(key, '/search/movie', { query: title, include_adult: 'false', ...(y ? { year: String(y) } : {}) });
        const res = j.results ?? [];
        hit = res.find(r => tkey(r.title) === k || tkey(r.original_title) === k) ?? (y ? null : res[0]);
        if (hit) break;
      }
      if (!hit) { out[k] = { at: new Date().toISOString(), missing: true }; continue; }
      const d = await api(key, `/movie/${hit.id}`, { append_to_response: 'credits' });
      out[k] = {
        at: new Date().toISOString(), id: d.id, title: d.title, original: d.original_title !== d.title ? d.original_title : null,
        release: d.release_date || null, runtime: d.runtime || null, genres: (d.genres ?? []).map(g => g.name), overview: d.overview || null,
        poster: d.poster_path ?? null, backdrop: d.backdrop_path ?? null, countries: (d.production_countries ?? []).map(c => c.iso_3166_1),
        director: (d.credits?.crew ?? []).filter(c => c.job === 'Director').map(c => c.name).join(', ') || null,
        cast: (d.credits?.cast ?? []).slice(0, 6).map(c => ({ name: c.name, role: c.character, photo: c.profile_path ?? null })),
      };
    } catch (err) { if (!out[k]) out[k] = { at: new Date().toISOString(), missing: true, error: err.message.slice(0, 60) }; }
  }
  return out;
}

/** Photos of people (actors, directors), cached between runs. */
export async function people(key, names, prev = {}, budget = 150) {
  const out = { ...prev };
  let used = 0;
  for (const name of names) {
    const k = tkey(name);
    if (!k || (out[k] && Date.now() - Date.parse(out[k].at) < FRESH) || used >= budget) continue;
    used++;
    try {
      const j = await api(key, '/search/person', { query: name, include_adult: 'false' });
      const p = (j.results ?? []).find(r => tkey(r.name) === k) ?? (j.results ?? [])[0];
      out[k] = p ? { at: new Date().toISOString(), id: p.id, name: p.name, photo: p.profile_path ?? null, dept: p.known_for_department ?? null } : { at: new Date().toISOString(), missing: true };
    } catch { if (!out[k]) out[k] = { at: new Date().toISOString(), missing: true }; }
  }
  return out;
}
