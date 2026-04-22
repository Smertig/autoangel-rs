// Core simulation types + per-frame tick. Kept framework-agnostic — the
// three.js-specific writeback into InstancedMesh happens in the hook.

import { spawnParticle } from './spawn';
import { applyController, type CtrlState } from '../../util/controllers';
import type { KpController } from '../../util/gfxTypes';
import { argbChannels } from '../../util/argb';

export type ShapeCfg =
  | { kind: 'point' }
  | {
      kind: 'ellipsoid';
      areaSize: [number, number, number];
      isSurface: boolean;
      isAvgGen: boolean;
      alphaSeg: number;
      betaSeg: number;
    }
  | {
      kind: 'cylinder';
      areaSize: [number, number, number];
      isSurface: boolean;
      isAvgGen: boolean;
      alphaSeg: number;
      betaSeg: number;
    };

export interface SimConfig {
  quota: number;
  emissionRate: number;
  ttl: number;
  angle: number;
  speed: number;
  parAcc: number;
  acc: number;
  accDir: [number, number, number];
  dragPow: number | undefined;
  colorMin: number; // u32 ARGB
  colorMax: number;
  scaleMin: number;
  scaleMax: number;
  rotMin: number;
  rotMax: number;
  parIniDir: [number, number, number];
  atlasRows: number;
  atlasCols: number;
  atlasFrames: number;
  initRandomTexture: boolean;
  particleWidth: number;
  particleHeight: number;
  shape: ShapeCfg;
  /**
   * Particle-element affectors (`GfxElement.affectors`). Evaluated per frame
   * in reset-from-base style — mathematically equivalent to the engine's
   * in-place accumulation when at most one affector touches a given channel
   * (all shipped fixtures).
   */
  affectors: readonly KpController[];
  /** Precomputed: any `move`/`rot`/`centri_move`/`rot_axis`/`revol` present.
   *  Skips position/rad2d seed+writeback when false. */
  hasMotionAffector: boolean;
}

const MOTION_KINDS: ReadonlySet<string> = new Set([
  'move', 'rot', 'centri_move', 'rot_axis', 'revol',
]);

export function hasMotionAffector(affectors: readonly KpController[]): boolean {
  for (const a of affectors) {
    if (MOTION_KINDS.has(a.body.kind)) return true;
  }
  return false;
}

export interface ParticleInstance {
  px: number; py: number; pz: number;
  dx: number; dy: number; dz: number;  // moveDir (unit)
  selfVel: number;
  velAlongAcc: number;
  r: number; g: number; b: number; a: number;  // 0..1 floats
  scale: number;
  rot: number;
  age: number;
  ttl: number;
  atlasFrame: number;
  // Spawn-time baseline for affector evaluation. The affector loop resets
  // live channels to these before re-running the stack each frame, so the
  // N-frame integration result equals single-step `base + delta*age` for
  // velocity affectors and pure `sample(age)` for transition affectors.
  // `baseColor` is pre-packed 0xAARRGGBB to skip a per-frame repack.
  baseColor: number;
  baseScale: number;
}

export interface SimState {
  alive: ParticleInstance[];
  emissionAcc: number;
  time: number;
  /**
   * Indices whose per-instance "held" attributes (color / alpha / atlas)
   * changed this tick — because a particle was born or moved via
   * swap-remove. The hook writes these attributes only for dirty indices,
   * saving a per-frame rewrite of every alive particle at 60 Hz.
   */
  dirtyIndices: number[];
  /**
   * Opaque per-shape scratch slot (e.g. ellipsoid GenAverage march cursors).
   * Shape spawners own its concrete type; the sim core treats it as unknown.
   */
  shapeState: unknown;
}

