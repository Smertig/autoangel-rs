import type { AutoangelModule } from '../../../types/autoangel';
import type { RefExtractor } from '../../../pck/index/extractors';
import type { RawRef } from '../../../pck/index/types';
import { resolvePath } from '../../util/model-dependencies';

/** Extracts the direct refs of an SMD: skeleton (.bon), skin paths (.ski),
 *  and the optional tcksDir which the indexer expands into per-`.stck`
 *  animation edges. No recursion — child refs are followed by their own
 *  extractors when those files are indexed. */
export const smdExtractor: RefExtractor = {
  name: 'smd',
  ext: '.smd',
  version: 1,
  extract(data, sourcePath, wasm: AutoangelModule): RawRef[] {
    using smd = wasm.SmdModel.parse(data);
    const refs: RawRef[] = [];

    if (smd.skeletonPath) {
      refs.push({
        kind: 'skeleton',
        raw: smd.skeletonPath,
        candidates: [resolvePath(smd.skeletonPath, sourcePath)],
      });
    }

    for (const skinPath of smd.skinPaths ?? []) {
      if (!skinPath) continue;
      refs.push({
        kind: 'skin',
        raw: skinPath,
        candidates: [resolvePath(skinPath, sourcePath)],
      });
    }

    if (smd.tcksDir) {
      refs.push({
        kind: 'animation',
        raw: smd.tcksDir,
        candidates: [],
        dirCandidates: [resolvePath(smd.tcksDir, sourcePath)],
        dirExt: '.stck',
      });
    }

    return refs;
  },
};
