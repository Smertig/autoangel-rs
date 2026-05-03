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
    const smd = wasm.parseSmd(data);
    const refs: RawRef[] = [];

    if (smd.skeleton_path) {
      refs.push({
        kind: 'skeleton',
        raw: smd.skeleton_path,
        candidates: [resolvePath(smd.skeleton_path, sourcePath)],
      });
    }

    for (const skinPath of smd.skin_paths ?? []) {
      if (!skinPath) continue;
      refs.push({
        kind: 'skin',
        raw: skinPath,
        candidates: [resolvePath(skinPath, sourcePath)],
      });
    }

    if (smd.tcks_dir) {
      refs.push({
        kind: 'animation',
        raw: smd.tcks_dir,
        candidates: [],
        dirCandidates: [resolvePath(smd.tcks_dir, sourcePath)],
        dirExt: '.stck',
      });
    }

    return refs;
  },
};
