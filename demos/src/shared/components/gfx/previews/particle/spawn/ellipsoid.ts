import { sampleConeDirection } from './cone';
import { buildBirth } from './index';
import {
  type ParticleInstance,
  type SimConfig,
  type SimState,
} from '../simulation';

type EllipsoidShape = Extract<SimConfig['shape'], { kind: 'ellipsoid' }>;

interface Spawn {
  pos: [number, number, number];
  moveDir: [number, number, number];
}

/**
 * GenTotal: rejection-sample the unit sphere, scale by areaSize, direction
 * from the standard emission cone. Mirrors A3DEllipsoidEmitter::GenTotal.
 *
 * Loop capped at 32 tries — statistically impossible to reach with uniform
 * rng (hit probability per try ≈ 0.52), but guards against misbehaved mocks.
 */
function genTotal(cfg: SimConfig, shape: EllipsoidShape, rng: () => number): Spawn {
  let x = 0, y = 0, z = 0;
  for (let tries = 0; tries < 32; tries++) {
    x = rng() * 2 - 1;
    y = rng() * 2 - 1;
    z = rng() * 2 - 1;
    if (x * x + y * y + z * z <= 1) break;
  }
  const [ax, ay, az] = shape.areaSize;
  const moveDir = sampleConeDirection(cfg.parIniDir, cfg.angle, rng);
  return { pos: [x * ax, y * ay, z * az], moveDir };
}

export function spawnEllipsoid(
  cfg: SimConfig,
  _state: SimState,
  rng: () => number,
): ParticleInstance {
  if (cfg.shape.kind !== 'ellipsoid') {
    throw new Error('spawnEllipsoid called with non-ellipsoid config');
  }
  const shape = cfg.shape;
  // RNG-call order: position first, then birth. Test fixtures depend on this.
  const { pos, moveDir } = genTotal(cfg, shape, rng);
  const birth = buildBirth(cfg, rng);
  return {
    px: pos[0], py: pos[1], pz: pos[2],
    dx: moveDir[0], dy: moveDir[1], dz: moveDir[2],
    ...birth,
  };
}
