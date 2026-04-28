import { describe, expect, it } from 'vitest';
import { EXTRACTOR_LOADERS } from '../extractors';

describe('EXTRACTOR_LOADERS', () => {
  it('exists and is iterable (may be empty until extractors land)', () => {
    expect(Array.isArray(EXTRACTOR_LOADERS)).toBe(true);
  });
});
