import type { AutoangelModule } from '../../../types/autoangel';
import type { PackageView } from '@shared/package';
import { renderEcm } from './internal/render-smd';
import { useRenderEffect } from './internal/useRenderEffect';
import { ModelSurface } from './internal/ModelSurface';
import type { ModelStatePorts } from './state';

interface EcmViewerProps {
  path: string;
  wasm: AutoangelModule;
  pkg: PackageView;
  initialClipName?: string;
  onNavigateToFile?: (path: string) => void;
  state?: ModelStatePorts;
}

export function EcmViewer({
  path, wasm, pkg, initialClipName, onNavigateToFile, state,
}: EcmViewerProps) {
  const { containerRef, error } = useRenderEffect(
    path,
    [path, wasm, pkg],
    (container) => renderEcm(container, wasm, pkg, path, {
      initialClipName, onNavigateToFile, state,
    }),
  );
  return <ModelSurface containerRef={containerRef} error={error} />;
}
