import { useMemo, type ComponentType } from 'react';
import type { ViewerContext, DifferContext } from './types';
import { singleFileView } from '@shared/package';

export function sideBySideDiffer(
  Viewer: ComponentType<ViewerContext>,
): ComponentType<DifferContext> {
  return function SideBySideDiffer({ path, ext, leftData, rightData, wasm }: DifferContext) {
    const leftPkg = useMemo(() => singleFileView(path, leftData), [leftData, path]);
    const rightPkg = useMemo(() => singleFileView(path, rightData), [rightData, path]);
    return (
      <div style={{ display: 'flex', gap: '8px', height: '100%' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Viewer path={path} ext={ext} pkg={leftPkg} wasm={wasm} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Viewer path={path} ext={ext} pkg={rightPkg} wasm={wasm} />
        </div>
      </div>
    );
  };
}
