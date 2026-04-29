import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

const { spawnChildMock } = vi.hoisted(() => ({
  spawnChildMock: vi.fn(),
}));
vi.mock('../registry', () => ({
  spawnElementRuntime: spawnChildMock,
}));

import { spawnContainerRuntime } from '../container';
import { pkgFrom, minimalSpawnOpts } from './_fixtures';
import { EMPTY_PACKAGE_VIEW } from '@shared/package';

beforeEach(() => {
  spawnChildMock.mockReset();
  spawnChildMock.mockImplementation(() => ({
    root: new THREE.Object3D(),
    tick: () => {},
    dispose: () => {},
  }));
});

function containerBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    kind: 'container',
    gfx_path: 'effects\\nested.gfx',
    out_color: false,
    loop_flag: false,
    play_speed: 1.0,
    dummy_use_g_scale: false,
    ...overrides,
  } as any;
}

function containerElement(kps?: unknown) {
  return {
    type_id: 200,
    name: 'ContainerA',
    src_blend: 5, dest_blend: 6,
    repeat_count: 0, repeat_delay: 0,
    tex_file: '', tex_row: 1, tex_col: 1, tex_interval: 0,
    tile_mode: 0, z_enable: 0, is_dummy: 0, priority: 0,
    body: containerBody(),
    affectors: [],
    key_point_set: kps,
  } as any;
}

function containerOpts(overrides: Record<string, unknown> = {}) {
  return {
    ...minimalSpawnOpts(THREE),
    element: containerElement(),
    pkg: pkgFrom(['gfx\\effects\\nested.gfx']),
    ...overrides,
  };
}

describe('spawnContainerRuntime', () => {
  it('returns a runtime with a THREE.Group root', () => {
    const rt = spawnContainerRuntime(containerBody(), containerOpts());
    expect(rt.root.type).toBe('Group');
    rt.dispose();
  });

  it('ticks cleanly when gfx_path is unresolvable (no crash)', async () => {
    const rt = spawnContainerRuntime(
      containerBody({ gfx_path: 'does\\not\\exist.gfx' }),
      containerOpts({ pkg: EMPTY_PACKAGE_VIEW }),
    );
    rt.tick(0.016);
    // Outer group always contains the animated group; children of the
    // nested gfx would populate the animated group, not the outer.
    expect(rt.root.children[0].children.length).toBe(0);
    rt.dispose();
  });

  it('skips recursion with a console.warn when path is already in visiting set', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const visiting = new Set(['gfx\\effects\\nested.gfx']);
    const preloadedGfx = new Map<string, unknown>([['gfx\\effects\\nested.gfx', { elements: [] }]]);
    const rt = spawnContainerRuntime(containerBody(), containerOpts({ visiting, preloadedGfx }));

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('cycle'), expect.any(String));
    expect(spawnChildMock).not.toHaveBeenCalled();
    rt.dispose();
    warnSpy.mockRestore();
  });

  it('multiplies play_speed into child gfxSpeed', () => {
    const childEl = { type_id: 120, body: { kind: 'particle' } };
    const preloadedGfx = new Map<string, unknown>([
      ['gfx\\effects\\nested.gfx', { elements: [childEl] }],
    ]);
    const rt = spawnContainerRuntime(
      containerBody({ play_speed: 2.0 }),
      containerOpts({ preloadedGfx, gfxSpeed: 3.0 }),
    );

    expect(spawnChildMock).toHaveBeenCalledTimes(1);
    const childOpts = spawnChildMock.mock.calls[0]![1];
    // opts.gfxSpeed * (body.play_speed ?? 1) = 3.0 * 2.0
    expect(childOpts.gfxSpeed).toBeCloseTo(6.0);
    // visiting set passed down to child must contain the resolved path
    expect(childOpts.visiting instanceof Set).toBe(true);
    expect((childOpts.visiting as Set<string>).has('gfx\\effects\\nested.gfx')).toBe(true);
    rt.dispose();
  });

  it('warns and mounts nothing when nested gfx is not preloaded', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rt = spawnContainerRuntime(containerBody(), containerOpts());

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not preloaded'), expect.any(String));
    expect(spawnChildMock).not.toHaveBeenCalled();
    expect(rt.root.children[0].children.length).toBe(0);
    rt.dispose();
    warnSpy.mockRestore();
  });
});
