export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Round + clamp to a single byte [0, 255]. Common helper for ARGB channel arithmetic. */
export function clamp8(x: number): number {
  return Math.max(0, Math.min(255, Math.round(x)));
}
