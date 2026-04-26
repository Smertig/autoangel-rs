import type { AutoangelModule } from '../../../types/autoangel';
import type { GetFile } from './internal/paths';
import { renderEcm } from './internal/render-smd';
import { useRenderEffect } from './internal/useRenderEffect';
import { ModelSurface } from './internal/ModelSurface';
import type { FindFile } from '../gfx/util/resolveEnginePath';
import type { ModelStatePorts } from './state';

interface EcmViewerProps {
  path: string;
  wasm: AutoangelModule;
  getData: GetFile;
  listFiles: (prefix: string) => string[];
  findFile: FindFile;
  initialClipName?: string;
  onNavigateToFile?: (path: string) => void;
  state?: ModelStatePorts;
}

export function EcmViewer({
  path, wasm, getData, listFiles, findFile, initialClipName, onNavigateToFile, state,
}: EcmViewerProps) {
  const { containerRef, error } = useRenderEffect(
    path,
    [path, wasm, getData],
    (container) => renderEcm(container, wasm, getData, path, {
      listFiles, findFile, initialClipName, onNavigateToFile, state,
    }),
  );
  return <ModelSurface containerRef={containerRef} error={error} />;
}
