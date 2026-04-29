import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { spawnDecalRuntime } from '../decal/runtime';
import { minimalSpawnOpts } from './_fixtures';

function decalBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    kind: 'decal',
    width: 1,
    height: 1,
    rot_from_view: false,
    ...overrides,
  } as any;
}

function decalElement(typeId: 100 | 101 | 102, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    type_id: typeId,
    name: 'D',
    src_blend: 5, dest_blend: 6,
    repeat_count: 0, repeat_delay: 0,
    tex_file: 'd.dds', tex_row: 1, tex_col: 1, tex_interval: 0,
    tile_mode: 0, z_enable: 0, is_dummy: 0, priority: 0,
    body: decalBody(),
    affectors: [],
    key_point_set: undefined,
    ...overrides,
  } as any;
}

describe('spawnDecalRuntime', () => {
  it('returns a runtime with an outer Group root for type 100', () => {
    const rt = spawnDecalRuntime(decalBody(), {
      ...minimalSpawnOpts(THREE),
      element: decalElement(100),
    });
    expect(rt.root.type).toBe('Group');
    expect(rt.root.children.length).toBe(1);
    expect(rt.root.children[0].children.length).toBe(1);
    rt.dispose();
  });

  it('preserves the engine-cross structure for type 102 (Group of two meshes)', () => {
    const rt = spawnDecalRuntime(decalBody(), {
      ...minimalSpawnOpts(THREE),
      element: decalElement(102),
    });
    // root → animated group → decal cross (Group with 2 child Meshes).
    const decalRoot = rt.root.children[0].children[0];
    expect((decalRoot as any).type).toBe('Group');
    expect((decalRoot as any).children.length).toBe(2);
    rt.dispose();
  });

  it('ticks cleanly and finishes when timeSpanSec elapses', () => {
    const rt = spawnDecalRuntime(decalBody(), {
      ...minimalSpawnOpts(THREE, { timeSpanSec: 0.1 }),
      element: decalElement(100),
    });
    rt.tick(0.05);
    expect(rt.finished?.()).toBe(false);
    rt.tick(0.1);
    expect(rt.finished?.()).toBe(true);
    rt.dispose();
  });

  it('returns a noop runtime when tex_file is empty', () => {
    const rt = spawnDecalRuntime(decalBody(), {
      ...minimalSpawnOpts(THREE),
      element: decalElement(100, { tex_file: '' }),
    });
    expect(rt.root.children.length).toBe(0);
    rt.dispose();
  });

  it('returns a noop runtime for type 101 (screen-space)', () => {
    const rt = spawnDecalRuntime(decalBody(), {
      ...minimalSpawnOpts(THREE),
      element: decalElement(101),
    });
    expect(rt.root.children.length).toBe(0);
    rt.dispose();
  });

  it('dispose before async texture load resolves does not crash', async () => {
    const rt = spawnDecalRuntime(decalBody(), {
      ...minimalSpawnOpts(THREE),
      element: decalElement(100),
      findFile: () => null, // resolveTexturePath returns null → async tail no-ops
    });
    rt.dispose();
    await new Promise((r) => setTimeout(r, 0));
    expect(true).toBe(true);
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
    const element = decalElement(100, { key_point_set: kps });
    const rt = spawnDecalRuntime(decalBody(), {
      ...minimalSpawnOpts(THREE),
      element,
    });
    rt.tick(0.05); // 50 ms at gfxSpeed=1
    expect(rt.root.children[0].position.x).toBeCloseTo(5, 1);
    rt.dispose();
  });
});
