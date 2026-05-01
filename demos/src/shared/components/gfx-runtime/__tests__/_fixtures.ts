// Shared test fixtures for gfx-runtime tests. Kept under __tests__/ with a
// leading underscore so vitest's discovery skips it as a non-spec file.

import { createPackageView, type PackageView } from '@shared/package';
import { normalizePath } from '@shared/util/path';

/** Minimal point-emitter particle body — what spawnElementRuntime / scheduler tests feed. */
export function minimalParticleBody() {
  return {
    kind: 'particle',
    emitter: {
      shape: { shape: 'point' },
      par_ini_dir: [0, 0, 1], angle: 0, speed: 0,
      acc: 0, par_acc: 0, acc_dir: [0, 1, 0],
      drag_pow: undefined,
      color_min: 0xffffffff, color_max: 0xffffffff,
      scale_min: 1, scale_max: 1, rot_min: 0, rot_max: 0,
      init_random_texture: false,
      particle_width: 1, particle_height: 1,
      emission_rate: 5, ttl: 1,
    },
    quota: 10,
    init_random_texture: false,
    particle_width: 1, particle_height: 1,
  } as any;
}

/** Minimal GfxElement wrapping the particle body — needed by spawners that
 *  read tex_file / src_blend / dest_blend off the parent element. */
export function minimalParticleElement() {
  return {
    type_id: 120,
    name: 'T',
    src_blend: 5, dest_blend: 6,
    repeat_count: 0, repeat_delay: 0,
    tex_file: 'test.dds', tex_row: 1, tex_col: 1, tex_interval: 0,
    tile_mode: 0, z_enable: 0, is_dummy: 0, priority: 0,
    body: minimalParticleBody(),
    affectors: [],
    key_point_set: undefined,
  } as any;
}

/** Build a case-insensitive, separator-agnostic PackageView from a fixed
 *  path list. Mirrors what App.tsx's path index does. */
export function pkgFrom(paths: string[]): PackageView {
  const byKey = new Map(paths.map((p) => [normalizePath(p), p]));
  return createPackageView({
    getData: async () => { throw new Error('test pkg has no data'); },
    resolve: (p) => byKey.get(normalizePath(p)) ?? null,
    list: () => [],
  });
}

/** Minimal SpawnOpts the particle/registry tests need. Pre-populates the
 *  texture cache for any `*.dds` referenced by minimalParticleElement /
 *  decal-test elements so the strict-loader path resolves without a fetch. */
export function minimalSpawnOpts(three: any, overrides: Record<string, any> = {}) {
  const fakeTex: { dispose?: () => void } = { dispose: () => {} };
  const preloadedTextures = new Map<string, { dispose?: () => void }>([
    ['gfx/textures/test.dds', fakeTex],
    ['gfx/textures/d.dds', fakeTex],
  ]);
  const byKey = new Map<string, string>();
  for (const p of preloadedTextures.keys()) byKey.set(normalizePath(p), p);
  const pkg: PackageView = createPackageView({
    getData: async () => { throw new Error('test pkg: no live read'); },
    resolve: (p) => byKey.get(normalizePath(p)) ?? null,
    list: () => [],
  });
  return {
    three,
    gfxScale: 1,
    gfxSpeed: 1,
    timeSpanSec: undefined as number | undefined,
    pkg,
    element: minimalParticleElement(),
    preloadedGfx: new Map<string, unknown>(),
    preloadedTextures,
    ...overrides,
  };
}
