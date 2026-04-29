import type * as ThreeModule from 'three';
import type { AutoangelModule } from '../../../../types/autoangel';
import type { GetData } from '@shared/formats/types';
import { ensureThree, getThree } from './three';
import { loadThreeTexture } from './texture';
import { buildBmdMeshes } from './bmd-mesh';
import { fitCameraToObject } from './camera-fit';

interface RenderBmdHoverArgs {
  canvas: HTMLCanvasElement;
  data: Uint8Array;
  getData: GetData;
  wasm: AutoangelModule;
}

/**
 * One-shot render of a parsed BMD into a fixed-size canvas. Returns a
 * cleanup function the caller must invoke on unmount to free GPU resources.
 *
 * Builds a minimal Three.js scene matching the full viewer's lighting and
 * camera angle, fetches textures via `getData` (per-texture failures fall
 * back to gray, same as the full viewer), and renders one frame. No
 * animation loop; no OrbitControls.
 */
export async function renderBmdHoverPreview(
  args: RenderBmdHoverArgs,
): Promise<() => void> {
  const { canvas, data, getData, wasm } = args;

  await ensureThree();
  const { THREE } = getThree();

  const bmd = wasm.parseBmd(data);

  const root = new THREE.Group();
  const dir = new THREE.Vector3(...bmd.dir).normalize();
  const up = new THREE.Vector3(...bmd.up).normalize();
  const right = new THREE.Vector3().crossVectors(up, dir).normalize();
  const basis = new THREE.Matrix4().makeBasis(right, up, dir);
  basis.setPosition(new THREE.Vector3(...bmd.pos));
  root.applyMatrix4(basis);
  root.scale.set(...bmd.scale);

  const uniqueTexPaths = Array.from(
    new Set(bmd.meshes.map((m) => m.texture_map).filter((p): p is string => !!p)),
  );
  const textureByPath = new Map<string, ThreeModule.Texture | null>(
    await Promise.all(
      uniqueTexPaths.map(async (p): Promise<[string, ThreeModule.Texture | null]> => {
        try {
          const texData = await getData(p);
          return [p, await loadThreeTexture(wasm, texData, p)];
        } catch {
          return [p, null];
        }
      }),
    ),
  );

  // Disposes everything currently owned. Used by both the success-path
  // cleanup callback and the catch block — keeps the two paths in sync.
  let meshes: ThreeModule.Mesh[] = [];
  let renderer: ThreeModule.WebGLRenderer | null = null;
  const disposeAll = () => {
    renderer?.dispose();
    meshes.forEach((m) => {
      m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((mat) => mat.dispose());
    });
    textureByPath.forEach((tex) => tex?.dispose());
  };

  try {
    ({ meshes } = buildBmdMeshes(THREE, bmd, textureByPath));
    for (const m of meshes) root.add(m);

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);
    scene.add(root);

    const w = canvas.clientWidth || 280;
    const h = canvas.clientHeight || 280;
    const { camera } = fitCameraToObject(THREE, root, w, h);

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
