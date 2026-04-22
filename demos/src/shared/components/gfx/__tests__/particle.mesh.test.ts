import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import type { SimConfig, SimState, ParticleInstance } from '../previews/particle/simulation';
import { createParticleMesh } from '../previews/particle/mesh';

function minimalCfg(quota: number): SimConfig {
  return {
    quota, emissionRate: 0, ttl: 1,
    angle: 0, speed: 0, parAcc: 0, acc: 0,
    accDir: [0, 1, 0], dragPow: undefined,
    colorMin: 0xffffffff, colorMax: 0xffffffff,
    scaleMin: 1, scaleMax: 1, rotMin: 0, rotMax: 0,
    parIniDir: [0, 0, 1],
    atlasRows: 1, atlasCols: 1, atlasFrames: 1,
    initRandomTexture: false,
    particleWidth: 1, particleHeight: 1,
    shape: { kind: 'point' },
    affectors: [],
    hasMotionAffector: false,
  };
}

function particle(overrides: Partial<ParticleInstance> = {}): ParticleInstance {
  return {
    px: 0, py: 0, pz: 0, dx: 0, dy: 0, dz: 1,
    selfVel: 0, velAlongAcc: 0,
    r: 1, g: 1, b: 1, a: 1,
    scale: 1, rot: 0, age: 0, ttl: 1, atlasFrame: 0,
    baseColor: 0xffffffff,
    baseScale: 1,
    ...overrides,
  };
}

describe('createParticleMesh', () => {
  it('creates an InstancedMesh sized to cfg.quota', () => {
    const m = createParticleMesh(minimalCfg(42), null as any, THREE);
    expect(m.object3D).toBeInstanceOf(THREE.InstancedMesh);
    const mesh = m.object3D as THREE.InstancedMesh;
    // Capacity = underlying InstancedBufferAttribute length. `mesh.count` starts
    // at 0 and is set per-frame by writeState — it is not capacity.
    expect(mesh.instanceMatrix.count).toBe(42);
    expect(mesh.count).toBe(0);
    m.dispose();
  });

  it('writeState pushes alive particle positions to instance matrix', () => {
    const m = createParticleMesh(minimalCfg(4), null as any, THREE);
    const state: SimState = {
      alive: [particle({ px: 1, py: 2, pz: 3 })],
      emissionAcc: 0, time: 0, dirtyIndices: [0], shapeState: null,
    };
    m.writeState(state);
    const mesh = m.object3D as THREE.InstancedMesh;
    const mat = new THREE.Matrix4();
    mesh.getMatrixAt(0, mat);
    const pos = new THREE.Vector3().setFromMatrixPosition(mat);
    expect(pos.x).toBeCloseTo(1, 5);
    expect(pos.y).toBeCloseTo(2, 5);
    expect(pos.z).toBeCloseTo(3, 5);
    m.dispose();
  });

  it('dispose frees geometry + material', () => {
    const m = createParticleMesh(minimalCfg(4), null as any, THREE);
    const mesh = m.object3D as THREE.InstancedMesh;
    const geomDispose = vi.spyOn(mesh.geometry, 'dispose');
    const matDispose = vi.spyOn(mesh.material as THREE.Material, 'dispose');
    m.dispose();
    expect(geomDispose).toHaveBeenCalled();
    expect(matDispose).toHaveBeenCalled();
  });
});
