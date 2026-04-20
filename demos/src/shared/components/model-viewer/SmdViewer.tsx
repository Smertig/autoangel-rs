import type { AutoangelModule } from '../../../types/autoangel';
import type { GetFile } from './internal/paths';
import { renderSmd } from './internal/render-smd';
import { useRenderEffect } from './internal/useRenderEffect';
import { ModelSurface } from './internal/ModelSurface';

interface SmdViewerProps {
  path: string;
  wasm: AutoangelModule;
  getData: GetFile;
  listFiles?: (prefix: string) => string[];
  initialClipName?: string;
}

export function SmdViewer({ path, wasm, getData, listFiles, initialClipName }: SmdViewerProps) {
  const { containerRef, error } = useRenderEffect(
    path,
    [path, wasm, getData],
    (container) => renderSmd(container, wasm, getData, path, { listFiles, initialClipName }),
  );
  return <ModelSurface containerRef={containerRef} error={error} />;
}
