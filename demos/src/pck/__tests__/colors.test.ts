import { describe, it, expect } from 'vitest';
import { PACKAGE_COLORS, ColorAllocator } from '../colors';

// ---------------------------------------------------------------------------
// PACKAGE_COLORS constant
// ---------------------------------------------------------------------------

describe('PACKAGE_COLORS', () => {
  it('has exactly 6 entries', () => {
    expect(PACKAGE_COLORS).toHaveLength(6);
  });

  it('starts with steel blue', () => {
    expect(PACKAGE_COLORS[0]).toBe('#4f9cd9');
  });

  it('matches the curated palette in order', () => {
    expect(PACKAGE_COLORS).toEqual([
      '#4f9cd9',
      '#c9844e',
      '#6fa86f',
      '#b86f9c',
      '#9a8ec4',
      '#d9b84f',
    ]);
  });
});

// ---------------------------------------------------------------------------
// ColorAllocator.allocate
// ---------------------------------------------------------------------------

describe('ColorAllocator.allocate', () => {
  it('fresh allocator returns index 0 and the first color', () => {
    const alloc = new ColorAllocator();
    expect(alloc.allocate()).toEqual({ index: 0, color: '#4f9cd9' });
  });

  it('sequential allocation returns 0..5 in order with matching colors', () => {
    const alloc = new ColorAllocator();
    for (let i = 0; i < PACKAGE_COLORS.length; i++) {
      expect(alloc.allocate()).toEqual({ index: i, color: PACKAGE_COLORS[i] });
    }
  });

  it('after release(2), next allocate returns index 2', () => {
    const alloc = new ColorAllocator();
    for (let i = 0; i < PACKAGE_COLORS.length; i++) alloc.allocate();
    alloc.release(2);
    expect(alloc.allocate()).toEqual({ index: 2, color: PACKAGE_COLORS[2] });
  });

  it('after random-order release, next allocate returns the lowest free index', () => {
    const alloc = new ColorAllocator();
    for (let i = 0; i < PACKAGE_COLORS.length; i++) alloc.allocate();
    // Release 4, then 1, then 3 — lowest free is 1.
    alloc.release(4);
    alloc.release(1);
    alloc.release(3);
    expect(alloc.allocate()).toEqual({ index: 1, color: PACKAGE_COLORS[1] });
    // Next lowest free is 3.
    expect(alloc.allocate()).toEqual({ index: 3, color: PACKAGE_COLORS[3] });
    // Next lowest free is 4.
    expect(alloc.allocate()).toEqual({ index: 4, color: PACKAGE_COLORS[4] });
  });

  it('cycles back to index 0 when all 6 are taken (7th allocate)', () => {
    const alloc = new ColorAllocator();
    for (let i = 0; i < PACKAGE_COLORS.length; i++) alloc.allocate();
    // All 6 taken — 7th cycles back to 0.
    expect(alloc.allocate()).toEqual({ index: 0, color: '#4f9cd9' });
  });

  it('after cycling, releasing any index still works normally', () => {
    const alloc = new ColorAllocator();
    for (let i = 0; i < PACKAGE_COLORS.length; i++) alloc.allocate();
    alloc.allocate(); // cycle → 0
    // Release index 2; next allocate should pick 2 (lowest free).
    alloc.release(2);
    expect(alloc.allocate()).toEqual({ index: 2, color: PACKAGE_COLORS[2] });
  });

  it('after release-all and re-allocate, starts from index 0', () => {
    const alloc = new ColorAllocator();
    for (let i = 0; i < PACKAGE_COLORS.length; i++) alloc.allocate();
    for (let i = 0; i < PACKAGE_COLORS.length; i++) alloc.release(i);
    expect(alloc.allocate()).toEqual({ index: 0, color: '#4f9cd9' });
  });

  it('re-adding after release returns the same slot (lowest-free implies same index)', () => {
    const alloc = new ColorAllocator();
    const a = alloc.allocate(); // 0
    const b = alloc.allocate(); // 1
    const c = alloc.allocate(); // 2
    alloc.release(b.index);
    // 1 is free, 0 and 2 are taken — lowest free is 1.
    expect(alloc.allocate()).toEqual({ index: b.index, color: b.color });
    // unused vars to silence lint
    void a;
    void c;
  });
});

// ---------------------------------------------------------------------------
// ColorAllocator.release
// ---------------------------------------------------------------------------

describe('ColorAllocator.release', () => {
  it('release on an unknown/never-allocated index is a silent no-op', () => {
    const alloc = new ColorAllocator();
    expect(() => alloc.release(3)).not.toThrow();
    // State unchanged — first allocate still returns 0.
    expect(alloc.allocate()).toEqual({ index: 0, color: '#4f9cd9' });
  });

  it('release on an already-released index is a silent no-op', () => {
    const alloc = new ColorAllocator();
    alloc.allocate(); // 0
    alloc.allocate(); // 1
    alloc.release(0);
    expect(() => alloc.release(0)).not.toThrow();
    // After double-release of 0, next allocate picks 0 (lowest free).
    expect(alloc.allocate()).toEqual({ index: 0, color: '#4f9cd9' });
  });

  it('release of an out-of-range index is a silent no-op', () => {
    const alloc = new ColorAllocator();
    expect(() => alloc.release(-1)).not.toThrow();
    expect(() => alloc.release(99)).not.toThrow();
    expect(alloc.allocate()).toEqual({ index: 0, color: '#4f9cd9' });
  });
});
