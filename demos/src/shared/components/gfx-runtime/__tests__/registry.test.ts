import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { spawnElementRuntime } from '../registry';
import { minimalParticleBody, minimalSpawnOpts } from './_fixtures';

describe('spawnElementRuntime', () => {
  it('routes particle kind to particle spawner', () => {
    const r = spawnElementRuntime(minimalParticleBody(), minimalSpawnOpts(THREE));
    expect(r.root).toBeDefined();
    // Particle adapter wraps the mesh in a Group; verify it has children
    // (the InstancedMesh) so we know it routed to the real spawner, not noop.
    expect(r.root.children.length).toBeGreaterThan(0);
    r.dispose();
  });

  it('routes unknown kinds to no-op', () => {
    const body = { kind: 'lightning' } as any;
    const r = spawnElementRuntime(body, minimalSpawnOpts(THREE));
    expect(r.root).toBeInstanceOf(THREE.Group);
    expect(r.root.children.length).toBe(0);
    r.dispose();
  });
});
