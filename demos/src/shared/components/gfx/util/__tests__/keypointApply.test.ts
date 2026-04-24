import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { applyKeypointTransform } from '../keypointApply';
import type { Sample } from '../keypointTrack';

function sample(overrides: Partial<Sample> = {}): Sample {
  return {
    color: 0xffffffff,
    position: [1, 2, 3],
    scale: 2.5,
    direction: [0, 0, 0, 1],
    rad2d: 0,
    normalized: 0,
    ...overrides,
  };
}

describe('applyKeypointTransform', () => {
  it('copies position from the sample to the object', () => {
    const obj = new THREE.Object3D();
    applyKeypointTransform(sample(), obj);
    expect(obj.position.x).toBeCloseTo(1);
    expect(obj.position.y).toBeCloseTo(2);
    expect(obj.position.z).toBeCloseTo(3);
  });

  it('writes scale as uniform scalar', () => {
    const obj = new THREE.Object3D();
    applyKeypointTransform(sample({ scale: 3.5 }), obj);
    expect(obj.scale.x).toBeCloseTo(3.5);
    expect(obj.scale.y).toBeCloseTo(3.5);
    expect(obj.scale.z).toBeCloseTo(3.5);
  });

  it('copies the direction quaternion into obj.quaternion', () => {
    const obj = new THREE.Object3D();
    const h = Math.SQRT1_2;
    applyKeypointTransform(sample({ direction: [0, h, 0, h] }), obj);
    expect(obj.quaternion.x).toBeCloseTo(0);
    expect(obj.quaternion.y).toBeCloseTo(h);
    expect(obj.quaternion.z).toBeCloseTo(0);
    expect(obj.quaternion.w).toBeCloseTo(h);
  });
});
