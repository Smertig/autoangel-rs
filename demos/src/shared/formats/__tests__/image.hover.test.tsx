// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { imageFormat } from '../image';
import type { HoverContext } from '../types';
import { EMPTY_PACKAGE_VIEW } from '@shared/package';

beforeAll(() => {
  // jsdom doesn't implement these; stub them for the native <img> path.
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = vi.fn(() => 'blob:mock');
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    URL.revokeObjectURL = vi.fn();
  }
});

afterEach(cleanup);

describe('imageFormat.HoverPreview', () => {
  it('is registered', () => {
    expect(imageFormat.HoverPreview).toBeDefined();
  });

  const fakePkg = EMPTY_PACKAGE_VIEW;

  it('renders a native <img> for .png', () => {
    const HP = imageFormat.HoverPreview!;
    const fakeWasm = {} as HoverContext['wasm'];
    const data = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const { container } = render(<HP path="a.png" ext=".png" data={data} pkg={fakePkg} wasm={fakeWasm} />);
    expect(container.querySelector('img')).not.toBeNull();
  });

  it('renders a <canvas> for .dds via wasm.decodeDds', () => {
    const HP = imageFormat.HoverPreview!;
    const decodeDds = vi.fn(() => ({ width: 4, height: 4, intoRgba: () => new Uint8Array(4 * 4 * 4) }));
    const decodeTga = vi.fn();
    const fakeWasm = { decodeDds, decodeTga } as unknown as HoverContext['wasm'];
    const data = new Uint8Array(128);
    const { container } = render(<HP path="a.dds" ext=".dds" data={data} pkg={fakePkg} wasm={fakeWasm} />);
    expect(container.querySelector('canvas')).not.toBeNull();
    expect(decodeDds).toHaveBeenCalled();
  });
});
