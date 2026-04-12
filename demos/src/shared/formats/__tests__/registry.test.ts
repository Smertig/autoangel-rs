import { describe, it, expect } from 'vitest';
import { findFormat } from '../registry';

describe('findFormat', () => {
  it('returns fallback for unknown extensions', () => {
    expect(findFormat('.xyz').name).toBe('fallback');
    expect(findFormat('').name).toBe('fallback');
  });
  it('returns text for .txt', () => {
    expect(findFormat('.txt').name).toBe('text');
  });
  it('returns text for .xml', () => {
    expect(findFormat('.xml').name).toBe('text');
  });
  it('returns image for .png', () => {
    expect(findFormat('.png').name).toBe('image');
  });
  it('returns image for .dds', () => {
    expect(findFormat('.dds').name).toBe('image');
  });
  it('returns model for .ecm', () => {
    expect(findFormat('.ecm').name).toBe('model');
  });
  it('returns model for .ski', () => {
    expect(findFormat('.ski').name).toBe('model');
  });
});
