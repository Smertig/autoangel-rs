import { resolveEnginePath, ENGINE_PATH_PREFIXES } from '../../util/resolveEnginePath';
import { loadThreeTexture } from '@shared/components/model-viewer/internal/texture';
import type { AutoangelModule } from '../../../../../types/autoangel';

/**
 * Resolve an engine-relative particle texture path against the loaded
 * pcks. Returns the actual stored path (case may differ from what the
 * engine string says), or the fallback engine-prefixed path when
 * `listFiles` isn't available.
 */
export function resolveTexturePath(
  texFile: string,
  listFiles: ((prefix: string) => string[]) | undefined,
): string | null {
  if (!listFiles) return `gfx\\textures\\${texFile}`;
  return resolveEnginePath(texFile, ENGINE_PATH_PREFIXES.textures, listFiles);
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

/** `useFileData` must always have a `getData` arg; this is the no-op one for when no texture path resolved. */
export const noopGetData = async (_: string): Promise<Uint8Array> => new Uint8Array();
