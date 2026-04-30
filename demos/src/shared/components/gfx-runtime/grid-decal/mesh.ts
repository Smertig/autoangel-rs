import type { BufferAttribute, Mesh, Texture } from 'three';
import type { Sample } from '../../gfx/util/keypointTrack';
import { decalBlendingProps } from '../decal/blend';
import { sampleAtlasFrame } from '../../gfx/util/atlas';
import { argbChannels, argbLerp } from '../../gfx/util/argb';
import { lerp } from '../../gfx/util/math';
import type { ElementBody, GfxElement } from '../../gfx/types';

type GridDecalBody = Extract<ElementBody, { kind: 'grid_decal_3d' }>;

export interface GridDecalMesh {
  readonly object3D: Mesh;
  setTexture(tex: Texture | null): void;
  writeFrame(sample: Sample, localMs: number): void;
  dispose(): void;
}

function decodeArgbInto(c: number, out: Float32Array, off: number): void {
  const [r, g, b, a] = argbChannels(c);
  out[off + 0] = r;
  out[off + 1] = g;
  out[off + 2] = b;
  out[off + 3] = a;
}

export function createGridDecalMesh(
  body: GridDecalBody,
  element: GfxElement,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  three: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  camera: any | null,
): GridDecalMesh {
  const THREE = three;
  const w = body.w_number, h = body.h_number;
  const degenerate = w < 2 || h < 2;

  const animKeys = body.animation_keys ?? [];
  const lastKeyMs = animKeys.length > 0 ? animKeys[animKeys.length - 1].time_ms : 0;
  // Multi-key animation drives per-frame lerp; a single key is folded into the
  // base buffers below so writeFrame can short-circuit.
  const animLerping = animKeys.length >= 2;

  const material = new THREE.MeshBasicMaterial({
    map: null,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    vertexColors: true,
    ...decalBlendingProps(element.src_blend, element.dest_blend, THREE),
  });
  if (degenerate) material.visible = false;

  const geometry = new THREE.BufferGeometry();
  const N = degenerate ? 0 : w * h;
  let basePos: Float32Array | null = null;
  let posAttr: BufferAttribute | null = null;
  let baseColor: Float32Array | null = null;
  let colorAttr: BufferAttribute | null = null;
  let texture: Texture | null = null;

  // Reusable scratch vectors for rot_from_view; allocating per-frame would be
  // 4× new Vector3() at 60Hz per runtime.
  const sElemPos = degenerate ? null : new THREE.Vector3();
  const sView = degenerate ? null : new THREE.Vector3();
  const sDir = degenerate ? null : new THREE.Vector3();
  const sUp = degenerate ? null : new THREE.Vector3();

  if (!degenerate) {
    basePos = new Float32Array(N * 3);
    baseColor = new Float32Array(N * 4);
    const uvs = new Float32Array(N * 2);
    const denomU = w > 1 ? w - 1 : 1;
    const denomV = h > 1 ? h - 1 : 1;
    // When animKeys.length === 1 the engine snaps to that key's vertex array;
    // bake it into basePos/baseColor at construction so writeFrame doesn't
    // re-copy immutable data every frame.
    const initSrc = animKeys.length === 1 ? animKeys[0].vertices : body.vertices;
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const i = row * w + col;
        const v = initSrc[i];
        basePos[i * 3 + 0] = v.pos[0];
        basePos[i * 3 + 1] = v.pos[1];
        basePos[i * 3 + 2] = v.pos[2];
        decodeArgbInto(v.color >>> 0, baseColor, i * 4);
        uvs[i * 2 + 0] = col / denomU;
        uvs[i * 2 + 1] = row / denomV;
      }
    }

    const indices: number[] = [];
    for (let row = 0; row < h - 1; row++) {
      for (let col = 0; col < w - 1; col++) {
        const i0 = row * w + col;
        const i1 = i0 + 1;
        const i2 = i0 + w;
        const i3 = i2 + 1;
        indices.push(i0, i1, i3, i0, i3, i2);
      }
    }

    posAttr = new THREE.BufferAttribute(new Float32Array(basePos), 3);
    posAttr!.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', posAttr);
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    colorAttr = new THREE.BufferAttribute(new Float32Array(baseColor), 4);
    colorAttr!.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('color', colorAttr);
  }
  const object3D: Mesh = new THREE.Mesh(geometry, material);

  function writeFrame(s: Sample, localMs: number) {
    if (degenerate) return;
    const bp = basePos!;
    const bc = baseColor!;
    let posDirty = false;

    if (animLerping) {
      const tGrid = lastKeyMs > 0 ? localMs % lastKeyMs : 0;
      let a = 0;
      for (let k = 0; k < animKeys.length - 1; k++) {
        if (tGrid >= animKeys[k].time_ms && tGrid < animKeys[k + 1].time_ms) { a = k; break; }
        a = k + 1;
      }
      const b = Math.min(a + 1, animKeys.length - 1);
      const t1 = animKeys[a].time_ms;
      const t2 = animKeys[b].time_ms;
      const r = t2 > t1 ? (tGrid - t1) / (t2 - t1) : 0;
      const va = animKeys[a].vertices;
      const vb = animKeys[b].vertices;
      for (let i = 0; i < N; i++) {
        bp[i * 3 + 0] = lerp(va[i].pos[0], vb[i].pos[0], r);
        bp[i * 3 + 1] = lerp(va[i].pos[1], vb[i].pos[1], r);
        bp[i * 3 + 2] = lerp(va[i].pos[2], vb[i].pos[2], r);
        decodeArgbInto(argbLerp(va[i].color, vb[i].color, r), bc, i * 4);
      }
      posDirty = true;
    }

    if (body.rot_from_view && camera) {
      // Engine: m_vView = m_vPos - cam.pos; vDir from parent dir (we use +Z
      // basis); vUp = cross(vView, vDir); vView = cross(vDir, vUp); normalize.
      object3D.getWorldPosition(sElemPos!);
      sView!.subVectors(sElemPos!, camera.position);
      sDir!.set(0, 0, 1);
      sUp!.crossVectors(sView!, sDir!);
      sView!.crossVectors(sDir!, sUp!);
      sDir!.normalize(); sUp!.normalize(); sView!.normalize();

      const arr = posAttr!.array as Float32Array;
      for (let i = 0; i < N; i++) {
        const x = bp[i * 3 + 0];
        const y = bp[i * 3 + 1];
        const z = bp[i * 3 + 2];
        // newPos = -y*vDir + x*vUp + z*vView (matScale folded into outer.scale chain)
        arr[i * 3 + 0] = -y * sDir!.x + x * sUp!.x + z * sView!.x;
        arr[i * 3 + 1] = -y * sDir!.y + x * sUp!.y + z * sView!.y;
        arr[i * 3 + 2] = -y * sDir!.z + x * sUp!.z + z * sView!.z;
      }
      posAttr!.needsUpdate = true;
    } else if (posDirty) {
      (posAttr!.array as Float32Array).set(bp);
      posAttr!.needsUpdate = true;
    }

    const [sR, sG, sB, sA] = argbChannels(s.color);

    // KP RGB modulates per-vertex RGB; per-vertex alpha is unmodulated, KP
    // alpha drives material.opacity and the draw-skip threshold below.
    const ca = colorAttr!.array as Float32Array;
    for (let i = 0; i < N; i++) {
      const i4 = i * 4;
      ca[i4 + 0] = bc[i4 + 0] * sR;
      ca[i4 + 1] = bc[i4 + 1] * sG;
      ca[i4 + 2] = bc[i4 + 2] * sB;
      ca[i4 + 3] = bc[i4 + 3];
    }
    colorAttr!.needsUpdate = true;

    material.opacity = sA;
    // Engine `Update_3D` skips the draw entirely when KP alpha < 5/255.
    material.visible = sA * 255 >= 5;

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
  }

  return {
    object3D,
    setTexture(tex) {
      material.map = tex ?? null;
      material.needsUpdate = true;
      texture = tex ?? null;
    },
    writeFrame,
    dispose() {
      material.dispose();
      geometry.dispose();
      if (object3D.parent) object3D.removeFromParent?.();
    },
  };
}
