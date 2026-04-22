import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createNoopRuntime } from '../noop';

describe('createNoopRuntime', () => {
  it('exposes an empty Group as root', () => {
    const r = createNoopRuntime(THREE);
    expect(r.root).toBeInstanceOf(THREE.Group);
    expect(r.root.children.length).toBe(0);
  });

  it('tick is a no-op', () => {
    const r = createNoopRuntime(THREE);
    expect(() => r.tick(1/60)).not.toThrow();
  });

  it('dispose is a no-op', () => {
    const r = createNoopRuntime(THREE);
    expect(() => r.dispose()).not.toThrow();
  });
});
