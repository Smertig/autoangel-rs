// Module-level lazy cache for the three.js runtime. three.js is heavy and
// only needed when a 3D viewer is mounted, so we import on demand and share
// the resolved module across every consumer.

import type * as ThreeModule from 'three';
import type { OrbitControls as OrbitControlsCtor } from 'three/addons/controls/OrbitControls.js';

let THREE: typeof ThreeModule | null = null;
let OrbitControls: typeof OrbitControlsCtor | null = null;
let threeLoading: Promise<void> | null = null;

export async function ensureThree(): Promise<void> {
  if (THREE) return;
  if (threeLoading) return threeLoading;
  threeLoading = (async () => {
    THREE = await import('three');
    const addons = await import('three/addons/controls/OrbitControls.js');
    OrbitControls = addons.OrbitControls;
  })();
  return threeLoading;
}

/**
 * Returns the loaded three.js module + OrbitControls. Must be called
 * only after `await ensureThree()`; throws otherwise. Designed to be
 * destructured at call sites: `const { THREE } = getThree();`.
 */
export function getThree(): { THREE: typeof ThreeModule; OrbitControls: typeof OrbitControlsCtor } {
  if (!THREE || !OrbitControls) throw new Error('ensureThree() must be awaited before getThree()');
  return { THREE, OrbitControls };
}
