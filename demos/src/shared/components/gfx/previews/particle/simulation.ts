// Core simulation types + per-frame tick. Kept framework-agnostic — the
// three.js-specific writeback into InstancedMesh happens in the hook.

import { argbChannels } from '../../util/argb';
import { sampleConeDirection } from './spawn';

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
}

export function createSimState(puffCount = 30): SimState {
  return {
    alive: [],
    emissionAcc: puffCount,
    time: 0,
    dirtyIndices: [],
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
    const p = spawnPoint(cfg, rng);
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

  state.time += dt;
  return state.alive.length;
}
