import type * as ThreeModule from 'three';
import type { AutoangelModule } from '../../../../types/autoangel';
import { readCssColorHex } from '@shared/util/css-vars';
import { getThree } from './three';
import { addStandardLights } from './scene';
import { getViewer } from './viewer';
import { buildSkeleton } from './skeleton';
import { buildBonScene } from './render-bon-scene';

export interface BonWorldPos { x: number; y: number; z: number }

export interface BonSceneApi {
  /** Bones excluding the synthetic `__root_world__` slot. */
  bones: ReadonlyArray<{ name: string; parent: number }>;
  hooks: ReadonlyArray<{ name: string; bone_index: number }>;
  /** Highlight the named bone or hook (or clear with null). Triggers a
   *  one-shot pulse animation in 3D and leaves a persistent indicator
   *  sphere at the host's world position. */
  setSelected(name: string | null): void;
  /** Resolve the world-space position of a bone or hook by name. */
  worldPositionOf(name: string): BonWorldPos | null;
  dispose(): void;
}

const PULSE_DURATION_MS = 600;
const INDICATOR_RADIUS_FACTOR = 1.6;
const PULSE_SCALE_PEAK = 1.8;
const PULSE_OPACITY_PEAK = 0.9;
// SkeletonHelper line segments and AxesHelper render at default order 0.
// Bumping the indicator + pulse above 1 keeps them on top of the rig
// regardless of camera angle (they also use depthTest:false).
const RENDER_ORDER_INDICATOR = 998;
const RENDER_ORDER_PULSE = 999;

