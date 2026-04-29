// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';

// Stub three.js — only methods/types GfxScene actually calls.
vi.mock('three', () => {
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
    position = { set: vi.fn() };
    aspect = 1;
    updateProjectionMatrix() {}
  }
  class WebGLRenderer {
    domElement: HTMLElement;
    constructor() { this.domElement = document.createElement('canvas'); }
    setSize() {} render() {} dispose() {} setPixelRatio() {}
  }
  class Color { constructor(_x?: any) {} }
  return { Scene, Object3D, PerspectiveCamera, WebGLRenderer, Color };
});

import { render, cleanup } from '@testing-library/react';
import { GfxScene } from '../GfxScene';

afterEach(cleanup);

describe('GfxScene scaffold', () => {
  it('mounts a canvas inside the host div', () => {
    const { container } = render(
      <GfxScene parsed={{ elements: [] }} runtimeKey={0}
        playing speed={1} enabled={new Set()} solo={null}
        spawn={() => null} onLoop={() => {}} />,
    );
    expect(container.querySelector('canvas')).toBeTruthy();
    expect(container.querySelector('[data-testid=gfx-scene]')).toBeTruthy();
  });

  it('does not throw when unmounted', () => {
    const { unmount } = render(
      <GfxScene parsed={{ elements: [] }} runtimeKey={0}
        playing speed={1} enabled={new Set()} solo={null}
        spawn={() => null} onLoop={() => {}} />,
    );
    expect(() => unmount()).not.toThrow();
  });

  it('spawns a runtime for each element returned by spawn(); adds root to scene', () => {
    const spawn = vi.fn((_key: string, _el: any) => ({
      root: { visible: true, children: [] as any[], add() {}, removeFromParent() {} },
      tick: () => {}, dispose: () => {},
    }));
    render(<GfxScene parsed={{ elements: [{ name: 'a' }, { name: 'b' }] }} runtimeKey={0}
      playing speed={1} enabled={new Set(['0', '1'])} solo={null}
      spawn={spawn} onLoop={() => {}} />);
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn.mock.calls[0][0]).toBe('0');
    expect(spawn.mock.calls[1][0]).toBe('1');
  });

  it('skips elements where spawn returns null (unsupported kinds)', () => {
    const spawn = vi.fn((_key: string, el: any) => el.kind === 'particle' ? ({
      root: { visible: true, children: [], add() {}, removeFromParent() {} },
      tick: () => {}, dispose: () => {},
    }) : null);
    expect(() => render(<GfxScene parsed={{ elements: [{ kind: 'light' }, { kind: 'particle' }] }}
      runtimeKey={0} playing speed={1} enabled={new Set(['0', '1'])} solo={null}
      spawn={spawn} onLoop={() => {}} />)).not.toThrow();
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it('toggles root.visible when enabled set changes', () => {
    const root = { visible: true, children: [] as any[], add() {}, removeFromParent() {} };
    const { rerender } = render(<GfxScene parsed={{ elements: [{}] }} runtimeKey={0}
      playing speed={1} enabled={new Set(['0'])} solo={null}
      spawn={() => ({ root, tick: () => {}, dispose: () => {} })} onLoop={() => {}} />);
    expect(root.visible).toBe(true);
    rerender(<GfxScene parsed={{ elements: [{}] }} runtimeKey={0}
      playing speed={1} enabled={new Set([])} solo={null}
      spawn={() => ({ root, tick: () => {}, dispose: () => {} })} onLoop={() => {}} />);
    expect(root.visible).toBe(false);
  });

  it('solo prop overrides enabled — only soloed root visible', () => {
    const rootA = { visible: true, children: [] as any[], add() {}, removeFromParent() {} };
    const rootB = { visible: true, children: [] as any[], add() {}, removeFromParent() {} };
    let i = 0;
    const spawn = () => {
      const root = i++ === 0 ? rootA : rootB;
      return { root, tick: () => {}, dispose: () => {} };
    };
    const { rerender } = render(<GfxScene parsed={{ elements: [{}, {}] }} runtimeKey={0}
      playing speed={1} enabled={new Set(['0', '1'])} solo={null}
      spawn={spawn} onLoop={() => {}} />);
    expect(rootA.visible).toBe(true);
    expect(rootB.visible).toBe(true);
    rerender(<GfxScene parsed={{ elements: [{}, {}] }} runtimeKey={0}
      playing speed={1} enabled={new Set(['0', '1'])} solo={'1'}
      spawn={spawn} onLoop={() => {}} />);
    expect(rootA.visible).toBe(false);
    expect(rootB.visible).toBe(true);
  });

  it('disposes all runtimes when runtimeKey bumps', () => {
    const dispose = vi.fn();
    let spawnCount = 0;
    const spawn = () => {
      spawnCount++;
      return {
        root: { visible: true, children: [], add() {}, removeFromParent() {} },
        tick: () => {}, dispose,
      };
    };
    const { rerender } = render(<GfxScene parsed={{ elements: [{}] }} runtimeKey={0}
      playing speed={1} enabled={new Set(['0'])} solo={null}
      spawn={spawn} onLoop={() => {}} />);
    expect(spawnCount).toBe(1);
    rerender(<GfxScene parsed={{ elements: [{}] }} runtimeKey={1}
      playing speed={1} enabled={new Set(['0'])} solo={null}
      spawn={spawn} onLoop={() => {}} />);
    expect(dispose).toHaveBeenCalled();
    expect(spawnCount).toBe(2);
  });

  it('disposes all runtimes on unmount', () => {
    const dispose = vi.fn();
    const { unmount } = render(<GfxScene parsed={{ elements: [{}] }} runtimeKey={0}
      playing speed={1} enabled={new Set(['0'])} solo={null}
      spawn={() => ({
        root: { visible: true, children: [], add() {}, removeFromParent() {} },
        tick: () => {}, dispose,
      })} onLoop={() => {}} />);
    unmount();
    expect(dispose).toHaveBeenCalled();
  });

  it('does not auto-loop when no runtime implements finished()', async () => {
    const onLoop = vi.fn();
    const dispose = vi.fn();
    let spawnCount = 0;
    const spawn = (_k: string, _el: any) => {
      spawnCount++;
      return {
        root: { visible: true, children: [] as any[], add() {}, removeFromParent() {} },
        tick: () => {}, dispose,
        // No finished()
      };
    };
    render(<GfxScene parsed={{ elements: [{}] }} runtimeKey={0}
      playing speed={1} enabled={new Set(['0'])} solo={null}
      spawn={spawn} onLoop={onLoop} />);
    await new Promise(r => setTimeout(r, 64));
    expect(onLoop).not.toHaveBeenCalled();
    expect(spawnCount).toBe(1);
    expect(dispose).not.toHaveBeenCalled();
  });

  it('auto-loops when every runtime reports finished()', async () => {
    const onLoop = vi.fn();
    const dispose = vi.fn();
    let spawnCount = 0;
    let isFinished = false;
    const spawn = (_k: string, _el: any) => {
      spawnCount++;
      return {
        root: { visible: true, children: [] as any[], add() {}, removeFromParent() {} },
        tick: () => {}, dispose,
        finished: () => isFinished,
      };
    };
    render(<GfxScene parsed={{ elements: [{}] }} runtimeKey={0}
      playing speed={1} enabled={new Set(['0'])} solo={null}
      spawn={spawn} onLoop={onLoop} />);
    expect(spawnCount).toBe(1);

    // Flip to finished and let rAF run.
    isFinished = true;
    await new Promise(r => setTimeout(r, 96));
    isFinished = false; // so the respawned runtime doesn't immediately re-fire infinitely

    expect(onLoop).toHaveBeenCalled();
    expect(spawnCount).toBeGreaterThanOrEqual(2);
    expect(dispose).toHaveBeenCalled();
  });

  it('does not auto-loop while paused', async () => {
    const onLoop = vi.fn();
    const spawn = () => ({
      root: { visible: true, children: [] as any[], add() {}, removeFromParent() {} },
      tick: () => {}, dispose: () => {},
      finished: () => true,
    });
    render(<GfxScene parsed={{ elements: [{}] }} runtimeKey={0}
      playing={false} speed={1} enabled={new Set(['0'])} solo={null}
      spawn={spawn} onLoop={onLoop} />);
    await new Promise(r => setTimeout(r, 64));
    expect(onLoop).not.toHaveBeenCalled();
  });

  it('does not tick runtimes when playing=false', async () => {
    const tick = vi.fn();
    render(<GfxScene parsed={{ elements: [{}] }} runtimeKey={0}
      playing={false} speed={1}
      enabled={new Set(['0'])} solo={null}
      spawn={() => ({
        root: { visible: true, children: [] as any[], add() {}, removeFromParent() {} },
        tick, dispose: () => {},
      })} onLoop={() => {}} />);
    await new Promise(r => setTimeout(r, 64));
    expect(tick).not.toHaveBeenCalled();
  });

  it('freezes the rAF loop when document.visibilityState becomes hidden', async () => {
    const tick = vi.fn();
    render(<GfxScene parsed={{ elements: [{}] }} runtimeKey={0}
      playing speed={1}
      enabled={new Set(['0'])} solo={null}
      spawn={() => ({
        root: { visible: true, children: [] as any[], add() {}, removeFromParent() {} },
        tick, dispose: () => {},
      })} onLoop={() => {}} />);
    // Let some ticks happen.
    await new Promise(r => setTimeout(r, 32));
    const ticksWhileVisible = tick.mock.calls.length;
    expect(ticksWhileVisible).toBeGreaterThan(0);

    // Hide the tab.
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));

    await new Promise(r => setTimeout(r, 64));
    const ticksAfterHide = tick.mock.calls.length;
    // Allow at most one stray tick after the visibility change before the loop freezes.
    expect(ticksAfterHide - ticksWhileVisible).toBeLessThanOrEqual(1);

    // Restore visibility for downstream tests.
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
});
