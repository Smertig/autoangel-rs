import { describe, it, expect, vi } from 'vitest';
import { createGfxLoader } from '../loader';
import { createPackageView } from '@shared/package';

const wasmStub = {
  parseGfx: (bytes: Uint8Array) => {
    if (bytes.length === 0) throw new Error('parse fail');
    return { version: 1, elements: [] };
  },
};

function pkgWith(getData: (p: string) => Promise<Uint8Array | null>) {
  return createPackageView({
    getData: async (p) => {
      const v = await getData(p);
      if (!v) throw new Error('miss');
      return v;
    },
    resolve: (p) => p,
    list: () => [],
  });
}

describe('createGfxLoader', () => {
  it('caches a resolved GFX by path', async () => {
    const getData = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const loader = createGfxLoader(wasmStub as any, pkgWith(getData));
    const a = await loader.load('gfx/test.gfx');
    const b = await loader.load('gfx/test.gfx');
    expect(a).toBe(b);
    expect(getData).toHaveBeenCalledTimes(1);
  });

  it('returns null sentinel on parse failure and caches it', async () => {
    const getData = vi.fn(async () => new Uint8Array(0));
    const loader = createGfxLoader(wasmStub as any, pkgWith(getData));
    const a = await loader.load('gfx/broken.gfx');
    const b = await loader.load('gfx/broken.gfx');
    expect(a).toBeNull();
    expect(b).toBeNull();
    expect(getData).toHaveBeenCalledTimes(1);
  });

  it('returns null sentinel and caches when pkg.read returns null', async () => {
    const getData = vi.fn(async () => null);
    const loader = createGfxLoader(wasmStub as any, pkgWith(getData));
    const a = await loader.load('gfx/missing.gfx');
    const b = await loader.load('gfx/missing.gfx');
    expect(a).toBeNull();
    expect(b).toBeNull();
    expect(getData).toHaveBeenCalledTimes(1);
  });
});
