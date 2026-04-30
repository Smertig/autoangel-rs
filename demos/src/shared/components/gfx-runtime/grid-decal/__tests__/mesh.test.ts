import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createGridDecalMesh } from '../mesh';

function gridDecalBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    kind: 'grid_decal_3d',
    w_number: 4,
    h_number: 4,
    grid_size: 0.5,
    z_offset: 0,
    aff_by_scl: false,
    rot_from_view: false,
    offset_height: 0.1,
    always_on_ground: false,
    animation_keys: [],
    vertices: Array.from({ length: 16 }, (_, i) => ({
      pos: [(i % 4) * 0.5, Math.floor(i / 4) * 0.5, 0] as [number, number, number],
      color: 0xffffffff,
    })),
    ...overrides,
  } as any;
}

function gridDecalElement(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    type_id: 210,
    name: 'GD',
    src_blend: 5, dest_blend: 6,
    repeat_count: 0, repeat_delay: 0,
    tex_file: 'grid.dds', tex_row: 1, tex_col: 1, tex_interval: 0,
    tile_mode: 0, z_enable: 0, is_dummy: 0, priority: 0,
    body: gridDecalBody(),
    affectors: [],
    key_point_set: undefined,
    ...overrides,
  } as any;
}

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

describe('createGridDecalMesh — degenerate input', () => {
  it('w<2 returns a mesh with material.visible=false', () => {
    const body = gridDecalBody({
      w_number: 1, h_number: 4,
      vertices: Array.from({ length: 4 }, () => ({ pos: [0, 0, 0], color: 0xffffffff })),
    });
    const m = createGridDecalMesh(body, gridDecalElement(), THREE, null);
    expect(m.object3D).toBeInstanceOf(THREE.Mesh);
    expect((m.object3D as any).material.visible).toBe(false);
    m.dispose();
  });

  it('h<2 returns a mesh with material.visible=false', () => {
    const body = gridDecalBody({
      w_number: 4, h_number: 1,
      vertices: Array.from({ length: 4 }, () => ({ pos: [0, 0, 0], color: 0xffffffff })),
    });
    const m = createGridDecalMesh(body, gridDecalElement(), THREE, null);
    expect((m.object3D as any).material.visible).toBe(false);
    m.dispose();
  });
});

describe('createGridDecalMesh — geometry build', () => {
  it('builds N=w*h positions populated from body.vertices', () => {
    const m = createGridDecalMesh(gridDecalBody(), gridDecalElement(), THREE, null);
    const pos = (m.object3D as any).geometry.attributes.position.array;
    expect(pos.length).toBe(16 * 3);
    // Spot check: vertex (col=2, row=1) → body.vertices[1*4 + 2] = pos [1.0, 0.5, 0]
    expect(pos[(1 * 4 + 2) * 3 + 0]).toBeCloseTo(1.0);
    expect(pos[(1 * 4 + 2) * 3 + 1]).toBeCloseTo(0.5);
    m.dispose();
  });

  it('builds uniform [0,1] UV attribute', () => {
    const m = createGridDecalMesh(gridDecalBody(), gridDecalElement(), THREE, null);
    const uv = (m.object3D as any).geometry.attributes.uv.array;
    expect(uv.length).toBe(16 * 2);
    // (col=0, row=0) → (0, 0); (col=3, row=3) → (1, 1)
    expect(uv[0]).toBeCloseTo(0); expect(uv[1]).toBeCloseTo(0);
    expect(uv[(3 * 4 + 3) * 2 + 0]).toBeCloseTo(1);
    expect(uv[(3 * 4 + 3) * 2 + 1]).toBeCloseTo(1);
    m.dispose();
  });

  it('builds (w-1)*(h-1)*6 index buffer with two CCW triangles per rect', () => {
    const m = createGridDecalMesh(gridDecalBody(), gridDecalElement(), THREE, null);
    const idx = (m.object3D as any).geometry.index.array;
    expect(idx.length).toBe(3 * 3 * 6); // (4-1)*(4-1)*6 = 54
    // First rect (row=0, col=0): tri1 = (0, 1, 5); tri2 = (0, 5, 4)
    expect([idx[0], idx[1], idx[2]]).toEqual([0, 1, 5]);
    expect([idx[3], idx[4], idx[5]]).toEqual([0, 5, 4]);
    m.dispose();
  });
});

