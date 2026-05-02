import type * as ThreeModule from 'three';
import type { AutoangelModule } from '../../../../types/autoangel';
import type { PackageView } from '@shared/package';
import { textureCandidates, tryLoadSki } from '@shared/util/model-dependencies';
import { getThree } from './three';
import { loadThreeTexture } from './texture';

/** Release everything `loadSkinFile` allocates: each mesh's geometry, its
 *  material(s), and the texture attached as `material.map`. Hover preview
 *  renderers call this from both their success-path cleanup and their
 *  catch block — keeps the two paths in sync. */
export function disposeSkinMeshes(meshes: readonly ThreeModule.Mesh[]): void {
  for (const m of meshes) {
    m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const mapped = mat as ThreeModule.Material & { map?: ThreeModule.Texture | null };
      mapped.map?.dispose();
      mat.dispose();
    }
  }
}

export function buildMesh(
  skin: any,
  index: number,
  textures: (any | null)[],
  kind: string,
  skeleton?: any,
  boneRemap?: Uint16Array,
  rigidBoneIdx?: number,
): ThreeModule.Mesh | null {
  const { THREE } = getThree();
  const positions = skin[`${kind}MeshPositions`](index);
  const normals = skin[`${kind}MeshNormals`](index);
  const uvs = skin[`${kind}MeshUvs`](index);
  const indices = skin[`${kind}MeshIndices`](index);
  if (!positions || !indices || positions.length === 0) return null;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (normals) geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  if (uvs) geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(new THREE.Uint16BufferAttribute(indices, 1));

  const texIdx = skin[`${kind}MeshTextureIndex`](index);
  const map = (texIdx >= 0 && textures[texIdx]) || null;
  const hasAlpha = map && map._hasAlpha;

  const mat = new THREE.MeshStandardMaterial({
    map,
    side: THREE.DoubleSide,
    color: map ? 0xffffff : 0x888888,
    transparent: hasAlpha || false,
    alphaTest: hasAlpha ? 0.1 : 0,
  });

  if (kind === 'skin' && skeleton) {
    const weights = skin.skinMeshBoneWeights(index);
    const boneIndices = skin.skinMeshBoneIndices(index);
    if (weights && boneIndices) {
      geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
      // Remap bone indices from SKI order to BON/skeleton order
      const indices16 = new Uint16Array(boneIndices.length);
      for (let k = 0; k < boneIndices.length; k++) {
        indices16[k] = boneRemap ? boneRemap[boneIndices[k]] : boneIndices[k];
      }
      geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices16, 4));
      const skinnedMesh = new THREE.SkinnedMesh(geom, mat);
      skinnedMesh.bind(skeleton, new THREE.Matrix4());
      return skinnedMesh;
    }
  }

  // Rigid mesh with skeleton: bind all vertices to a single bone
  if (kind === 'rigid' && skeleton && rigidBoneIdx != null && rigidBoneIdx >= 0) {
    const vertCount = positions.length / 3;
    const weights = new Float32Array(vertCount * 4);
    const boneIndices = new Uint16Array(vertCount * 4);
    for (let v = 0; v < vertCount; v++) {
      weights[v * 4] = 1;  // 100% weight on first bone slot
      boneIndices[v * 4] = rigidBoneIdx;
    }
    geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(boneIndices, 4));
    const skinnedMesh = new THREE.SkinnedMesh(geom, mat);
    skinnedMesh.bind(skeleton, new THREE.Matrix4());
    return skinnedMesh;
  }

  return new THREE.Mesh(geom, mat);
}

export interface SkinStats {
  verts: number;
  tris: number;
  meshes: number;
  textures: number;
}

export async function loadSkinFile(
  wasm: AutoangelModule,
  pkg: PackageView,
  skiArchivePath: string,
  skiData: Uint8Array,
  skeleton?: any,
  skelBoneNames?: string[],
): Promise<{ meshes: ThreeModule.Mesh[]; stats: SkinStats }> {
  using skin = wasm.Skin.parse(skiData);
  const stats: SkinStats = { verts: 0, tris: 0, meshes: 0, textures: 0 };
  const meshes: ThreeModule.Mesh[] = [];

  {
    // Build remap table: SKI bone index → skeleton (BON) bone index
    let boneRemap: Uint16Array | undefined;
    if (skeleton && skelBoneNames) {
      const skiBoneNames: string[] = skin.boneNames || [];
      if (skiBoneNames.length > 0) {
        const nameToIdx = new Map<string, number>();
        for (let i = 0; i < skelBoneNames.length; i++) nameToIdx.set(skelBoneNames[i], i);
        boneRemap = new Uint16Array(skiBoneNames.length);
        for (let i = 0; i < skiBoneNames.length; i++) {
          boneRemap[i] = nameToIdx.get(skiBoneNames[i]) ?? 0;
        }
        console.log(`[model] Bone remap: ${skiBoneNames.length} SKI bones → ${skelBoneNames.length} BON bones`);
      } else {
        console.warn('[model] No SKI bone names — cannot remap');
      }
    }

    const textureNames: string[] = skin.textures || [];
    const textures = await Promise.all(
      textureNames.map(async (texName: string) => {
        for (const tp of textureCandidates(skiArchivePath, texName)) {
          const texData = await pkg.read(tp);
          if (texData) return await loadThreeTexture(wasm, texData, texName);
        }
        console.warn('[model] Texture not found:', texName);
        return null;
      }),
    );
    stats.textures = textures.filter(Boolean).length;

    for (let i = 0; i < skin.skinMeshCount; i++) {
      const mesh = buildMesh(skin, i, textures, 'skin', skeleton, boneRemap);
      if (mesh) meshes.push(mesh);
    }
    for (let i = 0; i < skin.rigidMeshCount; i++) {
      let boneIdx = skin.rigidMeshBoneIndex(i);
      if (boneIdx >= 0 && boneRemap) boneIdx = boneRemap[boneIdx] ?? boneIdx;
      const mesh = buildMesh(skin, i, textures, 'rigid',
        skeleton && boneIdx >= 0 ? skeleton : undefined,
        undefined, boneIdx >= 0 ? boneIdx : undefined);
      if (mesh) meshes.push(mesh);
    }

    for (const m of meshes) {
      stats.meshes++;
      stats.verts += m.geometry.attributes.position.count;
      stats.tris += m.geometry.index ? m.geometry.index.count / 3 : 0;
    }
  }

  return { meshes, stats };
}

/** Load every SKI variant in parallel (independent reads, decode, GPU upload).
 *  Returns one mesh array per input path; empty arrays for paths that don't
 *  resolve. Used by SMD/ECM hover previews where the slowest single SKI
 *  bounds time-to-first-paint. */
export async function loadAllSkins(
  wasm: AutoangelModule,
  pkg: PackageView,
  skiPaths: readonly string[],
  opts?: { skeleton?: any; boneNames?: string[] },
): Promise<ThreeModule.Mesh[][]> {
  return Promise.all(
    skiPaths.map(async (skiPath) => {
      const ski = await tryLoadSki(skiPath, pkg);
      if (!ski) return [];
      const { meshes } = await loadSkinFile(
        wasm, pkg, ski.archivePath, ski.data, opts?.skeleton, opts?.boneNames,
      );
      return meshes;
    }),
  );
}
