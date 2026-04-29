// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

// Captured by the mocked getViewer so tests can drive frames synchronously.
let fakeViewer: any = null;
let onFrameUpdate: (() => void) | null = null;
let isAuxAnimating: (() => boolean) | null = null;

class OrbitControls {
  target = { set() {} };
  enableDamping = false; dampingFactor = 0;
  addEventListener() {} removeEventListener() {}
  update() {} dispose() {}
}

vi.mock('../../model-viewer/internal/three', () => {
  class Scene {
    children: any[] = [];
    add(c: any) { this.children.push(c); }
    remove(c: any) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); }
  }
  class Object3D {
    visible = true; children: any[] = [];
    add(c: any) { this.children.push(c); }
    removeFromParent() {}
  }
  class PerspectiveCamera {
    position = { set() {} }; aspect = 1;
    updateProjectionMatrix() {} lookAt() {}
  }
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
    fakeViewer = {
      renderer: { domElement: canvas, dispose() {} },
      scene: null, camera: null, controls: null,
      lastDt: 0.016,
      get onFrameUpdate() { return onFrameUpdate; },
      set onFrameUpdate(fn: any) { onFrameUpdate = fn; },
      get isAuxAnimating() { return isAuxAnimating; },
      set isAuxAnimating(fn: any) { isAuxAnimating = fn; },
      requestRender: vi.fn(),
      setControls: vi.fn(),
      dispose: vi.fn(() => {
        canvas.parentNode?.removeChild(canvas);
        onFrameUpdate = null;
        isAuxAnimating = null;
      }),
    };
    return fakeViewer;
  },
}));

vi.mock('../../gfx-runtime/registry', () => ({
  spawnElementRuntime: vi.fn(),
  allActiveFinished: (runtimes: Iterable<{ finished?: () => boolean }>) => {
    let any = false;
    for (const rt of runtimes) {
      if (rt.finished) { any = true; if (!rt.finished()) return false; }
    }
    return any;
  },
}));

import { spawnElementRuntime } from '../../gfx-runtime/registry';
import { render, cleanup } from '@testing-library/react';
import { GfxScene } from '../GfxScene';

const makeRuntime = (overrides: any = {}) => ({
  root: { visible: true, children: [], add() {}, removeFromParent() {} },
  tick: vi.fn(),
  dispose: vi.fn(),
  ...overrides,
});

const baseProps: any = {
  parsed: { elements: [], default_scale: 1, play_speed: 1 },
  runtimeKey: 0,
  playing: true,
  speed: 1,
  enabled: new Set<string>(),
  solo: null,
  preloadedGfx: new Map(),
  preloadedTextures: new Map(),
  findFile: () => null,
  shouldSpawn: () => true,
  onLoop: () => {},
};

beforeEach(() => { (spawnElementRuntime as any).mockReset(); });
afterEach(() => { cleanup(); fakeViewer = null; onFrameUpdate = null; isAuxAnimating = null; });

const propsFor = (over: Partial<typeof baseProps>) => ({ ...baseProps, ...over });

