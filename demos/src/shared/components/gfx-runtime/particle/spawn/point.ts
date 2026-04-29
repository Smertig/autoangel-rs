import { sampleConeDirection } from './cone';
import { buildBirth } from './index';
import { type ParticleInstance, type SimConfig } from '../simulation';

export function spawnPoint(cfg: SimConfig, rng: () => number): ParticleInstance {
  const [dx, dy, dz] = sampleConeDirection(cfg.parIniDir, cfg.angle, rng);
  const initDelta = 0.001;
  const birth = buildBirth(cfg, rng);
  return {
    px: dx * initDelta, py: dy * initDelta, pz: dz * initDelta,
    dx, dy, dz,
    ...birth,
  };
}
