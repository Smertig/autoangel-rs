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
