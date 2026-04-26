import type { AutoangelModule } from '../../../types/autoangel';
import type { GetFile } from './internal/paths';
import { renderSmd } from './internal/render-smd';
import { useRenderEffect } from './internal/useRenderEffect';
import { ModelSurface } from './internal/ModelSurface';
import type { FindFile } from '../gfx/util/resolveEnginePath';
import type { ModelStatePorts } from './state';

interface SmdViewerProps {
  path: string;
  wasm: AutoangelModule;
  getData: GetFile;
  listFiles: (prefix: string) => string[];
  findFile: FindFile;
  initialClipName?: string;
  state?: ModelStatePorts;
}

export function SmdViewer({
  path, wasm, getData, listFiles, findFile, initialClipName, state,
}: SmdViewerProps) {
  const { containerRef, error } = useRenderEffect(
    path,
    [path, wasm, getData],
    (container) => renderSmd(container, wasm, getData, path, {
      listFiles, findFile, initialClipName, state,
    }),
  );
  return <ModelSurface containerRef={containerRef} error={error} />;
}
