import type { AutoangelModule } from '../../../../types/autoangel';
import { getThree } from './three';

export interface BoneScaleData {
  boneIndex: number;
  scale: [number, number, number];
  scaleType: number; // -1 = BoneScaleEx
}

export function readEcmBoneScales(ecm: any): { entries: BoneScaleData[]; isNew: boolean; baseBone: string | undefined } {
  const count: number = ecm.boneScaleCount;
  const entries: BoneScaleData[] = [];
  for (let i = 0; i < count; i++) {
    const bs = ecm.getBoneScale(i);
    if (!bs) continue;
    entries.push({
      boneIndex: bs.bone_index,
      scale: [bs.scale[0], bs.scale[1], bs.scale[2]],
      // BoneScaleEx (new format) leaves scale_type as null; preserve the
      // legacy -1 sentinel so downstream consumers don't have to special-case.
      scaleType: bs.scale_type ?? -1,
    });
  }
  return { entries, isNew: ecm.newBoneScale, baseBone: ecm.scaleBaseBone };
}

/**
 * Apply BoneScaleEx entries: store per-bone scale factors in userData.
 * These affect the child translation offset during hierarchy update.
 */
export function applyBoneScales(bones: any[], entries: BoneScaleData[], isNew: boolean): void {
  for (const e of entries) {
    const bone = bones[e.boneIndex];
    if (!bone) continue;
    if (isNew) {
      // BoneScaleEx: [lenFactor, thickFactor, wholeFactor]
      bone.userData.lenScale = e.scale[0];
      bone.userData.thickScale = e.scale[1];
      bone.userData.wholeScale = e.scale[2];
    } else {
      // Old format: direct scale vector
      bone.userData.boneScale = e.scale;
      bone.userData.boneScaleType = e.scaleType;
    }
  }
}

/**
 * Compute foot offset per the design doc (section 11a).
 * Returns the Y offset to subtract from all bone world positions.
 */
export function computeFootOffset(
  bones: any[],
  boneNames: string[],
  baseBone: string | undefined,
  tmpRoot: any,
): number {
  const { THREE } = getThree();
  // 1. Current world matrices are the UNSCALED rest pose (already computed)
  //    Find the foot bone.
  let footIdx = -1;
  if (baseBone) {
    footIdx = boneNames.indexOf(baseBone);
  }
  if (footIdx < 0) {
    // Find bone with lowest world Y
    let minY = Infinity;
    const pos = new THREE.Vector3();
    for (let i = 0; i < bones.length; i++) {
      if (bones[i].name === '__root_world__') continue;
      bones[i].getWorldPosition(pos);
      if (pos.y < minY) { minY = pos.y; footIdx = i; }
    }
  }
  if (footIdx < 0) return 0;

  const footBone = bones[footIdx];
  // 2. Ground point in world space (foot projected to Y=0)
  const footWorld = new THREE.Vector3();
  footBone.getWorldPosition(footWorld);
  const groundWorld = new THREE.Vector3(footWorld.x, 0, footWorld.z);

  // 3. Transform ground point to foot bone local space
  const invWorld = new THREE.Matrix4().copy(footBone.matrixWorld).invert();
  const groundLocal = groundWorld.clone().applyMatrix4(invWorld);

  // 4. Apply bone scaling to the hierarchy
  //    Scale child translations by parent's accumulated scale
  applyBoneScalesToHierarchy(bones);
  tmpRoot.updateWorldMatrix(false, true);

  // 5. Transform ground point back to world using SCALED bone matrix
  const groundScaled = groundLocal.clone().applyMatrix4(footBone.matrixWorld);
  return groundScaled.y;
}

/**
 * Propagate bone scale userData into the actual bone translations.
 * For BoneScaleEx: child position *= parent's (wholeScale * lenScale).
 */
export function applyBoneScalesToHierarchy(bones: any[]): void {
  // Accumulate whole_scale down the tree (BFS from roots)
  for (const bone of bones) {
    const parentWhole = bone.parent?.userData?.accumulatedWholeScale ?? 1;
    const ownWhole = bone.userData.wholeScale ?? 1;
    bone.userData.accumulatedWholeScale = parentWhole * ownWhole;

    const parentLen = bone.parent?.userData?.lenScale ?? 1;
    const factor = parentWhole * parentLen;
    if (factor !== 1) {
      bone.position.multiplyScalar(factor);
    }
  }
}

