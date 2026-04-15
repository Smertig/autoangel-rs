import { describe, it, expect, vi } from 'vitest';
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

describe('downloadActions', () => {
  const mockCtx = (ext: string) => ({
    path: `models\\test${ext}`,
    ext,
    getData: vi.fn(),
    wasm: {} as any,
  });

  it('model format returns download actions for .ecm', () => {
    const format = findFormat('.ecm');
    const actions = format.downloadActions?.(mockCtx('.ecm'));
    expect(actions).toBeDefined();
    expect(actions!.length).toBe(3);
    expect(actions![0].label).toContain('Download file');
    expect(actions![1].label).toContain('ZIP');
    expect(actions![2].label).toContain('PCK');
  });

  it('model format returns undefined for .ski', () => {
    const format = findFormat('.ski');
    const actions = format.downloadActions?.(mockCtx('.ski'));
    expect(actions).toBeUndefined();
  });

  it('model format returns undefined for .stck', () => {
    const format = findFormat('.stck');
    const actions = format.downloadActions?.(mockCtx('.stck'));
    expect(actions).toBeUndefined();
  });

  it('text format has no downloadActions', () => {
    const format = findFormat('.txt');
    expect(format.downloadActions).toBeUndefined();
  });
});
