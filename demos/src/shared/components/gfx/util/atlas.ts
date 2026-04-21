export interface AtlasFrame {
  offset: [number, number];
  repeat: [number, number];
}

/**
 * Compute UV offset/repeat for a flipbook atlas frame at time `tMs`.
 * Mirrors `A3DDecalEx.cpp:385-417` (UV + UReverse/VReverse/UVExchg).
 * `intervalMs == 0` pins to frame 0.
 */
export function sampleAtlasFrame(
  row: number,
  col: number,
  intervalMs: number,
  tMs: number,
  uReverse: boolean = false,
  vReverse: boolean = false,
  uvExchg: boolean = false,
): AtlasFrame {
  const totalFrames = Math.max(1, row * col);
  const frame = intervalMs > 0 ? Math.floor(tMs / intervalMs) % totalFrames : 0;
  const r = Math.floor(frame / col);
  const c = frame % col;
  let uOffset = c / col;
  let vOffset = (row - 1 - r) / row;
  let uSize = 1 / col;
  let vSize = 1 / row;
  if (uReverse) { uOffset += uSize; uSize = -uSize; }
  if (vReverse) { vOffset += vSize; vSize = -vSize; }
  if (uvExchg) {
    [uOffset, vOffset] = [vOffset, uOffset];
    [uSize, vSize] = [vSize, uSize];
  }
  return { offset: [uOffset, vOffset], repeat: [uSize, vSize] };
}
