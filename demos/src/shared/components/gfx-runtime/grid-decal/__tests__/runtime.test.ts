import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { spawnGridDecalRuntime, computeGridDecalDurationSec } from '../runtime';
import { minimalSpawnOpts } from '../../__tests__/_fixtures';

function gridDecalBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    kind: 'grid_decal_3d',
    w_number: 4,
    h_number: 4,
    grid_size: 0.5,
    z_offset: 0,
    aff_by_scl: false,
    rot_from_view: false,
    offset_height: 0.1,
    always_on_ground: false,
    animation_keys: [],
    vertices: Array.from({ length: 16 }, (_, i) => ({
      pos: [(i % 4) * 0.5, Math.floor(i / 4) * 0.5, 0] as [number, number, number],
      color: 0xffffffff,
    })),
    ...overrides,
  } as any;
}

function gridDecalElement(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    type_id: 210,
    name: 'GD',
    src_blend: 5, dest_blend: 6,
    repeat_count: 0, repeat_delay: 0,
    // 'd.dds' resolves via minimalSpawnOpts's preloaded cache.
    tex_file: 'd.dds', tex_row: 1, tex_col: 1, tex_interval: 0,
    tile_mode: 0, z_enable: 0, is_dummy: 0, priority: 0,
    body: gridDecalBody(),
    affectors: [],
    key_point_set: undefined,
    ...overrides,
  } as any;
}

describe('spawnGridDecalRuntime', () => {
  it('no tex_file → noop', () => {
    const rt = spawnGridDecalRuntime(gridDecalBody(), {
      ...minimalSpawnOpts(THREE),
      element: gridDecalElement({ tex_file: '' }),
    });
    expect(rt.root).toBeInstanceOf(THREE.Group);
    expect(rt.finished?.()).toBe(true);
    rt.dispose();
  });

  it('texture not preloaded → noop', () => {
    const rt = spawnGridDecalRuntime(gridDecalBody(), {
      ...minimalSpawnOpts(THREE),
      element: gridDecalElement(),
      preloadedTextures: new Map(),
    });
    expect(rt.root).toBeInstanceOf(THREE.Group);
    expect(rt.finished?.()).toBe(true);
    rt.dispose();
  });

  it('happy path: tick advances mesh.writeFrame (material.opacity changes)', () => {
    // KPS that changes alpha across time so writeFrame is observable.
    const kp = (overrides: any = {}) => ({
      time_span: 1000, color: 0xffffffff, scale: 1,
      position: [0, 0, 0], direction: [0, 0, 0, 1],
      rad_2d: 0, controllers: [],
      ...overrides,
    });
    const kps: any = {
      start_time: 0,
      keypoints: [kp({ color: 0xffffffff }), kp({ color: 0x80ffffff })],
    };
    const rt = spawnGridDecalRuntime(gridDecalBody(), {
      ...minimalSpawnOpts(THREE),
      element: gridDecalElement({ key_point_set: kps }),
    });
    rt.tick(1.5);
    const animated = (rt.root as any).children[0];
    const mesh = animated.children[0];
    const op1 = mesh.material.opacity;
    rt.tick(0.5);
    const op2 = mesh.material.opacity;
    expect(op1).not.toBe(op2);
    rt.dispose();
  });

  function makeKps(scale: number) {
    const kp = {
      time_span: 1000, color: 0xffffffff, scale,
      position: [0, 0, 0], direction: [0, 0, 0, 1],
      rad_2d: 0, controllers: [],
    };
    return { start_time: 0, keypoints: [kp, kp] } as any;
  }

  it('aff_by_scl=false resets animated.scale to 1 even when sample.scale != 1', () => {
    const rt = spawnGridDecalRuntime(gridDecalBody({ aff_by_scl: false }), {
      ...minimalSpawnOpts(THREE),
      element: gridDecalElement({ key_point_set: makeKps(3) }),
    });
    rt.tick(0.5);
    const animated = (rt.root as any).children[0];
    expect(animated.scale.x).toBeCloseTo(1);
    expect(animated.scale.y).toBeCloseTo(1);
    expect(animated.scale.z).toBeCloseTo(1);
    rt.dispose();
  });

  it('aff_by_scl=true keeps sample.scale on animated', () => {
    const rt = spawnGridDecalRuntime(gridDecalBody({ aff_by_scl: true }), {
      ...minimalSpawnOpts(THREE),
      element: gridDecalElement({ key_point_set: makeKps(3) }),
    });
    rt.tick(0.5);
    const animated = (rt.root as any).children[0];
    expect(animated.scale.x).toBeCloseTo(3);
    rt.dispose();
  });

  it('timeSpanSec finishes the runtime', () => {
    const rt = spawnGridDecalRuntime(gridDecalBody(), {
      ...minimalSpawnOpts(THREE),
      element: gridDecalElement(),
      timeSpanSec: 0.5,
    });
    expect(rt.finished?.()).toBe(false);
    rt.tick(0.25);
    expect(rt.finished?.()).toBe(false);
    rt.tick(0.5);
    expect(rt.finished?.()).toBe(true);
    rt.dispose();
  });

  it('dispose: removes outer from parent, mesh disposed', () => {
    const rt = spawnGridDecalRuntime(gridDecalBody(), {
      ...minimalSpawnOpts(THREE),
      element: gridDecalElement(),
    });
    const parent = new THREE.Scene();
    parent.add(rt.root);
    expect(rt.root.parent).toBe(parent);
    const animated = (rt.root as any).children[0];
    const mesh = animated.children[0];
    const geom = mesh.geometry;
    const mat = mesh.material;
    rt.dispose();
    expect(rt.root.parent).toBeNull();
    expect(() => geom.dispose()).not.toThrow();
    expect(() => mat.dispose()).not.toThrow();
  });
});