describe('GfxScene', () => {
  it('mounts a canvas via getViewer', () => {
    const { container } = render(<GfxScene {...baseProps} />);
    expect(container.querySelector('canvas')).toBeTruthy();
    expect(container.querySelector('[data-testid=gfx-scene]')).toBeTruthy();
  });

  it('disposes the viewer on unmount', () => {
    const { unmount } = render(<GfxScene {...baseProps} />);
    const dispose = fakeViewer.dispose;
    unmount();
    expect(dispose).toHaveBeenCalled();
  });

  it('spawns a runtime for each element where shouldSpawn returns true', () => {
    (spawnElementRuntime as any).mockImplementation(() => makeRuntime());
    render(<GfxScene {...propsFor({
      parsed: { elements: [{ name: 'a' }, { name: 'b' }], default_scale: 1, play_speed: 1 },
      enabled: new Set(['0', '1']),
    })} />);
    expect(spawnElementRuntime).toHaveBeenCalledTimes(2);
  });

  it('skips elements where shouldSpawn returns false', () => {
    (spawnElementRuntime as any).mockImplementation(() => makeRuntime());
    render(<GfxScene {...propsFor({
      parsed: { elements: [{ name: 'a' }, { name: 'b' }], default_scale: 1, play_speed: 1 },
      shouldSpawn: (el: any) => el.name === 'a',
      enabled: new Set(['0', '1']),
    })} />);
    expect(spawnElementRuntime).toHaveBeenCalledTimes(1);
  });

  it('does not throw when spawnElementRuntime returns null', () => {
    (spawnElementRuntime as any).mockReturnValue(null);
    expect(() => render(<GfxScene {...propsFor({
      parsed: { elements: [{ name: 'a' }], default_scale: 1, play_speed: 1 },
      enabled: new Set(['0']),
    })} />)).not.toThrow();
  });

  it('toggles root.visible when enabled set changes', () => {
    const root = { visible: true, children: [] as any[], add() {}, removeFromParent() {} };
    (spawnElementRuntime as any).mockReturnValue(makeRuntime({ root }));
    const { rerender } = render(<GfxScene {...propsFor({
      parsed: { elements: [{ name: 'a' }], default_scale: 1, play_speed: 1 },
      enabled: new Set(['0']),
    })} />);
    expect(root.visible).toBe(true);
    rerender(<GfxScene {...propsFor({
      parsed: { elements: [{ name: 'a' }], default_scale: 1, play_speed: 1 },
      enabled: new Set([]),
    })} />);
    expect(root.visible).toBe(false);
  });

  it('solo prop hides peer-level elements', () => {
    const rootA = { visible: true, children: [] as any[], add() {}, removeFromParent() {} };
    const rootB = { visible: true, children: [] as any[], add() {}, removeFromParent() {} };
    let i = 0;
    (spawnElementRuntime as any).mockImplementation(() =>
      makeRuntime({ root: i++ === 0 ? rootA : rootB }),
    );
    const { rerender } = render(<GfxScene {...propsFor({
      parsed: { elements: [{ name: 'a' }, { name: 'b' }], default_scale: 1, play_speed: 1 },
      enabled: new Set(['0', '1']),
    })} />);
    expect(rootA.visible).toBe(true);
    expect(rootB.visible).toBe(true);
    rerender(<GfxScene {...propsFor({
      parsed: { elements: [{ name: 'a' }, { name: 'b' }], default_scale: 1, play_speed: 1 },
      enabled: new Set(['0', '1']),
      solo: '1',
    })} />);
    expect(rootA.visible).toBe(false);
    expect(rootB.visible).toBe(true);
  });

  it('runtimeKey bump disposes runtimes and respawns', () => {
    const dispose = vi.fn();
    let spawnCount = 0;
    (spawnElementRuntime as any).mockImplementation(() => {
      spawnCount++;
      return makeRuntime({ dispose });
    });
    const { rerender } = render(<GfxScene {...propsFor({
      parsed: { elements: [{ name: 'a' }], default_scale: 1, play_speed: 1 },
      enabled: new Set(['0']),
    })} />);
    expect(spawnCount).toBe(1);
    rerender(<GfxScene {...propsFor({
      parsed: { elements: [{ name: 'a' }], default_scale: 1, play_speed: 1 },
      runtimeKey: 1,
      enabled: new Set(['0']),
    })} />);
    expect(dispose).toHaveBeenCalled();
    expect(spawnCount).toBe(2);
  });

  it('ticks runtimes when onFrameUpdate fires while playing', () => {
    const tick = vi.fn();
    (spawnElementRuntime as any).mockReturnValue(makeRuntime({ tick }));
    render(<GfxScene {...propsFor({
      parsed: { elements: [{ name: 'a' }], default_scale: 1, play_speed: 1 },
      enabled: new Set(['0']),
      speed: 2,
    })} />);
    onFrameUpdate?.();
    expect(tick).toHaveBeenCalledOnce();
    // lastDt = 0.016, speed = 2 → scaled dt = 0.032
    expect(tick.mock.calls[0][0]).toBeCloseTo(0.032, 5);
  });

  it('does not tick when playing is false', () => {
    const tick = vi.fn();
    (spawnElementRuntime as any).mockReturnValue(makeRuntime({ tick }));
    render(<GfxScene {...propsFor({
      parsed: { elements: [{ name: 'a' }], default_scale: 1, play_speed: 1 },
      enabled: new Set(['0']),
      playing: false,
    })} />);
    onFrameUpdate?.();
    expect(tick).not.toHaveBeenCalled();
  });

  it('isAuxAnimating reflects playing state', () => {
    (spawnElementRuntime as any).mockReturnValue(makeRuntime());
    const { rerender } = render(<GfxScene {...propsFor({
      parsed: { elements: [{ name: 'a' }], default_scale: 1, play_speed: 1 },
      enabled: new Set(['0']),
    })} />);
    expect(isAuxAnimating?.()).toBe(true);
    rerender(<GfxScene {...propsFor({
      parsed: { elements: [{ name: 'a' }], default_scale: 1, play_speed: 1 },
      enabled: new Set(['0']),
      playing: false,
    })} />);
    expect(isAuxAnimating?.()).toBe(false);
  });

  it('auto-loops when every runtime reports finished()', () => {
    const onLoop = vi.fn();
    const dispose = vi.fn();
    let spawnCount = 0;
    let finished = true;
    (spawnElementRuntime as any).mockImplementation(() => {
      spawnCount++;
      return makeRuntime({ dispose, finished: () => finished });
    });
    render(<GfxScene {...propsFor({
      parsed: { elements: [{ name: 'a' }], default_scale: 1, play_speed: 1 },
      enabled: new Set(['0']),
      onLoop,
    })} />);
    expect(spawnCount).toBe(1);
    onFrameUpdate?.();
    expect(onLoop).toHaveBeenCalled();
    expect(dispose).toHaveBeenCalled();
    expect(spawnCount).toBeGreaterThanOrEqual(2);
    finished = false; // prevent re-loop in subsequent invocations
  });

  it('does not auto-loop when no runtime implements finished()', () => {
    const onLoop = vi.fn();
    (spawnElementRuntime as any).mockReturnValue(makeRuntime());
    render(<GfxScene {...propsFor({
      parsed: { elements: [{ name: 'a' }], default_scale: 1, play_speed: 1 },
      enabled: new Set(['0']),
      onLoop,
    })} />);
    onFrameUpdate?.();
    expect(onLoop).not.toHaveBeenCalled();
  });
});
