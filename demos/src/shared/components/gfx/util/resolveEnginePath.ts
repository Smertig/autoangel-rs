/**
 * Canonical engine-path prefix tuples, each covering the lowercase pck
 * storage convention and the engine's title-cased fallback. Consumers:
 * ContainerPreview (gfx), ModelPreview (models), ParticlePreview (textures),
 * SoundPreview. Use via `PackageView.resolveEngine(rawPath, prefixes)`.
 */
export const ENGINE_PATH_PREFIXES = {
  gfx:      ['gfx\\',           'GFX\\']           as const,
  models:   ['gfx\\models\\',   'gfx\\Models\\']   as const,
  textures: ['gfx\\textures\\', 'gfx\\Textures\\'] as const,
  sound:    ['sound\\',         'Sound\\']         as const,
};

/** Build a list of resolution candidates by prepending each prefix to `raw`. */
export function withEnginePrefixes(raw: string, prefixes: readonly string[]): string[] {
  return prefixes.map((p) => p + raw);
}
