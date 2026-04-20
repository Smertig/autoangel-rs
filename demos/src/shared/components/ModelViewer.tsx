import { useEffect, useRef, useState } from 'react';
import type { AutoangelModule } from '../../types/autoangel';
import { getExtension } from '@shared/util/files';
import styles from './model-viewer/ModelViewer.module.css';
import { type GetFile, withWarnOnThrow } from './model-viewer/internal/paths';
import { ensureThree, getThree } from './model-viewer/internal/three';
import { loadSkinFile } from './model-viewer/internal/mesh';
import { disposeViewer } from './model-viewer/internal/viewer';
import { mountScene } from './model-viewer/internal/scene';
import { renderEcm, renderSmd } from './model-viewer/internal/render-smd';

const HIDDEN_STYLE: React.CSSProperties = { display: 'none' };

interface ModelViewerProps {
  path: string;
  wasm: AutoangelModule;
  getData: (path: string) => Promise<Uint8Array | null>;
  listFiles?: (prefix: string) => string[];
  /**
   * The engine drives a GFX `Model` element with the clip named by its
   * `model_act_name`; without this we'd always start on the idle-hint
   * heuristic and the preview wouldn't match what actually plays in-game.
   * Unknown names fall back to the heuristic with a console warning.
   */
  initialClipName?: string;
}

async function renderSkin(
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

  if (group.children.length === 0) {
    throw new Error('No meshes could be built from skin file');
  }

  mountScene(container, group, stats, skiData, '.ski');
}

async function renderTrackSet(
  container: HTMLElement,
  wasm: AutoangelModule,
  getFileRaw: (path: string) => Promise<Uint8Array | null>,
  stckPath: string,
): Promise<void> {
  const data = await getFileRaw(stckPath);
  if (!data) throw new Error(`File not found: ${stckPath}`);
  using ts = wasm.TrackSet.parse(data);
  const fps = ts.animFps || 30;
  const duration = (ts.animEnd - ts.animStart) / fps;
  const div = document.createElement('div');
  div.style.cssText = 'padding: 16px; font-family: monospace; color: #ccc;';
  div.innerHTML = [
    '<h3 style="margin: 0 0 12px; color: #fff;">STCK Track Set</h3>',
    '<table style="border-collapse: collapse;">',
    `<tr><td style="padding: 2px 12px 2px 0; color: #888;">Version</td><td>${ts.version}</td></tr>`,
    `<tr><td style="padding: 2px 12px 2px 0; color: #888;">Frames</td><td>${ts.animStart} \u2013 ${ts.animEnd}</td></tr>`,
    `<tr><td style="padding: 2px 12px 2px 0; color: #888;">FPS</td><td>${fps}</td></tr>`,
    `<tr><td style="padding: 2px 12px 2px 0; color: #888;">Bone tracks</td><td>${ts.trackCount}</td></tr>`,
    `<tr><td style="padding: 2px 12px 2px 0; color: #888;">Duration</td><td>${duration.toFixed(2)}s</td></tr>`,
    '</table>',
  ].join('');
  container.replaceChildren(div);
}

// ── React Component ──

export function ModelViewer({ path, wasm, getData, listFiles, initialClipName }: ModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  // Track the current path to cancel stale loads
  const currentPathRef = useRef<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setError(null);
    currentPathRef.current = path;

    const ext = getExtension(path);
    const renderFn = ext === '.ecm'
      ? () => renderEcm(container, wasm, getData, path, { listFiles, initialClipName })
      : ext === '.smd'
      ? () => renderSmd(container, wasm, getData, path, { listFiles, initialClipName })
      : ext === '.stck'
      ? () => renderTrackSet(container, wasm, getData, path)
      : () => renderSkin(container, wasm, getData, path);

    renderFn().catch((e: unknown) => {
      // Only show error if this effect is still current
      if (currentPathRef.current !== path) return;
      console.error('[model] Preview failed:', e);
      // Clean up viewer on error
      disposeViewer();
      if (container) container.innerHTML = '';
      setError(`Model preview failed: ${e instanceof Error ? e.message : String(e)}`);
    });

    // No cleanup on path change — the persistent viewer pattern lets the
    // new render() paint over the old scene without a white flash.
    // Cleanup on component unmount is handled by a separate effect below.
    // `initialClipName` intentionally omitted: changing it alone shouldn't
    // trigger a full model re-download. The right fix (swap the live
    // mixer's clip in place) is a follow-up; until then, the clip applies
    // on the next path change, which covers every current caller.
  }, [path, wasm, getData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dispose viewer only on component unmount (not path change)
  useEffect(() => {
    return () => {
      disposeViewer();
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, []);

  return (
    <>
      {error && <div className={styles.modelError}>{error}</div>}
      <div ref={containerRef} className={styles.modelContainer} style={error ? HIDDEN_STYLE : undefined} />
    </>
  );
}
