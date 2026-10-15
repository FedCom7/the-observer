/**
 * JSON fetch with a localStorage cache. Free APIs have rate limits
 * (Launch Library allows 15 requests per hour), so every source declares
 * how long its data stays fresh and we reuse the cached copy until then.
 */
interface Cached { t: number; data: unknown }

const KEY = 'obs:cache:';

function readCache(url: string): Cached | null {
  try {
    const raw = localStorage.getItem(KEY + url);
    return raw ? (JSON.parse(raw) as Cached) : null;
  } catch {
    return null;
  }
}

function writeCache(url: string, data: unknown) {
  try {
    localStorage.setItem(KEY + url, JSON.stringify({ t: Date.now(), data }));
  } catch {
    // Quota exceeded or storage blocked: run without the cache.
  }
}

export async function getJSON<T>(url: string, ttlMs: number): Promise<T> {
  const cached = readCache(url);
  if (cached && Date.now() - cached.t < ttlMs) return cached.data as T;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = (await res.json()) as T;
    writeCache(url, data);
    return data;
  } catch (err) {
    // Network down or rate limited: fall back to stale data if we have it.
    if (cached) return cached.data as T;
    throw err;
  }
}
