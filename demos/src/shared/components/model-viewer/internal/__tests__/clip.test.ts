import { describe, it, expect, vi } from 'vitest';
import { sliceEmbeddedAnimationClip } from '../clip';

vi.mock('../three', () => {
  class FakeKeyframeTrack {
    constructor(public name: string, public times: Float32Array, public values: Float32Array) {}
  }
  class FakeClip {
    constructor(public name: string, public duration: number, public tracks: any[]) {}
  }
  const THREE = {
    VectorKeyframeTrack: FakeKeyframeTrack,
    QuaternionKeyframeTrack: FakeKeyframeTrack,
    AnimationClip: FakeClip,
  };
  return {
    getThree: () => ({ THREE }),
    ensureThree: async () => {},
  };
});

const fakeAnimation = {
  anim_start: 0,
  anim_end: 100,
  anim_fps: 10,
  bone_tracks: [
    {
      bone_id: 0,
      position: {
        frame_rate: 10,
        track_length_ms: 10000,
        keys: [
          0, 0, 0,  // key 0 at frame 0
          1, 0, 0,  // key 1 at frame 25
          2, 0, 0,  // key 2 at frame 50
          3, 0, 0,  // key 3 at frame 75
          4, 0, 0,  // key 4 at frame 100
        ],
        key_frame_ids: [0, 25, 50, 75, 100],
      },
      rotation: {
        frame_rate: 10,
        track_length_ms: 10000,
        keys: [
          0, 0, 0, 1,
          0, 0, 0, 1,
          0, 0, 0, 1,
          0, 0, 0, 1,
          0, 0, 0, 1,
        ],
        key_frame_ids: [0, 25, 50, 75, 100],
      },
    },
  ],
};

describe('sliceEmbeddedAnimationClip', () => {
  it('returns null for zero-duration action', () => {
    const action = { name: 'static', start_frame: 50, end_frame: 50, frame_rate: null, tck_file: null };
    const result = sliceEmbeddedAnimationClip(fakeAnimation as any, action as any, ['root']);
    expect(result).toBeNull();
  });

  it('extracts the keys within the action frame range and rebases times to start at 0', () => {
    const action = { name: 'middle', start_frame: 25, end_frame: 75, frame_rate: null, tck_file: null };
    const result: any = sliceEmbeddedAnimationClip(fakeAnimation as any, action as any, ['root']);
    expect(result).not.toBeNull();
    expect(result.duration).toBeCloseTo(5.0, 5);
    expect(result.tracks.length).toBe(2);
    const posTrack = result.tracks[0];
    expect(Array.from(posTrack.times as Float32Array)).toEqual([0, 2.5, 5]);
    expect(Array.from(posTrack.values as Float32Array)).toEqual([1, 0, 0, 2, 0, 0, 3, 0, 0]);
  });

  it('skips bone tracks whose bone_id is out of range and keeps valid ones', () => {
    const animationMixed = {
      ...fakeAnimation,
      bone_tracks: [
        { ...fakeAnimation.bone_tracks[0], bone_id: 0 },   // valid
        { ...fakeAnimation.bone_tracks[0], bone_id: 99 },  // out of range
      ],
    };
    const action = { name: 'middle', start_frame: 25, end_frame: 75, frame_rate: null, tck_file: null };
    const result: any = sliceEmbeddedAnimationClip(animationMixed as any, action as any, ['root']);
    expect(result).not.toBeNull();
    // Only the valid track contributes — 1 valid bone × (position + rotation) = 2 tracks.
    expect(result.tracks.length).toBe(2);
  });
});
