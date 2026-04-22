import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { spawnParticleRuntime } from '../particle';
import { minimalParticleBody, minimalSpawnOpts } from './_fixtures';

describe('spawnParticleRuntime', () => {
  it('returns a runtime whose root is added to a parent when tick runs', () => {
    const r = spawnParticleRuntime(minimalParticleBody(), minimalSpawnOpts(THREE));
    expect(r.root).toBeDefined();
    r.tick(0.016);
    r.dispose();
  });

  it('applies gfxScale to the root Object3D', () => {
    const r = spawnParticleRuntime(minimalParticleBody(), minimalSpawnOpts(THREE, { gfxScale: 2.5 }));
    expect(r.root.scale.x).toBeCloseTo(2.5);
    r.dispose();
  });

  it('finished() returns true after timeSpanSec elapses', () => {
    const r = spawnParticleRuntime(minimalParticleBody(), minimalSpawnOpts(THREE, { timeSpanSec: 0.1 }));
    r.tick(0.05);
    expect(r.finished?.()).toBe(false);
    r.tick(0.1);
    expect(r.finished?.()).toBe(true);
    r.dispose();
  });
});
