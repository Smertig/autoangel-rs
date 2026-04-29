import type { AutoangelModule } from '../../../types/autoangel';
import type { PackageView } from '@shared/package';
import { renderSmd } from './internal/render-smd';
import { useRenderEffect } from './internal/useRenderEffect';
import { ModelSurface } from './internal/ModelSurface';
import type { ModelStatePorts } from './state';

interface SmdViewerProps {
  path: string;
  wasm: AutoangelModule;
  pkg: PackageView;
  initialClipName?: string;
  state?: ModelStatePorts;
}

export function SmdViewer({
  path, wasm, pkg, initialClipName, state,
}: SmdViewerProps) {
  const { containerRef, error } = useRenderEffect(
    path,
    [path, wasm, pkg],
    (container) => renderSmd(container, wasm, pkg, path, {
      initialClipName, state,
    }),
  );
  return <ModelSurface containerRef={containerRef} error={error} />;
}
