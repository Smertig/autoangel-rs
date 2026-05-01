import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { EMPTY_PACKAGE_VIEW } from '@shared/package';
import type { FormatDescriptor, HoverContext } from '../types';

interface HoverPreviewSmokeOptions {
  format: FormatDescriptor;
  /** The mocked render helper — must be a `vi.fn()` set up via `vi.mock()` at
   *  module scope (vi.mock paths are static, so the caller, not the factory,
   *  has to declare the mock). */
  renderHelper: Mock;
}

/**
 * Five-test smoke suite shared by every `*Format.HoverPreview` consumer of
 * `<HoverCanvasPreview>`: registration, canvas mount, dispose-on-unmount,
 * error UI, and the dispose-after-unmount race. Convention-bound — the error
 * label and sample filename are derived from `format.name`, which matches the
 * `<HoverCanvasPreview label=…>` prop set in every format file today.
 */
export function makeHoverPreviewSmokeTests({ format, renderHelper }: HoverPreviewSmokeOptions): void {
  const ext = `.${format.name}`;
  const path = `a${ext}`;
  const label = format.name.toUpperCase();
  const fakeWasm = {} as HoverContext['wasm'];
  const fakeData = new Uint8Array(8);

  describe(`${format.name}Format.HoverPreview`, () => {
    afterEach(cleanup);
    beforeEach(() => { renderHelper.mockReset(); });

    const mount = () => {
      const HP = format.HoverPreview!;
      return render(
        <HP path={path} ext={ext} data={fakeData} pkg={EMPTY_PACKAGE_VIEW} wasm={fakeWasm} />,
      );
    };

    it('is registered', () => {
      expect(format.HoverPreview).toBeDefined();
    });

    it('renders a <canvas> and invokes the render helper', async () => {
      renderHelper.mockResolvedValue(vi.fn());
      const { container } = mount();
      expect(container.querySelector('canvas')).not.toBeNull();
      await waitFor(() => expect(renderHelper).toHaveBeenCalledOnce());
    });

    it('disposes the renderer on unmount', async () => {
      const dispose = vi.fn();
      renderHelper.mockResolvedValue(dispose);
      const { unmount } = mount();
      await waitFor(() => expect(renderHelper).toHaveBeenCalledOnce());
      unmount();
      expect(dispose).toHaveBeenCalledOnce();
    });

    it('shows an error message when the render helper rejects', async () => {
      renderHelper.mockRejectedValue(new Error('parse fail'));
      const { container, findByText } = mount();
      expect(await findByText(new RegExp(`Failed to render ${label}: parse fail`))).toBeDefined();
      expect(container.querySelector('canvas')).toBeNull();
    });

    it('disposes the renderer if it resolves after unmount', async () => {
      const dispose = vi.fn();
      let resolveRender!: (fn: () => void) => void;
      renderHelper.mockReturnValue(new Promise((resolve) => { resolveRender = resolve; }));
      const { unmount } = mount();
      unmount();
      resolveRender(dispose);
      await Promise.resolve();
      expect(dispose).toHaveBeenCalledOnce();
    });
  });
}
