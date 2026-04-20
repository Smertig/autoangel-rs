import type { AutoangelModule } from '../../../../types/autoangel';
import { getExtension, IMAGE_EXTENSIONS, IMAGE_MIME } from '@shared/util/files';
import { getThree } from './three';

// Engine stores textures as DDS/TGA (need wasm decoder) or browser-native
// formats like BMP/PNG/JPG (for skins of many scene models). Dispatch by
// extension and build a THREE.CanvasTexture with consistent flipY/colorSpace.
export async function loadThreeTexture(
  wasm: AutoangelModule,
  data: Uint8Array,
  texName: string,
): Promise<any | null> {
  const ext = getExtension(texName);
  try {
    if (ext === '.dds') return canvasTextureFromRgba(wasm.decodeDds(data));
    if (ext === '.tga') return canvasTextureFromRgba(wasm.decodeTga(data));
    if (IMAGE_EXTENSIONS.has(ext)) return await textureFromBrowserImage(data, ext);
    console.warn('[model] Unknown texture format:', texName);
    return null;
  } catch (e: unknown) {
    console.warn('[model] Texture decode failed:', texName, e instanceof Error ? e.message : e);
    return null;
  }
}

export function canvasTextureFromRgba(decoded: { width: number; height: number; intoRgba(): Uint8Array }): any {
  const { THREE } = getThree();
  const { width, height } = decoded;
  const rgba = decoded.intoRgba();

  let hasAlpha = false;
  for (let i = 3; i < rgba.byteLength; i += 4 * 64) {
    if (rgba[i] < 250) { hasAlpha = true; break; }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(
    new ImageData(
      new Uint8ClampedArray(rgba.buffer as ArrayBuffer, rgba.byteOffset, rgba.byteLength),
      width,
      height,
    ),
    0,
    0,
  );

  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex._hasAlpha = hasAlpha;
  return tex;
}

export async function textureFromBrowserImage(data: Uint8Array, ext: string): Promise<any> {
  const { THREE } = getThree();
  const mime = IMAGE_MIME[ext] ?? 'application/octet-stream';
  const blob = new Blob([data.buffer as ArrayBuffer], { type: mime });
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  // Browser-decoded formats (BMP/PNG/JPG) don't carry alpha metadata we
  // can cheaply inspect; assume opaque and let materials override if needed.
  tex._hasAlpha = false;
  return tex;
}
