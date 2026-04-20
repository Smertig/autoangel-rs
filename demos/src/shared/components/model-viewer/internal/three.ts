// Module-level lazy cache for the three.js runtime. three.js is heavy and
// only needed when a 3D viewer is mounted, so we import on demand and share
// the resolved module across every consumer.

let THREE: any = null;
let OrbitControls: any = null;
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
export function getThree(): { THREE: any; OrbitControls: any } {
  if (!THREE) throw new Error('ensureThree() must be awaited before getThree()');
  return { THREE, OrbitControls };
}
