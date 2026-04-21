import { sampleConeDirection } from './cone';
import { buildBirth } from './index';
import {
  type ParticleInstance,
  type SimConfig,
  type SimState,
} from '../simulation';

type CylinderShape = Extract<SimConfig['shape'], { kind: 'cylinder' }>;

interface Spawn {
  pos: [number, number, number];
  moveDir: [number, number, number];
}

/**
 * GenTotal: rejection-sample the unit disk (x²+y² ≤ 1), z uniform in [-1, 1],
 * scale by areaSize, direction from the standard emission cone. Mirrors
 * A3DCylinderEmitter::GenTotal.
 *
 * Loop capped at 32 tries — hit probability per try is π/4 ≈ 0.785, so
 * exceeding 32 is statistically impossible. Defensive against broken mocks.
 */
function genTotal(cfg: SimConfig, shape: CylinderShape, rng: () => number): Spawn {
  // Engine draws x, y, z every iteration (only xy gates the break); preserve
  // that rng-call stream so deterministic tests match engine behavior.
  let x = 0, y = 0, z = 0;
  for (let tries = 0; tries < 32; tries++) {
    x = rng() * 2 - 1;
    y = rng() * 2 - 1;
    z = rng() * 2 - 1;
    if (x * x + y * y <= 1) break;
  }
  const [ax, ay, az] = shape.areaSize;
  const moveDir = sampleConeDirection(cfg.parIniDir, cfg.angle, rng);
  return { pos: [x * ax, y * ay, z * az], moveDir };
}

/**
 * GenSurface: uniform angle around z-axis, z uniform along axis,
 * moveDir from the cone sampler (engine calls GenDirection unconditionally
 * for cylinder — unlike ellipsoid GenSurface which uses -v).
 */
function genSurface(cfg: SimConfig, shape: CylinderShape, rng: () => number): Spawn {
  const yaw = rng() * Math.PI * 2;
  const vx = Math.cos(yaw);
  const vy = Math.sin(yaw);
  const z = rng() * 2 - 1;
  const [ax, ay, az] = shape.areaSize;
  const moveDir = sampleConeDirection(cfg.parIniDir, cfg.angle, rng);
  return { pos: [vx * ax, vy * ay, z * az], moveDir };
}

interface CylGenAvgState { angleAlpha: number; currentBeta: number; }

/**
 * GenAverage: deterministic grid march. alpha advances around z-axis;
 * currentBeta is an INTEGER z-step counter (not a float angle like ellipsoid).
 *
 * Per-spawn v:
 *   Engine starts from vInitPos = (0, 1, 1), then rotates around z by alpha,
 *   overwriting z with (1 - 2·currentBeta/betaSeg).
 *   rotZ(α) · (0, 1, 0) = (-sin α, cos α, 0). z is preserved.
 *   Net: v = (-sin α, cos α, 1 - 2·currentBeta/betaSeg).
 *
 * Surface mode fixes the radial ratio at 1; volume mode draws rng().
 *
 * Cursor advance mirrors engine lines 79-90 — sequential `if`/`if`, not `if/else`.
 */
function genAverage(
  cfg: SimConfig,
  shape: CylinderShape,
  state: SimState,
  rng: () => number,
): Spawn {
  let s = state.shapeState as CylGenAvgState | null;
  if (!s) { s = { angleAlpha: 0, currentBeta: 0 }; state.shapeState = s; }

  const alphaSeg = Math.max(1, shape.alphaSeg);
  const betaSeg = Math.max(1, shape.betaSeg);

  const vx = -Math.sin(s.angleAlpha);
  const vy =  Math.cos(s.angleAlpha);
  const vz = 1 - 2 * (s.currentBeta / betaSeg);

  // Engine draws the ratio unconditionally; short-circuit here diverges
  // the rng stream in surface mode. Accepted to keep tests ergonomic —
  // same choice as ellipsoid GenAverage.
  const ratio = shape.isSurface ? 1 : rng();
  const [ax, ay, az] = shape.areaSize;
  const pos: [number, number, number] = [
    vx * ax * ratio,
    vy * ay * ratio,
    vz * az * ratio,
  ];
  const moveDir = sampleConeDirection(cfg.parIniDir, cfg.angle, rng);

  s.angleAlpha += (Math.PI * 2) / alphaSeg;
  if (s.angleAlpha > Math.PI * 2) {
    s.angleAlpha = 0;
    s.currentBeta += 1;
  }
  if (s.currentBeta > betaSeg) {
    s.angleAlpha = 0;
    s.currentBeta = 0;
  }

  return { pos, moveDir };
}

export function spawnCylinder(
  cfg: SimConfig,
  state: SimState,
  rng: () => number,
): ParticleInstance {
  if (cfg.shape.kind !== 'cylinder') {
    throw new Error('spawnCylinder called with non-cylinder config');
  }
  const shape = cfg.shape;
  // RNG-call order: position first, then birth. Test fixtures depend on this.
  const { pos, moveDir } = shape.isAvgGen
    ? genAverage(cfg, shape, state, rng)
    : shape.isSurface
      ? genSurface(cfg, shape, rng)
      : genTotal(cfg, shape, rng);
  const birth = buildBirth(cfg, rng);
  return {
    px: pos[0], py: pos[1], pz: pos[2],
    dx: moveDir[0], dy: moveDir[1], dz: moveDir[2],
    ...birth,
  };
}
