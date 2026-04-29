import type { AutoangelModule } from '../../../types/autoangel';
import type { PackageView } from '@shared/package';

export interface GfxLoader {
  load(resolvedPath: string): Promise<unknown | null>;
}

/**
 * Lazy GFX file loader. First call for a given path fetches + parses; both
 * the in-flight Promise and the eventual result (success or null sentinel)
 * are cached so subsequent calls don't re-fetch. Failures degrade to null
 * with a single console.warn — never let one bad GFX break clip playback.
 */
export function createGfxLoader(wasm: AutoangelModule, pkg: PackageView): GfxLoader {
  const cache = new Map<string, Promise<unknown | null>>();
  return {
    load(path) {
      let p = cache.get(path);
      if (p) return p;
      p = (async () => {
        try {
          const data = await pkg.read(path);
          if (!data) { console.warn(`[gfx-runtime] missing: ${path}`); return null; }
          return wasm.parseGfx(data);
        } catch (e) {
          console.warn(`[gfx-runtime] parse failed: ${path}`, e);
          return null;
        }
      })();
      cache.set(path, p);
      return p;
    },
  };
}
