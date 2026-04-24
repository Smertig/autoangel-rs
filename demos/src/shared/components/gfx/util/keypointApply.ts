import type { Object3D } from 'three';
import type { Sample } from './keypointTrack';

/**
 * Apply a KeyPointSet `Sample`'s transform channels (position, scale,
 * direction quaternion) to a three.js Object3D. Color / rad_2d are left to
 * the caller — they have varying target shapes across consumers.
 */
export function applyKeypointTransform(sample: Sample, obj: Object3D): void {
  obj.position.fromArray(sample.position);
  obj.scale.setScalar(sample.scale);
  obj.quaternion.set(
    sample.direction[0],
    sample.direction[1],
    sample.direction[2],
    sample.direction[3],
  );
}
