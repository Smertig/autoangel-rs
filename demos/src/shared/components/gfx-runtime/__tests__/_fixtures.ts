// Shared test fixtures for gfx-runtime tests. Kept under __tests__/ with a
// leading underscore so vitest's discovery skips it as a non-spec file.

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
    tex_file: '', tex_row: 1, tex_col: 1, tex_interval: 0,
    tile_mode: 0, z_enable: 0, is_dummy: 0, priority: 0,
    body: minimalParticleBody(),
    affectors: [],
    key_point_set: undefined,
  } as any;
}

/** Build a case-insensitive `findFile` from a fixed path list. Mirrors
 *  what App.tsx's path index does, but trivial enough to inline in tests. */
export function findFileFrom(paths: string[]): (p: string) => string | null {
  const lower = new Map(paths.map((p) => [p.toLowerCase(), p]));
  return (p: string) => lower.get(p.toLowerCase()) ?? null;
}

/** Minimal SpawnOpts the particle/registry tests need. Texture loading is
 *  skipped when tex_file is empty (the default), so wasm/findFile can be
 *  stubbed harmlessly. */
export function minimalSpawnOpts(three: any, overrides: Record<string, any> = {}) {
  return {
    three,
    gfxScale: 1,
    gfxSpeed: 1,
    timeSpanSec: undefined as number | undefined,
    getData: async () => new Uint8Array(0),
    wasm: {} as any,
    findFile: () => null,
    element: minimalParticleElement(),
    ...overrides,
  };
}
