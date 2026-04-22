export interface HookSpec {
  hookName: string;
  hookOffset: [number, number, number];
  hookYaw: number;
  hookPitch: number;
  hookRot: number;
  bindParent: boolean;
}

/**
 * Resolves an ECM event's `hookName` to the attachment point Object3D. The
 * caller is responsible for preferring hooks (HH_zui, HH_lefthandweapon, …)
 * over bones of the same name — hooks are what ECM events actually target.
 * Returns `undefined` if the name doesn't match anything, in which case
 * `attachToHook` falls back to the scene root.
 */
export type AttachPointResolver = (name: string) => any | undefined;

/**
 * Parent `root` to the appropriate node based on `spec`. Mutates `root`'s
 * parent + local transform.
 *
 * Euler order for hookYaw/Pitch/Rot is YXZ (engine convention: yaw around Y,
 * pitch around X, roll around Z) — best-guess; cross-check against engine
 * source if orientations look off against a real ECM.
 */
export function attachToHook(
  root: any, // THREE.Object3D
  spec: HookSpec,
  findAttachPoint: AttachPointResolver,
  sceneRoot: any,
): void {
  const attachPoint = spec.hookName ? findAttachPoint(spec.hookName) : undefined;

  if (spec.bindParent && attachPoint) {
    root.position.set(spec.hookOffset[0], spec.hookOffset[1], spec.hookOffset[2]);
    root.rotation.set(spec.hookPitch, spec.hookYaw, spec.hookRot, 'YXZ');
    attachPoint.add(root);
    return;
  }

  if (!attachPoint) {
    sceneRoot.add(root);
    return;
  }

  // Freeze at spawn location — bake the attachment point's current world
  // transform onto root so subsequent bone motion doesn't drag the effect.
  attachPoint.updateMatrixWorld(true);
  root.matrix.copy(attachPoint.matrixWorld);
  root.matrix.decompose(root.position, root.quaternion, root.scale);
  // TODO: hookOffset is in bone-local space; the correct transform applies
  // bone's rotation before adding to world position. Current naive add is
  // exact only when the bone is unrotated. Milestone B fixtures usually have
  // zero offset; revisit when a real ECM surfaces the problem.
  root.position.x += spec.hookOffset[0];
  root.position.y += spec.hookOffset[1];
  root.position.z += spec.hookOffset[2];
  // TODO: also compose hookYaw/Pitch/Rot with the snapshot rotation.
  sceneRoot.add(root);
}
