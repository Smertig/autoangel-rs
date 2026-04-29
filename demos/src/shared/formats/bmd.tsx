import { useEffect, useRef, useState } from 'react';
import { BmdViewer } from '@shared/components/model-viewer';
import { renderBmdHoverPreview } from '@shared/components/model-viewer/internal/render-bmd-hover';
import { sideBySideDiffer } from './helpers';
import { useNullableGetData } from '@shared/hooks/useNullableGetData';
import type { FormatDescriptor, ViewerContext, HoverContext } from './types';

function BmdFormatViewer({ path, getData, wasm }: ViewerContext) {
  const getDataNullable = useNullableGetData(getData);
  return <BmdViewer path={path} wasm={wasm} getData={getDataNullable} />;
}

const FIT_STYLE = { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' } as const;

function BmdHoverPreview({ data, getData, wasm }: HoverContext) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        const dispose = await renderBmdHoverPreview({ canvas, data, getData, wasm });
        if (disposed) {
          dispose();
          return;
        }
        cleanup = dispose;
      } catch (e) {
        if (!disposed) {
          setError(`Failed to render BMD: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [data, getData, wasm]);

  if (error) {
    return <div style={{ color: '#c66', fontSize: 11, padding: 8 }}>{error}</div>;
  }
  return <canvas ref={canvasRef} width={280} height={280} style={FIT_STYLE} />;
}

export const bmdFormat: FormatDescriptor = {
  name: 'bmd',
  matches: (ext) => ext === '.bmd',
  Viewer: BmdFormatViewer,
  Differ: sideBySideDiffer(BmdFormatViewer),
  HoverPreview: BmdHoverPreview,
};
