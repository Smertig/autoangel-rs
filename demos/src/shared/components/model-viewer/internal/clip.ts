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

export function buildKeyTimes(keyCount: number, frameIds: Uint16Array | undefined, frameRate: number): Float32Array {
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
  using ts = wasm.TrackSet.parse(stckData);
  const trackCount: number = ts.trackCount;
  const fps = ts.animFps || 30;
  const duration = (ts.animEnd - ts.animStart) / fps;
  const tracks: any[] = [];

  for (let t = 0; t < trackCount; t++) {
    const boneId: number = ts.boneId(t);
    if (boneId < 0 || boneId >= boneNames.length) continue;
    const boneName = boneNames[boneId];

    const posKeys: Float32Array | undefined = ts.positionKeys(t);
    if (posKeys && posKeys.length > 0) {
      const times = buildKeyTimes(posKeys.length / 3, ts.positionFrameIds(t), ts.positionFrameRate(t));
      tracks.push(new THREE.VectorKeyframeTrack(`${boneName}.position`, times, posKeys));
    }

    const rotKeys: Float32Array | undefined = ts.rotationKeys(t);
    if (rotKeys && rotKeys.length > 0) {
      const times = buildKeyTimes(rotKeys.length / 4, ts.rotationFrameIds(t), ts.rotationFrameRate(t));
      tracks.push(new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, rotKeys));
    }
  }

  if (tracks.length === 0 || duration <= 0) return null;
  return new THREE.AnimationClip(clipName, duration, tracks);
}
