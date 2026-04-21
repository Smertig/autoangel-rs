export function argbToCss(argb: number): string {
  const a = ((argb >>> 24) & 0xff) / 255;
  const r = (argb >>> 16) & 0xff;
  const g = (argb >>> 8) & 0xff;
  const b = argb & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`;
}

export function argbToHex(argb: number): string {
  return `0x${(argb >>> 0).toString(16).padStart(8, '0').toUpperCase()}`;
}

/** Decode packed u32 ARGB to four normalised floats in [0, 1]. */
export function argbChannels(argb: number): [number, number, number, number] {
  const a = ((argb >>> 24) & 0xff) / 255;
  const r = ((argb >>> 16) & 0xff) / 255;
  const g = ((argb >>> 8) & 0xff) / 255;
  const b = (argb & 0xff) / 255;
  return [r, g, b, a];
}

/** Channel-wise linear blend of two packed `0xAARRGGBB` colors. */
export function argbLerp(a: number, b: number, t: number): number {
  const lerp = (x: number, y: number) => Math.round(x + (y - x) * t);
  const aa = (a >>> 24) & 0xff, ar = (a >>> 16) & 0xff, ag = (a >>> 8) & 0xff, ab = a & 0xff;
  const ba = (b >>> 24) & 0xff, br = (b >>> 16) & 0xff, bg = (b >>> 8) & 0xff, bb = b & 0xff;
  return (
    (lerp(aa, ba) << 24) |
    (lerp(ar, br) << 16) |
    (lerp(ag, bg) << 8) |
    lerp(ab, bb)
  ) >>> 0;
}
