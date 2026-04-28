import { describe, expect, it } from 'vitest';
import { ecmExtractor } from '../extract';

function makeWasm(parsed: {
  skinModelPath?: string;
  additionalSkins?: string[];
  children?: Array<{ path: string } | null>;
}): any {
  const children = parsed.children ?? [];
  return {
    EcmModel: {
      parse: (_: Uint8Array) => ({
        skinModelPath: parsed.skinModelPath ?? '',
        additionalSkins: parsed.additionalSkins ?? [],
        childCount: children.length,
        getChild(i: number) {
          return children[i];
        },
        free() {},
        [Symbol.dispose]() {},
      }),
    },
  };
}

describe('ecmExtractor', () => {
  it('declares stable identity', () => {
    expect(ecmExtractor.name).toBe('ecm');
    expect(ecmExtractor.ext).toBe('.ecm');
  });

  it('emits skin-model, additional-skin, child-ecm refs', () => {
    const wasm = makeWasm({
      skinModelPath: '花苞食人花.smd',
      additionalSkins: ['extra1.ski', 'models\\other\\extra2.ski'],
      children: [{ path: 'child1.ecm' }, null, { path: 'child2.ecm' }],
    });
    const refs = ecmExtractor.extract(
      new Uint8Array(0),
      'models\\foo\\利齿绿萼.ecm',
      wasm,
    );
    expect(refs).toEqual([
      {
        kind: 'skin-model',
        raw: '花苞食人花.smd',
        candidates: ['models\\foo\\花苞食人花.smd'],
      },
      {
        kind: 'additional-skin',
        raw: 'extra1.ski',
        candidates: ['models\\foo\\extra1.ski'],
      },
      {
        kind: 'additional-skin',
        raw: 'models\\other\\extra2.ski',
        candidates: ['models\\other\\extra2.ski'],
      },
      {
        kind: 'child-ecm',
        raw: 'child1.ecm',
        candidates: ['models\\foo\\child1.ecm'],
      },
      {
        kind: 'child-ecm',
        raw: 'child2.ecm',
        candidates: ['models\\foo\\child2.ecm'],
      },
    ]);
  });

  it('produces no refs for an empty ECM', () => {
    const wasm = makeWasm({});
    expect(ecmExtractor.extract(new Uint8Array(0), 'a.ecm', wasm)).toEqual([]);
  });
});
