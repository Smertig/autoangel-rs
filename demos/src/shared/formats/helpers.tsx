import { useCallback, type ComponentType } from 'react';
import type { ViewerContext, DifferContext } from './types';

/**
 * Wraps a throw-based getData into a null-returning form, matching the
 * signature model/stck viewers expect. Caches the wrapper via useCallback
 * so the downstream useEffect doesn't see a fresh function on every render.
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

export function sideBySideDiffer(
  Viewer: ComponentType<ViewerContext>,
): ComponentType<DifferContext> {
  return function SideBySideDiffer({ path, ext, leftData, rightData, wasm }: DifferContext) {
    const getLeftData = useCallback(async () => leftData, [leftData]);
    const getRightData = useCallback(async () => rightData, [rightData]);
    return (
      <div style={{ display: 'flex', gap: '8px', height: '100%' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Viewer path={path} ext={ext} getData={getLeftData} wasm={wasm} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Viewer path={path} ext={ext} getData={getRightData} wasm={wasm} />
        </div>
      </div>
    );
  };
}