describe('computeGridDecalDurationSec', () => {
  it('returns 0 when no KPS and no animation keys', () => {
    const el = { body: gridDecalBody(), key_point_set: undefined } as any;
    expect(computeGridDecalDurationSec(el, {} as any)).toBe(0);
  });

  it('returns lastKey.time_ms / 1000 when animation_keys are present and no KPS', () => {
    const body = gridDecalBody({
      animation_keys: [
        { time_ms: 0, vertices: gridDecalBody().vertices },
        { time_ms: 2500, vertices: gridDecalBody().vertices },
      ],
    });
    const el = { body, key_point_set: undefined } as any;
    expect(computeGridDecalDurationSec(el, {} as any)).toBeCloseTo(2.5);
  });

  it('returns max(KPS, gridDurSec) — KPS wins when longer', () => {
    const body = gridDecalBody({
      animation_keys: [
        { time_ms: 0, vertices: gridDecalBody().vertices },
        { time_ms: 1000, vertices: gridDecalBody().vertices },
      ],
    });
    const kps: any = {
      start_time: 0,
      keypoints: [{ time_span: 5000, color: 0xffffffff, scale: 1, position: [0, 0, 0], direction: [0, 0, 0, 1], rad_2d: 0, controllers: [] }],
    };
    const el = { body, key_point_set: kps } as any;
    expect(computeGridDecalDurationSec(el, {} as any)).toBeCloseTo(5);
  });

  it('returns max(KPS, gridDurSec) — gridDurSec wins when longer', () => {
    const body = gridDecalBody({
      animation_keys: [
        { time_ms: 0, vertices: gridDecalBody().vertices },
        { time_ms: 4000, vertices: gridDecalBody().vertices },
      ],
    });
    const kps: any = {
      start_time: 0,
      keypoints: [{ time_span: 1000, color: 0xffffffff, scale: 1, position: [0, 0, 0], direction: [0, 0, 0, 1], rad_2d: 0, controllers: [] }],
    };
    const el = { body, key_point_set: kps } as any;
    expect(computeGridDecalDurationSec(el, {} as any)).toBeCloseTo(4);
  });
});
