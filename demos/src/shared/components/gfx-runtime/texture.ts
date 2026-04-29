import { ENGINE_PATH_PREFIXES } from '../gfx/util/resolveEnginePath';
import { loadThreeTexture } from '@shared/components/model-viewer/internal/texture';
import type { AutoangelModule } from '../../../types/autoangel';
import type { PreloadedTexture } from '@shared/components/gfx-runtime/types';
import type { PackageView } from '@shared/package';

/**
 * Resolve an engine-relative particle texture path against the loaded pcks.
 * Returns the actual stored path (case may differ from what the engine
 * string says) or null if no loaded package contains it.
 */
export function resolveTexturePath(texFile: string, pkg: PackageView): string | null {
  return pkg.resolveEngine(texFile, ENGINE_PATH_PREFIXES.textures);
}

/**
 * Thin composition of the existing `loadThreeTexture` helper; kept here
 * so the particle preview doesn't import from `model-viewer/internal`
 * directly (keeps the dependency graph tidy).
 */
export async function loadParticleTexture(
  wasm: AutoangelModule,
  data: Uint8Array,
  texFile: string,
): Promise<unknown | null> {
  return loadThreeTexture(wasm, data, texFile);
}

/** Look up a preloaded texture for the given element. Warns and returns null
 *  when the texture isn't preloaded — strict-loader runtimes treat that as
 *  "skip rendering" rather than retrying an async fetch. */
export function resolvePreloadedTexture(
  texFile: string,
  pkg: PackageView,
  preloadedTextures: Map<string, PreloadedTexture> | undefined,
  kind: string,
): PreloadedTexture | null {
  const path = resolveTexturePath(texFile, pkg);
  const tex = path ? preloadedTextures?.get(path) ?? null : null;
  if (!tex) console.warn(`[gfx-runtime] ${kind} texture not preloaded:`, texFile);
  return tex;
}
