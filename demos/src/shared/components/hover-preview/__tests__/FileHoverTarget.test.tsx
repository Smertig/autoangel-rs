// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FileHoverTarget } from '../FileHoverTarget';
import { createPackageView, type PackageView } from '@shared/package';
import type { AutoangelModule } from '../../../../types/autoangel';

afterEach(cleanup);

const fakeWasm = {} as AutoangelModule;

function pkgWith(read: () => Promise<Uint8Array | null>): PackageView {
  return createPackageView({
    getData: async () => {
      const v = await read();
      if (!v) throw new Error('miss');
      return v;
    },
    resolve: (p) => p,
    list: () => [],
  });
}

describe('FileHoverTarget', () => {
  it('does not show popover before the open delay', () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValue(new Uint8Array());
    render(
      <FileHoverTarget
        path="a.dds"
        pkg={pkgWith(read)}
        wasm={fakeWasm}
      >
        <button>row</button>
      </FileHoverTarget>,
    );
    fireEvent.mouseEnter(screen.getByText('row'));
    act(() => { vi.advanceTimersByTime(100); });
    expect(screen.queryByRole('tooltip')).toBeNull();
    vi.useRealTimers();
  });

  it('shows popover after the open delay', () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValue(new Uint8Array());
    render(
      <FileHoverTarget
        path="a.dds"
        pkg={pkgWith(read)}
        wasm={fakeWasm}
      >
        <button>row</button>
      </FileHoverTarget>,
    );
    fireEvent.mouseEnter(screen.getByText('row'));
    act(() => { vi.advanceTimersByTime(160); });
    expect(screen.getByRole('tooltip')).toBeDefined();
    expect(screen.getByText('a.dds')).toBeDefined();
    vi.useRealTimers();
  });

  it('mouseleave before delay cancels the open', () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValue(new Uint8Array());
    render(
      <FileHoverTarget
        path="a.dds"
        pkg={pkgWith(read)}
        wasm={fakeWasm}
      >
        <button>row</button>
      </FileHoverTarget>,
    );
    fireEvent.mouseEnter(screen.getByText('row'));
    act(() => { vi.advanceTimersByTime(100); });
    fireEvent.mouseLeave(screen.getByText('row'));
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(read).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
