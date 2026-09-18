// ============================================================
// SahakariSIP — Data-layer response cache
// ============================================================
// A small in-memory TTL cache for read queries. The dashboard pipeline
// (analytics over every entry) used to re-run on EVERY screen focus and
// keystroke; with the cache, tab switches and back-navigation serve the
// last computed result instantly and expire after 30s.
//
// Keys are scoped by mode + user id, and every mutation clears the cache,
// so results are never stale after a write.
// ============================================================

interface CacheEntry {
  value: unknown;
  expires: number;
}

const cache = new Map<string, CacheEntry>();

export const CACHE_TTL_MS = 30_000;

export function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function cacheSet(key: string, value: unknown, ttl = CACHE_TTL_MS): void {
  cache.set(key, { value, expires: Date.now() + ttl });
}

/** Clear the whole cache, or only entries whose key starts with `prefix`. */
export function cacheInvalidate(prefix?: string): void {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const k of Array.from(cache.keys())) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}
