// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { HoverContext } from '../types';

vi.mock('@shared/components/model-viewer/internal/render-ecm-hover', () => ({
  renderEcmHoverPreview: vi.fn(),
}));

import { renderEcmHoverPreview } from '@shared/components/model-viewer/internal/render-ecm-hover';
import { ecmFormat } from '../ecm';

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(renderEcmHoverPreview).mockReset();
});

const fakeWasm = {} as HoverContext['wasm'];
const fakeData = new Uint8Array(8);
const fakeGetData = async () => new Uint8Array();

describe('ecmFormat.HoverPreview', () => {
  it('is registered', () => {
    expect(ecmFormat.HoverPreview).toBeDefined();
  });

  it('renders a <canvas> and invokes the render helper', async () => {
    const dispose = vi.fn();
    vi.mocked(renderEcmHoverPreview).mockResolvedValue(dispose);

    const HP = ecmFormat.HoverPreview!;
    const { container } = render(
      <HP path="char.ecm" ext=".ecm" data={fakeData} getData={fakeGetData} wasm={fakeWasm} />,
    );

    expect(container.querySelector('canvas')).not.toBeNull();
    await waitFor(() => {
      expect(renderEcmHoverPreview).toHaveBeenCalledOnce();
    });
  });

  it('disposes the renderer on unmount', async () => {
    const dispose = vi.fn();
    vi.mocked(renderEcmHoverPreview).mockResolvedValue(dispose);

    const HP = ecmFormat.HoverPreview!;
    const { unmount } = render(
      <HP path="char.ecm" ext=".ecm" data={fakeData} getData={fakeGetData} wasm={fakeWasm} />,
    );
    await waitFor(() => expect(renderEcmHoverPreview).toHaveBeenCalledOnce());

    unmount();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('shows an error message when the render helper rejects', async () => {
    vi.mocked(renderEcmHoverPreview).mockRejectedValue(new Error('parse fail'));

    const HP = ecmFormat.HoverPreview!;
    const { container, findByText } = render(
      <HP path="char.ecm" ext=".ecm" data={fakeData} getData={fakeGetData} wasm={fakeWasm} />,
    );

    expect(await findByText(/Failed to render ECM: parse fail/)).toBeDefined();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('disposes the renderer if it resolves after unmount', async () => {
    const dispose = vi.fn();
    let resolveRender!: (fn: () => void) => void;
    vi.mocked(renderEcmHoverPreview).mockReturnValue(
      new Promise((resolve) => { resolveRender = resolve; }),
    );

    const HP = ecmFormat.HoverPreview!;
    const { unmount } = render(
      <HP path="char.ecm" ext=".ecm" data={fakeData} getData={fakeGetData} wasm={fakeWasm} />,
    );
    unmount();
    resolveRender(dispose);
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
