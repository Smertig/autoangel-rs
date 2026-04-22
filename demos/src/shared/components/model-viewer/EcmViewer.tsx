import type { AutoangelModule } from '../../../types/autoangel';
import type { GetFile } from './internal/paths';
import { renderEcm } from './internal/render-smd';
import { useRenderEffect } from './internal/useRenderEffect';
import { ModelSurface } from './internal/ModelSurface';
import type { FindFile } from '../gfx/util/resolveEnginePath';

interface EcmViewerProps {
  path: string;
  wasm: AutoangelModule;
  getData: GetFile;
  listFiles: (prefix: string) => string[];
  findFile: FindFile;
  initialClipName?: string;
}

export function EcmViewer({ path, wasm, getData, listFiles, findFile, initialClipName }: EcmViewerProps) {
  const { containerRef, error } = useRenderEffect(
    path,
    [path, wasm, getData],
    (container) => renderEcm(container, wasm, getData, path, { listFiles, findFile, initialClipName }),
  );
  return <ModelSurface containerRef={containerRef} error={error} />;
}
