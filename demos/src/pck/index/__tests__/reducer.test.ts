import { describe, expect, it } from 'vitest';
import {
  addEdges,
  createIndexState,
  removeSlot,
  reresolve,
} from '../reducer';
import { normalizePathKey } from '../pathKey';
import type { Edge } from '../types';

function pathIndex(paths: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of paths) m.set(normalizePathKey(p), p);
  return m;
}

const edge = (over: Partial<Edge> = {}): Edge => ({
  fromPkgId: 1,
  fromPath: 'a.ecm',
  fromName: 'ecm',
  kind: 'skin-model',
  raw: 'a.smd',
  candidates: ['a.smd'],
  resolved: 'a.smd',
  ...over,
});

describe('reducer', () => {
  it('byFrom and byTo views reflect added edges', () => {
    const s = createIndexState();
    addEdges(s, [edge()]);
    expect(s.byFrom.get('a.ecm')).toHaveLength(1);
    expect(s.byTo.get('a.smd')).toHaveLength(1);
    expect(s.dangling).toHaveLength(0);
  });

  it('byTo keys are normalized — case-/separator-insensitive lookup', () => {
    const s = createIndexState();
    addEdges(s, [edge({ resolved: 'Models\\Foo\\Bar.SMD' })]);
    expect(s.byTo.get('models/foo/bar.smd')).toHaveLength(1);
    expect(s.byTo.get('Models\\Foo\\Bar.SMD')).toBeUndefined();
  });

  it('null `resolved` lands edges in `dangling`, not `byTo`', () => {
    const s = createIndexState();
    addEdges(s, [edge({ resolved: null })]);
    expect(s.dangling).toHaveLength(1);
    expect(s.byTo.size).toBe(0);
  });

  it('removeSlot drops outgoing edges of the removed pkg only', () => {
    const s = createIndexState();
    addEdges(s, [
      edge({ fromPkgId: 1, fromPath: 'a.ecm' }),
      edge({ fromPkgId: 2, fromPath: 'b.ecm' }),
    ]);
    removeSlot(s, 1);
    expect(s.byFrom.has('a.ecm')).toBe(false);
    expect(s.byFrom.has('b.ecm')).toBe(true);
    expect(s.edges).toHaveLength(1);
  });

  it('reresolve re-binds dangling edges when path index grows', () => {
    const s = createIndexState();
    addEdges(s, [edge({ candidates: ['gfx\\foo.smd'], resolved: null })]);
    expect(s.dangling).toHaveLength(1);
    reresolve(s, pathIndex(['gfx\\foo.smd']));
    expect(s.dangling).toHaveLength(0);
    expect(s.byTo.get('gfx/foo.smd')).toHaveLength(1);
  });

  it('reresolve demotes edges whose target left the index', () => {
    const s = createIndexState();
    addEdges(s, [edge({ candidates: ['a.smd'] })]);
    expect(s.byTo.has('a.smd')).toBe(true);
    reresolve(s, pathIndex([]));
    expect(s.byTo.size).toBe(0);
    expect(s.dangling).toHaveLength(1);
  });

  it('reresolve preserves byFrom view', () => {
    const s = createIndexState();
    addEdges(s, [edge()]);
    reresolve(s, pathIndex([]));
    expect(s.byFrom.get('a.ecm')).toHaveLength(1);
  });
});
