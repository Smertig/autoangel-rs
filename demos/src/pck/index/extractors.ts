import type { AutoangelModule } from '../../types/autoangel';
import type { RawRef } from './types';

/** Stateless per-format ref extractor.
 *
 *  Lives in a UI-free file (`shared/formats/<name>/extract.ts`) so the
 *  index worker can import it without pulling React/JSX. The index uses
 *  `name` as the perTypeVersions key — `ext` is for ext-based dispatch. */
export interface RefExtractor {
  /** Stable identity for invalidation. Matches FormatDescriptor.name. */
  name: string;
  /** Lowercase extension including the dot, e.g. '.ecm'. */
  ext: string;
  /** Hand-bumped whenever `extract` output shape or content changes. */
  version: number;
  /** Pure function: given the file bytes and its archive path, return
   *  the raw refs found inside. Engine-prefix knowledge belongs here,
   *  not in the indexer. May throw — caller catches and records as a
   *  per-file error. */
  extract(data: Uint8Array, sourcePath: string, wasm: AutoangelModule): RawRef[];
}

/** Lazy loaders. Each entry resolves to a concrete RefExtractor.
 *  Order has no semantic meaning. */
export const EXTRACTOR_LOADERS: Array<() => Promise<RefExtractor>> = [
  () => import('@shared/formats/ski/extract').then((m) => m.skiExtractor),
  () => import('@shared/formats/smd/extract').then((m) => m.smdExtractor),
  () => import('@shared/formats/ecm/extract').then((m) => m.ecmExtractor),
  () => import('@shared/formats/bmd/extract').then((m) => m.bmdExtractor),
  () => import('@shared/formats/gfx/extract').then((m) => m.gfxExtractor),
];
