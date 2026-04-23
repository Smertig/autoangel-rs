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
  it('returns ecm for .ecm', () => {
    expect(findFormat('.ecm').name).toBe('ecm');
  });
  it('returns smd for .smd', () => {
    expect(findFormat('.smd').name).toBe('smd');
  });
  it('returns ski for .ski', () => {
    expect(findFormat('.ski').name).toBe('ski');
  });
  it('returns stck for .stck', () => {
    expect(findFormat('.stck').name).toBe('stck');
  });
  it('returns gfx for .gfx', () => {
    expect(findFormat('.gfx').name).toBe('gfx');
  });
});

describe('downloadActions', () => {
  const mockCtx = (ext: string) => ({
    path: `models\\test${ext}`,
    ext,
    getData: vi.fn(),
    wasm: {} as any,
    listFiles: () => [],
    findFile: () => null,
  });

  it('ecm format returns download actions for .ecm', async () => {
    const format = await findFormat('.ecm').load();
    const actions = format.downloadActions?.(mockCtx('.ecm'));
    expect(actions).toBeDefined();
    expect(actions!.length).toBe(3);
    expect(actions![0].label).toContain('Download file');
    expect(actions![1].label).toContain('ZIP');
    expect(actions![2].label).toContain('PCK');
  });

  it('ski format has no downloadActions', async () => {
    const format = await findFormat('.ski').load();
    expect(format.downloadActions).toBeUndefined();
  });

  it('stck format has no downloadActions', async () => {
    const format = await findFormat('.stck').load();
    expect(format.downloadActions).toBeUndefined();
  });

  it('text format has no downloadActions', async () => {
    const format = await findFormat('.txt').load();
    expect(format.downloadActions).toBeUndefined();
  });
});
