// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';

// ModelViewer pulls in three.js which doesn't work in jsdom. Stub it.
vi.mock('@shared/components/model-viewer', () => ({
  SmdViewer: ({ path, initialClipName }: { path: string; initialClipName?: string }) => (
    <div data-testid="model-viewer-stub" data-initial-clip={initialClipName ?? ''}>{path}</div>
  ),
}));

import { render, screen, cleanup } from '@testing-library/react';
import { ModelPreview } from '../previews/ModelPreview';
import { findFileFrom } from '@shared/components/gfx-runtime/__tests__/_fixtures';

afterEach(cleanup);

// Real fixture shape — model_path has engine-casing (".SMD" uppercase)
// while loaded pcks store lowercase (".smd").
const body: any = {
  kind: 'model',
  model_path: '石头\\石头.SMD',
  model_act_name: 'idle',
  loops: 1,
  alpha_cmp: true,
  write_z: false,
  use_3d_cam: undefined,
  facing_dir: true,
  tail_lines: [],
};
const element: any = { type_id: 160, name: 'm1' };

function makeCtx(overrides: Partial<any> = {}): any {
  return {
    path: '', ext: '.gfx',
    getData: async () => new Uint8Array(),
    listFiles: () => [],
    findFile: () => null,
    wasm: {},
    ...overrides,
  };
}

describe('ModelPreview', () => {
  it('renders tinted M thumbnail when collapsed', () => {
    render(<ModelPreview body={body} element={element} context={makeCtx()} expanded={false} />);
    expect(screen.getByText('M')).toBeDefined();
  });

  it('renders typed field rows; hides undefined flags', () => {
    render(<ModelPreview body={body} element={element} context={makeCtx()} expanded={true} />);
    expect(screen.getByText('model_act_name')).toBeDefined();
    expect(screen.getByText('idle')).toBeDefined();
    expect(screen.getByText('loops')).toBeDefined();
    expect(screen.getByText('alpha_cmp')).toBeDefined();
    expect(screen.getByText('write_z')).toBeDefined();
    expect(screen.getByText('facing_dir')).toBeDefined();
    expect(screen.queryByText('use_3d_cam')).toBeNull();
  });

  it('embeds ModelViewer with the resolved engine path + initialClipName from model_act_name', () => {
    const ctx = makeCtx({ findFile: findFileFrom(['gfx\\models\\石头\\石头.smd']) });
    render(<ModelPreview body={body} element={element} context={ctx} expanded={true} />);
    const stub = screen.getByTestId('model-viewer-stub');
    // Passes the ACTUAL pck path (lowercase), not the raw body.model_path.
    expect(stub.textContent).toBe('gfx\\models\\石头\\石头.smd');
    // Fixture has model_act_name='idle' — should flow through to ModelViewer.
    expect(stub.getAttribute('data-initial-clip')).toBe('idle');
  });

  it('omits initialClipName when model_act_name is absent', () => {
    const bodyNoAct = { ...body, model_act_name: undefined };
    const ctx = makeCtx({ findFile: findFileFrom(['gfx\\models\\石头\\石头.smd']) });
    render(<ModelPreview body={bodyNoAct} element={element} context={ctx} expanded={true} />);
    expect(screen.getByTestId('model-viewer-stub').getAttribute('data-initial-clip')).toBe('');
  });

  it('shows missing-package banner when the file is not in any loaded package', () => {
    const ctx = makeCtx();
    const { container } = render(
      <ModelPreview body={body} element={element} context={ctx} expanded={true} />,
    );
    expect(screen.queryByTestId('model-viewer-stub')).toBeNull();
    expect(screen.getByText(/not in any loaded package/i)).toBeDefined();
    expect(container.textContent).toContain('gfx\\Models\\石头\\石头.SMD');
  });
});
