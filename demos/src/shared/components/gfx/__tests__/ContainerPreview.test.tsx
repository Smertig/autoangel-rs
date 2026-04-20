// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('@shared/components/gfx/GfxViewer', () => ({
  GfxViewer: ({ data, context }: { data: Uint8Array; context: any }) => (
    <div data-testid="nested-gfx-stub" data-child-path={context.path}>
      {`${data.byteLength} bytes`}
    </div>
  ),
}));

import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { ContainerPreview } from '../previews/ContainerPreview';

afterEach(cleanup);

const body: any = {
  kind: 'container',
  gfx_path: '场景\\模型\\水车模型.gfx',
  out_color: true,
  loop_flag: true,
  play_speed: 1.5,
  dummy_use_g_scale: false,
  tail_lines: [],
};
const element: any = { type_id: 200, name: 'waterwheel' };

function makeCtx(overrides: Partial<any> = {}): any {
  return {
    path: 'gfx\\foo.gfx',
    ext: '.gfx',
    getData: async (p: string) => new Uint8Array([1, 2, 3]),
    listFiles: (prefix: string) =>
      prefix === 'gfx\\' ? ['gfx\\场景\\模型\\水车模型.gfx'] : [],
    wasm: {},
    ...overrides,
  };
}

describe('ContainerPreview', () => {
  it('renders a tinted thumbnail when collapsed', () => {
    render(<ContainerPreview body={body} element={element} context={makeCtx()} expanded={false} />);
    // Letter thumb like ModelPreview's "M".
    expect(screen.getByText('C')).toBeDefined();
  });

  it('shows typed fields when expanded: gfx_path, loop_flag, play_speed, dummy_use_g_scale, out_color', () => {
    render(<ContainerPreview body={body} element={element} context={makeCtx()} expanded={true} />);
    expect(screen.getByText('gfx_path')).toBeDefined();
    expect(screen.getByText('loop_flag')).toBeDefined();
    expect(screen.getByText('play_speed')).toBeDefined();
    expect(screen.getByText('out_color')).toBeDefined();
    expect(screen.getByText('dummy_use_g_scale')).toBeDefined();
  });

  it('fetches and mounts nested GfxViewer with the resolved child path', async () => {
    const ctx = makeCtx();
    render(<ContainerPreview body={body} element={element} context={ctx} expanded={true} />);
    const stub = await screen.findByTestId('nested-gfx-stub');
    // Child context's path reflects the ACTUAL resolved pck path, not the raw body.gfx_path.
    expect(stub.getAttribute('data-child-path')).toBe('gfx\\场景\\模型\\水车模型.gfx');
    expect(stub.textContent).toContain('3 bytes');
  });

  it('shows a missing-package banner when listFiles finds nothing', async () => {
    const ctx = makeCtx({ listFiles: () => [] });
    const { container } = render(
      <ContainerPreview body={body} element={element} context={ctx} expanded={true} />,
    );
    expect(screen.queryByTestId('nested-gfx-stub')).toBeNull();
    expect(screen.getByText(/not found in any loaded package/i)).toBeDefined();
    expect(container.textContent).toContain('gfx\\场景\\模型\\水车模型.gfx');
  });

  it('falls back to engine-prefixed path when listFiles is undefined', async () => {
    const ctx = makeCtx({ listFiles: undefined });
    render(<ContainerPreview body={body} element={element} context={ctx} expanded={true} />);
    const stub = await screen.findByTestId('nested-gfx-stub');
    // No resolver to find actual casing; pass the engine-prefix string through.
    expect(stub.getAttribute('data-child-path')).toBe('gfx\\场景\\模型\\水车模型.gfx');
  });
});
