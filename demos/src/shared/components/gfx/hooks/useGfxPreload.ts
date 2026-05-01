import { useEffect, useRef, useState } from 'react';
import { ensureThree } from '../../model-viewer/internal/three';
import { ENGINE_PATH_PREFIXES } from '../util/resolveEnginePath';
import { disposePreloadedTextures, preloadGfxGraph } from '../../gfx-runtime/preload';
import type { ViewerCtx } from '../types';
import type { PreloadedTexture } from '../../gfx-runtime/types';

export interface PreloadResult {
  ready: boolean;
  preloadedGfx: Map<string, unknown>;
  preloadedTextures: Map<string, PreloadedTexture>;
}

const EMPTY_GFX = new Map<string, unknown>();
const EMPTY_TEX = new Map<string, PreloadedTexture>();

/**
 * Preload nested container GFX + every element's tex_file referenced from
 * `parsed`. Particle/decal runtimes render nothing without a preloaded
 * texture (engine parity — see `particle.ts:36-40`), so this is mandatory.
 */
export function useGfxPreload(parsed: any, context: ViewerCtx): PreloadResult {
  const [state, setState] = useState<PreloadResult>({
    ready: false,
    preloadedGfx: EMPTY_GFX,
    preloadedTextures: EMPTY_TEX,
  });
  // Track the live texture map so the cleanup handler can dispose it before
  // the effect re-runs or the component unmounts.
  const ownedTexturesRef = useRef<Map<string, PreloadedTexture>>(EMPTY_TEX);

  useEffect(() => {
    let cancelled = false;
    setState({ ready: false, preloadedGfx: EMPTY_GFX, preloadedTextures: EMPTY_TEX });

    const run = async () => {
      const seeds: string[] = [];
      for (const el of parsed?.elements ?? []) {
        if (el?.body?.kind === 'container' && el.body.gfx_path) {
          const r = context.pkg.resolveEngine(el.body.gfx_path, ENGINE_PATH_PREFIXES.gfx);
          if (r) seeds.push(r);
        }
      }

      // The texture decoder reads the lazy three module via getThree(); nothing
      // else in this viewer's path primes it, so prime it here.
      await ensureThree();

      const { preloadedGfx, preloadedTextures } = await preloadGfxGraph({
        wasm: context.wasm,
        pkg: context.pkg,
        seeds,
        extraElements: parsed?.elements ?? [],
        cancelled: () => cancelled,
      });

      if (cancelled) {
        disposePreloadedTextures(preloadedTextures);
        return;
      }
      ownedTexturesRef.current = preloadedTextures;
      setState({ ready: true, preloadedGfx, preloadedTextures });
    };

    run().catch((err) => {
      console.warn('[useGfxPreload] failed', err);
      if (!cancelled) setState({ ready: true, preloadedGfx: EMPTY_GFX, preloadedTextures: EMPTY_TEX });
    });

    return () => {
      cancelled = true;
      disposePreloadedTextures(ownedTexturesRef.current);
      ownedTexturesRef.current = EMPTY_TEX;
    };
  }, [parsed, context.wasm, context.pkg]);

  return state;
}
