import { describe, it, expect } from 'vitest';
import type { SimConfig, SimState } from '../simulation';
import { spawnParticle } from '../spawn';
import { spawnEllipsoid } from '../spawn/ellipsoid';

function makeCfg(overrides: Partial<Extract<SimConfig['shape'], { kind: 'ellipsoid' }>> = {}): SimConfig {
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
      kind: 'ellipsoid',
      areaSize: [1, 2, 0.5],
      isSurface: false,
      isAvgGen: false,
      alphaSeg: 10,
      betaSeg: 10,
      ...overrides,
    },
    affectors: [],
    hasMotionAffector: false,
  };
}

function makeState(): SimState {
  return { alive: [], emissionAcc: 0, time: 0, dirtyIndices: [], shapeState: null };
}

/** Queue-based RNG: returns successive values, then loops. */
function queuedRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('spawnEllipsoid — GenTotal (volume)', () => {
  it('spawns inside the ellipsoid: normalized position satisfies x²+y²+z² ≤ 1', () => {
    const cfg = makeCfg({ areaSize: [1, 2, 0.5], isSurface: false, isAvgGen: false });
    // Sampling order: position (x, y, z, maybe retries), cone (angle=0 → 0 draws), birth (6 for r,g,b,a,scale,rot; no atlasFrame because initRandomTexture=false).
    // 2*r - 1 = 0.3 when r = 0.65. So (0.65, 0.65, 0.65) → |v|² = 0.27, inside. Hit first try.
    const rng = queuedRng([
      0.65, 0.65, 0.65, // position
      0.5, 0.5, 0.5, 0.5, 0.5, 0.5, // birth
    ]);
    const p = spawnEllipsoid(cfg, makeState(), rng);
    const [ax, ay, az] = [1, 2, 0.5];
    const nx = p.px / ax, ny = p.py / ay, nz = p.pz / az;
    expect(nx * nx + ny * ny + nz * nz).toBeLessThanOrEqual(1 + 1e-6);
  });

  it('rejects outside-sphere triples and retries', () => {
    const cfg = makeCfg({ areaSize: [1, 1, 1], isSurface: false, isAvgGen: false });
    // First triple: 2*0.95-1 = 0.9 each → |v|² = 2.43, REJECT.
    // Second triple: 2*0.5-1 = 0 each → |v|² = 0, ACCEPT at origin.
    const rng = queuedRng([
      0.95, 0.95, 0.95,                      // reject
      0.5, 0.5, 0.5,                          // accept at (0, 0, 0)
      0.5, 0.5, 0.5, 0.5, 0.5, 0.5,           // birth
    ]);
    const p = spawnEllipsoid(cfg, makeState(), rng);
    expect(p.px).toBeCloseTo(0);
    expect(p.py).toBeCloseTo(0);
    expect(p.pz).toBeCloseTo(0);
  });
});

describe('spawnEllipsoid — GenSurface (shell)', () => {
  it('spawns on the shell: normalized position has magnitude ≈ 1', () => {
    const cfg = makeCfg({ areaSize: [2, 3, 1], isSurface: true, isAvgGen: false });
    // RNG order for GenSurface:
    //   1. yaw   = rng() * 2π
    //   2. pitch = rng() * 2π
    //   (no cone draws — moveDir = -v)
    //   Then buildBirth: 6 draws (r, g, b, a, scale, rot).
    const rng = queuedRng([
      0.1, 0.3,                              // yaw, pitch
      0.5, 0.5, 0.5, 0.5, 0.5, 0.5,          // birth
    ]);
    const p = spawnEllipsoid(cfg, makeState(), rng);
    const [ax, ay, az] = [2, 3, 1];
    const nx = p.px / ax, ny = p.py / ay, nz = p.pz / az;
    expect(nx * nx + ny * ny + nz * nz).toBeCloseTo(1, 4);
  });

  it('sets moveDir to -v (inward): dot(moveDir, normPos) = -1 on unit sphere', () => {
    const cfg = makeCfg({ areaSize: [1, 1, 1], isSurface: true, isAvgGen: false });
    const rng = queuedRng([
      0.25, 0.5,
      0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
    ]);
    const p = spawnEllipsoid(cfg, makeState(), rng);
    // On unit sphere (areaSize = 1,1,1), pos is the unit outward vector v.
    // moveDir = -v, so dot(pos, moveDir) = -|v|² = -1.
    const dot = p.px * p.dx + p.py * p.dy + p.pz * p.dz;
    expect(dot).toBeCloseTo(-1, 4);
  });
});

