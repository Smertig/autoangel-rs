import { describe, it, expect } from 'vitest';
import type { SimConfig, SimState } from '../previews/particle/simulation';
import { spawnEllipsoid } from '../previews/particle/spawn/ellipsoid';

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
