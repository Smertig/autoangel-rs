import React, { useEffect, useRef, useState } from 'react';
import { IMAGE_EXTENSIONS, CANVAS_IMAGE_EXTENSIONS, IMAGE_MIME } from '@shared/util/files';
import { decodeToCanvas } from '@shared/util/canvas';
import styles from './ImagePreview.module.css';

interface DecodedImageLike {
  width: number;
  height: number;
  intoRgba(): Uint8Array;
}

interface ImagePreviewProps {
  data: Uint8Array;
  ext: string;
  decodeDds?: (data: Uint8Array) => DecodedImageLike;
  decodeTga?: (data: Uint8Array) => DecodedImageLike;
}

function NativeImage({ data, ext }: { data: Uint8Array; ext: string }) {
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const blob = new Blob([data.buffer as ArrayBuffer], { type: IMAGE_MIME[ext] });
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    setDimensions(null);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [data, ext]);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setDimensions({ w: img.naturalWidth, h: img.naturalHeight });
  };

  if (!url) return null;

  return (
    <>
      <img src={url} onLoad={handleLoad} className={styles.image} alt="" />
      {dimensions && (
        <div className={styles.imageInfo}>
          {dimensions.w} &times; {dimensions.h}
        </div>
      )}
    </>
  );
}

function CanvasImage({
  data,
  ext,
  decodeDds,
  decodeTga,
}: {
  data: Uint8Array;
  ext: string;
  decodeDds?: (data: Uint8Array) => DecodedImageLike;
  decodeTga?: (data: Uint8Array) => DecodedImageLike;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setDimensions(null);
    try {
      if (!decodeDds || !decodeTga) {
        setError(`No decoder available for ${ext}`);
        return;
      }
      const { canvas: decoded, width, height } = decodeToCanvas(data, ext, decodeDds, decodeTga);
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(decoded, 0, 0);
      setDimensions({ w: width, h: height });
    } catch (e: unknown) {
      setError(`Failed to decode ${ext}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [data, ext, decodeDds, decodeTga]);

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  return (
    <>
      <canvas ref={canvasRef} className={styles.canvas} />
      {dimensions && (
        <div className={styles.imageInfo}>
          {dimensions.w} &times; {dimensions.h} ({ext.slice(1).toUpperCase()})
        </div>
      )}
    </>
  );
}

export function ImagePreview({ data, ext, decodeDds, decodeTga }: ImagePreviewProps) {
  if (IMAGE_EXTENSIONS.has(ext) && IMAGE_MIME[ext]) {
    return (
      <div className={styles.imagePreview}>
        <NativeImage data={data} ext={ext} />
      </div>
    );
  }

  if (CANVAS_IMAGE_EXTENSIONS.has(ext)) {
    return (
      <div className={styles.imagePreview}>
        <CanvasImage data={data} ext={ext} decodeDds={decodeDds} decodeTga={decodeTga} />
      </div>
    );
  }

  return null;
}
