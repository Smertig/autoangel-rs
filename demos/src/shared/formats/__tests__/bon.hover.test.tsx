// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { HoverContext } from '../types';
import { EMPTY_PACKAGE_VIEW } from '@shared/package';

vi.mock('@shared/components/model-viewer/internal/render-bon-hover', () => ({
  renderBonHoverPreview: vi.fn(),
}));

import { renderBonHoverPreview } from '@shared/components/model-viewer/internal/render-bon-hover';
import { bonFormat } from '../bon';

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(renderBonHoverPreview).mockReset();
});

const fakeWasm = {} as HoverContext['wasm'];
const fakeData = new Uint8Array(8);
const fakePkg = EMPTY_PACKAGE_VIEW;

describe('bonFormat.HoverPreview', () => {
  it('is registered', () => {
    expect(bonFormat.HoverPreview).toBeDefined();
  });

  it('renders a <canvas> and invokes the render helper', async () => {
    const dispose = vi.fn();
    vi.mocked(renderBonHoverPreview).mockResolvedValue(dispose);

    const HP = bonFormat.HoverPreview!;
    const { container } = render(
      <HP path="a.bon" ext=".bon" data={fakeData} pkg={fakePkg} wasm={fakeWasm} />,
    );

    expect(container.querySelector('canvas')).not.toBeNull();
    await waitFor(() => {
      expect(renderBonHoverPreview).toHaveBeenCalledOnce();
    });
  });

  it('disposes the renderer on unmount', async () => {
    const dispose = vi.fn();
    vi.mocked(renderBonHoverPreview).mockResolvedValue(dispose);

    const HP = bonFormat.HoverPreview!;
    const { unmount } = render(
      <HP path="a.bon" ext=".bon" data={fakeData} pkg={fakePkg} wasm={fakeWasm} />,
    );
    await waitFor(() => expect(renderBonHoverPreview).toHaveBeenCalledOnce());

    unmount();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('shows an error message when the render helper rejects', async () => {
    vi.mocked(renderBonHoverPreview).mockRejectedValue(new Error('parse failed'));

    const HP = bonFormat.HoverPreview!;
    const { container, findByText } = render(
      <HP path="a.bon" ext=".bon" data={fakeData} pkg={fakePkg} wasm={fakeWasm} />,
    );

    expect(await findByText(/Failed to render BON: parse failed/)).toBeDefined();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('disposes the renderer if it resolves after unmount', async () => {
    const dispose = vi.fn();
    let resolveRender!: (fn: () => void) => void;
    vi.mocked(renderBonHoverPreview).mockReturnValue(
      new Promise((resolve) => { resolveRender = resolve; }),
    );

    const HP = bonFormat.HoverPreview!;
    const { unmount } = render(
      <HP path="a.bon" ext=".bon" data={fakeData} pkg={fakePkg} wasm={fakeWasm} />,
    );
    unmount();
    resolveRender(dispose);
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
