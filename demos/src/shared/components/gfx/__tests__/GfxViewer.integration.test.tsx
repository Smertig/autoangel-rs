// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';

class OrbitControls {
  target = { set() {} };
  enableDamping = false; dampingFactor = 0;
  addEventListener() {} removeEventListener() {}
  update() {} dispose() {}
}

vi.mock('../../model-viewer/internal/three', () => {
  class Scene { children: any[] = []; add(c: any) { this.children.push(c); } remove(_c: any) {} }
  class Object3D { visible = true; children: any[] = []; add(c: any) { this.children.push(c); } removeFromParent() {} }
  class PerspectiveCamera { position = { set() {} }; aspect = 1; updateProjectionMatrix() {} lookAt() {} }
  class Color { constructor(_x?: any) {} }
  return {
    ensureThree: async () => {},
    getThree: () => ({ THREE: { Scene, Object3D, PerspectiveCamera, Color }, OrbitControls }),
  };
});

vi.mock('../../model-viewer/internal/viewer', () => ({
  getViewer: (host: HTMLElement) => {
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    return {
      renderer: { domElement: canvas, dispose() {} },
      scene: null, camera: null, controls: null, lastDt: 0,
      onFrameUpdate: null, isAuxAnimating: null,
      requestRender() {}, setControls() {},
      dispose() { canvas.parentNode?.removeChild(canvas); },
    };
  },
}));

vi.mock('../../gfx-runtime/registry', () => ({
  RENDERABLE_KINDS: new Set(['particle', 'container', 'decal']),
  isRenderableKind: (k: string) => ['particle', 'container', 'decal'].includes(k),
  spawnElementRuntime: () => ({
    root: { visible: true, children: [], add() {}, removeFromParent() {} },
    tick() {}, dispose() {},
  }),
  computeGfxDurationSec: () => 4,
  computeElementDurationSec: () => 4,
  elementSkipReason: () => null,
}));

import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { GfxViewer } from '../GfxViewer';
import { EMPTY_PACKAGE_VIEW } from '@shared/package';

afterEach(cleanup);

describe('GfxViewer integration', () => {
  it('mounts header, sidebar, scene, and transport for a parsed GFX', async () => {
    const fakeWasm = {
      parseGfx: () => ({
        version: 103, default_scale: 1, play_speed: 1, default_alpha: 1,
        elements: [
          { name: 'p1', body: { kind: 'particle' }, tex_file: '', tex_row: 1, tex_col: 1 },
          { name: 'l1', body: { kind: 'light' }, tex_file: '', tex_row: 1, tex_col: 1 },
        ],
      }),
    } as any;
    const ctx: any = {
      path: 'a.gfx', ext: '.gfx',
      pkg: EMPTY_PACKAGE_VIEW,
      wasm: fakeWasm,
    };
    render(<GfxViewer data={new Uint8Array()} context={ctx} />);
    expect(screen.getByText(/GFX v103/)).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('p1')).toBeTruthy();
      expect(screen.getByText('l1')).toBeTruthy();
      expect(screen.getByTestId('gfx-scene')).toBeTruthy();
    });
  });

  it('shows parse-error banner when wasm.parseGfx throws', () => {
    const fakeWasm = { parseGfx: () => { throw new Error('bad bytes'); } } as any;
    const ctx: any = {
      path: 'a.gfx', ext: '.gfx',
      pkg: EMPTY_PACKAGE_VIEW,
      wasm: fakeWasm,
    };
    render(<GfxViewer data={new Uint8Array()} context={ctx} />);
    expect(screen.getByText(/Parse error: bad bytes/)).toBeTruthy();
  });
});
