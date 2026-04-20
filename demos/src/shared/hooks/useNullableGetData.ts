import { useCallback } from 'react';

/**
 * Wraps a throw-based getData into a null-returning form — the shape that
 * components reusing cross-package file access expect (e.g. the model
 * viewers). Cached via useCallback so downstream effects don't see a fresh
 * reference on every render.
 */
export function useNullableGetData(
  getData: (path: string) => Promise<Uint8Array>,
): (path: string) => Promise<Uint8Array | null> {
  return useCallback(
    async (p: string): Promise<Uint8Array | null> => {
      try { return await getData(p); }
      catch { return null; }
    },
    [getData],
  );
}
