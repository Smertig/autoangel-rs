// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { HoverContext } from '../types';
import { EMPTY_PACKAGE_VIEW } from '@shared/package';

vi.mock('@shared/components/model-viewer/internal/render-bmd-hover', () => ({
  renderBmdHoverPreview: vi.fn(),
}));

import { renderBmdHoverPreview } from '@shared/components/model-viewer/internal/render-bmd-hover';
import { bmdFormat } from '../bmd';

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(renderBmdHoverPreview).mockReset();
});

const fakeWasm = {} as HoverContext['wasm'];
const fakeData = new Uint8Array(8);
const fakePkg = EMPTY_PACKAGE_VIEW;

describe('bmdFormat.HoverPreview', () => {
  it('is registered', () => {
    expect(bmdFormat.HoverPreview).toBeDefined();
  });

  it('renders a <canvas> and invokes the render helper', async () => {
    const dispose = vi.fn();
    vi.mocked(renderBmdHoverPreview).mockResolvedValue(dispose);

    const HP = bmdFormat.HoverPreview!;
    const { container } = render(
      <HP path="b.bmd" ext=".bmd" data={fakeData} pkg={fakePkg} wasm={fakeWasm} />,
    );

    expect(container.querySelector('canvas')).not.toBeNull();
    await waitFor(() => {
      expect(renderBmdHoverPreview).toHaveBeenCalledOnce();
    });
  });

  it('disposes the renderer on unmount', async () => {
    const dispose = vi.fn();
    vi.mocked(renderBmdHoverPreview).mockResolvedValue(dispose);

    const HP = bmdFormat.HoverPreview!;
    const { unmount } = render(
      <HP path="b.bmd" ext=".bmd" data={fakeData} pkg={fakePkg} wasm={fakeWasm} />,
    );
    await waitFor(() => expect(renderBmdHoverPreview).toHaveBeenCalledOnce());

    unmount();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('shows an error message when the render helper rejects', async () => {
    vi.mocked(renderBmdHoverPreview).mockRejectedValue(new Error('parse fail'));

    const HP = bmdFormat.HoverPreview!;
    const { container, findByText } = render(
      <HP path="b.bmd" ext=".bmd" data={fakeData} pkg={fakePkg} wasm={fakeWasm} />,
    );

    expect(await findByText(/Failed to render BMD: parse fail/)).toBeDefined();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('disposes the renderer if it resolves after unmount', async () => {
    const dispose = vi.fn();
    let resolveRender!: (fn: () => void) => void;
    vi.mocked(renderBmdHoverPreview).mockReturnValue(
      new Promise((resolve) => { resolveRender = resolve; }),
    );

    const HP = bmdFormat.HoverPreview!;
    const { unmount } = render(
      <HP path="b.bmd" ext=".bmd" data={fakeData} pkg={fakePkg} wasm={fakeWasm} />,
    );
    unmount();
    resolveRender(dispose);
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
