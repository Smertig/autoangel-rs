import { useMemo } from 'react';
import { useFileData } from '@shared/hooks/useFileData';
import { noopGetData, resolveTexturePath } from '../particle/texture';
import type { GfxElement, ViewerCtx } from '../types';

/**
 * Resolves the element's texture path against loaded pcks and streams the
 * bytes. Returns `null` while loading / on failure; the caller uploads the
 * bytes to three.js inside its scene-build effect.
 */
export function useDecalTexture(
  element: GfxElement,
  context: ViewerCtx,
): Uint8Array | null {
  const resolvedPath = useMemo(
    () => resolveTexturePath(element.tex_file, context.listFiles),
    [element.tex_file, context.listFiles],
  );
  const state = useFileData(
    resolvedPath ?? '__noop__',
    resolvedPath ? context.getData : noopGetData,
  );
  return useMemo(
    () => (state.status === 'loaded' ? state.data : null),
    [state],
  );
}
