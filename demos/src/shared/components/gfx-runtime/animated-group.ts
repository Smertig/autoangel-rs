import type { Object3D } from 'three';
import { createKeypointAnimator, type KeypointAnimator } from './keypoint-animator';
import type { GfxElement } from '../../../types/autoangel';

export interface AnimatedGroupPair {
  /** Carries gfxScale and receives attachToHook position/rotation mutations. */
  readonly outer: Object3D;
  /** What the keypoint animator mutates each tick. Three.js composes with `outer`. */
  readonly animated: Object3D;
  readonly animator: KeypointAnimator | null;
}

/**
 * Nested outer/animated group pair. The animator writes into `animated` so
 * it can't clobber the spawn-time gfxScale/hookOffset baked on `outer` —
 * three.js composes parent * child automatically, matching
 * `A3DGFXContainer::TickAnimation`'s `kp.scale * parent.scale`.
 */
export function createAnimatedGroupPair(
  three: any,
  element: GfxElement,
  gfxScale: number,
): AnimatedGroupPair {
  const outer = new three.Group();
  outer.scale.setScalar(gfxScale);
  const animated = new three.Group();
  outer.add(animated);
  const animator = createKeypointAnimator(element.key_point_set);
  return { outer, animated, animator };
}