export function buildSkeleton(wasm: AutoangelModule, bonData: Uint8Array): {
  skeleton: any;
  bones: any[];
  boneNames: string[];
  tmpRoot: any;
  hooksByName: Map<string, any>;
  bonesByName: Map<string, any>;
} {
  const { THREE } = getThree();
  const skel = wasm.parseSkeleton(bonData);
  const boneCount = skel.bones.length;
  const bones: any[] = [];
  const boneNames: string[] = [];

  for (let i = 0; i < boneCount; i++) {
    const bone = new THREE.Bone();
    bone.name = skel.bones[i].name || `bone_${i}`;
    bones.push(bone);
    boneNames.push(bone.name);
  }

  for (let i = 0; i < boneCount; i++) {
    const parentIdx = skel.bones[i].parent;
    if (parentIdx >= 0 && parentIdx < boneCount) {
      bones[parentIdx].add(bones[i]);
    }
  }

  // Derive bind-pose local transforms from mat_bone_init (inverse bind matrices).
  // The BON file's mat_relative represents the runtime/animation state, not the
  // bind pose where vertices were authored. We compute bind-pose locals as:
  //   bind_world[i] = inverse(mat_bone_init[i])
  //   bind_local[i] = inverse(bind_world[parent]) × bind_world[i]
  const boneInverses: any[] = [];
  for (let i = 0; i < boneCount; i++) {
    const bone = skel.bones[i];
    const initMat = new THREE.Matrix4().fromArray(bone.mat_bone_init);
    boneInverses.push(initMat);

    const bindWorld = initMat.clone().invert();
    const parentIdx = bone.parent;
    let bindLocal;
    if (parentIdx >= 0 && parentIdx < boneCount) {
      // bind_local = inverse(bind_world[parent]) × bind_world[i]
      //            = mat_bone_init[parent] × bind_world[i]
      bindLocal = boneInverses[parentIdx].clone().multiply(bindWorld);
    } else {
      bindLocal = bindWorld;
    }
    bindLocal.decompose(bones[i].position, bones[i].quaternion, bones[i].scale);

    if (bone.is_flipped) {
      bones[i].scale.x *= -1;
    }
  }

  // Materialize hooks (HH_*, CC_*, etc.) as Object3D children of their
  // owning bone. ECM GFX events target these by name, so they need to
  // participate in the three.js scene graph just like bones do.
  const hooksByName = new Map<string, any>();
  for (const h of skel.hooks) {
    const parent = bones[h.bone_index];
    if (!parent) continue;
    const hookObj = new THREE.Group();
    hookObj.name = h.name;
    // Hook transform is 16 floats, column-major local-to-bone — matches
    // three.js Matrix4.fromArray convention used for boneInitTransform.
    const mat = new THREE.Matrix4().fromArray(h.transform);
    mat.decompose(hookObj.position, hookObj.quaternion, hookObj.scale);
    parent.add(hookObj);
    hooksByName.set(h.name, hookObj);
  }

  // Update world matrices
  const tmpRoot = new THREE.Object3D();
  for (const b of bones) {
    if (!b.parent || b.parent.type !== 'Bone') tmpRoot.add(b);
  }
  tmpRoot.updateWorldMatrix(false, true);

  // Extra bone slot at index == boneCount
  const extraBone = new THREE.Bone();
  extraBone.name = '__root_world__';
  tmpRoot.add(extraBone);
  bones.push(extraBone);
  boneNames.push(extraBone.name);
  boneInverses.push(new THREE.Matrix4());
  tmpRoot.updateWorldMatrix(false, true);

  const skeleton = new THREE.Skeleton(bones, boneInverses);
  const bonesByName = new Map<string, any>();
  for (const b of bones) bonesByName.set(b.name, b);
  return { skeleton, bones, boneNames, tmpRoot, hooksByName, bonesByName };
}
