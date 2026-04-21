import { describe, it, expect } from 'vitest';
import {
  createSimState,
  tickSim,
  type SimConfig,
} from '../previews/particle/simulation';

function makeCfg(overrides: Partial<SimConfig> = {}): SimConfig {
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
    ...overrides,
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
