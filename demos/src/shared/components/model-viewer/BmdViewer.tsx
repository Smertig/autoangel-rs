import type { AutoangelModule } from '../../../types/autoangel';
import type { GetFile } from './internal/paths';
import { renderBmd } from './internal/render-bmd';
import { useRenderEffect } from './internal/useRenderEffect';
import { ModelSurface } from './internal/ModelSurface';

interface BmdViewerProps {
  path: string;
  wasm: AutoangelModule;
  getData: GetFile;
}

export function BmdViewer({ path, wasm, getData }: BmdViewerProps) {
  const { containerRef, error } = useRenderEffect(
    path,
    [path, wasm, getData],
    async (container) => {
      const data = await getData(path);
      if (!data) throw new Error(`BMD file not found: ${path}`);
      await renderBmd(container, wasm, getData, data);
    },
  );
  return <ModelSurface containerRef={containerRef} error={error} />;
}
