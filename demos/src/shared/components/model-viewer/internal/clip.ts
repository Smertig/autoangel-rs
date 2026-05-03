import type { Animation, SmdAction, Track } from 'autoangel';
import type { AutoangelModule } from '../../../../types/autoangel';
import { getThree } from './three';

export class ClipCache {
  private map = new Map<string, any>();
  constructor(private maxSize: number) {}

  get(name: string): any | undefined {
    const clip = this.map.get(name);
    if (clip !== undefined) {
      this.map.delete(name);
      this.map.set(name, clip);
    }
    return clip;
  }

  set(name: string, clip: any): void {
    if (this.map.has(name)) {
      this.map.delete(name);
    } else if (this.map.size >= this.maxSize) {
      const first = this.map.keys().next().value!;
      this.map.delete(first);
    }
    this.map.set(name, clip);
  }
}

export function buildKeyTimes(keyCount: number, frameIds: ArrayLike<number> | undefined, frameRate: number): Float32Array {
  const times = new Float32Array(keyCount);
  if (frameIds) {
    for (let k = 0; k < keyCount; k++) times[k] = frameIds[k] / frameRate;
  } else {
    for (let k = 0; k < keyCount; k++) times[k] = k / frameRate;
  }
  return times;
}

export function buildAnimationClip(
  wasm: AutoangelModule,
  stckData: Uint8Array,
  clipName: string,
  boneNames: string[],
): any | null {
  const { THREE } = getThree();
  const ts = wasm.parseAnimation(stckData);
  const fps = ts.anim_fps || 30;
  const animEnd = ts.anim_end ?? ts.anim_start;
  const duration = (animEnd - ts.anim_start) / fps;
  const tracks: any[] = [];

  for (const bt of ts.bone_tracks) {
    const boneId = bt.bone_id;
    if (boneId < 0 || boneId >= boneNames.length) continue;
    const boneName = boneNames[boneId];

    const posKeys = bt.position.keys;
    if (posKeys.length > 0) {
      const posIds = bt.position.key_frame_ids ?? undefined;
      const times = buildKeyTimes(posKeys.length / 3, posIds, bt.position.frame_rate);
      tracks.push(new THREE.VectorKeyframeTrack(`${boneName}.position`, times, posKeys));
    }

    const rotKeys = bt.rotation.keys;
    if (rotKeys.length > 0) {
      const rotIds = bt.rotation.key_frame_ids ?? undefined;
      const times = buildKeyTimes(rotKeys.length / 4, rotIds, bt.rotation.frame_rate);
      tracks.push(new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, rotKeys));
    }
  }

  if (tracks.length === 0 || duration <= 0) return null;
  return new THREE.AnimationClip(clipName, duration, tracks);
}

/** Filter to keys in [startSec, endSec], rebased to start at 0. */
function sliceTrack(
  track: Track,
  startSec: number,
  endSec: number,
  floatsPerKey: number,
): { times: Float32Array; values: Float32Array } | null {
  const numKeys = track.keys.length / floatsPerKey;
  if (numKeys === 0) return null;
  const times = buildKeyTimes(numKeys, track.key_frame_ids ?? undefined, track.frame_rate);

  const filteredTimes: number[] = [];
  const filteredValues: number[] = [];
  for (let k = 0; k < numKeys; k++) {
    const t = times[k];
    if (t >= startSec && t <= endSec) {
      filteredTimes.push(t - startSec);
      for (let i = 0; i < floatsPerKey; i++) {
        filteredValues.push(track.keys[k * floatsPerKey + i]);
      }
    }
  }
  if (filteredTimes.length === 0) return null;
  return {
    times: new Float32Array(filteredTimes),
    values: new Float32Array(filteredValues),
  };
}

/** Per-clip three.js AnimationClip sliced from a BON-embedded `Animation` by
 *  an `SmdAction`'s frame range. */
export function sliceEmbeddedAnimationClip(
  animation: Animation,
  action: SmdAction,
  boneNames: string[],
): any | null {
  const { THREE } = getThree();
  const fps = animation.anim_fps || 30;
  const startSec = action.start_frame / fps;
  const endSec = action.end_frame / fps;
  const duration = endSec - startSec;
  if (duration <= 0) return null;

  const tracks: any[] = [];
  for (const bt of animation.bone_tracks) {
    if (bt.bone_id < 0 || bt.bone_id >= boneNames.length) continue;
    const boneName = boneNames[bt.bone_id];

    const pos = sliceTrack(bt.position, startSec, endSec, 3);
    if (pos) tracks.push(new THREE.VectorKeyframeTrack(`${boneName}.position`, pos.times, pos.values));
    const rot = sliceTrack(bt.rotation, startSec, endSec, 4);
    if (rot) tracks.push(new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, rot.times, rot.values));
  }
  if (tracks.length === 0) return null;
  return new THREE.AnimationClip(action.name, duration, tracks);
}
