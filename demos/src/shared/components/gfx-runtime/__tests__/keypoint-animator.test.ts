import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createKeypointAnimator } from '../keypoint-animator';

function makeKps(spans: number[], positions: [number, number, number][]) {
  return {
    start_time: 0,
    keypoints: spans.map((s, i) => ({
      time_span: s,
      color: 0xffffffff,
      position: positions[i] ?? [0, 0, 0],
      scale: 1,
      direction: [0, 0, 0, 1] as [number, number, number, number],
      rad_2d: 0,
      interpolate_mode: 1,
      controllers: [],
    })),
  };
}

describe('createKeypointAnimator', () => {
  it('returns null when element has no KeyPointSet', () => {
    expect(createKeypointAnimator(undefined)).toBeNull();
  });

  it('applies position/scale from a single-segment track at a mid point', () => {
    const kps = makeKps([0, 100], [[0, 0, 0], [10, 0, 0]]);
    const animator = createKeypointAnimator(kps)!;
    expect(animator).not.toBeNull();

    const obj = new THREE.Object3D();
    animator.tickTo(50, obj);
    expect(obj.position.x).toBeCloseTo(5);
  });

  it('wraps elapsedMs via loopDurationMs when track.loopable', () => {
    const kps = makeKps([0, 100], [[0, 0, 0], [10, 0, 0]]);
    const animator = createKeypointAnimator(kps)!;
    const obj = new THREE.Object3D();
    animator.tickTo(150, obj); // 150 % 100 = 50
    expect(obj.position.x).toBeCloseTo(5);
  });
});
