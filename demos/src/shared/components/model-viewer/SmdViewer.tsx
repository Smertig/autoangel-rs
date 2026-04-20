import type { AutoangelModule } from '../../../types/autoangel';
import type { GetFile } from './internal/paths';
import { renderSmd } from './internal/render-smd';
import { useRenderEffect } from './internal/useRenderEffect';
import styles from './ModelViewer.module.css';

const HIDDEN_STYLE: React.CSSProperties = { display: 'none' };

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
  return (
    <>
      {error && <div className={styles.modelError}>{error}</div>}
      <div ref={containerRef} className={styles.modelContainer} style={error ? HIDDEN_STYLE : undefined} />
    </>
  );
}
