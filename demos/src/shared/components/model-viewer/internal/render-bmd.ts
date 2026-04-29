import type * as ThreeModule from 'three';
import type { AutoangelModule } from '../../../../types/autoangel';
import { ensureThree, getThree } from './three';
import type { GetFile } from './paths';
import { loadThreeTexture } from './texture';
import { mountScene } from './scene';
import type { SkinStats } from './mesh';
import { buildBmdMeshes } from './bmd-mesh';

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

  const { meshes, stats: meshStats } = buildBmdMeshes(THREE, bmd, textureByPath);
  for (const m of meshes) root.add(m);

  const stats: SkinStats = {
    ...meshStats,
    textures: [...textureByPath.values()].filter(Boolean).length,
  };

  mountScene(container, root, stats, bmdData, '.bmd');
}
