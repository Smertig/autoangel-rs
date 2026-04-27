import type * as ThreeModule from 'three';
import type { AutoangelModule } from '../../../../types/autoangel';
import { ensureThree, getThree } from './three';
import type { GetFile } from './paths';
import { loadThreeTexture } from './texture';
import { mountScene } from './scene';
import type { SkinStats } from './mesh';

export async function renderBmd(
  container: HTMLElement,
  wasm: AutoangelModule,
  getFile: GetFile,
  bmdData: Uint8Array,
): Promise<void> {
  await ensureThree();
  const { THREE } = getThree();

  const bmd = wasm.parseBmd(bmdData);

  const root = new THREE.Group();
  root.name = 'bmd-root';

  const dir = new THREE.Vector3(...bmd.dir).normalize();
  const up = new THREE.Vector3(...bmd.up).normalize();
  const right = new THREE.Vector3().crossVectors(up, dir).normalize();
  const basis = new THREE.Matrix4().makeBasis(right, up, dir);
  basis.setPosition(new THREE.Vector3(...bmd.pos));
  root.applyMatrix4(basis);
  root.scale.set(...bmd.scale);

  const stats: SkinStats = { verts: 0, tris: 0, meshes: 0, textures: 0 };

  // Serial awaits per mesh would N×-multiply OPFS/network round-trips for
  // buildings with many sub-meshes that share materials.
  const uniqueTexPaths = Array.from(
    new Set(bmd.meshes.map((m) => m.texture_map).filter((p): p is string => !!p)),
  );
  const textureByPath = new Map<string, ThreeModule.Texture | null>(
    await Promise.all(
      uniqueTexPaths.map(async (p): Promise<[string, ThreeModule.Texture | null]> => {
        try {
          const data = await getFile(p);
          if (!data) {
            console.warn('[bmd] Texture not found:', p);
            return [p, null];
          }
          return [p, await loadThreeTexture(wasm, data, p)];
        } catch (e) {
          console.warn('[bmd] Texture load failed:', p, e);
          return [p, null];
        }
      }),
    ),
  );

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
    const hasAlpha = !!(map && map._hasAlpha);
    const mat = new THREE.MeshStandardMaterial({
      map,
      side: THREE.DoubleSide,
      color: map ? 0xffffff : 0x888888,
      transparent: hasAlpha,
      alphaTest: hasAlpha ? 0.1 : 0,
    });

    const m = new THREE.Mesh(geom, mat);
    m.name = mesh.name;
    root.add(m);

    stats.meshes++;
    stats.verts += mesh.positions.length;
    stats.tris += mesh.indices.length / 3;
  }
  stats.textures = [...textureByPath.values()].filter(Boolean).length;

  mountScene(container, root, stats, bmdData, '.bmd');
}
