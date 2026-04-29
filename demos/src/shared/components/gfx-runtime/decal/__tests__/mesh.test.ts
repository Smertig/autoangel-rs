import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createDecalMesh } from '../mesh';

function decalBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    kind: 'decal',
    width: 2,
    height: 3,
    rot_from_view: false,
    ...overrides,
  } as any;
}

function decalElement(typeId: 100 | 102, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    type_id: typeId,
    name: 'D',
    src_blend: 5, dest_blend: 6,
    repeat_count: 0, repeat_delay: 0,
    tex_file: 'deca.dds', tex_row: 1, tex_col: 1, tex_interval: 0,
    tile_mode: 0, z_enable: 0, is_dummy: 0, priority: 0,
    body: decalBody(),
    affectors: [],
    key_point_set: undefined,
    ...overrides,
  } as any;
}

describe('createDecalMesh — type 100', () => {
  it('returns a single Mesh with a PlaneGeometry sized width x height', () => {
    const m = createDecalMesh(decalBody(), decalElement(100), THREE);
    expect(m.object3D).toBeInstanceOf(THREE.Mesh);
    const geom = (m.object3D as any).geometry;
    expect(geom.parameters.width).toBeCloseTo(2);
    expect(geom.parameters.height).toBeCloseTo(3);
    m.dispose();
  });

  it('translates geometry by (0.5 - orgPt) * dim', () => {
    const body = decalBody({ org_pt: [0.25, 0.75] });
    const m = createDecalMesh(body, decalElement(100), THREE);
    const pos = (m.object3D as any).geometry.attributes.position.array;
    expect(pos[0]).toBeCloseTo(-0.5);
    expect(pos[1]).toBeCloseTo(0.75);
    m.dispose();
  });
});

describe('createDecalMesh — type 102 (billboard cross)', () => {
  it('returns a Group with two Mesh children sharing one material', () => {
    const m = createDecalMesh(decalBody(), decalElement(102), THREE);
    expect(m.object3D).toBeInstanceOf(THREE.Group);
    const children = (m.object3D as any).children;
    expect(children.length).toBe(2);
    expect(children[0]).toBeInstanceOf(THREE.Mesh);
    expect(children[1]).toBeInstanceOf(THREE.Mesh);
    expect((children[0] as any).material).toBe((children[1] as any).material);
    m.dispose();
  });

  it('rotates the second mesh by PI/2 around Y so it sits in the YZ plane', () => {
    const m = createDecalMesh(decalBody(), decalElement(102), THREE);
    const children = (m.object3D as any).children;
    expect(children[0].rotation.y).toBeCloseTo(0);
    expect(children[1].rotation.y).toBeCloseTo(Math.PI / 2);
    m.dispose();
  });
});

function sample(overrides: Partial<any> = {}) {
  return {
    color: 0xffffffff,
    position: [0, 0, 0] as [number, number, number],
    scale: 1,
    direction: [0, 0, 0, 1] as [number, number, number, number],
    rad2d: 0,
    normalized: 0,
    ...overrides,
  };
}

describe('DecalMesh.writeFrame', () => {
  it('writes material.color and opacity from sample.color (ARGB)', () => {
    const m = createDecalMesh(decalBody(), decalElement(100), THREE);
    m.writeFrame(sample({ color: 0x80ff0000 }), 0);
    const mat = (m.object3D as any).material;
    expect(mat.color.r).toBeCloseTo(1);
    expect(mat.color.g).toBeCloseTo(0);
    expect(mat.color.b).toBeCloseTo(0);
    expect(mat.opacity).toBeCloseTo(128 / 255);
    expect(mat.visible).toBe(true);
    m.dispose();
  });

  it('hides material when alpha rounds below engine skip threshold (< 5/255)', () => {
    const m = createDecalMesh(decalBody(), decalElement(100), THREE);
    m.writeFrame(sample({ color: 0x03ffffff }), 0);
    expect((m.object3D as any).material.visible).toBe(false);
    m.dispose();
  });

  it('applies rad_2d Z roll for type 100 but not for type 102', () => {
    const m100 = createDecalMesh(decalBody(), decalElement(100), THREE);
    m100.writeFrame(sample({ rad2d: Math.PI / 4 }), 0);
    const euler100 = new THREE.Euler().setFromQuaternion(m100.object3D.quaternion);
    expect(Math.abs(euler100.z)).toBeGreaterThan(0.1);
    m100.dispose();

    const m102 = createDecalMesh(decalBody(), decalElement(102), THREE);
    m102.writeFrame(sample({ rad2d: Math.PI / 4 }), 0);
    const euler102 = new THREE.Euler().setFromQuaternion(m102.object3D.quaternion);
    expect(Math.abs(euler102.z)).toBeLessThan(0.0001);
    m102.dispose();
  });
});

describe('DecalMesh.setTexture + dispose', () => {
  it('swaps material.map on setTexture and marks needsUpdate', () => {
    const m = createDecalMesh(decalBody(), decalElement(100), THREE);
    const mat = (m.object3D as any).material;
    expect(mat.map).toBeNull();
    // THREE.Material.needsUpdate is a write-only setter that bumps .version —
    // verifying the version delta is the observable "dirty" flag.
    const beforeVersion = mat.version;
    const tex = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1);
    m.setTexture(tex);
    expect(mat.map).toBe(tex);
    expect(mat.version).toBeGreaterThan(beforeVersion);
    m.dispose();
  });

  it('dispose releases material + geometries; texture is caller-owned', () => {
    const m = createDecalMesh(decalBody(), decalElement(102), THREE);
    const group = m.object3D as any;
    const material = group.children[0].material;
    const geoms = group.children.map((c: any) => c.geometry);
    const tex = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1);
    m.setTexture(tex);

    const matSpy = vi.spyOn(material, 'dispose');
    const geomSpies = geoms.map((g: any) => vi.spyOn(g, 'dispose'));
    const texSpy = vi.spyOn(tex, 'dispose');

    m.dispose();
    expect(matSpy).toHaveBeenCalled();
    geomSpies.forEach((s: any) => expect(s).toHaveBeenCalled());
    expect(texSpy).not.toHaveBeenCalled();
  });
});