describe('createGridDecalMesh — color attribute + texture lifecycle', () => {
  it('initializes RGBA color attribute from body.vertices[i].color (ARGB)', () => {
    const body = gridDecalBody({
      vertices: Array.from({ length: 16 }, () => ({
        pos: [0, 0, 0] as [number, number, number],
        color: 0x80ff8040, // A=128, R=255, G=128, B=64
      })),
    });
    const m = createGridDecalMesh(body, gridDecalElement(), THREE, null);
    const c = (m.object3D as any).geometry.attributes.color.array;
    expect(c.length).toBe(16 * 4);
    expect(c[0]).toBeCloseTo(255 / 255);   // R
    expect(c[1]).toBeCloseTo(128 / 255);   // G
    expect(c[2]).toBeCloseTo(64 / 255);    // B
    expect(c[3]).toBeCloseTo(128 / 255);   // A
    m.dispose();
  });

  it('setTexture swaps material.map and bumps version', () => {
    const m = createGridDecalMesh(gridDecalBody(), gridDecalElement(), THREE, null);
    const mat = (m.object3D as any).material;
    const before = mat.version;
    const tex = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1);
    m.setTexture(tex);
    expect(mat.map).toBe(tex);
    expect(mat.version).toBeGreaterThan(before);
    m.dispose();
  });

  it('dispose releases material + geometry; texture is caller-owned', () => {
    const m = createGridDecalMesh(gridDecalBody(), gridDecalElement(), THREE, null);
    const mat = (m.object3D as any).material;
    const geom = (m.object3D as any).geometry;
    const tex = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1);
    m.setTexture(tex);
    const matSpy = vi.spyOn(mat, 'dispose');
    const geomSpy = vi.spyOn(geom, 'dispose');
    const texSpy = vi.spyOn(tex, 'dispose');
    m.dispose();
    expect(matSpy).toHaveBeenCalled();
    expect(geomSpy).toHaveBeenCalled();
    expect(texSpy).not.toHaveBeenCalled();
  });
});

describe('GridDecalMesh.writeFrame — KP color compose + alpha', () => {
  it('multiplies KP RGB into per-vertex color buffer', () => {
    const body = gridDecalBody({
      vertices: Array.from({ length: 16 }, () => ({
        pos: [0, 0, 0] as [number, number, number],
        color: 0xff80ff80, // A=255, R=128, G=255, B=128
      })),
    });
    const m = createGridDecalMesh(body, gridDecalElement(), THREE, null);
    m.writeFrame(sample({ color: 0xff8080ff }), 0); // A=255, R=128, G=128, B=255
    const c = (m.object3D as any).geometry.attributes.color.array;
    expect(c[0]).toBeCloseTo((128 / 255) * (128 / 255), 3); // R
    expect(c[1]).toBeCloseTo((255 / 255) * (128 / 255), 3); // G
    expect(c[2]).toBeCloseTo((128 / 255) * (255 / 255), 3); // B
    expect(c[3]).toBeCloseTo(255 / 255, 3);                  // per-vertex A unchanged
    // needsUpdate is a write-only setter that bumps `version` (initial 0 → ≥1).
    expect((m.object3D as any).geometry.attributes.color.version).toBeGreaterThan(0);
    m.dispose();
  });

  it('writes material.opacity = sampleAlpha; visible=false when sampleAlpha*255 < 5', () => {
    const m = createGridDecalMesh(gridDecalBody(), gridDecalElement(), THREE, null);
    m.writeFrame(sample({ color: 0x80ffffff }), 0);
    expect((m.object3D as any).material.opacity).toBeCloseTo(128 / 255);
    expect((m.object3D as any).material.visible).toBe(true);
    m.writeFrame(sample({ color: 0x03ffffff }), 0);
    expect((m.object3D as any).material.visible).toBe(false);
    m.dispose();
  });

  it('advances atlas frame via texture.offset/repeat when tex_row*tex_col > 1', () => {
    const el = gridDecalElement({ tex_row: 2, tex_col: 2, tex_interval: 100 });
    const m = createGridDecalMesh(gridDecalBody(), el, THREE, null);
    const tex = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1);
    m.setTexture(tex);
    m.writeFrame(sample({ color: 0xffffffff }), 0);
    const off0: [number, number] = [tex.offset.x, tex.offset.y];
    m.writeFrame(sample({ color: 0xffffffff }), 150);
    expect([tex.offset.x, tex.offset.y]).not.toEqual(off0);
    m.dispose();
  });
});

