import type { AutoangelModule } from '../../../types/autoangel';
import type { PackageView } from '@shared/package';
import { ensureThree, getThree } from './internal/three';
import { loadSkinFile } from './internal/mesh';
import { mountScene } from './internal/scene';
import { useRenderEffect } from './internal/useRenderEffect';
import { ModelSurface } from './internal/ModelSurface';

async function renderSki(
  container: HTMLElement,
  wasm: AutoangelModule,
  pkg: PackageView,
  skiPath: string,
): Promise<void> {
  await ensureThree();
  const skiData = await pkg.read(skiPath);
  if (!skiData) throw new Error(`File not found: ${skiPath}`);
  const { THREE } = getThree();
  const group = new THREE.Group();
  const { meshes, stats } = await loadSkinFile(wasm, pkg, skiPath, skiData);
  for (const m of meshes) group.add(m);
  if (group.children.length === 0) throw new Error('No meshes could be built from skin file');
  mountScene(container, group, stats, skiData, '.ski');
}

interface SkiViewerProps {
  path: string;
  wasm: AutoangelModule;
  pkg: PackageView;
}

export function SkiViewer({ path, wasm, pkg }: SkiViewerProps) {
  const { containerRef, error } = useRenderEffect(
    path,
    [path, wasm, pkg],
    (container) => renderSki(container, wasm, pkg, path),
  );
  return <ModelSurface containerRef={containerRef} error={error} />;
}
