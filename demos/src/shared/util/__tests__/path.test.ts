import { describe, expect, it } from 'vitest';
import { normalizePath } from '../path';

describe('normalizePath', () => {
  it('lowercases, normalizes separators, and strips leading slashes', () => {
    expect(normalizePath('Models\\Foo.smd')).toBe('models/foo.smd');
    expect(normalizePath('models/foo.smd')).toBe('models/foo.smd');
    expect(normalizePath('/models/foo.smd')).toBe('models/foo.smd');
    expect(normalizePath('\\\\models\\foo.smd')).toBe('models/foo.smd');
  });

  it('is idempotent', () => {
    const inputs = ['Models\\Foo.smd', '/models/foo.smd', '\\\\a\\b\\c.dds'];
    for (const s of inputs) {
      const once = normalizePath(s);
      expect(normalizePath(once)).toBe(once);
    }
  });

  it('preserves the empty string', () => {
    expect(normalizePath('')).toBe('');
  });
});