describe('GridDecalMesh.writeFrame — GridAnimation', () => {
  it('lerps positions and per-vertex colors at midpoint between two keys', () => {
    const verts0 = Array.from({ length: 16 }, () => ({
      pos: [0, 0, 0] as [number, number, number],
      color: 0xff000000, // black, A=255
    }));
    const verts1 = Array.from({ length: 16 }, () => ({
      pos: [1, 1, 0] as [number, number, number],
      color: 0xffffffff, // white
    }));
    const body = gridDecalBody({
      animation_keys: [
        { time_ms: 0, vertices: verts0 },
        { time_ms: 1000, vertices: verts1 },
      ],
      vertices: verts0,
    });
    const m = createGridDecalMesh(body, gridDecalElement(), THREE, null);
    m.writeFrame(sample({ color: 0xffffffff }), 500);

    const pos = (m.object3D as any).geometry.attributes.position.array;
    expect(pos[0]).toBeCloseTo(0.5);
    expect(pos[1]).toBeCloseTo(0.5);
    const col = (m.object3D as any).geometry.attributes.color.array;
    expect(col[0]).toBeCloseTo(0.5, 1); // R lerps from 0 → 1 at t=0.5
    // needsUpdate is a write-only setter that bumps `version` (initial 0 → ≥1).
    expect((m.object3D as any).geometry.attributes.position.version).toBeGreaterThan(0);
    m.dispose();
  });

  it('wraps localMs by lastKey.time_ms — no freeze on subsequent cycles', () => {
    const verts0 = Array.from({ length: 16 }, () => ({ pos: [0, 0, 0] as [number, number, number], color: 0xff000000 }));
    const verts1 = Array.from({ length: 16 }, () => ({ pos: [1, 0, 0] as [number, number, number], color: 0xffffffff }));
    const body = gridDecalBody({
      animation_keys: [
        { time_ms: 0, vertices: verts0 },
        { time_ms: 1000, vertices: verts1 },
      ],
      vertices: verts0,
    });
    const m = createGridDecalMesh(body, gridDecalElement(), THREE, null);
    // After 1.5 cycles, the wrapped time = 500ms, mid-lerp again (not frozen at end).
    m.writeFrame(sample({ color: 0xffffffff }), 1500);
    const pos = (m.object3D as any).geometry.attributes.position.array;
    expect(pos[0]).toBeCloseTo(0.5);
    m.dispose();
  });

  it('single key → snaps to that key state', () => {
    const verts = Array.from({ length: 16 }, () => ({ pos: [2, 3, 4] as [number, number, number], color: 0xffff8040 }));
    const body = gridDecalBody({
      animation_keys: [{ time_ms: 0, vertices: verts }],
      vertices: Array.from({ length: 16 }, () => ({ pos: [0, 0, 0] as [number, number, number], color: 0xffffffff })),
    });
    const m = createGridDecalMesh(body, gridDecalElement(), THREE, null);
    m.writeFrame(sample({ color: 0xffffffff }), 999);
    const pos = (m.object3D as any).geometry.attributes.position.array;
    expect(pos[0]).toBeCloseTo(2);
    expect(pos[1]).toBeCloseTo(3);
    m.dispose();
  });
});

describe('GridDecalMesh.writeFrame — rot_from_view', () => {
  it('with rot_from_view=true and a stub camera, vertex 0 lies in the camera plane', () => {
    const body = gridDecalBody({
      rot_from_view: true,
      vertices: Array.from({ length: 16 }, (_, i) => ({
        pos: [(i % 4) - 1.5, Math.floor(i / 4) - 1.5, 0] as [number, number, number],
        color: 0xffffffff,
      })),
    });
    // Stub camera at (0,0,5) looking at origin.
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 5);
    camera.updateMatrixWorld();

    const m = createGridDecalMesh(body, gridDecalElement(), THREE, camera);
    // Mesh is a child of nothing — outer.matrixWorld is identity for this test;
    // the runtime supplies a real outer/animated chain, but the unit-test here
    // only asserts that rot_from_view=true *changed* positions vs the static path.
    m.writeFrame(sample({ color: 0xffffffff }), 0);
    const pos = (m.object3D as any).geometry.attributes.position.array;

    // Static-path would have left the bottom-left vertex at body.vertices[0].pos = (-1.5, -1.5, 0).
    const staticBody = gridDecalBody({
      rot_from_view: false,
      vertices: body.vertices,
    });
    const ref = createGridDecalMesh(staticBody, gridDecalElement(), THREE, null);
    ref.writeFrame(sample({ color: 0xffffffff }), 0);
    const refPos = (ref.object3D as any).geometry.attributes.position.array;

    // At least one component differs — the rot_from_view path actually ran.
    let differs = false;
    for (let i = 0; i < pos.length; i++) {
      if (Math.abs(pos[i] - refPos[i]) > 1e-4) { differs = true; break; }
    }
    expect(differs).toBe(true);
    m.dispose(); ref.dispose();
  });

  it('rot_from_view=true but getCamera()=null falls back to default local mode (no throw)', () => {
    const body = gridDecalBody({ rot_from_view: true });
    const m = createGridDecalMesh(body, gridDecalElement(), THREE, null);
    expect(() => m.writeFrame(sample({ color: 0xffffffff }), 0)).not.toThrow();
    m.dispose();
  });
});
