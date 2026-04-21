/**
 * Some GFX references (Container's `gfx_path`, Model's `model_path`,
 * Particle's `tex_file`) are engine-relative — the runtime prepends a
 * fixed prefix before loading. Mirrors that resolution so we can look up
 * the file in the loaded pcks: build the engine-prefixed target, then
 * scan `listFiles` case-insensitively to find the actual stored path
 * (pcks are typically lowercase; engine strings often have title-casing
 * or uppercase extensions).
 */
export function resolveEnginePath(
  rawPath: string,
  prefixes: readonly string[],
  listFiles: (prefix: string) => string[],
): string | null {
  const target = (prefixes[0] + rawPath).toLowerCase();
  for (const prefix of prefixes) {
    const match = listFiles(prefix).find((p) => p.toLowerCase() === target);
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
  gfx:      ['gfx\\',          'GFX\\']          as const,
  models:   ['gfx\\models\\',   'gfx\\Models\\']   as const,
  textures: ['gfx\\textures\\', 'gfx\\Textures\\'] as const,
};
