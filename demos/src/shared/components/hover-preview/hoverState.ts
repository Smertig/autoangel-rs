const fetchCache = new Map<string, Promise<Uint8Array>>();

export function getCachedFetch(
  path: string,
  fetcher: () => Promise<Uint8Array>,
): Promise<Uint8Array> {
  const cached = fetchCache.get(path);
  if (cached) return cached;
  const p = fetcher();
  fetchCache.set(path, p);
  // Evict on rejection so a transient failure doesn't poison the cache.
  p.catch(() => fetchCache.delete(path));
  return p;
}

export function clearHoverCache(): void {
  fetchCache.clear();
}

type TargetId = symbol | null;
let active: TargetId = null;
const listeners = new Set<() => void>();

export function registerActive(id: TargetId): void {
  if (active === id) return;
  active = id;
  listeners.forEach(l => l());
}

export function isActive(id: TargetId): boolean {
  return active === id;
}

export function subscribeActive(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