describe('spawnEllipsoid — GenAverage (deterministic grid)', () => {
  it('first spawn at (α=0, β=0): direction is +y, scaled by areaSize × ratio', () => {
    const cfg = makeCfg({
      areaSize: [2, 3, 4],
      isSurface: false,   // volume: ratio consumes 1 rng draw
      isAvgGen: true,
      alphaSeg: 4,
      betaSeg: 4,
    });
    // RNG order for GenAverage (volume, angle=0):
    //   1. ratio = rng()
    //   cone: 0 draws (angle = 0)
    //   buildBirth: 6 draws
    const rng = queuedRng([
      0.5,                                 // ratio
      0.5, 0.5, 0.5, 0.5, 0.5, 0.5,        // birth
    ]);
    const state = makeState();
    const p = spawnEllipsoid(cfg, state, rng);
    // At (α=0, β=0), applyAngles(0, 0) = rotY(0) · rotX(0) · (0, 1, 0) = (0, 1, 0).
    // pos = v .* areaSize × ratio = (0, 1, 0) .* (2, 3, 4) × 0.5 = (0, 1.5, 0).
    expect(p.px).toBeCloseTo(0, 4);
    expect(p.py).toBeCloseTo(3 * 0.5, 4);
    expect(p.pz).toBeCloseTo(0, 4);
  });

  it('first call advances cursor to angleBeta = π/betaSeg, angleAlpha = 0', () => {
    const cfg = makeCfg({
      areaSize: [1, 1, 1],
      isSurface: true,    // surface: ratio NOT drawn (fixed at 1)
      isAvgGen: true,
      alphaSeg: 4,
      betaSeg: 4,
    });
    // RNG order for GenAverage (surface, angle=0):
    //   cone: 0 draws
    //   buildBirth: 6 draws
    //   (no ratio — surface mode uses 1.0)
    const rng = queuedRng([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    const state = makeState();
    spawnEllipsoid(cfg, state, rng);
    const s = state.shapeState as { angleAlpha: number; angleBeta: number };
    expect(s.angleAlpha).toBe(0);
    expect(s.angleBeta).toBeCloseTo(Math.PI / 4, 6);
  });

  it('second call advances angleAlpha = 2π/alphaSeg, angleBeta = π/betaSeg', () => {
    const cfg = makeCfg({
      areaSize: [1, 1, 1],
      isSurface: true,
      isAvgGen: true,
      alphaSeg: 4,
      betaSeg: 4,
    });
    const rng = queuedRng([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    const state = makeState();
    spawnEllipsoid(cfg, state, rng);
    spawnEllipsoid(cfg, state, rng);
    const s = state.shapeState as { angleAlpha: number; angleBeta: number };
    expect(s.angleAlpha).toBeCloseTo((2 * Math.PI) / 4, 6);
    expect(s.angleBeta).toBeCloseTo(Math.PI / 4, 6);
  });
});

describe('spawnParticle dispatcher', () => {
  it('routes ellipsoid-kind config to spawnEllipsoid (shell invariant holds)', () => {
    const cfg = makeCfg({ areaSize: [1, 1, 1], isSurface: true, isAvgGen: false });
    const rng = queuedRng([0.25, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    const p = spawnParticle(cfg, makeState(), rng);
    const len = Math.sqrt(p.px * p.px + p.py * p.py + p.pz * p.pz);
    expect(len).toBeCloseTo(1, 4);
  });
});
