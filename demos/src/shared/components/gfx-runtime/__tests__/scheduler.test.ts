import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createGfxEventScheduler } from '../scheduler';
import type { AnimEvent } from '../../model-viewer/internal/event-map';

function fakeEvent(overrides: Partial<AnimEvent> = {}): AnimEvent {
  return {
    type: 100, filePath: 'a.gfx', startTime: 500, timeSpan: 1000,
    once: false, hookName: '', hookOffset: [0, 0, 0],
    hookYaw: 0, hookPitch: 0, hookRot: 0,
    bindParent: true, gfxScale: 1, gfxSpeed: 1,
    ...overrides,
  };
}

describe('createGfxEventScheduler', () => {
  it('fires event when time crosses startTime', () => {
    const spawn = vi.fn(() => ({ root: new THREE.Group(), tick() {}, dispose() {} }));
    const s = createGfxEventScheduler({
      events: [fakeEvent({ startTime: 100 })],
      spawn,
      bones: [], sceneRoot: new THREE.Group(),
    });
    s.tickToClipTime(0.05);  // 50 ms — not yet
    expect(spawn).not.toHaveBeenCalled();
    s.tickToClipTime(0.15);  // 150 ms — crosses 100
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('does not refire same once event on loop', () => {
    const spawn = vi.fn(() => ({ root: new THREE.Group(), tick() {}, dispose() {} }));
    const s = createGfxEventScheduler({
      events: [fakeEvent({ startTime: 100, once: true })],
      spawn,
      bones: [], sceneRoot: new THREE.Group(),
    });
    s.tickToClipTime(0.2);
    s.onLoop();
    s.tickToClipTime(0.2);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('refires non-once event after onLoop', () => {
    const spawn = vi.fn(() => ({ root: new THREE.Group(), tick() {}, dispose() {} }));
    const s = createGfxEventScheduler({
      events: [fakeEvent({ startTime: 100, once: false })],
      spawn,
      bones: [], sceneRoot: new THREE.Group(),
    });
    s.tickToClipTime(0.2);
    s.onLoop();
    s.tickToClipTime(0.2);
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it('disposeAll tears down every spawned runtime', () => {
    const dispose = vi.fn();
    const spawn = () => ({ root: new THREE.Group(), tick() {}, dispose, finished: () => false });
    const s = createGfxEventScheduler({
      events: [fakeEvent({ startTime: 50 })],
      spawn,
      bones: [], sceneRoot: new THREE.Group(),
    });
    s.tickToClipTime(0.1);
    s.disposeAll();
    expect(dispose).toHaveBeenCalled();
  });

  it('attachRuntime registers an externally-spawned runtime for ticking', () => {
    const tick = vi.fn();
    const dispose = vi.fn();
    const spawn = vi.fn(() => ({ root: new THREE.Group(), tick() {}, dispose() {} }));
    const s = createGfxEventScheduler({
      events: [], spawn, bones: [], sceneRoot: new THREE.Group(),
    });
    const extRt = { root: new THREE.Group(), tick, dispose, finished: () => false };
    s.attachRuntime(extRt);
    s.tickRuntimes(0.016);
    expect(tick).toHaveBeenCalledWith(0.016);
    s.disposeAll();
    expect(dispose).toHaveBeenCalled();
  });

  it('_activeCount tracks spawn → finished → disposeAll lifecycle', () => {
    let finishedFlag = false;
    const spawn = () => ({
      root: new THREE.Group(),
      tick() {},
      dispose() {},
      finished: () => finishedFlag,
    });
    const s = createGfxEventScheduler({
      events: [fakeEvent({ startTime: 50 }), fakeEvent({ startTime: 100 })],
      spawn,
      bones: [], sceneRoot: new THREE.Group(),
    });
    expect(s._activeCount()).toBe(0);
    s.tickToClipTime(0.2); // crosses both 50 ms and 100 ms
    expect(s._activeCount()).toBe(2);
    finishedFlag = true;
    s.tickRuntimes(0.016); // runtimes report finished → removed
    expect(s._activeCount()).toBe(0);
    // disposeAll on an empty scheduler is a no-op.
    s.disposeAll();
    expect(s._activeCount()).toBe(0);
  });

  it('re-attached runtime ticks normally after a disposeAll cycle (toggle off → on)', () => {
    // Simulates the "Render GFX" transport-bar toggle: operator unticks the
    // checkbox (disposeAll), then reticks (rebuild a fresh scheduler and
    // resume ticking). A runtime attached to the *second* scheduler must be
    // ticked and not have stale state from the first one.
    const firstTick = vi.fn();
    const firstDispose = vi.fn();
    const s1 = createGfxEventScheduler({
      events: [], spawn: () => ({ root: new THREE.Group(), tick() {}, dispose() {} }),
      bones: [], sceneRoot: new THREE.Group(),
    });
    s1.attachRuntime({
      root: new THREE.Group(), tick: firstTick, dispose: firstDispose,
      finished: () => false,
    });
    s1.tickRuntimes(0.016);
    expect(firstTick).toHaveBeenCalledTimes(1);
    s1.disposeAll();
    expect(firstDispose).toHaveBeenCalledTimes(1);
    // After disposeAll, further ticks must not re-invoke the old runtime.
    s1.tickRuntimes(0.016);
    expect(firstTick).toHaveBeenCalledTimes(1);

    // Toggle back on — caller builds a fresh scheduler.
    const secondTick = vi.fn();
    const secondDispose = vi.fn();
    const s2 = createGfxEventScheduler({
      events: [], spawn: () => ({ root: new THREE.Group(), tick() {}, dispose() {} }),
      bones: [], sceneRoot: new THREE.Group(),
    });
    s2.attachRuntime({
      root: new THREE.Group(), tick: secondTick, dispose: secondDispose,
      finished: () => false,
    });
    s2.tickRuntimes(0.016);
    expect(secondTick).toHaveBeenCalledWith(0.016);
    expect(secondTick).toHaveBeenCalledTimes(1);
    // Ensure schedulers are fully independent — s2 tick didn't touch s1's runtime.
    expect(firstTick).toHaveBeenCalledTimes(1);
  });

  it('tickRuntimes ticks active runtimes and removes finished ones', () => {
    const tick = vi.fn();
    const dispose = vi.fn();
    let finishedFlag = false;
    const spawn = () => ({
      root: new THREE.Group(),
      tick,
      dispose,
      finished: () => finishedFlag,
    });
    const s = createGfxEventScheduler({
      events: [fakeEvent({ startTime: 50 })],
      spawn,
      bones: [], sceneRoot: new THREE.Group(),
    });
    s.tickToClipTime(0.1);
    s.tickRuntimes(0.016);
    expect(tick).toHaveBeenCalledWith(0.016);
    expect(dispose).not.toHaveBeenCalled();
    finishedFlag = true;
    s.tickRuntimes(0.016);
    expect(dispose).toHaveBeenCalled();
    // A second tickRuntimes after disposal must not re-tick the removed runtime.
    s.tickRuntimes(0.016);
    expect(tick).toHaveBeenCalledTimes(2);
  });
});
