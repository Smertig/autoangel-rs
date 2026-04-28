import { describe, expect, it } from 'vitest';
import { normalizePathKey } from '../pathKey';

describe('normalizePathKey', () => {
  it('lowercases, normalizes separators, and strips leading slashes', () => {
    expect(normalizePathKey('Models\\Foo.smd')).toBe('models/foo.smd');
    expect(normalizePathKey('models/foo.smd')).toBe('models/foo.smd');
    expect(normalizePathKey('/models/foo.smd')).toBe('models/foo.smd');
    expect(normalizePathKey('\\\\models\\foo.smd')).toBe('models/foo.smd');
  });

  it('is idempotent', () => {
    const inputs = ['Models\\Foo.smd', '/models/foo.smd', '\\\\a\\b\\c.dds'];
    for (const s of inputs) {
      const once = normalizePathKey(s);
      expect(normalizePathKey(once)).toBe(once);
    }
  });

  it('preserves the empty string', () => {
    expect(normalizePathKey('')).toBe('');
  });
});
