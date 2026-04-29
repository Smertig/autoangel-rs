import type * as ThreeModule from 'three';

/**
 * Build a perspective camera positioned to frame the given object's bounding box.
 * Returns the new camera plus the bbox center (useful for OrbitControls.target)
 * and the bbox `size` (diagonal length, used for clip planes / control limits).
 *
 * Camera placement matches the full viewer's mountScene: a 3/4 angle
 * `(size*0.6, size*0.5, size*1.2)` offset from the bbox center, with FOV 40°
 * and near/far set to `size * 0.001` / `size * 20` for tight depth precision.
 */
export function fitCameraToObject(
  THREE: typeof ThreeModule,
  object: ThreeModule.Object3D,
  width: number,
  height: number,
): { camera: ThreeModule.PerspectiveCamera; center: ThreeModule.Vector3; size: number } {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length();
  const offset = new THREE.Vector3(size * 0.6, size * 0.5, size * 1.2);

  const camera = new THREE.PerspectiveCamera(40, width / height, size * 0.001, size * 20);
  camera.position.copy(center).add(offset);
  camera.lookAt(center);

  return { camera, center, size };
}
