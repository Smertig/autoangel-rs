import { describe, expect, it } from 'vitest';
import { gfxExtractor } from '../extract';

function makeWasm(elements: any[]): any {
  return { parseGfx: (_: Uint8Array) => ({ elements }) };
}

describe('gfxExtractor', () => {
  it('declares stable identity', () => {
    expect(gfxExtractor.name).toBe('gfx');
    expect(gfxExtractor.ext).toBe('.gfx');
  });

  it('extracts particle tex_file with textures-prefix candidates', () => {
    const wasm = makeWasm([
      { tex_file: 'foo.dds', body: { kind: 'particle' } },
    ]);
    const refs = gfxExtractor.extract(new Uint8Array(0), 'a.gfx', wasm);
    expect(refs).toEqual([
      {
        kind: 'texture',
        raw: 'foo.dds',
        candidates: ['gfx\\textures\\foo.dds', 'gfx\\Textures\\foo.dds'],
      },
    ]);
  });

  it('extracts container gfx_path with gfx-prefix candidates', () => {
    const wasm = makeWasm([
      { tex_file: '', body: { kind: 'container', gfx_path: 'sub.gfx' } },
    ]);
    const refs = gfxExtractor.extract(new Uint8Array(0), 'a.gfx', wasm);
    expect(refs).toEqual([
      {
        kind: 'gfx',
        raw: 'sub.gfx',
        candidates: ['gfx\\sub.gfx', 'GFX\\sub.gfx'],
      },
    ]);
  });

  it('extracts model_path with models-prefix candidates', () => {
    const wasm = makeWasm([
      { tex_file: '', body: { kind: 'model', model_path: 'weapon.smd' } },
    ]);
    const refs = gfxExtractor.extract(new Uint8Array(0), 'a.gfx', wasm);
    expect(refs).toEqual([
      {
        kind: 'model',
        raw: 'weapon.smd',
        candidates: ['gfx\\models\\weapon.smd', 'gfx\\Models\\weapon.smd'],
      },
    ]);
  });

  it('extracts sound paths with sound-prefix candidates', () => {
    const wasm = makeWasm([
      { tex_file: '', body: { kind: 'sound', paths: ['hit.ogg', 'miss.ogg'] } },
    ]);
    const refs = gfxExtractor.extract(new Uint8Array(0), 'a.gfx', wasm);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toEqual({
      kind: 'sound',
      raw: 'hit.ogg',
      candidates: ['sound\\hit.ogg', 'Sound\\hit.ogg'],
    });
  });

  it('combines tex_file with body refs on the same element', () => {
    const wasm = makeWasm([
      { tex_file: 'fx.dds', body: { kind: 'container', gfx_path: 'sub.gfx' } },
    ]);
    const refs = gfxExtractor.extract(new Uint8Array(0), 'a.gfx', wasm);
    expect(refs.map((r) => r.kind)).toEqual(['texture', 'gfx']);
  });

  it('emits nothing for elements with no refs', () => {
    const wasm = makeWasm([{ tex_file: '', body: { kind: 'unknown' } }]);
    expect(gfxExtractor.extract(new Uint8Array(0), 'a.gfx', wasm)).toEqual([]);
  });
});
