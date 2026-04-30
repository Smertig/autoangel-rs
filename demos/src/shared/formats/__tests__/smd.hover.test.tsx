// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { HoverContext } from '../types';
import { EMPTY_PACKAGE_VIEW } from '@shared/package';

vi.mock('@shared/components/model-viewer/internal/render-smd-hover', () => ({
  renderSmdHoverPreview: vi.fn(),
}));

import { renderSmdHoverPreview } from '@shared/components/model-viewer/internal/render-smd-hover';
import { smdFormat } from '../smd';

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(renderSmdHoverPreview).mockReset();
});

const fakeWasm = {} as HoverContext['wasm'];
const fakeData = new Uint8Array(8);
const fakePkg = EMPTY_PACKAGE_VIEW;

describe('smdFormat.HoverPreview', () => {
  it('is registered', () => {
    expect(smdFormat.HoverPreview).toBeDefined();
  });

  it('renders a <canvas> and invokes the render helper', async () => {
    const dispose = vi.fn();
    vi.mocked(renderSmdHoverPreview).mockResolvedValue(dispose);

    const HP = smdFormat.HoverPreview!;
    const { container } = render(
      <HP path="a.smd" ext=".smd" data={fakeData} pkg={fakePkg} wasm={fakeWasm} />,
    );

    expect(container.querySelector('canvas')).not.toBeNull();
    await waitFor(() => {
      expect(renderSmdHoverPreview).toHaveBeenCalledOnce();
    });
  });

  it('disposes the renderer on unmount', async () => {
    const dispose = vi.fn();
    vi.mocked(renderSmdHoverPreview).mockResolvedValue(dispose);

    const HP = smdFormat.HoverPreview!;
    const { unmount } = render(
      <HP path="a.smd" ext=".smd" data={fakeData} pkg={fakePkg} wasm={fakeWasm} />,
    );
    await waitFor(() => expect(renderSmdHoverPreview).toHaveBeenCalledOnce());

    unmount();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('shows an error message when the render helper rejects', async () => {
    vi.mocked(renderSmdHoverPreview).mockRejectedValue(new Error('no skeleton'));

    const HP = smdFormat.HoverPreview!;
    const { container, findByText } = render(
      <HP path="a.smd" ext=".smd" data={fakeData} pkg={fakePkg} wasm={fakeWasm} />,
    );

    expect(await findByText(/Failed to render SMD: no skeleton/)).toBeDefined();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('disposes the renderer if it resolves after unmount', async () => {
    const dispose = vi.fn();
    let resolveRender!: (fn: () => void) => void;
    vi.mocked(renderSmdHoverPreview).mockReturnValue(
      new Promise((resolve) => { resolveRender = resolve; }),
    );

    const HP = smdFormat.HoverPreview!;
    const { unmount } = render(
      <HP path="a.smd" ext=".smd" data={fakeData} pkg={fakePkg} wasm={fakeWasm} />,
    );
    unmount();
    resolveRender(dispose);
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