export function mountBonScene(
  container: HTMLElement,
  wasm: AutoangelModule,
  bonData: Uint8Array,
): BonSceneApi {
  const { THREE, OrbitControls } = getThree();
  const v = getViewer(container);

  const skel = buildSkeleton(wasm, bonData);
  const built = buildBonScene(THREE, skel, { perHookMaterials: true });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1b1e);
  addStandardLights(THREE, scene);
  scene.add(built.group);

  v._disposeScene();
  v.scene = scene;

  const w = container.clientWidth || 400;
  const h = container.clientHeight || 400;
  const { camera, center } = fitCameraToBones(THREE, skel.bones, w, h);
  v.camera = camera;

  if (v.controls) v.controls.dispose();
  const controls = new OrbitControls(v.camera, v.renderer.domElement);
  controls.target.copy(center);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  v.setControls(controls);
  controls.update();
  v.renderer.render(v.scene, v.camera);

  const boneIdxByRef = new Map<unknown, number>();
  for (let i = 0; i < skel.bones.length; i++) boneIdxByRef.set(skel.bones[i], i);

  const bones: Array<{ name: string; parent: number }> = [];
  for (let i = 0; i < skel.bones.length; i++) {
    const b = skel.bones[i];
    if (b.name === '__root_world__') continue;
    const parent = b.parent && b.parent.type === 'Bone' ? boneIdxByRef.get(b.parent) ?? -1 : -1;
    bones.push({ name: b.name, parent });
  }
  const hooks: Array<{ name: string; bone_index: number }> = [];
  for (const [name, hookObj] of skel.hooksByName) {
    const idx = boneIdxByRef.get(hookObj.parent);
    if (idx != null) hooks.push({ name, bone_index: idx });
  }

  const selectedColor = new THREE.Color(readCssColorHex('--accent-hover', 0x74c0fc));
  const hookColor = new THREE.Color(readCssColorHex('--bon-hook', 0xfab005));

  // Selection feedback in 3D: a persistent indicator sphere at the picked
  // host's world position, plus a one-shot pulse sphere that expands +
  // fades on each click. Both render with depthTest off so they're not
  // hidden by skeleton lines or hook spheres.
  const indicatorRadius = built.hookRadius * INDICATOR_RADIUS_FACTOR;
  const selectedSphere = new THREE.Mesh(
    new THREE.SphereGeometry(indicatorRadius, 16, 12),
    new THREE.MeshBasicMaterial({
      color: selectedColor,
      transparent: true,
      opacity: 0.65,
      depthTest: false,
    }),
  );
  selectedSphere.renderOrder = RENDER_ORDER_INDICATOR;
  selectedSphere.visible = false;
  scene.add(selectedSphere);

  const pulseSphere = new THREE.Mesh(
    new THREE.SphereGeometry(indicatorRadius, 24, 16),
    new THREE.MeshBasicMaterial({
      color: selectedColor,
      transparent: true,
      opacity: 1,
      depthTest: false,
    }),
  );
  pulseSphere.renderOrder = RENDER_ORDER_PULSE;
  pulseSphere.visible = false;
  scene.add(pulseSphere);

  const tmpVec = new THREE.Vector3();
  let pulseStart = -Infinity;

  v.onBeforeRender = () => {
    if (pulseStart < 0) return;
    const elapsed = performance.now() - pulseStart;
    if (elapsed >= PULSE_DURATION_MS) {
      pulseSphere.visible = false;
      pulseStart = -Infinity;
      return;
    }
    const t = elapsed / PULSE_DURATION_MS;
    // ease-out cubic: 1 - (1-t)³ — fast start, slow finish, the "ping" feel.
    const eased = 1 - Math.pow(1 - t, 3);
    pulseSphere.scale.setScalar(1 + eased * PULSE_SCALE_PEAK);
    (pulseSphere.material as ThreeModule.MeshBasicMaterial).opacity =
      PULSE_OPACITY_PEAK * (1 - eased);
  };
  v.isAuxAnimating = () => pulseStart > 0 && (performance.now() - pulseStart) < PULSE_DURATION_MS;

  function findHost(name: string): any | null {
    for (const b of skel.bones) if (b.name === name) return b;
    return skel.hooksByName.get(name) ?? null;
  }

  return {
    bones,
    hooks,
    setSelected(name) {
      const host = name != null ? findHost(name) : null;
      if (host) {
        host.getWorldPosition(tmpVec);
        selectedSphere.position.copy(tmpVec);
        selectedSphere.visible = true;
        pulseSphere.position.copy(tmpVec);
        pulseSphere.scale.setScalar(1);
        (pulseSphere.material as ThreeModule.MeshBasicMaterial).opacity = PULSE_OPACITY_PEAK;
        pulseSphere.visible = true;
        pulseStart = performance.now();
      } else {
        selectedSphere.visible = false;
        pulseSphere.visible = false;
        pulseStart = -Infinity;
      }
      // Hooks keep per-mesh materials, so each retints individually — a
      // secondary cue alongside the indicator sphere.
      for (const [hookName, mesh] of built.hookMeshByName) {
        const target = hookName === name ? selectedColor : hookColor;
        (mesh.material as ThreeModule.MeshBasicMaterial).color.copy(target);
      }
      v.requestRender();
    },
    worldPositionOf(name) {
      const host = findHost(name);
      if (!host) return null;
      host.getWorldPosition(tmpVec);
      return { x: tmpVec.x, y: tmpVec.y, z: tmpVec.z };
    },
    dispose() {
      // Clear render-loop callbacks before freeing the meshes they capture
      // — otherwise the next frame fires `onBeforeRender` against a torn-down
      // material/geometry. `getViewer` keeps `Viewer` alive per-container, so
      // these stick around past `api.dispose()` if not nulled here.
      v.onBeforeRender = null;
      v.isAuxAnimating = null;
      built.dispose();
      selectedSphere.geometry.dispose();
      (selectedSphere.material as ThreeModule.Material).dispose();
      pulseSphere.geometry.dispose();
      (pulseSphere.material as ThreeModule.Material).dispose();
    },
  };
}

function fitCameraToBones(
  THREE: typeof import('three'),
  bones: any[],
  width: number,
  height: number,
): { camera: ThreeModule.PerspectiveCamera; center: ThreeModule.Vector3 } {
  const box = new THREE.Box3();
  const tmp = new THREE.Vector3();
  for (const b of bones) {
    if (b.name === '__root_world__') continue;
    b.getWorldPosition(tmp);
    box.expandByPoint(tmp);
  }
  const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  const size = box.isEmpty() ? 1 : box.getSize(new THREE.Vector3()).length();
  const offset = new THREE.Vector3(size * 0.6, size * 0.5, size * 1.2);
  const camera = new THREE.PerspectiveCamera(40, width / height, size * 0.001, size * 20);
  camera.position.copy(center).add(offset);
  camera.lookAt(center);
  return { camera, center };
}
