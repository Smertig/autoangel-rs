import type * as ThreeModule from 'three';
import type { HoverCanvasRenderArgs } from '@shared/components/hover-preview/types';
import { ensureThree, getThree } from './three';
import { buildSkeleton } from './skeleton';
import { buildBonScene } from './render-bon-scene';
import { setupHoverScene } from './hover-scene';

/** Static hover preview for a `.bon`: skeleton stick figure (parent→child
 *  line segments) with small warm-coloured spheres at hook positions. No
 *  axes, no labels, no animation — readability over completeness at 280×280. */
export async function renderBonHoverPreview(
  args: HoverCanvasRenderArgs,
): Promise<() => void> {
  const { canvas, data, wasm } = args;

  await ensureThree();
  const { THREE } = getThree();

  const skel = buildSkeleton(wasm, data);
  const scene = buildBonScene(THREE, skel);

  let renderer: ThreeModule.WebGLRenderer | null = null;
  const disposeAll = () => {
    renderer?.dispose();
    scene.dispose();
  };

  try {
    const setup = setupHoverScene(THREE, canvas, scene.group);
    renderer = setup.renderer;
    renderer.render(setup.scene, setup.camera);
    return disposeAll;
  } catch (e) {
    disposeAll();
    throw e;
  }
}
