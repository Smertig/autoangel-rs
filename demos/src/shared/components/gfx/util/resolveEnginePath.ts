/**
 * Case-insensitive full-path lookup against the loaded pcks. Returns the
 * canonical-cased stored path or null if no loaded package contains it.
 */
export type FindFile = (path: string) => string | null;

/**
 * GFX references (Container's `gfx_path`, Model's `model_path`, Particle's
 * `tex_file`) are engine-relative — the runtime prepends a fixed prefix
 * before loading. Tries each prefix in turn against the index.
 */
export function resolveEnginePath(
  rawPath: string,
  prefixes: readonly string[],
  findFile: FindFile,
): string | null {
  for (const prefix of prefixes) {
    const match = findFile(prefix + rawPath);
    if (match) return match;
  }
  return null;
}

/**
 * Canonical engine-path prefix tuples, each covering the lowercase pck
 * storage convention and the engine's title-cased fallback. Consumers:
 * ContainerPreview (gfx), ModelPreview (models), ParticlePreview (textures).
 */
export const ENGINE_PATH_PREFIXES = {
  gfx:      ['gfx\\',           'GFX\\']           as const,
  models:   ['gfx\\models\\',   'gfx\\Models\\']   as const,
  textures: ['gfx\\textures\\', 'gfx\\Textures\\'] as const,
  sound:    ['sound\\',         'Sound\\']         as const,
};
