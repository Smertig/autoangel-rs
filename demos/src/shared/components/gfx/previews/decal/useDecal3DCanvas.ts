import { useEffect, useRef, type RefObject } from 'react';
import { ensureThree, getThree } from '@shared/components/model-viewer/internal/three';
import { loadParticleTexture } from '../particle/texture';
import { createDecalMesh } from './mesh';
import { useDecalTexture } from './useDecalTexture';
import { readBgColor } from '../../util/bg';
import { sampleTrack, trackSignature, type Track } from '../../util/keypointTrack';
import type { ElementBody, GfxElement, ViewerCtx } from '../types';

type DecalBody = Extract<ElementBody, { kind: 'decal' }>;

/**
 * three.js scene for Decal3D (100) / DecalBillboard (102).
 *
 * - 100: KPS direction quat + local-Z roll from `rad_2d`.
 * - 102: engine-correct cross of two intersecting quads (XY + YZ planes)
 *   per `A3DDecalEx::Update_Billboard` — mesh geometry is already built
 *   inside `createDecalMesh`; no per-frame camera-facing hack needed.
 */
export function useDecal3DCanvas(
  body: DecalBody,
  element: GfxElement,
  context: ViewerCtx,
  track: Track,
): { canvasRef: RefObject<HTMLDivElement | null> } {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const signature = trackSignature(track);
  const texData = useDecalTexture(element, context);

  const orgPtX = body.org_pt ? body.org_pt[0] : 0.5;
  const orgPtY = body.org_pt ? body.org_pt[1] : 0.5;

  useEffect(() => {
    const mount = canvasRef.current;
    if (!mount) return;
    // jsdom has no WebGL — bail early so the mount div still renders for
    // assertions. In real browsers, constructor errors propagate.
    if (typeof WebGLRenderingContext === 'undefined') return;

    let disposed = false;
    let raf = 0;
    let sceneCleanup: (() => void) | null = null;

    (async () => {
      await ensureThree();
      if (disposed) return;
      const { THREE, OrbitControls } = getThree();

      // Fill the whole mount rectangle — the .expanded grid stretches the
      // left column to match the field-panel height on the right, so the
      // canvas consumes the entire left cell with no dead space.
      const sizeOf = (el: HTMLElement) => ({
        w: Math.max(200, el.clientWidth || 260),
        h: Math.max(200, el.clientHeight || 260),
      });
      let { w, h } = sizeOf(mount);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const renderer: any = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(window.devicePixelRatio || 1);
      renderer.setSize(w, h);
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      // Match the page's own `--gfx-bg-deep` so additive blending composites
      // the way the engine does (black DDS background contributes zero on
      // top of the matching bg, leaving only the bright additive glow visible).
      scene.background = readBgColor(THREE, mount);
      const camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100);
      const camDist = Math.max(body.width, body.height) * 2.5 || 2.5;
      camera.position.set(camDist, camDist, camDist);
      camera.lookAt(0, 0, 0);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 0, 0);
      controls.enableDamping = true;
      controls.dampingFactor = 0.15;

      const resizeObs = new ResizeObserver(() => {
        const next = sizeOf(mount);
        if (next.w !== w || next.h !== h) {
          w = next.w; h = next.h;
          renderer.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        }
      });
      resizeObs.observe(mount);

      const grid = new THREE.GridHelper(4, 8, 0x666666, 0x333333);
      scene.add(grid);

      const decalMesh = createDecalMesh(body, element, THREE);
      scene.add(decalMesh.object3D);

      if (texData && texData.byteLength > 0) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tex: any = await loadParticleTexture(context.wasm, texData, element.tex_file);
          if (disposed) {
            tex?.dispose?.();
            decalMesh.dispose();
            renderer.dispose();
            renderer.domElement.parentNode?.removeChild(renderer.domElement);
            return;
          }
          decalMesh.setTexture(tex);
        } catch {
          /* leave untextured */
        }
      }

      const startMs = performance.now();

      const tick = () => {
        const now = performance.now();
        const localMs = track.loopable ? (now - startMs) % track.loopDurationMs : 0;
        const sample = sampleTrack(track, localMs);
        decalMesh.writeFrame(sample, localMs);
        controls.update();
        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      sceneCleanup = () => {
        if (raf) cancelAnimationFrame(raf);
        resizeObs.disconnect();
        controls.dispose();
        decalMesh.dispose();
        renderer.dispose();
        renderer.domElement.parentNode?.removeChild(renderer.domElement);
      };
    })();

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      sceneCleanup?.();
    };
    // `track` is intentionally omitted — `signature` is its content hash, so
    // the closure's captured ref is always valid for the current signature.
  }, [
    signature,
    body.width,
    body.height,
    orgPtX,
    orgPtY,
    element.type_id,
    element.src_blend,
    element.dest_blend,
    element.tex_row,
    element.tex_col,
    element.tex_interval,
    texData,
    context.wasm,
    element.tex_file,
  ]);

  return { canvasRef };
}
