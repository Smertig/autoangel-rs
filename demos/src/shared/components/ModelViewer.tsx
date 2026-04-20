import { useEffect, useState } from 'react';
import type { AutoangelModule } from '../../types/autoangel';
import { getExtension } from '@shared/util/files';
import { EcmViewer, SmdViewer, SkiViewer } from './model-viewer';
import { StckViewer } from './StckViewer';
import type { GetFile } from './model-viewer/internal/paths';

interface ModelViewerProps {
  path: string;
  wasm: AutoangelModule;
  getData: GetFile;
  listFiles?: (prefix: string) => string[];
  /**
   * The engine drives a GFX `Model` element with the clip named by its
   * `model_act_name`; without this we'd always start on the idle-hint
   * heuristic and the preview wouldn't match what actually plays in-game.
   * Unknown names fall back to the heuristic with a console warning.
   */
  initialClipName?: string;
}

function StckFetchWrapper({ path, wasm, getData }: { path: string; wasm: AutoangelModule; getData: GetFile }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; data: Uint8Array }>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    getData(path)
      .then((data) => {
        if (cancelled) return;
        if (!data) setState({ status: 'error', message: `File not found: ${path}` });
        else setState({ status: 'ok', data });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      });
    return () => { cancelled = true; };
  }, [path, getData]);
  if (state.status === 'loading') return <div>Loading...</div>;
  if (state.status === 'error') return <div>Error: {state.message}</div>;
  return <StckViewer data={state.data} wasm={wasm} />;
}

export function ModelViewer({ path, wasm, getData, listFiles, initialClipName }: ModelViewerProps) {
  const ext = getExtension(path);
  if (ext === '.ecm')  return <EcmViewer path={path} wasm={wasm} getData={getData} listFiles={listFiles} initialClipName={initialClipName} />;
  if (ext === '.smd')  return <SmdViewer path={path} wasm={wasm} getData={getData} listFiles={listFiles} initialClipName={initialClipName} />;
  if (ext === '.stck') return <StckFetchWrapper path={path} wasm={wasm} getData={getData} />;
  return <SkiViewer path={path} wasm={wasm} getData={getData} />;
}
