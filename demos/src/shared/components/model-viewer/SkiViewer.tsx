import type { AutoangelModule } from '../../../types/autoangel';
import type { GetFile } from './internal/paths';
import { ensureThree, getThree } from './internal/three';
import { loadSkinFile } from './internal/mesh';
import { mountScene } from './internal/scene';
import { withWarnOnThrow } from './internal/paths';
import { useRenderEffect } from './internal/useRenderEffect';
import styles from './ModelViewer.module.css';

const HIDDEN_STYLE: React.CSSProperties = { display: 'none' };

async function renderSki(
  container: HTMLElement,
  wasm: AutoangelModule,
  getFileRaw: GetFile,
  skiPath: string,
): Promise<void> {
  await ensureThree();
  const getFile = withWarnOnThrow(getFileRaw);
  const skiData = await getFile(skiPath);
  if (!skiData) throw new Error(`File not found: ${skiPath}`);
  const { THREE } = getThree();
  const group = new THREE.Group();
  const { meshes, stats } = await loadSkinFile(wasm, getFile, skiPath, skiData);
  for (const m of meshes) group.add(m);
  if (group.children.length === 0) throw new Error('No meshes could be built from skin file');
  mountScene(container, group, stats, skiData, '.ski');
}

interface SkiViewerProps {
  path: string;
  wasm: AutoangelModule;
  getData: GetFile;
}

export function SkiViewer({ path, wasm, getData }: SkiViewerProps) {
  const { containerRef, error } = useRenderEffect(
    path,
    [path, wasm, getData],
    (container) => renderSki(container, wasm, getData, path),
  );
  return (
    <>
      {error && <div className={styles.modelError}>{error}</div>}
      <div ref={containerRef} className={styles.modelContainer} style={error ? HIDDEN_STYLE : undefined} />
    </>
  );
}
