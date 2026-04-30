// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { HoverContext } from '../types';
import { EMPTY_PACKAGE_VIEW } from '@shared/package';

vi.mock('@shared/components/model-viewer/internal/render-ski-hover', () => ({
  renderSkiHoverPreview: vi.fn(),
}));

import { renderSkiHoverPreview } from '@shared/components/model-viewer/internal/render-ski-hover';
import { skiFormat } from '../ski';

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(renderSkiHoverPreview).mockReset();
});

const fakeWasm = {} as HoverContext['wasm'];
const fakeData = new Uint8Array(8);
const fakePkg = EMPTY_PACKAGE_VIEW;

describe('skiFormat.HoverPreview', () => {
  it('is registered', () => {
    expect(skiFormat.HoverPreview).toBeDefined();
  });

  it('renders a <canvas> and invokes the render helper', async () => {
    const dispose = vi.fn();
    vi.mocked(renderSkiHoverPreview).mockResolvedValue(dispose);

    const HP = skiFormat.HoverPreview!;
    const { container } = render(
      <HP path="a.ski" ext=".ski" data={fakeData} pkg={fakePkg} wasm={fakeWasm} />,
    );

    expect(container.querySelector('canvas')).not.toBeNull();
    await waitFor(() => {
      expect(renderSkiHoverPreview).toHaveBeenCalledOnce();
    });
  });

  it('disposes the renderer on unmount', async () => {
    const dispose = vi.fn();
    vi.mocked(renderSkiHoverPreview).mockResolvedValue(dispose);

    const HP = skiFormat.HoverPreview!;
    const { unmount } = render(
      <HP path="a.ski" ext=".ski" data={fakeData} pkg={fakePkg} wasm={fakeWasm} />,
    );
    await waitFor(() => expect(renderSkiHoverPreview).toHaveBeenCalledOnce());

    unmount();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('shows an error message when the render helper rejects', async () => {
    vi.mocked(renderSkiHoverPreview).mockRejectedValue(new Error('no meshes'));

    const HP = skiFormat.HoverPreview!;
    const { container, findByText } = render(
      <HP path="a.ski" ext=".ski" data={fakeData} pkg={fakePkg} wasm={fakeWasm} />,
    );

    expect(await findByText(/Failed to render SKI: no meshes/)).toBeDefined();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('disposes the renderer if it resolves after unmount', async () => {
    const dispose = vi.fn();
    let resolveRender!: (fn: () => void) => void;
    vi.mocked(renderSkiHoverPreview).mockReturnValue(
      new Promise((resolve) => { resolveRender = resolve; }),
    );

    const HP = skiFormat.HoverPreview!;
    const { unmount } = render(
      <HP path="a.ski" ext=".ski" data={fakeData} pkg={fakePkg} wasm={fakeWasm} />,
    );
    unmount();
    resolveRender(dispose);
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
