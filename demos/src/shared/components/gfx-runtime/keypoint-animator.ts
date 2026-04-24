import type { Object3D } from 'three';
import { buildTrack, sampleTrack, type Sample, type Track } from '../gfx/util/keypointTrack';
import { applyKeypointTransform } from '../gfx/util/keypointApply';
import type { GfxElement } from '../../../types/autoangel';

type KeyPointSet = NonNullable<GfxElement['key_point_set']>;

export interface KeypointAnimator {
  /** Advance to absolute elapsedMs (since runtime spawn), apply transform to
   *  `target`, return the sample so callers can inspect the color channel. */
  tickTo(elapsedMs: number, target: Object3D): Sample;
}

// The GfxLoader caches parsed `.gfx` objects by path, so repeat-fires of the
// same event share `KeyPointSet` object identity. Cache the built Track to
// avoid rebuilding ~8 parallel arrays on every spawn.
const TRACK_CACHE = new WeakMap<KeyPointSet, Track>();

export function createKeypointAnimator(kps: KeyPointSet | undefined): KeypointAnimator | null {
  if (!kps) return null;
  let track = TRACK_CACHE.get(kps);
  if (!track) {
    track = buildTrack(kps);
    TRACK_CACHE.set(kps, track);
  }
  return {
    tickTo(elapsedMs, target) {
      const tMs = track.loopable ? elapsedMs % track.loopDurationMs : elapsedMs;
      const sample = sampleTrack(track, tMs);
      applyKeypointTransform(sample, target);
      return sample;
    },
  };
}
