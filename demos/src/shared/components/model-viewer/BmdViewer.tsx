import type { AutoangelModule } from '../../../types/autoangel';
import type { PackageView } from '@shared/package';
import { renderBmd } from './internal/render-bmd';
import { useRenderEffect } from './internal/useRenderEffect';
import { ModelSurface } from './internal/ModelSurface';

interface BmdViewerProps {
  path: string;
  wasm: AutoangelModule;
  pkg: PackageView;
}

export function BmdViewer({ path, wasm, pkg }: BmdViewerProps) {
  const { containerRef, error } = useRenderEffect(
    path,
    [path, wasm, pkg],
    async (container) => {
      const data = await pkg.read(path);
      if (!data) throw new Error(`BMD file not found: ${path}`);
      await renderBmd(container, wasm, pkg, data);
    },
  );
  return <ModelSurface containerRef={containerRef} error={error} />;
}