export function createSimState(puffCount = 30): SimState {
  return {
    alive: [],
    emissionAcc: puffCount,
    time: 0,
    dirtyIndices: [],
    shapeState: null,
  };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Engine pool-size resolution (A3DParticleSystemEx::Init + SetPoolSize):
 * pool = floor(ttl * rate) + 1, capped by `quota` when `quota > 0`, then
 * hard-clamped to the engine's global _max_quota = 750.
 */
export function resolvePoolSize(quota: number, rate: number, ttl: number): number {
  const natural = Math.floor(Math.max(0, ttl) * Math.max(0, rate)) + 1;
  const capped = quota === -1 || natural <= quota ? natural : quota;
  return Math.max(1, Math.min(750, capped));
}

/**
 * Advance the simulation by `dt` seconds:
 * 1. accumulate + spawn new particles up to quota
 * 2. age surviving particles, remove those past TTL
 * 3. integrate motion (trapezoidal, matching engine ApplyMotion math)
 *
 * Returns the new alive count so callers can update readouts cheaply.
 */
export function tickSim(
  dt: number,
  state: SimState,
  cfg: SimConfig,
  rng: () => number,
): number {
  state.dirtyIndices.length = 0;

  // Emit.
  state.emissionAcc += dt * cfg.emissionRate;
  while (state.emissionAcc >= 1 && state.alive.length < cfg.quota) {
    const p = spawnParticle(cfg, state, rng);
    // For the initial "puff" pre-load, stagger ages so they don't all die
    // simultaneously; rng() is cheap and bounded.
    if (state.time < 0.001) {
      p.age = rng() * Math.min(0.3, cfg.ttl * 0.5);
    }
    state.dirtyIndices.push(state.alive.length);
    state.alive.push(p);
    state.emissionAcc -= 1;
  }

  // Update + expire.
  for (let i = state.alive.length - 1; i >= 0; i--) {
    const p = state.alive[i];
    p.age += dt;
    if (p.age >= p.ttl) {
      // Swap-remove — the particle that moves into slot `i` is a different
      // one than last frame, so its "held" attributes need rewriting.
      const last = state.alive.length - 1;
      if (i !== last) {
        state.alive[i] = state.alive[last];
        state.dirtyIndices.push(i);
      }
      state.alive.pop();
      continue;
    }

    // Self-velocity along moveDir (trapezoidal integration).
    const selfVelEnd = p.selfVel + cfg.parAcc * dt;
    const selfDist = (p.selfVel + selfVelEnd) * 0.5 * dt;
    p.px += p.dx * selfDist;
    p.py += p.dy * selfDist;
    p.pz += p.dz * selfDist;
    p.selfVel = selfVelEnd;

    // External acceleration along accDir (trapezoidal).
    const velAccEnd = p.velAlongAcc + cfg.acc * dt;
    const accDist = (p.velAlongAcc + velAccEnd) * 0.5 * dt;
    p.px += cfg.accDir[0] * accDist;
    p.py += cfg.accDir[1] * accDist;
    p.pz += cfg.accDir[2] * accDist;
    p.velAlongAcc = velAccEnd;
  }

  applyAffectors(state, cfg, dt);

  state.time += dt;
  return state.alive.length;
}

const scratchCtrl: CtrlState = {
  color: 0,
  scale: 1,
  position: [0, 0, 0],
  rad2d: 0,
};
// Reused across every (particle, affector) pair — avoids per-call object
// literal allocation in the `applyController` hot path.
const scratchCtx: { localMs: number; dtMs: number } = { localMs: 0, dtMs: 0 };

function applyAffectors(state: SimState, cfg: SimConfig, dtSec: number): void {
  const affectors = cfg.affectors;
  if (affectors.length === 0) return;

  // Every alive particle's held attributes change this tick — the affector
  // pass owns the dirty set, replacing the birth/swap-remove marks from
  // earlier in the tick so the mesh upload can iterate a single list.
  state.dirtyIndices.length = 0;

  const dtMs = dtSec * 1000;
  const motion = cfg.hasMotionAffector;

  for (let i = 0; i < state.alive.length; i++) {
    const p = state.alive[i];
    const ageSec = p.age;
    const ageMs = ageSec * 1000;

    // Color/scale reset to spawn baseline so affectors re-integrate from age=0.
    scratchCtrl.color = p.baseColor;
    scratchCtrl.scale = p.baseScale;
    if (motion) {
      // Seed position/rad2d from current — motion affectors ADD to sim-
      // integrated trajectory each frame.
      scratchCtrl.position[0] = p.px;
      scratchCtrl.position[1] = p.py;
      scratchCtrl.position[2] = p.pz;
      scratchCtrl.rad2d = p.rot;
    }

    scratchCtx.localMs = ageMs;
    scratchCtx.dtMs = dtMs;
    for (let k = 0; k < affectors.length; k++) {
      const a = affectors[k];
      if (a.start_time !== undefined && ageSec < a.start_time) continue;
      if (a.end_time !== undefined && a.end_time >= 0 && ageSec > a.end_time) continue;
      applyController(a, scratchCtrl, scratchCtx);
    }

    const [r, g, b, a] = argbChannels(scratchCtrl.color);
    p.r = r; p.g = g; p.b = b; p.a = a;
    p.scale = scratchCtrl.scale;
    if (motion) {
      p.px = scratchCtrl.position[0];
      p.py = scratchCtrl.position[1];
      p.pz = scratchCtrl.position[2];
      p.rot = scratchCtrl.rad2d;
    }

    state.dirtyIndices.push(i);
  }
}
