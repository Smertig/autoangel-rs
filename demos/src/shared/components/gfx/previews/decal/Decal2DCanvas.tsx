import { useEffect, useMemo, useRef } from 'react';
import { useFileData } from '@shared/hooks/useFileData';
import { loadParticleTexture, noopGetData, resolveTexturePath } from '../particle/texture';
import { sampleAtlasFrame } from '../../util/atlas';
import { sampleTrack, trackSignature, type Track } from '../../util/keypointTrack';
import type { ElementBody, GfxElement, ViewerCtx } from '../types';
import styles from './Decal2DCanvas.module.css';

type DecalBody = Extract<ElementBody, { kind: 'decal' }>;

export function Decal2DCanvas({
  body,
  element,
  context,
  track,
}: {
  body: DecalBody;
  element: GfxElement;
  context: ViewerCtx;
  track: Track;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imageRef = useRef<any>(null);

  const resolvedPath = useMemo(
    () => resolveTexturePath(element.tex_file, context.listFiles),
    [element.tex_file, context.listFiles],
  );

  // useFileData requires a path and a getData fn; when no resolved path,
  // fall through with a noop to keep hooks order stable.
  const texDataState = useFileData(
    resolvedPath ?? '__noop__',
    resolvedPath ? context.getData : noopGetData,
  );
  const texData = useMemo(
    () => (texDataState.status === 'loaded' ? texDataState.data : null),
    [texDataState],
  );

  // Load texture into an Image element for 2D canvas drawImage.
  useEffect(() => {
    let cancelled = false;
    if (!texData || texData.byteLength === 0) {
      imageRef.current = null;
      return;
    }
    (async () => {
      try {
        const tex = await loadParticleTexture(context.wasm, texData, element.tex_file);
        if (cancelled) return;
        // loadParticleTexture returns a three.js Texture wrapping an Image|ImageBitmap|HTMLCanvasElement.
        // Pull the underlying source out for canvas2d use.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const src = (tex as any)?.image;
        if (src) imageRef.current = src;
        // The Texture wrapper is only used to decode the image source —
        // we keep the raw Image/ImageBitmap and drop the GPU-side Texture.
        (tex as any)?.dispose?.();
      } catch {
        imageRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [texData, context.wasm, element.tex_file]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const aspect = body.height > 0 ? body.width / body.height : 1;
    const W = 200;
    const H = Math.max(40, Math.round(W / Math.max(0.1, aspect)));
    cv.width = W;
    cv.height = H;

    let raf = 0;
    const startMs = performance.now();
    const tick = () => {
      const now = performance.now();
      const localMs = track.loopable ? (now - startMs) % track.loopDurationMs : 0;
      const sample = sampleTrack(track, localMs);
      const atlas = sampleAtlasFrame(
        Math.max(1, element.tex_row),
        Math.max(1, element.tex_col),
        element.tex_interval,
        localMs,
      );

      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(sample.rad2d);
      ctx.scale(sample.scale, sample.scale);
      const a = ((sample.color >>> 24) & 0xff) / 255;
      ctx.globalAlpha = a;

      const img = imageRef.current as
        | HTMLImageElement
        | HTMLCanvasElement
        | ImageBitmap
        | null;
      const iw = img && 'width' in img ? (img as { width: number }).width : 0;
      const ih = img && 'height' in img ? (img as { height: number }).height : 0;
      const ready =
        !!img &&
        iw > 0 &&
        ih > 0 &&
        (!(img instanceof HTMLImageElement) || img.complete !== false);

      if (ready) {
        const sx = atlas.offset[0] * iw;
        const sy = atlas.offset[1] * ih;
        const sw = atlas.repeat[0] * iw;
        const sh = atlas.repeat[1] * ih;
        ctx.drawImage(
          img as CanvasImageSource,
          sx,
          sy,
          sw,
          sh,
          -W / 2,
          -H / 2,
          W,
          H,
        );
        // Multiply tint pass.
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = `rgb(${(sample.color >>> 16) & 0xff}, ${
          (sample.color >>> 8) & 0xff
        }, ${sample.color & 0xff})`;
        ctx.fillRect(-W / 2, -H / 2, W, H);
        ctx.globalCompositeOperation = 'source-over';
      } else {
        // No texture — color swatch.
        ctx.fillStyle = `rgba(${(sample.color >>> 16) & 0xff}, ${
          (sample.color >>> 8) & 0xff
        }, ${sample.color & 0xff}, ${a})`;
        ctx.fillRect(-W / 2, -H / 2, W, H);
      }
      ctx.restore();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    trackSignature(track),
    body.width,
    body.height,
    element.tex_row,
    element.tex_col,
    element.tex_interval,
    texData,
    track,
  ]);

  return (
    <div className={styles.wrap} data-testid="decal-2d-canvas">
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}
