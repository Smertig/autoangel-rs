import { useCallback, type ComponentType } from 'react';
import type { ViewerContext, DifferContext } from './types';

// Stubs for callers that have no package index — diff view, single-file
// previews. Nested-reference resolution returns "nothing found" instead
// of crashing on a missing callback.
export const noListFiles = (): string[] => [];
export const noFindFile = (): string | null => null;

export function sideBySideDiffer(
  Viewer: ComponentType<ViewerContext>,
): ComponentType<DifferContext> {
  return function SideBySideDiffer({ path, ext, leftData, rightData, wasm }: DifferContext) {
    const getLeftData = useCallback(async () => leftData, [leftData]);
    const getRightData = useCallback(async () => rightData, [rightData]);
    return (
      <div style={{ display: 'flex', gap: '8px', height: '100%' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Viewer path={path} ext={ext} getData={getLeftData} wasm={wasm} listFiles={noListFiles} findFile={noFindFile} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Viewer path={path} ext={ext} getData={getRightData} wasm={wasm} listFiles={noListFiles} findFile={noFindFile} />
        </div>
      </div>
    );
  };
}
