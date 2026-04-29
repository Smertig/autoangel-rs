import type { AutoangelModule } from '../../../types/autoangel';
import type { RefExtractor } from '../../../pck/index/extractors';
import type { RawRef } from '../../../pck/index/types';
import { ENGINE_PATH_PREFIXES, withEnginePrefixes } from '../../components/gfx/util/resolveEnginePath';
import { resolvePath } from '../../util/model-dependencies';

// Mirror of EcmEvent.event_type values used by the model viewer's
// `buildAnimEventMap` (see model-viewer/internal/event-map.ts). Kept local
// to avoid a UI-internal import from this pure data extractor.
const EVENT_GFX = 100;
const EVENT_SOUND = 101;

/** Extracts the direct refs of an ECM: the linked SMD, additional SKI
 *  skins, child ECMs, plus per-event GFX/sound paths from combined
 *  actions (timeline events on animations). Recursion is handled by the
 *  indexer — each child ECM and each emitted GFX is indexed independently
 *  when its file is reached. */
export const ecmExtractor: RefExtractor = {
  name: 'ecm',
  ext: '.ecm',
  version: 2,
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

    const actionCount = ecm.combineActionCount ?? 0;
    for (let i = 0; i < actionCount; i++) {
      const eventCount = ecm.combineActionEventCount(i);
      for (let e = 0; e < eventCount; e++) {
        const ev = ecm.getEvent(i, e);
        if (!ev || !ev.fx_file_path) continue;
        if (ev.event_type === EVENT_GFX) {
          refs.push({
            kind: 'gfx',
            raw: ev.fx_file_path,
            candidates: withEnginePrefixes(ev.fx_file_path, ENGINE_PATH_PREFIXES.gfx),
          });
        } else if (ev.event_type === EVENT_SOUND) {
          refs.push({
            kind: 'sound',
            raw: ev.fx_file_path,
            candidates: withEnginePrefixes(ev.fx_file_path, ENGINE_PATH_PREFIXES.sound),
          });
        }
      }
    }

    return refs;
  },
};
