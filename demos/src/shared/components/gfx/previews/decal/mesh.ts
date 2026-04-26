import type { Object3D, Texture } from 'three';
import type { Sample } from '../../util/keypointTrack';
import { applyKeypointTransform } from '../../util/keypointApply';
import { decalBlendingProps } from './blend';
import { sampleAtlasFrame } from '../../util/atlas';
import type { ElementBody, GfxElement } from '../types';

type DecalBody = Extract<ElementBody, { kind: 'decal' }>;

export interface DecalMesh {
  /** Mesh for type 100; Group of two meshes for type 102. */
  readonly object3D: Object3D;
  /** Replace the texture uniform. Caller owns the texture lifecycle —
   *  `dispose()` does not touch it. */
  setTexture(tex: Texture | null): void;
  /** Apply KPS sample + atlas frame. `localMs` feeds atlas advance. */
  writeFrame(sample: Sample, localMs: number): void;
  dispose(): void;
}

export function createDecalMesh(
  body: DecalBody,
  element: GfxElement,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  three: any,
): DecalMesh {
  const THREE = three;
  const orgPtX = body.org_pt ? body.org_pt[0] : 0.5;
  const orgPtY = body.org_pt ? body.org_pt[1] : 0.5;
  const quadW = Math.max(0.01, body.width);
  const quadH = Math.max(0.01, body.height);

  const material = new THREE.MeshBasicMaterial({
    map: null,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    ...decalBlendingProps(element.src_blend, element.dest_blend, THREE),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const geometries: any[] = [];
  const buildQuad = () => {
    const g = new THREE.PlaneGeometry(quadW, quadH);
    g.translate((0.5 - orgPtX) * quadW, (0.5 - orgPtY) * quadH, 0);
    geometries.push(g);
    return g;
  };

  let object3D: Object3D;
  if (element.type_id === 102) {
    // Engine Update_Billboard emits 8 verts = two intersecting quads
    // (XY plane at z=0 + YZ plane at x=0, same centered, same material).
    const group = new THREE.Group();
    const m1 = new THREE.Mesh(buildQuad(), material);
    const m2 = new THREE.Mesh(buildQuad(), material);
    m2.rotation.y = Math.PI / 2;
    group.add(m1);
    group.add(m2);
    object3D = group;
  } else {
    // Engine Fill_Verts_3D default → flat XY quad with org_pt offset.
    object3D = new THREE.Mesh(buildQuad(), material);
  }

  let texture: Texture | null = null;

  return {
    object3D,
    setTexture(tex) {
      material.map = tex ?? null;
      material.needsUpdate = true;
      texture = tex ?? null;
    },
    writeFrame(sample, localMs) {
      applyKeypointTransform(sample, object3D);
      // rad_2d is a 2D roll; engine applies it via kp matrix for type 100.
      // Type 102 cross is axis-aligned in local space, no rad_2d.
      if (element.type_id !== 102) object3D.rotateZ(sample.rad2d);

      const a = ((sample.color >>> 24) & 0xff) / 255;
      const r = ((sample.color >>> 16) & 0xff) / 255;
      const g = ((sample.color >>> 8) & 0xff) / 255;
      const b = (sample.color & 0xff) / 255;
      material.color.setRGB(r, g, b);
      material.opacity = a;
      // Engine Update_Billboard / Update_3D bail when alpha < 5 (out of 255).
      material.visible = a * 255 >= 5;

      if (texture && (element.tex_row > 1 || element.tex_col > 1)) {
        const atlas = sampleAtlasFrame(
          Math.max(1, element.tex_row),
          Math.max(1, element.tex_col),
          element.tex_interval,
          localMs,
        );
        texture.offset.fromArray(atlas.offset);
        texture.repeat.fromArray(atlas.repeat);
      }
    },
    dispose() {
      material.dispose();
      for (const g of geometries) g.dispose();
      // Texture is owned by the caller (preload cache or standalone preview).
      if (object3D.parent) object3D.removeFromParent?.();
    },
  };
}
