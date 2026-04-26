import type { GfxElement, KeyPointSet } from '../../../types/autoangel';
import type { ElementBodyKind } from '../gfx/previews/types';

export type DurationElement = Pick<GfxElement, 'body' | 'key_point_set'>;
export type GfxLike = { elements: ReadonlyArray<GfxElement> };
export type ResolveGfx = (gfxPath: string) => GfxLike | null;
export type IsRenderable = (kind: ElementBodyKind) => boolean;

export interface DurationContext {
  resolve: ResolveGfx;
  visiting: Set<string>;
  isRenderable: IsRenderable;
}

/** Sum a KeyPointSet's keyframe timeline, in seconds. `time_span === -1`
 *  ("hold forever") returns `Infinity` — the caller decides whether to
 *  treat it as a no-loop signal (tail prediction) or a never-finish signal
 *  (per-runtime timeSpanSec). */
export function keyPointSetDurationSec(kps: KeyPointSet | undefined): number {
  if (!kps) return 0;
  let total = kps.start_time;
  for (const k of kps.keypoints) {
    if (k.time_span === -1) return Infinity;
    total += k.time_span;
  }
  return total / 1000;
}
