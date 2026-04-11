export function decodeToCanvas(
  data: Uint8Array,
  ext: string,
  decodeDds: (d: Uint8Array) => { width: number; height: number; intoRgba(): Uint8Array },
  decodeTga: (d: Uint8Array) => { width: number; height: number; intoRgba(): Uint8Array },
): { canvas: HTMLCanvasElement; width: number; height: number } {
  const decoder = ext === '.dds' ? decodeDds : decodeTga;
  const decoded = decoder(data);
  const { width, height } = decoded;
  const rgba = decoded.intoRgba();
  const imageData = new ImageData(
    new Uint8ClampedArray(rgba.buffer as ArrayBuffer, rgba.byteOffset, rgba.byteLength),
    width, height,
  );
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.putImageData(imageData, 0, 0);
  return { canvas, width, height };
}
