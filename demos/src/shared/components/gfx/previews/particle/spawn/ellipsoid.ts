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

/**
 * GenSurface: uniform shell sample via two rotations, scaled by areaSize,
 * moveDir = -v (inward — verbatim from engine).
 *
 * Matches A3DEllipsoidEmitter::GenSurface:
 *   q1 = quat(unit_y,  rng * 2π)  → axis = rotate(q1, unit_x)
 *   q2 = quat(axis,    rng * 2π)  → v    = rotate(q2, unit_y)
 *   pos = v .* areaSize
 *   moveDir = -v
 *
 * Derivation:
 *   axis = rotY(yaw) · unit_x = (cos yaw, 0, -sin yaw)     // standard right-handed rotY
 *   v    = rotateAroundAxis(axis, pitch) · unit_y
 *        = unit_y·cos pitch + (axis × unit_y)·sin pitch + axis·(axis · unit_y)·(1-cos pitch)
 *   axis · unit_y = 0  (axis is in xz-plane) → last term drops.
 *   axis × unit_y = (-axis.z, 0, axis.x) = (sin yaw, 0, cos yaw)
 *   So v = ( sin yaw · sin pitch,  cos pitch,  cos yaw · sin pitch ).
 */
function genSurface(shape: EllipsoidShape, rng: () => number): Spawn {
  const yaw = rng() * Math.PI * 2;
  const pitch = rng() * Math.PI * 2;

  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  const sp = Math.sin(pitch), cp = Math.cos(pitch);

  // v = (sin yaw · sin pitch, cos pitch, cos yaw · sin pitch)
  const vx = sy * sp;
  const vy = cp;
  const vz = cy * sp;

  const [ax, ay, az] = shape.areaSize;
  return {
    pos: [vx * ax, vy * ay, vz * az],
    moveDir: [-vx, -vy, -vz],
  };
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
  const { pos, moveDir } = shape.isSurface
    ? genSurface(shape, rng)
    : genTotal(cfg, shape, rng);
  const birth = buildBirth(cfg, rng);
  return {
    px: pos[0], py: pos[1], pz: pos[2],
    dx: moveDir[0], dy: moveDir[1], dz: moveDir[2],
    ...birth,
  };
}
