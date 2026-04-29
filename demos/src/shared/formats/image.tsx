import { useEffect, useRef, useState } from 'react';
import { IMAGE_EXTENSIONS, CANVAS_IMAGE_EXTENSIONS, IMAGE_MIME } from '@shared/util/files';
import { ImagePreview } from '@shared/components/ImagePreview';
import { ImageDiff } from '@pck-diff/components/ImageDiff';
import { useFileData } from '@shared/hooks/useFileData';
import { decodeToCanvas } from '@shared/util/canvas';
import { HOVER_FIT_STYLE } from './hover-style';
import type { FormatDescriptor, ViewerContext, DifferContext, HoverContext } from './types';

function ImageViewer({ path, ext, getData, wasm }: ViewerContext) {
  const state = useFileData(path, getData);

  if (state.status === 'loading') return <div>Loading...</div>;
  if (state.status === 'error') return <div>Error: {state.message}</div>;

  return (
    <ImagePreview
      data={state.data}
      ext={ext}
      decodeDds={wasm.decodeDds}
      decodeTga={wasm.decodeTga}
    />
  );
}

function ImageDiffer({ path, ext, leftData, rightData, wasm }: DifferContext) {
  return <ImageDiff leftData={leftData} rightData={rightData} path={path} ext={ext} wasm={wasm} />;
}

function ImageHoverPreview({ ext, data, wasm }: HoverContext) {
  if (IMAGE_EXTENSIONS.has(ext) && IMAGE_MIME[ext]) {
    return <NativeHoverImage data={data} ext={ext} />;
  }
  if (CANVAS_IMAGE_EXTENSIONS.has(ext)) {
    return <CanvasHoverImage data={data} ext={ext} wasm={wasm} />;
  }
  return null;
}

function NativeHoverImage({ data, ext }: { data: Uint8Array; ext: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const blob = new Blob([data.buffer as ArrayBuffer], { type: IMAGE_MIME[ext] });
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => { URL.revokeObjectURL(u); };
  }, [data, ext]);
  if (!url) return null;
  return <img src={url} alt="" style={HOVER_FIT_STYLE} />;
}

function CanvasHoverImage({
  data, ext, wasm,
}: { data: Uint8Array; ext: string; wasm: HoverContext['wasm'] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    try {
      const { canvas, width, height } = decodeToCanvas(data, ext, wasm.decodeDds, wasm.decodeTga);
      const c = canvasRef.current;
      if (!c) return;
      c.width = width;
      c.height = height;
      c.getContext('2d')!.drawImage(canvas, 0, 0);
    } catch {
      // Swallow; metadata strip below still informs the user.
    }
  }, [data, ext, wasm]);
  return <canvas ref={canvasRef} style={HOVER_FIT_STYLE} />;
}

export const imageFormat: FormatDescriptor = {
  name: 'image',
  matches: (ext) => IMAGE_EXTENSIONS.has(ext) || CANVAS_IMAGE_EXTENSIONS.has(ext),
  Viewer: ImageViewer,
  Differ: ImageDiffer,
  HoverPreview: ImageHoverPreview,
};
