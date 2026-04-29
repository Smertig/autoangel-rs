import { ENGINE_PATH_PREFIXES } from '../gfx/util/resolveEnginePath';
import { loadParticleTexture, resolveTexturePath } from './texture';
import { createGfxLoader } from './loader';
import type { PreloadedTexture } from './types';
import type { AutoangelModule } from '../../../types/autoangel';
import type { PackageView } from '@shared/package';

export interface GfxLike { elements: any[] }

export interface PreloadOpts {
  wasm: AutoangelModule;
  pkg: PackageView;
  /** Resolved (canonical-cased) GFX paths to seed the BFS load. */
  seeds: string[];
  /** Top-level elements whose `tex_file`s should also be collected. Use
   *  when the "parent" GFX isn't itself in the preloadedGfx map (e.g. the
   *  GFX viewer's currently-open file). */
  extraElements?: { tex_file?: string }[];
  /** Optional cancel signal. Textures decoded after this returns true are
   *  disposed instead of stored. */
  cancelled?: () => boolean;
}

export interface PreloadResult {
  preloadedGfx: Map<string, GfxLike>;
  preloadedTextures: Map<string, PreloadedTexture>;
}

/**
 * Resolve and load every nested-container GFX reachable from `seeds`, then
 * parallel-decode every referenced texture. The decoder reads the lazy
 * three module via `getThree()`, so callers must `await ensureThree()`
 * before invoking this helper.
 */
export async function preloadGfxGraph(opts: PreloadOpts): Promise<PreloadResult> {
  const loader = createGfxLoader(opts.wasm, opts.pkg);
  const resolveGfxPath = (p: string) =>
    opts.pkg.resolveEngine(p, ENGINE_PATH_PREFIXES.gfx);

  const preloadedGfx = new Map<string, GfxLike>();
  const seen = new Set<string>();
  let pending: string[] = [];
  const enqueue = (p: string | null) => {
    if (p && !seen.has(p)) { seen.add(p); pending.push(p); }
  };
  for (const seed of opts.seeds) enqueue(seed);

  while (pending.length > 0) {
    const batch = pending; pending = [];
    const loaded = await Promise.all(batch.map(async (path) => {
      const gfx = await loader.load(path);
      return { path, gfx: gfx ? (gfx as GfxLike) : null };
    }));
    for (const { path, gfx } of loaded) {
      if (!gfx) continue;
      preloadedGfx.set(path, gfx);
      for (const el of gfx.elements ?? []) {
        if (el?.body?.kind === 'container' && el.body.gfx_path) {
          enqueue(resolveGfxPath(el.body.gfx_path));
        }
      }
    }
  }

  const texPaths = new Set<string>();
  const collectTextures = (elements: { tex_file?: string }[] | undefined) => {
    for (const el of elements ?? []) {
      if (el?.tex_file) {
        const tp = resolveTexturePath(el.tex_file, opts.pkg);
        if (tp) texPaths.add(tp);
      }
    }
  };
  for (const gfx of preloadedGfx.values()) collectTextures(gfx.elements);
  if (opts.extraElements) collectTextures(opts.extraElements);

  const preloadedTextures = new Map<string, PreloadedTexture>();
  await Promise.all([...texPaths].map(async (texPath) => {
    try {
      const data = await opts.pkg.read(texPath);
      if (!data || data.byteLength === 0) return;
      const tex = await loadParticleTexture(opts.wasm, data, texPath);
      if (!tex) return;
      if (opts.cancelled?.()) {
        (tex as PreloadedTexture).dispose?.();
        return;
      }
      preloadedTextures.set(texPath, tex as PreloadedTexture);
    } catch (e) {
      console.warn('[gfx-runtime] texture preload failed:', texPath, e);
    }
  }));

  return { preloadedGfx, preloadedTextures };
}
