import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCachedFetch, clearHoverCache,
  registerActive, isActive,
} from '../hoverState';

describe('hover-preview cache', () => {
  beforeEach(() => clearHoverCache());

  it('returns the same promise for the same path', () => {
    const fn = async () => new Uint8Array([1, 2, 3]);
    const p1 = getCachedFetch('a/b.dds', fn);
    const p2 = getCachedFetch('a/b.dds', fn);
    expect(p1).toBe(p2);
  });

  it('returns different promises for different paths', () => {
    const fn = async () => new Uint8Array();
    const p1 = getCachedFetch('a.dds', fn);
    const p2 = getCachedFetch('b.dds', fn);
    expect(p1).not.toBe(p2);
  });

  it('clearHoverCache evicts entries', () => {
    const fn = async () => new Uint8Array();
    const p1 = getCachedFetch('a.dds', fn);
    clearHoverCache();
    const p2 = getCachedFetch('a.dds', fn);
    expect(p1).not.toBe(p2);
  });
});

describe('hover-preview singleton', () => {
  it('only one target is active at a time', () => {
    const t1 = Symbol('t1');
    const t2 = Symbol('t2');
    registerActive(t1);
    expect(isActive(t1)).toBe(true);
    registerActive(t2);
    expect(isActive(t1)).toBe(false);
    expect(isActive(t2)).toBe(true);
  });

  it('registerActive(null) clears active', () => {
    const t = Symbol('t');
    registerActive(t);
    registerActive(null);
    expect(isActive(t)).toBe(false);
  });
});
