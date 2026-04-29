import type { AutoangelModule } from '../../../types/autoangel';
import type { RefExtractor } from '../../../pck/index/extractors';
import type { RawRef } from '../../../pck/index/types';
import { ENGINE_PATH_PREFIXES, withEnginePrefixes } from '../../components/gfx/util/resolveEnginePath';

/** Extracts asset refs from a GFX file. Each element may carry:
 *  - per-element `tex_file` (particles especially) — engine textures dir
 *  - container body's `gfx_path` — engine gfx dir
 *  - model body's `model_path` — engine models dir
 *  - sound body's `paths` — engine sound dir
 *
 *  Engine-prefix knowledge stays in this extractor (resolves at
 *  extraction time into a candidate list per ref). */
export const gfxExtractor: RefExtractor = {
  name: 'gfx',
  ext: '.gfx',
  version: 1,
  extract(data, _sourcePath, wasm: AutoangelModule): RawRef[] {
    const gfx = wasm.parseGfx(data);
    const refs: RawRef[] = [];

    for (const el of gfx.elements ?? []) {
      if (el.tex_file) {
        refs.push({
          kind: 'texture',
          raw: el.tex_file,
          candidates: withEnginePrefixes(el.tex_file, ENGINE_PATH_PREFIXES.textures),
        });
      }
      const body = el.body;
      if (!body) continue;
      if (body.kind === 'container' && body.gfx_path) {
        refs.push({
          kind: 'gfx',
          raw: body.gfx_path,
          candidates: withEnginePrefixes(body.gfx_path, ENGINE_PATH_PREFIXES.gfx),
        });
      } else if (body.kind === 'model' && body.model_path) {
        refs.push({
          kind: 'model',
          raw: body.model_path,
          candidates: withEnginePrefixes(body.model_path, ENGINE_PATH_PREFIXES.models),
        });
      } else if (body.kind === 'sound') {
        for (const sp of body.paths ?? []) {
          if (!sp) continue;
          refs.push({
            kind: 'sound',
            raw: sp,
            candidates: withEnginePrefixes(sp, ENGINE_PATH_PREFIXES.sound),
          });
        }
      }
    }

    return refs;
  },
};
