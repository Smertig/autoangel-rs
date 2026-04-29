import { describe, it, expect } from 'vitest';
import { buildTree } from '../buildTree';

describe('buildTree', () => {
  it('returns a flat list when no containers', () => {
    const gfx: any = { elements: [
      { name: 'p1', body: { kind: 'particle' } },
      { name: 'p2', body: { kind: 'particle' } },
    ] };
    const t = buildTree(gfx, { resolve: () => null, visiting: new Set() });
    expect(t.length).toBe(2);
    expect(t[0].children).toBeUndefined();
  });

  it('descends into resolvable containers', () => {
    const child: any = { elements: [{ name: 'c1', body: { kind: 'particle' } }] };
    const gfx: any = { elements: [
      { name: 'box', body: { kind: 'container', gfx_path: 'gfx/x.gfx' } },
    ] };
    const t = buildTree(gfx, { resolve: () => child, visiting: new Set() });
    expect(t[0].children).toBeDefined();
    expect(t[0].children!.length).toBe(1);
    expect(t[0].children![0].element.name).toBe('c1');
  });

  it('returns empty children when container path is unresolvable', () => {
    const gfx: any = { elements: [
      { name: 'box', body: { kind: 'container', gfx_path: 'gfx/missing.gfx' } },
    ] };
    const t = buildTree(gfx, { resolve: () => null, visiting: new Set() });
    expect(t[0].children).toEqual([]);
  });

  it('breaks cycles', () => {
    const gfx: any = { elements: [
      { name: 'box', body: { kind: 'container', gfx_path: 'gfx/x.gfx' } },
    ] };
    // resolve always returns gfx itself -> cycle
    const t = buildTree(gfx, { resolve: () => gfx, visiting: new Set() });
    expect(t[0].children).toEqual([]); // cycle detected, children empty
  });

  it('assigns stable index paths matching nesting', () => {
    const child: any = { elements: [
      { name: 'c0', body: { kind: 'particle' } },
      { name: 'c1', body: { kind: 'particle' } },
    ] };
    const gfx: any = { elements: [
      { name: 'a', body: { kind: 'particle' } },
      { name: 'box', body: { kind: 'container', gfx_path: 'gfx/x.gfx' } },
    ] };
    const t = buildTree(gfx, { resolve: () => child, visiting: new Set() });
    expect(t[0].path).toEqual([0]);
    expect(t[1].path).toEqual([1]);
    expect(t[1].children![0].path).toEqual([1, 0]);
    expect(t[1].children![1].path).toEqual([1, 1]);
  });
});
