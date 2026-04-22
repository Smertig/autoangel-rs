import { argbChannels } from '../../../util/argb';
import { lerp, type ParticleInstance, type SimConfig, type SimState } from '../simulation';
import { spawnCylinder } from './cylinder';
import { spawnEllipsoid } from './ellipsoid';
import { spawnPoint } from './point';

export { sampleConeDirection } from './cone';
export { spawnCylinder } from './cylinder';
export { spawnEllipsoid } from './ellipsoid';
export { spawnPoint } from './point';

/**
 * Shape-independent birth sampling: color / scale / rotation / ttl / atlasFrame.
 *
 * RNG-call order is load-bearing — tests assume: 4 color draws (r, g, b, a),
 * then scale, rot, and (only if initRandomTexture) atlasFrame. Must match
 * legacy spawnPoint order so existing deterministic tests keep passing.
 */
export function buildBirth(
  cfg: SimConfig,
  rng: () => number,
): Omit<ParticleInstance, 'px' | 'py' | 'pz' | 'dx' | 'dy' | 'dz'> {
  const [r0, g0, b0, a0] = argbChannels(cfg.colorMin);
  const [r1, g1, b1, a1] = argbChannels(cfg.colorMax);
  const atlasFrames = Math.max(1, cfg.atlasFrames);
  const r = lerp(r0, r1, rng());
  const g = lerp(g0, g1, rng());
  const b = lerp(b0, b1, rng());
  const a = lerp(a0, a1, rng());
  const scale = lerp(cfg.scaleMin, cfg.scaleMax, rng());
  const rot = lerp(cfg.rotMin, cfg.rotMax, rng());
  const atlasFrame = cfg.initRandomTexture
    ? Math.floor(rng() * atlasFrames) % atlasFrames
    : 0;
  const r8 = Math.round(r * 255);
  const g8 = Math.round(g * 255);
  const b8 = Math.round(b * 255);
  const a8 = Math.round(a * 255);
  const baseColor = ((a8 << 24) | (r8 << 16) | (g8 << 8) | b8) >>> 0;
  return {
    selfVel: cfg.speed, velAlongAcc: 0,
    r, g, b, a, scale, rot,
    age: 0, ttl: cfg.ttl,
    atlasFrame,
    baseColor,
    baseScale: scale,
  };
}

/**
 * Shape-dispatched spawn. `state` is threaded so stateful shapes (ellipsoid
 * GenAverage) can park march cursors in `state.shapeState`.
 */
export function spawnParticle(
  cfg: SimConfig,
  state: SimState,
  rng: () => number,
): ParticleInstance {
  switch (cfg.shape.kind) {
    case 'point':
      return spawnPoint(cfg, rng);
    case 'ellipsoid':
      return spawnEllipsoid(cfg, state, rng);
    case 'cylinder':
      return spawnCylinder(cfg, state, rng);
    default: {
      const _exhaustive: never = cfg.shape;
      throw new Error(
        `spawnParticle: unhandled shape kind ${(_exhaustive as { kind?: string })?.kind}`,
      );
    }
  }
}
