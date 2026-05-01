import { readCssVar } from '@shared/util/css-vars';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readBgColor(THREE: any, container: HTMLElement): any {
  const raw = readCssVar('--gfx-bg-deep', container);
  return raw ? new THREE.Color(raw) : new THREE.Color(0x0b0b0d);
}
