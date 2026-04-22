import { describe, it, expect } from 'vitest';
import {
  createSimState,
  hasMotionAffector,
  tickSim,
  type SimConfig,
} from '../previews/particle/simulation';
import type { KpController } from '../util/gfxTypes';

function makeCfg(overrides: Partial<SimConfig> = {}): SimConfig {
  const affectors = overrides.affectors ?? [];
  return {
    quota: 100,
    emissionRate: 10,
    ttl: 1,
    angle: 0,
    speed: 2,
    parAcc: 0,
    acc: 0,
    accDir: [0, 1, 0],
    dragPow: undefined,
    colorMin: 0xffffffff,
    colorMax: 0xffffffff,
    scaleMin: 1,
    scaleMax: 1,
    rotMin: 0,
    rotMax: 0,
    parIniDir: [0, 0, 1],
    atlasRows: 1,
    atlasCols: 1,
    atlasFrames: 1,
    initRandomTexture: false,
    particleWidth: 1,
    particleHeight: 1,
    shape: { kind: 'point' },
    ...overrides,
    affectors,
    hasMotionAffector: hasMotionAffector(affectors),
  };
}

const rng = () => 0.5;

describe('tickSim', () => {
  it('emits according to the emission accumulator', () => {
    // puffCount=0 so the preload doesn't mask the rate behavior.
    const state = createSimState(0);
    const cfg = makeCfg({ emissionRate: 10, quota: 100 });
    // 0.5 s * 10/s = 5 new particles.
    const alive = tickSim(0.5, state, cfg, rng);
    expect(alive).toBe(5);
  });

  it('caps alive count at quota', () => {
    const state = createSimState(0);
    const cfg = makeCfg({ emissionRate: 1000, quota: 7, ttl: 100 });
    const alive = tickSim(1, state, cfg, rng);
    expect(alive).toBe(7);
  });

  it('removes particles past their TTL', () => {
    const state = createSimState(0);
    const cfg = makeCfg({ emissionRate: 1000, quota: 10, ttl: 0.1 });
    tickSim(0.01, state, cfg, rng);
    expect(state.alive.length).toBe(10);
    // Advance well past ttl with no further emission.
    const dead = tickSim(1, state, { ...cfg, emissionRate: 0 }, rng);
    expect(dead).toBe(0);
  });

  it('integrates self-velocity along moveDir (trapezoidal)', () => {
    // puffCount=1 pre-seeds the emission accumulator so the first tick
    // actually spawns.
    const state = createSimState(1);
    const cfg = makeCfg({
      emissionRate: 0,
      quota: 1,
      speed: 2,
      parAcc: 0,
      ttl: 10,
      parIniDir: [0, 0, 1],
      angle: 0,
    });
    tickSim(0.001, state, cfg, rng);
    expect(state.alive.length).toBe(1);
    const start = state.alive[0].pz;
    // 0.5 s * 2 u/s = +1 unit along +Z (constant velocity).
    tickSim(0.5, state, cfg, rng);
    expect(state.alive[0].pz - start).toBeCloseTo(1.0, 5);
  });

  it('marks births and swap-remove targets as dirty', () => {
    const state = createSimState(0);
    const cfg = makeCfg({ emissionRate: 1000, quota: 3, ttl: 100 });
    tickSim(0.01, state, cfg, rng);
    // 3 births → indices 0, 1, 2 dirty.
    expect(state.dirtyIndices.slice().sort()).toEqual([0, 1, 2]);

    // Age particle 0 past ttl; swap-remove pulls index 2 into slot 0 →
    // dirty[0].
    state.alive[0].age = cfg.ttl + 1;
    tickSim(0.001, state, { ...cfg, emissionRate: 0 }, rng);
    expect(state.dirtyIndices).toContain(0);
    expect(state.alive.length).toBe(2);
  });
});

// ── Affector application ─────────────────────────────────────────────────

function clTransAlphaOnly(
  origin: number,
  destAlpha: number,
  timeMs: number,
): KpController {
  const dest = (destAlpha << 24) | (origin & 0x00ffffff);
  return {
    start_time: undefined,
    end_time: undefined,
    body: {
      kind: 'cl_trans',
      color_origin: origin,
      dest_colors: [dest >>> 0],
      trans_times_ms: [timeMs],
      alpha_only: true,
    },
  } as KpController;
}

