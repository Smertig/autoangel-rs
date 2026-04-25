import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { spawnElementRuntime, elementSkipReason } from '../registry';
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

describe('elementSkipReason', () => {
  function el(kind: string, typeId = 0, tex = 't.dds') {
    return { type_id: typeId, tex_file: tex, body: { kind } as any } as any;
  }

  it('returns null for particle', () => {
    expect(elementSkipReason(el('particle'))).toBeNull();
  });

  it('returns null for container', () => {
    expect(elementSkipReason(el('container'))).toBeNull();
  });

  it('returns "decal (screen-space)" for decal type 101', () => {
    expect(elementSkipReason(el('decal', 101))).toBe('decal (screen-space)');
  });

  it('returns null for decal type 100 and 102', () => {
    expect(elementSkipReason(el('decal', 100))).toBeNull();
    expect(elementSkipReason(el('decal', 102))).toBeNull();
  });

  it('returns the kind for unknown kinds', () => {
    expect(elementSkipReason(el('lightning'))).toBe('lightning');
  });
});
