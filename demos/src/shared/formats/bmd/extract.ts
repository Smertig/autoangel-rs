import type { AutoangelModule } from '../../../types/autoangel';
import type { RefExtractor } from '../../../pck/index/extractors';
import type { RawRef } from '../../../pck/index/types';
import { normalizePathKey } from '../../../pck/index/pathKey';

/** Extracts texture refs from a BMD's per-mesh `texture_map`. BMD textures
 *  are loaded directly via `getFile(texture_map)` with no engine prefix
 *  (see render-bmd.ts), so the candidate is the raw path. Duplicate
 *  texture maps across meshes collapse into one ref. */
export const bmdExtractor: RefExtractor = {
  name: 'bmd',
  ext: '.bmd',
  version: 1,
  extract(data, _sourcePath, wasm: AutoangelModule): RawRef[] {
    const bmd = wasm.parseBmd(data);
    const refs: RawRef[] = [];
    const seen = new Set<string>();
    for (const mesh of bmd.meshes ?? []) {
      const tex = mesh.texture_map;
      if (!tex) continue;
      const key = normalizePathKey(tex);
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push({
        kind: 'texture',
        raw: tex,
        candidates: [tex],
      });
    }
    return refs;
  },
};
