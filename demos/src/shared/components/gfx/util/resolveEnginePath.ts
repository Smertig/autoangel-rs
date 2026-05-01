/**
 * Engine-path prefixes by ref kind. Use via `PackageView.resolveEngine`.
 * Lookup goes through `normalizePath`, so the prefixes themselves only
 * need to cover the engine's directory layout — case and separator
 * variations resolve uniformly.
 */
export const ENGINE_PATH_PREFIXES = {
  gfx:      ['gfx/']           as const,
  models:   ['gfx/models/']    as const,
  textures: ['gfx/textures/']  as const,
  sound:    ['sound/']         as const,
};

import { normalizePath } from '@shared/util/path';

/** Build a list of resolution candidates by prepending each prefix to `raw`,
 *  emitting in the canonical JS-side path form (lowercase + forward-slash). */
export function withEnginePrefixes(raw: string, prefixes: readonly string[]): string[] {
  return prefixes.map((p) => normalizePath(p + raw));
}
