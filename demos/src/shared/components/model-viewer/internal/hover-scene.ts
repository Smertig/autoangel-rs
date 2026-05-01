import type * as ThreeModule from 'three';
import { fitCameraToObject } from './camera-fit';
import { addStandardLights } from './scene';

/**
 * Build the hover-preview scaffold shared by every 3D hover-preview format
 * (BMD / SKI / ECM / SMD): an empty scene with standard lights, the supplied
 * root attached, a camera framing it, and a renderer sized to the canvas.
 *
 * The caller decides whether to call `renderer.render(scene, camera)` once
 * (static formats) or to wire it into a mixer-driven rAF loop (animated SMD).
 * Disposal of the renderer + any meshes attached to `root` stays the
 * caller's responsibility — ownership models differ across formats.
 */
export function setupHoverScene(
  THREE: typeof import('three'),
  canvas: HTMLCanvasElement,
  root: ThreeModule.Object3D,
): {
  scene: ThreeModule.Scene;
  camera: ThreeModule.Camera;
  renderer: ThreeModule.WebGLRenderer;
} {
  const scene = new THREE.Scene();
  addStandardLights(THREE, scene);
  scene.add(root);

  const w = canvas.clientWidth || 280;
  const h = canvas.clientHeight || 280;
  const { camera } = fitCameraToObject(THREE, root, w, h);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);

  return { scene, camera, renderer };
}
