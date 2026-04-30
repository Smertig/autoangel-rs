import type * as ThreeModule from 'three';
import type { HoverCanvasRenderArgs } from '@shared/components/hover-preview/types';
import { ensureThree, getThree } from './three';
import { disposeSkinMeshes, loadSkinFile } from './mesh';
import { fitCameraToObject } from './camera-fit';
import { addStandardLights } from './scene';

/** Static one-shot render of a SKI — meshes at bind transforms with
 *  textures applied. Standalone SKIs have no animation pipeline, so this
 *  matches what the full SkiViewer shows on first paint. */
export async function renderSkiHoverPreview(
  args: HoverCanvasRenderArgs,
): Promise<() => void> {
  const { canvas, path, data, pkg, wasm, cancelled } = args;

  await ensureThree();
  const { THREE } = getThree();

  const { meshes } = await loadSkinFile(wasm, pkg, path, data) as {
    meshes: ThreeModule.Mesh[];
  };

  let renderer: ThreeModule.WebGLRenderer | null = null;
  const disposeAll = () => {
    renderer?.dispose();
    disposeSkinMeshes(meshes);
  };

  try {
    if (cancelled()) return disposeAll;
    if (meshes.length === 0) throw new Error('No meshes built from skin file');

    const group = new THREE.Group();
    for (const m of meshes) group.add(m);

    const scene = new THREE.Scene();
    addStandardLights(THREE, scene);
    scene.add(group);

    const w = canvas.clientWidth || 280;
    const h = canvas.clientHeight || 280;
    const { camera } = fitCameraToObject(THREE, group, w, h);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    renderer.render(scene, camera);

    return disposeAll;
  } catch (e) {
    disposeAll();
    throw e;
  }
}
