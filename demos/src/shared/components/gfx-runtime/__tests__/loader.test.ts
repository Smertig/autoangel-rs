import { describe, it, expect, vi } from 'vitest';
import { createGfxLoader } from '../loader';

const wasmStub = {
  parseGfx: (bytes: Uint8Array) => {
    if (bytes.length === 0) throw new Error('parse fail');
    return { version: 1, elements: [] };
  },
};

describe('createGfxLoader', () => {
  it('caches a resolved GFX by path', async () => {
    const getData = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const loader = createGfxLoader(wasmStub as any, getData);
    const a = await loader.load('gfx/test.gfx');
    const b = await loader.load('gfx/test.gfx');
    expect(a).toBe(b);
    expect(getData).toHaveBeenCalledTimes(1);
  });

  it('returns null sentinel on parse failure and caches it', async () => {
    const getData = vi.fn(async () => new Uint8Array(0));
    const loader = createGfxLoader(wasmStub as any, getData);
    const a = await loader.load('gfx/broken.gfx');
    const b = await loader.load('gfx/broken.gfx');
    expect(a).toBeNull();
    expect(b).toBeNull();
    expect(getData).toHaveBeenCalledTimes(1);
  });

  it('returns null sentinel and caches when getData returns null', async () => {
    const getData = vi.fn(async () => null);
    const loader = createGfxLoader(wasmStub as any, getData);
    const a = await loader.load('gfx/missing.gfx');
    const b = await loader.load('gfx/missing.gfx');
    expect(a).toBeNull();
    expect(b).toBeNull();
    expect(getData).toHaveBeenCalledTimes(1);
  });
});
