import { describe, it, expect } from 'vitest';
import { dedupeEdges } from '../dedupeEdges';
import type { Edge } from '../../index/types';

const e = (over: Partial<Edge> = {}): Edge => ({
  fromPkgId: 1,
  fromPath: 'a.ecm',
  fromName: 'ecm',
  kind: 'skin-model',
  raw: 'a.smd',
  candidates: ['a.smd'],
  resolved: 'a.smd',
  ...over,
});

describe('dedupeEdges', () => {
  it('returns empty for empty input', () => {
    expect(dedupeEdges([])).toEqual([]);
  });

  it('collapses two edges with identical (kind, fromPath, resolved)', () => {
    const edges = [e({ kind: 'gfx', resolved: 'fx.gfx' }), e({ kind: 'gfx', resolved: 'fx.gfx' })];
    expect(dedupeEdges(edges)).toEqual([edges[0]]);
  });

  it('keeps edges with the same target but different kinds', () => {
    const a = e({ kind: 'skin-model', resolved: 'x.smd' });
    const b = e({ kind: 'animation', resolved: 'x.smd' });
    expect(dedupeEdges([a, b])).toEqual([a, b]);
  });

  it('keeps edges from different sources (incoming dedupe)', () => {
    const a = e({ fromPath: 'one.ecm', resolved: 't.smd' });
    const b = e({ fromPath: 'two.ecm', resolved: 't.smd' });
    expect(dedupeEdges([a, b])).toEqual([a, b]);
  });

  it('keeps unresolved edges with different raw paths', () => {
    const a = e({ resolved: null, raw: 'broken-1.smd' });
    const b = e({ resolved: null, raw: 'broken-2.smd' });
    expect(dedupeEdges([a, b])).toEqual([a, b]);
  });

  it('collapses unresolved edges with the same raw path', () => {
    const a = e({ resolved: null, raw: 'broken.smd' });
    const b = e({ resolved: null, raw: 'broken.smd' });
    expect(dedupeEdges([a, b])).toEqual([a]);
  });

  it('does not let resolved="x" collide with unresolved raw="x" in keying', () => {
    const a = e({ resolved: 'x.smd', raw: 'x.smd' });
    const b = e({ resolved: null, raw: 'x.smd' });
    // Same kind + fromPath but one is resolved (target=x.smd) and the other
    // is unresolved (target=raw:x.smd). Different keys → both kept.
    expect(dedupeEdges([a, b])).toEqual([a, b]);
  });

  it('preserves first-occurrence order across many edges', () => {
    const a = e({ kind: 'gfx', resolved: 'a.gfx' });
    const b = e({ kind: 'animation', resolved: 'a.stck' });
    const c = e({ kind: 'gfx', resolved: 'a.gfx' }); // dup of a
    const d = e({ kind: 'gfx', resolved: 'b.gfx' });
    expect(dedupeEdges([a, b, c, d])).toEqual([a, b, d]);
  });
});
