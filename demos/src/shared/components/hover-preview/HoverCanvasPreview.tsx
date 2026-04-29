import { useEffect, useRef, useState } from 'react';
import { HOVER_FIT_STYLE } from '@shared/formats/hover-style';
import type { GetData } from '@shared/formats/types';
import type { AutoangelModule } from '../../../types/autoangel';

export interface HoverCanvasRenderArgs {
  canvas: HTMLCanvasElement;
  data: Uint8Array;
  getData: GetData;
  wasm: AutoangelModule;
  /** Returns true once the popover has unmounted; checked between async
   *  steps so resources allocated post-cancel are disposed inline rather
   *  than uploaded to GPU and immediately thrown away. */
  cancelled: () => boolean;
}

/** A render fn the popover invokes; returns its own cleanup callback. */
export type HoverCanvasRenderer = (args: HoverCanvasRenderArgs) => Promise<() => void>;

interface HoverCanvasPreviewProps {
  data: Uint8Array;
  getData: GetData;
  wasm: AutoangelModule;
  render: HoverCanvasRenderer;
  /** Inserted into the error message: "Failed to render <label>: …". */
  label: string;
  width: number;
  height: number;
}

/** Shared hover-popover shell for canvas-based previews (BMD, GFX). Handles
 *  the mount/disposed-flag/cleanup-on-unmount race; renders the error fallback
 *  when the render helper rejects. */
export function HoverCanvasPreview({
  data, getData, wasm, render, label, width, height,
}: HoverCanvasPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        const dispose = await render({
          canvas, data, getData, wasm,
          cancelled: () => disposed,
        });
        if (disposed) {
          dispose();
          return;
        }
        cleanup = dispose;
      } catch (e) {
        if (!disposed) {
          setError(`Failed to render ${label}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [data, getData, wasm, render, label]);

  if (error) {
    return <div style={{ color: '#c66', fontSize: 11, padding: 8 }}>{error}</div>;
  }
  return <canvas ref={canvasRef} width={width} height={height} style={HOVER_FIT_STYLE} />;
}
