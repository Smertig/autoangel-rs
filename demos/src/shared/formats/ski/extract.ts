import type { AutoangelModule } from '../../../types/autoangel';
import type { RefExtractor } from '../../../pck/index/extractors';
import type { RawRef } from '../../../pck/index/types';
import { textureCandidates } from '../../util/model-dependencies';

/** Extracts texture refs from a SKI file. The engine tries three locations
 *  in order — `textureCandidates` already encodes that priority, so we
 *  pass the list straight through as the candidate set per ref. */
export const skiExtractor: RefExtractor = {
  name: 'ski',
  ext: '.ski',
  version: 1,
  extract(data, sourcePath, wasm: AutoangelModule): RawRef[] {
    using skin = wasm.Skin.parse(data);
    const refs: RawRef[] = [];
    for (const texName of skin.textures ?? []) {
      if (!texName) continue;
      refs.push({
        kind: 'texture',
        raw: texName,
        candidates: textureCandidates(sourcePath, texName),
      });
    }
    return refs;
  },
};