describe('tickSim affectors', () => {
  // Spawn one particle with age 0 (no puff-stagger) so assertions can target
  // exact ages. `emissionAcc=1, emissionRate=0` + `state.time>0.001` on the
  // spawn tick avoids the initial puff-age randomisation.
  function spawnOne(cfg: SimConfig) {
    const state = createSimState(0);
    state.emissionAcc = 1;
    state.time = 1; // disables the puff-stagger branch
    tickSim(0.0001, state, cfg, rng);
    return state;
  }

  it('applies cl_trans alpha_only over particle age', () => {
    const origin = 0xff8080ff; // fully opaque
    const affector = clTransAlphaOnly(origin, 0x00, 1000); // α 255→0 over 1s
    const cfg = makeCfg({
      emissionRate: 0, quota: 1, ttl: 5,
      colorMin: origin, colorMax: origin,
      affectors: [affector],
    });
    const state = spawnOne(cfg);
    expect(state.alive).toHaveLength(1);
    // Advance to mid-track.
    tickSim(0.5, state, cfg, rng);
    const p = state.alive[0];
    // Age ≈ 0.5001s → alpha ≈ round(255 * (1 - 0.5001)) / 255 ≈ 0.498.
    expect(p.a).toBeGreaterThan(0.45);
    expect(p.a).toBeLessThan(0.55);
    // Past the track end — alpha clamps to 0.
    tickSim(0.8, state, cfg, rng);
    expect(state.alive[0].a).toBeLessThan(0.01);
  });

  it('honors start_time gating (affector inactive before window)', () => {
    const affector: KpController = {
      start_time: 0.5,
      end_time: undefined,
      body: {
        kind: 'scale',
        scale_delta: -1,   // -1/sec
        min_scale: 0,
        max_scale: 10,
      },
    } as KpController;
    const cfg = makeCfg({
      emissionRate: 0, quota: 1, ttl: 5,
      scaleMin: 2, scaleMax: 2,
      affectors: [affector],
    });
    const state = spawnOne(cfg);
    // Age 0.25s < 0.5s start_time → affector inactive, scale stays at base.
    tickSim(0.25, state, cfg, rng);
    expect(state.alive[0].scale).toBeCloseTo(2, 5);
    // Age 0.75s → affector active, scale = base + delta*age = 2 + (-1)*0.75 = 1.25.
    tickSim(0.5, state, cfg, rng);
    expect(state.alive[0].scale).toBeCloseTo(1.25, 3);
  });

  it('flags all alive as dirty when affectors present', () => {
    const affector = clTransAlphaOnly(0xff8080ff, 0x00, 1000);
    const state = createSimState(0);
    const cfg = makeCfg({
      emissionRate: 1000, quota: 4, ttl: 100,
      affectors: [affector],
    });
    tickSim(0.01, state, cfg, rng);
    expect(state.dirtyIndices.slice().sort()).toEqual([0, 1, 2, 3]);
    // Second tick: no births, but affector present → all alive re-flagged dirty.
    tickSim(0.01, state, { ...cfg, emissionRate: 0 }, rng);
    expect(state.dirtyIndices.slice().sort()).toEqual([0, 1, 2, 3]);
  });

  it('applies Move affector (translation along dir with vel+acc)', () => {
    const affector: KpController = {
      start_time: undefined, end_time: undefined,
      body: { kind: 'move', dir: [1, 0, 0], vel: 2, acc: 0 },
    } as KpController;
    const cfg = makeCfg({
      emissionRate: 0, quota: 1, ttl: 5,
      speed: 0, // no self-velocity from emitter — isolate affector contribution
      affectors: [affector],
    });
    const state = spawnOne(cfg);
    const p0 = state.alive[0];
    const startX = p0.px;
    // Constant vel=2 u/s over 0.5s total (plus spawnOne's 0.0001 seed tick).
    tickSim(0.5, state, cfg, rng);
    // Trapezoidal CalcDist(vel=2, acc=0, age, dt=0.5) = 2 * 0.5 = 1.
    expect(state.alive[0].px - startX).toBeCloseTo(1, 3);
  });

  it('applies Rot affector (rad2d integration)', () => {
    const affector: KpController = {
      start_time: undefined, end_time: undefined,
      body: { kind: 'rot', vel: Math.PI, acc: 0 }, // π rad/s
    } as KpController;
    const cfg = makeCfg({
      emissionRate: 0, quota: 1, ttl: 5,
      rotMin: 0, rotMax: 0,
      affectors: [affector],
    });
    const state = spawnOne(cfg);
    tickSim(0.5, state, cfg, rng);
    // 0.5s at π rad/s = π/2 rad.
    expect(state.alive[0].rot).toBeCloseTo(Math.PI / 2, 3);
  });

  it('applies RotAxis affector (orbit position around line)', () => {
    // Rotate around Y axis through origin. Starting at (1, 0, 0), a quarter
    // turn (π/2) places the particle at ≈(0, 0, -1) for +Y rotation (RH).
    const affector: KpController = {
      start_time: undefined, end_time: undefined,
      body: {
        kind: 'rot_axis',
        pos: [0, 0, 0],
        axis: [0, 1, 0],
        vel: Math.PI / 2,
        acc: 0,
      },
    } as KpController;
    const cfg = makeCfg({
      emissionRate: 0, quota: 1, ttl: 5,
      speed: 0,
      affectors: [affector],
    });
    const state = spawnOne(cfg);
    state.alive[0].px = 1; state.alive[0].py = 0; state.alive[0].pz = 0;
    // 1s at π/2 rad/s → quarter turn around +Y.
    tickSim(1, state, cfg, rng);
    const p = state.alive[0];
    expect(p.px).toBeCloseTo(0, 3);
    expect(p.pz).toBeCloseTo(-1, 3);
  });

  it('applies Revol affector (orbit position, same math as RotAxis)', () => {
    const affector: KpController = {
      start_time: undefined, end_time: undefined,
      body: {
        kind: 'revol',
        pos: [0, 0, 0],
        axis: [0, 1, 0],
        vel: Math.PI,
        acc: 0,
      },
    } as KpController;
    const cfg = makeCfg({
      emissionRate: 0, quota: 1, ttl: 5,
      speed: 0,
      affectors: [affector],
    });
    const state = spawnOne(cfg);
    state.alive[0].px = 2; state.alive[0].py = 0; state.alive[0].pz = 0;
    // 1s at π rad/s → half turn around +Y. (2,0,0) → (-2,0,0).
    tickSim(1, state, cfg, rng);
    expect(state.alive[0].px).toBeCloseTo(-2, 3);
    expect(state.alive[0].pz).toBeCloseTo(0, 3);
  });

  it('chains Move → RotAxis: pivot follows Move-accumulated offset', () => {
    // Move shifts +X by 3 units over the tick; RotAxis then rotates around
    // the (shifted) origin pivot. Without axisOff tracking, the rotation
    // would instead be around the world origin and produce a different
    // final position.
    const move: KpController = {
      start_time: undefined, end_time: undefined,
      body: { kind: 'move', dir: [1, 0, 0], vel: 3, acc: 0 },
    } as KpController;
    const rotAxis: KpController = {
      start_time: undefined, end_time: undefined,
      body: { kind: 'rot_axis', pos: [0, 0, 0], axis: [0, 1, 0], vel: Math.PI / 2, acc: 0 },
    } as KpController;
    const cfg = makeCfg({
      emissionRate: 0, quota: 1, ttl: 5,
      speed: 0,
      affectors: [move, rotAxis],
    });
    const state = spawnOne(cfg);
    // Starting position (4,0,0). After Move: (7,0,0). axisOff = (3,0,0).
    // Pivot = body.pos(0,0,0) + axisOff(3,0,0) = (3,0,0). Quarter turn
    // around +Y at (3,0,0): (7,0,0) → displacement (4,0,0) → rotates to
    // (0,0,-4) → final (3,0,-4).
    state.alive[0].px = 4; state.alive[0].py = 0; state.alive[0].pz = 0;
    tickSim(1, state, cfg, rng);
    const p = state.alive[0];
    expect(p.px).toBeCloseTo(3, 3);
    expect(p.pz).toBeCloseTo(-4, 3);
  });

  it('applies CentriMove affector (radial translation from center)', () => {
    const affector: KpController = {
      start_time: undefined, end_time: undefined,
      body: { kind: 'centri_move', center: [0, 0, 0], vel: 1, acc: 0 },
    } as KpController;
    const cfg = makeCfg({
      emissionRate: 0, quota: 1, ttl: 5,
      speed: 0,
      affectors: [affector],
    });
    const state = spawnOne(cfg);
    // Place particle at (3, 0, 0) so the radial direction is +X.
    state.alive[0].px = 3;
    state.alive[0].py = 0;
    state.alive[0].pz = 0;
    tickSim(0.5, state, cfg, rng);
    // CentriMove with vel=1 pushes outward by 0.5 units over 0.5s.
    expect(state.alive[0].px).toBeCloseTo(3.5, 3);
  });
});
