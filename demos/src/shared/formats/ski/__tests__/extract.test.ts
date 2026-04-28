import { describe, expect, it } from 'vitest';
import { skiExtractor } from '../extract';

/** Stub `wasm.Skin.parse` returning a using-disposable object with the
 *  fields the extractor reads. Tests stay pure-JS — the real wasm is
 *  exercised by E2E. */
function makeWasm(textures: string[]): any {
  return {
    Skin: {
      parse: (_data: Uint8Array) => ({
        textures,
        free() {},
        [Symbol.dispose]() {},
      }),
    },
  };
}

describe('skiExtractor', () => {
  it('declares stable identity', () => {
    expect(skiExtractor.name).toBe('ski');
    expect(skiExtractor.ext).toBe('.ski');
    expect(typeof skiExtractor.version).toBe('number');
  });

  it('emits one texture ref per texture with three engine candidates', () => {
    const wasm = makeWasm(['花苞食人花2.dds', '花苞食人花透明2.dds']);
    const refs = skiExtractor.extract(
      new Uint8Array(0),
      'models\\npcs\\11木元素\\利齿绿萼.ski',
      wasm,
    );
    expect(refs).toEqual([
      {
        kind: 'texture',
        raw: '花苞食人花2.dds',
        candidates: [
          'models\\npcs\\11木元素\\textures\\花苞食人花2.dds',
          'models\\npcs\\11木元素\\tex_利齿绿萼\\花苞食人花2.dds',
          'models\\npcs\\11木元素\\花苞食人花2.dds',
        ],
      },
      {
        kind: 'texture',
        raw: '花苞食人花透明2.dds',
        candidates: [
          'models\\npcs\\11木元素\\textures\\花苞食人花透明2.dds',
          'models\\npcs\\11木元素\\tex_利齿绿萼\\花苞食人花透明2.dds',
          'models\\npcs\\11木元素\\花苞食人花透明2.dds',
        ],
      },
    ]);
  });

  it('skips empty texture names', () => {
    const wasm = makeWasm(['', 'real.dds', '']);
    const refs = skiExtractor.extract(new Uint8Array(0), 'a.ski', wasm);
    expect(refs).toHaveLength(1);
    expect(refs[0].raw).toBe('real.dds');
  });

  it('handles missing textures array', () => {
    const wasm: any = { Skin: { parse: () => ({ free() {}, [Symbol.dispose]() {} }) } };
    expect(skiExtractor.extract(new Uint8Array(0), 'a.ski', wasm)).toEqual([]);
  });
});
