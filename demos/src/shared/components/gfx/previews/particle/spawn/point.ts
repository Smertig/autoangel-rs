import { argbChannels } from '../../../util/argb';
import { sampleConeDirection } from './cone';
import { lerp, type ParticleInstance, type SimConfig } from '../simulation';

export function spawnPoint(cfg: SimConfig, rng: () => number): ParticleInstance {
  const [dx, dy, dz] = sampleConeDirection(cfg.parIniDir, cfg.angle, rng);
  const initDelta = 0.001;
  const [r0, g0, b0, a0] = argbChannels(cfg.colorMin);
  const [r1, g1, b1, a1] = argbChannels(cfg.colorMax);
  // Per-channel random blend matches engine: each component independently
  // chooses a t in [0,1].
  const r = lerp(r0, r1, rng());
  const g = lerp(g0, g1, rng());
  const b = lerp(b0, b1, rng());
  const a = lerp(a0, a1, rng());
  const atlasFrames = Math.max(1, cfg.atlasFrames);
  return {
    px: dx * initDelta,
    py: dy * initDelta,
    pz: dz * initDelta,
    dx, dy, dz,
    selfVel: cfg.speed,
    velAlongAcc: 0,
    r, g, b, a,
    scale: lerp(cfg.scaleMin, cfg.scaleMax, rng()),
    rot: lerp(cfg.rotMin, cfg.rotMax, rng()),
    age: 0,
    ttl: cfg.ttl,
    atlasFrame: cfg.initRandomTexture ? Math.floor(rng() * atlasFrames) % atlasFrames : 0,
  };
}
