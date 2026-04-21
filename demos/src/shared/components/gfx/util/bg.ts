// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readBgColor(THREE: any, container: HTMLElement): any {
  try {
    const raw = getComputedStyle(container).getPropertyValue('--gfx-bg-deep').trim();
    if (raw) return new THREE.Color(raw);
  } catch {
    /* computed-style read may fail in edge cases; fall through */
  }
  return new THREE.Color(0x0b0b0d);
}
