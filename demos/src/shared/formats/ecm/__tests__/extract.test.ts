import { describe, expect, it } from 'vitest';
import { ecmExtractor } from '../extract';

interface MockEvent {
  event_type: number;
  fx_file_path: string;
}

function makeWasm(parsed: {
  skinModelPath?: string;
  additionalSkins?: string[];
  children?: Array<{ path: string } | null>;
  /** Each combined action is a flat list of events. */
  combinedActions?: MockEvent[][];
}): any {
  const children = parsed.children ?? [];
  const actions = parsed.combinedActions ?? [];
  return {
    EcmModel: {
      parse: (_: Uint8Array) => ({
        skinModelPath: parsed.skinModelPath ?? '',
        additionalSkins: parsed.additionalSkins ?? [],
        childCount: children.length,
        getChild(i: number) {
          return children[i];
        },
        combineActionCount: actions.length,
        combineActionEventCount(i: number) {
          return actions[i]?.length ?? 0;
        },
        getEvent(i: number, e: number) {
          return actions[i]?.[e] ?? null;
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

  it('emits gfx and sound refs from combined-action events', () => {
    const wasm = makeWasm({
      combinedActions: [
        [
          { event_type: 100, fx_file_path: '人物\\技能\\刺客\\foo.gfx' },
          { event_type: 101, fx_file_path: '动作\\hit.wav' },
        ],
        [
          { event_type: 100, fx_file_path: 'shared\\bar.gfx' },
          // Unknown event types (e.g. 5 = Bind) are ignored.
          { event_type: 5, fx_file_path: 'unused.dat' },
        ],
      ],
    });
    const refs = ecmExtractor.extract(new Uint8Array(0), 'a.ecm', wasm);
    expect(refs).toEqual([
      {
        kind: 'gfx',
        raw: '人物\\技能\\刺客\\foo.gfx',
        candidates: ['gfx\\人物\\技能\\刺客\\foo.gfx', 'GFX\\人物\\技能\\刺客\\foo.gfx'],
      },
      {
        kind: 'sound',
        raw: '动作\\hit.wav',
        candidates: ['sound\\动作\\hit.wav', 'Sound\\动作\\hit.wav'],
      },
      {
        kind: 'gfx',
        raw: 'shared\\bar.gfx',
        candidates: ['gfx\\shared\\bar.gfx', 'GFX\\shared\\bar.gfx'],
      },
    ]);
  });

  it('skips events with empty fx_file_path', () => {
    const wasm = makeWasm({
      combinedActions: [[{ event_type: 100, fx_file_path: '' }]],
    });
    expect(ecmExtractor.extract(new Uint8Array(0), 'a.ecm', wasm)).toEqual([]);
  });
});
