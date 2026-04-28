import { describe, expect, it } from 'vitest';
import { bmdExtractor } from '../extract';

function makeWasm(textureMaps: Array<string | undefined | null>): any {
  return {
    parseBmd: (_: Uint8Array) => ({
      meshes: textureMaps.map((t) => ({ texture_map: t ?? '' })),
    }),
  };
}

describe('bmdExtractor', () => {
  it('emits one ref per unique texture_map', () => {
    const wasm = makeWasm(['textures\\a.dds', 'textures\\b.dds']);
    const refs = bmdExtractor.extract(new Uint8Array(0), 'b.bmd', wasm);
    expect(refs).toEqual([
      { kind: 'texture', raw: 'textures\\a.dds', candidates: ['textures\\a.dds'] },
      { kind: 'texture', raw: 'textures\\b.dds', candidates: ['textures\\b.dds'] },
    ]);
  });

  it('deduplicates case-insensitively', () => {
    const wasm = makeWasm(['Textures\\A.DDS', 'textures\\a.dds', 'textures\\a.dds']);
    const refs = bmdExtractor.extract(new Uint8Array(0), 'b.bmd', wasm);
    expect(refs).toHaveLength(1);
    expect(refs[0].raw).toBe('Textures\\A.DDS'); // first wins
  });

  it('skips empty texture_map', () => {
    const wasm = makeWasm(['', 'real.dds', null]);
    const refs = bmdExtractor.extract(new Uint8Array(0), 'b.bmd', wasm);
    expect(refs).toHaveLength(1);
    expect(refs[0].raw).toBe('real.dds');
  });

  it('handles missing meshes', () => {
    const wasm: any = { parseBmd: () => ({}) };
    expect(bmdExtractor.extract(new Uint8Array(0), 'b.bmd', wasm)).toEqual([]);
  });
});
