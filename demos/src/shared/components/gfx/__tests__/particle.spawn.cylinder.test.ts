import { describe, it, expect } from 'vitest';
import type { SimConfig, SimState } from '../previews/particle/simulation';
import { spawnCylinder } from '../previews/particle/spawn/cylinder';
import { spawnParticle } from '../previews/particle/spawn';

function makeCfg(
  overrides: Partial<Extract<SimConfig['shape'], { kind: 'cylinder' }>> = {},
): SimConfig {
  return {
    quota: 100,
    emissionRate: 10,
    ttl: 1,
    angle: 0,
    speed: 0,
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
    shape: {
      kind: 'cylinder',
      areaSize: [1, 2, 0.5],
      isSurface: false,
      isAvgGen: false,
      alphaSeg: 10,
      betaSeg: 10,
      ...overrides,
    },
  };
}

function makeState(): SimState {
  return { alive: [], emissionAcc: 0, time: 0, dirtyIndices: [], shapeState: null };
}

function queuedRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('spawnCylinder — GenTotal (disk + axial)', () => {
  it('spawns inside: (px/ax)² + (py/ay)² ≤ 1 and |pz/az| ≤ 1', () => {
    const cfg = makeCfg({ areaSize: [1, 2, 0.5], isSurface: false, isAvgGen: false });
    const rng = queuedRng([
      0.65, 0.65,
      0.75,
      0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
    ]);
    const p = spawnCylinder(cfg, makeState(), rng);
    const nx = p.px / 1, ny = p.py / 2, nz = p.pz / 0.5;
    expect(nx * nx + ny * ny).toBeLessThanOrEqual(1 + 1e-6);
    expect(Math.abs(nz)).toBeLessThanOrEqual(1 + 1e-6);
  });

  it('rejects outside-disk (x,y) triples and retries', () => {
    const cfg = makeCfg({ areaSize: [1, 1, 1], isSurface: false, isAvgGen: false });
    // Iter 1 (3 draws, z discarded): xy = (0.9, 0.9) → 1.62 > 1, REJECT.
    // Iter 2 (3 draws, z kept):      xy = (0, 0) → 0 ≤ 1, ACCEPT; z = 0.
    const rng = queuedRng([
      0.95, 0.95, 0.5,                 // iter 1 (rejected)
      0.5, 0.5, 0.5,                   // iter 2 (accepted → (0, 0, 0))
      0.5, 0.5, 0.5, 0.5, 0.5, 0.5,    // birth
    ]);
    const p = spawnCylinder(cfg, makeState(), rng);
    expect(p.px).toBeCloseTo(0);
    expect(p.py).toBeCloseTo(0);
    expect(p.pz).toBeCloseTo(0);
  });
});

describe('spawnCylinder — GenSurface (shell)', () => {
  it('spawns on the shell: (px/ax)² + (py/ay)² ≈ 1, |pz/az| ≤ 1', () => {
    const cfg = makeCfg({ areaSize: [2, 3, 1], isSurface: true, isAvgGen: false });
    const rng = queuedRng([
      0.1,
      0.75,
      0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
    ]);
    const p = spawnCylinder(cfg, makeState(), rng);
    const nx = p.px / 2, ny = p.py / 3, nz = p.pz / 1;
    expect(nx * nx + ny * ny).toBeCloseTo(1, 4);
    expect(Math.abs(nz)).toBeLessThanOrEqual(1 + 1e-6);
  });

  it('moveDir comes from cone sampler (not -v like ellipsoid)', () => {
    const cfg = makeCfg({ areaSize: [1, 1, 1], isSurface: true, isAvgGen: false });
    const rng = queuedRng([0.25, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    const p = spawnCylinder(cfg, makeState(), rng);
    expect(p.dx).toBeCloseTo(0, 6);
    expect(p.dy).toBeCloseTo(0, 6);
    expect(p.dz).toBeCloseTo(1, 6);
  });
});

describe('spawnCylinder — GenAverage (deterministic grid)', () => {
  it('first spawn at (α=0, currentBeta=0, surface): pos = (0, ay, az)', () => {
    const cfg = makeCfg({
      areaSize: [2, 3, 4],
      isSurface: true,
      isAvgGen: true,
      alphaSeg: 4,
      betaSeg: 4,
    });
    const rng = queuedRng([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    const state = makeState();
    const p = spawnCylinder(cfg, state, rng);
    expect(p.px).toBeCloseTo(0, 4);
    expect(p.py).toBeCloseTo(3, 4);
    expect(p.pz).toBeCloseTo(4, 4);
  });

  it('first call advances cursor: angleAlpha = 2π/alphaSeg, currentBeta = 0', () => {
    const cfg = makeCfg({
      areaSize: [1, 1, 1],
      isSurface: true,
      isAvgGen: true,
      alphaSeg: 4,
      betaSeg: 4,
    });
    const rng = queuedRng([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    const state = makeState();
    spawnCylinder(cfg, state, rng);
    const s = state.shapeState as { angleAlpha: number; currentBeta: number };
    expect(s.angleAlpha).toBeCloseTo((2 * Math.PI) / 4, 6);
    expect(s.currentBeta).toBe(0);
  });

  it('volume mode draws ratio from rng and scales position', () => {
    const cfg = makeCfg({
      areaSize: [2, 3, 4],
      isSurface: false,
      isAvgGen: true,
      alphaSeg: 4,
      betaSeg: 4,
    });
    const rng = queuedRng([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    const state = makeState();
    const p = spawnCylinder(cfg, state, rng);
    expect(p.px).toBeCloseTo(0, 4);
    expect(p.py).toBeCloseTo(1.5, 4);
    expect(p.pz).toBeCloseTo(2, 4);
  });
});

describe('spawnParticle dispatcher', () => {
  it('routes cylinder-kind config to spawnCylinder (shell invariant holds)', () => {
    const cfg = makeCfg({ areaSize: [1, 1, 1], isSurface: true, isAvgGen: false });
    const rng = queuedRng([
      0.25, 0.5,
      0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
    ]);
    const p = spawnParticle(cfg, makeState(), rng);
    const radial = Math.sqrt(p.px * p.px + p.py * p.py);
    expect(radial).toBeCloseTo(1, 4);
  });
});
