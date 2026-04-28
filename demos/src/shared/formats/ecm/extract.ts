import type { AutoangelModule } from '../../../types/autoangel';
import type { RefExtractor } from '../../../pck/index/extractors';
import type { RawRef } from '../../../pck/index/types';
import { resolvePath } from '../../util/model-dependencies';

/** Extracts the direct refs of an ECM: the linked SMD, additional SKI
 *  skins, and child ECMs. Recursion is handled by the indexer (each
 *  child ECM is indexed independently when its file is reached). */
export const ecmExtractor: RefExtractor = {
  name: 'ecm',
  ext: '.ecm',
  version: 1,
  extract(data, sourcePath, wasm: AutoangelModule): RawRef[] {
    using ecm = wasm.EcmModel.parse(data);
    const refs: RawRef[] = [];

    if (ecm.skinModelPath) {
      refs.push({
        kind: 'skin-model',
        raw: ecm.skinModelPath,
        candidates: [resolvePath(ecm.skinModelPath, sourcePath)],
      });
    }

    for (const sp of ecm.additionalSkins ?? []) {
      if (!sp) continue;
      refs.push({
        kind: 'additional-skin',
        raw: sp,
        candidates: [resolvePath(sp, sourcePath)],
      });
    }

    for (let i = 0; i < ecm.childCount; i++) {
      const child = ecm.getChild(i);
      if (!child) continue;
      refs.push({
        kind: 'child-ecm',
        raw: child.path,
        candidates: [resolvePath(child.path, sourcePath)],
      });
    }

    return refs;
  },
};
