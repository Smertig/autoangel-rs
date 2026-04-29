import type * as ThreeModule from 'three';
import type { BmdModel } from 'autoangel';
import './texture'; // for `_hasAlpha` augmentation on `THREE.Texture`

/** Build the empty BMD root group with the model's basis (dir/up/right)
 *  + position + scale applied. Caller adds meshes via `buildBmdMeshes`. */
export function buildBmdRoot(THREE: typeof ThreeModule, bmd: BmdModel): ThreeModule.Group {
  const root = new THREE.Group();
  root.name = 'bmd-root';

  const dir = new THREE.Vector3(...bmd.dir).normalize();
  const up = new THREE.Vector3(...bmd.up).normalize();
  const right = new THREE.Vector3().crossVectors(up, dir).normalize();
  const basis = new THREE.Matrix4().makeBasis(right, up, dir);
  basis.setPosition(new THREE.Vector3(...bmd.pos));
  root.applyMatrix4(basis);
  root.scale.set(...bmd.scale);

  return root;
}

/** Stats accumulated while building meshes. The full viewer's HUD also
 *  surfaces texture count separately — that's added by the caller. */
export interface BmdBuildStats {
  meshes: number;
  verts: number;
  tris: number;
}

/**
 * Build the THREE.Mesh objects for a parsed BMD model. Per-mesh material
 * uses the texture from `textureByPath` if present, else falls back to a
 * plain gray material — matching the full viewer's behavior on missing
 * textures.
 *
 * Caller is responsible for adding the meshes to a scene/group and for
 * disposing geometries and materials when done.
 */
export function buildBmdMeshes(
  THREE: typeof ThreeModule,
  bmd: BmdModel,
  textureByPath: Map<string, ThreeModule.Texture | null>,
): { meshes: ThreeModule.Mesh[]; stats: BmdBuildStats } {
  const meshes: ThreeModule.Mesh[] = [];
  const stats: BmdBuildStats = { meshes: 0, verts: 0, tris: 0 };

  for (const mesh of bmd.meshes) {
    if (mesh.positions.length === 0 || mesh.indices.length === 0) continue;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(new Float32Array(mesh.positions.flat()), 3),
    );
    if (mesh.normals.length === mesh.positions.length) {
      geom.setAttribute(
        'normal',
        new THREE.Float32BufferAttribute(new Float32Array(mesh.normals.flat()), 3),
      );
    }
    if (mesh.uvs.length === mesh.positions.length) {
      geom.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute(new Float32Array(mesh.uvs.flat()), 2),
      );
    }
    geom.setIndex(new THREE.Uint16BufferAttribute(new Uint16Array(mesh.indices), 1));

    const map = textureByPath.get(mesh.texture_map) ?? null;
    const hasAlpha = !!map?._hasAlpha;
    const mat = new THREE.MeshStandardMaterial({
      map,
      side: THREE.DoubleSide,
      color: map ? 0xffffff : 0x888888,
      transparent: hasAlpha,
      alphaTest: hasAlpha ? 0.1 : 0,
    });

    const m = new THREE.Mesh(geom, mat);
    m.name = mesh.name;
    meshes.push(m);

    stats.meshes++;
    stats.verts += mesh.positions.length;
    stats.tris += mesh.indices.length / 3;
  }

  return { meshes, stats };
}
