import type * as ThreeModule from 'three';
import { readCssColorHex } from '@shared/util/css-vars';

type Skel = {
  bones: any[];
  hooksByName: Map<string, any>;
  tmpRoot: any;
};

// Hook sphere radius is a fraction of the skeleton's bounding-box diagonal —
// bone-space units vary wildly between models, so a fixed world-unit size
// would overwhelm small rigs and disappear on large ones.
const HOOK_FRAC = 0.012;

export interface BonSceneHandles {
  group: ThreeModule.Group;
  /** Lets callers retint a single hook for selection feedback. */
  hookMeshByName: Map<string, ThreeModule.Mesh>;
  helper: ThreeModule.SkeletonHelper;
  /** Radius the hook spheres were sized to (derived from the rig's bbox
   *  diagonal). Useful for sizing selection indicators consistently. */
  hookRadius: number;
  dispose: () => void;
}

export function buildBonScene(
  THREE: typeof import('three'),
  skel: Skel,
  opts: { perHookMaterials?: boolean } = {},
): BonSceneHandles {
  const group = new THREE.Group();
  group.add(skel.tmpRoot);

  const rootBone = skel.bones.find((b: any) => !b.parent || b.parent.type !== 'Bone')
    ?? skel.bones[0];
  const helper = new THREE.SkeletonHelper(rootBone);
  (helper.material as any).color = new THREE.Color(readCssColorHex('--accent', 0x228be6));
  (helper.material as any).linewidth = 2;
  group.add(helper);

  const diag = computeBoneDiagonal(THREE, skel.bones);
  const hookRadius = Math.max(diag * HOOK_FRAC, 0.02);

  const hookColor = readCssColorHex('--bon-hook', 0xfab005);
  const hookGeom = new THREE.SphereGeometry(hookRadius, 8, 6);
  const sharedHookMat = opts.perHookMaterials
    ? null
    : new THREE.MeshBasicMaterial({ color: hookColor });
  const ownedMaterials: ThreeModule.Material[] = [];
  if (sharedHookMat) ownedMaterials.push(sharedHookMat);

  const hookMeshByName = new Map<string, ThreeModule.Mesh>();
  for (const [name, hookObj] of skel.hooksByName) {
    const mat = sharedHookMat ?? new THREE.MeshBasicMaterial({ color: hookColor });
    if (mat !== sharedHookMat) ownedMaterials.push(mat);
    const sphere = new THREE.Mesh(hookGeom, mat);
    sphere.name = name;
    hookObj.add(sphere);
    hookMeshByName.set(name, sphere);
  }

  return {
    group,
    hookMeshByName,
    helper,
    hookRadius,
    dispose() {
      hookGeom.dispose();
      for (const m of ownedMaterials) m.dispose();
    },
  };
}

function computeBoneDiagonal(THREE: typeof import('three'), bones: any[]): number {
  const box = new THREE.Box3();
  const tmp = new THREE.Vector3();
  for (const b of bones) {
    if (b.name === '__root_world__') continue;
    b.getWorldPosition(tmp);
    box.expandByPoint(tmp);
  }
  if (box.isEmpty()) return 1;
  return box.getSize(new THREE.Vector3()).length();
}
