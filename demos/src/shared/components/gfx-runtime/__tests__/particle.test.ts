import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { spawnParticleRuntime } from '../particle/runtime';
import { minimalParticleBody, minimalParticleElement, minimalSpawnOpts } from './_fixtures';

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

  it('animates the group position via element key_point_set', () => {
    const kps = {
      start_time: 0,
      keypoints: [
        {
          time_span: 0,
          interpolate_mode: 1,
          color: 0xffffffff,
          position: [0, 0, 0],
          scale: 1,
          direction: [0, 0, 0, 1],
          rad_2d: 0,
          controllers: [],
        },
        {
          time_span: 100,
          interpolate_mode: 1,
          color: 0xffffffff,
          position: [10, 0, 0],
          scale: 1,
          direction: [0, 0, 0, 1],
          rad_2d: 0,
          controllers: [],
        },
      ],
    };
    const element = {
      ...(minimalParticleElement()),
      key_point_set: kps,
    };
    const r = spawnParticleRuntime(
      minimalParticleBody(),
      minimalSpawnOpts(THREE, { element }),
    );
    r.tick(0.05); // 50 ms scaled (gfxSpeed default 1)
    // Midpoint of the 100 ms segment → position x should be ~5.
    // root is the outer group (gfxScale mount); inner group is where the
    // animator writes — position animation lives there.
    expect(r.root.children[0].position.x).toBeCloseTo(5, 1);
    r.dispose();
  });
});
