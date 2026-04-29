// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { HoverContext } from '../types';
import { EMPTY_PACKAGE_VIEW } from '@shared/package';

vi.mock('@shared/components/gfx/render-hover', () => ({
  renderGfxHoverPreview: vi.fn(),
}));

import { renderGfxHoverPreview } from '@shared/components/gfx/render-hover';
import { gfxFormat } from '../gfx';

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(renderGfxHoverPreview).mockReset();
});

const fakeWasm = {} as HoverContext['wasm'];
const fakeData = new Uint8Array(8);
const fakePkg = EMPTY_PACKAGE_VIEW;

describe('gfxFormat.HoverPreview', () => {
  it('is registered', () => {
    expect(gfxFormat.HoverPreview).toBeDefined();
  });

  it('renders a <canvas> and invokes the render helper', async () => {
    const dispose = vi.fn();
    vi.mocked(renderGfxHoverPreview).mockResolvedValue(dispose);

    const HP = gfxFormat.HoverPreview!;
    const { container } = render(
      <HP path="a.gfx" ext=".gfx" data={fakeData} pkg={fakePkg} wasm={fakeWasm} />,
    );

    expect(container.querySelector('canvas')).not.toBeNull();
    await waitFor(() => {
      expect(renderGfxHoverPreview).toHaveBeenCalledOnce();
    });
  });

  it('disposes the renderer on unmount', async () => {
    const dispose = vi.fn();
    vi.mocked(renderGfxHoverPreview).mockResolvedValue(dispose);

    const HP = gfxFormat.HoverPreview!;
    const { unmount } = render(
      <HP path="a.gfx" ext=".gfx" data={fakeData} pkg={fakePkg} wasm={fakeWasm} />,
    );
    await waitFor(() => expect(renderGfxHoverPreview).toHaveBeenCalledOnce());

    unmount();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('shows an error message when the render helper rejects', async () => {
    vi.mocked(renderGfxHoverPreview).mockRejectedValue(new Error('parse fail'));

    const HP = gfxFormat.HoverPreview!;
    const { container, findByText } = render(
      <HP path="a.gfx" ext=".gfx" data={fakeData} pkg={fakePkg} wasm={fakeWasm} />,
    );

    expect(await findByText(/Failed to render GFX: parse fail/)).toBeDefined();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('disposes the renderer if it resolves after unmount', async () => {
    const dispose = vi.fn();
    let resolveRender!: (fn: () => void) => void;
    vi.mocked(renderGfxHoverPreview).mockReturnValue(
      new Promise((resolve) => { resolveRender = resolve; }),
    );

    const HP = gfxFormat.HoverPreview!;
    const { unmount } = render(
      <HP path="a.gfx" ext=".gfx" data={fakeData} pkg={fakePkg} wasm={fakeWasm} />,
    );
    unmount();
    resolveRender(dispose);
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
