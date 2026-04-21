import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { ensureThree, getThree } from '@shared/components/model-viewer/internal/three';
import { useFileData } from '@shared/hooks/useFileData';
import { loadParticleTexture, noopGetData, resolveTexturePath } from '../particle/texture';
import { d3dBlendToThreeFactor } from '../../util/blendModes';
import { sampleAtlasFrame } from '../../util/atlas';
import { sampleTrack, trackSignature, type Track } from '../../util/keypointTrack';
import type { ElementBody, GfxElement, ViewerCtx } from '../types';

type DecalBody = Extract<ElementBody, { kind: 'decal' }>;

/**
 * three.js scene for Decal3D (100) / DecalBillboard (102).
 *
 * - 100: KPS direction quat + local-Z roll from `rad_2d`.
 * - 102: always camera-facing via `mesh.quaternion.copy(camera.quaternion)`.
 */
export function useDecal3DCanvas(
  body: DecalBody,
  element: GfxElement,
  context: ViewerCtx,
  track: Track,
): { canvasRef: RefObject<HTMLDivElement | null> } {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const signature = trackSignature(track);

  const resolvedPath = useMemo(
    () => resolveTexturePath(element.tex_file, context.listFiles),
    [element.tex_file, context.listFiles],
  );
  const texDataState = useFileData(
    resolvedPath ?? '__noop__',
    resolvedPath ? context.getData : noopGetData,
  );
  const texData = useMemo(
    () => (texDataState.status === 'loaded' ? texDataState.data : null),
    [texDataState],
  );

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const THREE: any = getThree().THREE;

      const W = mount.clientWidth || 280;
      const H = 200;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const renderer: any = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(window.devicePixelRatio || 1);
      renderer.setSize(W, H);
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, W / H, 0.01, 100);
      const camDist = Math.max(body.width, body.height) * 2.5 || 2.5;
      camera.position.set(camDist, camDist, camDist);
      camera.lookAt(0, 0, 0);

      const grid = new THREE.GridHelper(4, 8, 0x666666, 0x333333);
      scene.add(grid);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let texture: any = null;
      if (texData && texData.byteLength > 0) {
        try {
          texture = await loadParticleTexture(context.wasm, texData, element.tex_file);
          if (disposed) {
            texture?.dispose?.();
            renderer.dispose();
            renderer.domElement.parentNode?.removeChild(renderer.domElement);
            return;
          }
        } catch {
          texture = null;
        }
      }

      const srcFactor = d3dBlendToThreeFactor(element.src_blend, THREE);
      const dstFactor = d3dBlendToThreeFactor(element.dest_blend, THREE);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending:
          srcFactor !== null && dstFactor !== null
            ? THREE.CustomBlending
            : THREE.NormalBlending,
        blendSrc: srcFactor ?? THREE.SrcAlphaFactor,
        blendDst: dstFactor ?? THREE.OneMinusSrcAlphaFactor,
      });

      const w = Math.max(0.01, body.width);
      const h = Math.max(0.01, body.height);
      const geom = new THREE.PlaneGeometry(w, h);
      geom.translate((0.5 - orgPtX) * w, (0.5 - orgPtY) * h, 0);

      const mesh = new THREE.Mesh(geom, material);
      scene.add(mesh);

      const isBillboard = element.type_id === 102;
      const startMs = performance.now();

      const tick = () => {
        const now = performance.now();
        const localMs = track.loopable ? (now - startMs) % track.loopDurationMs : 0;
        const sample = sampleTrack(track, localMs);

        mesh.position.fromArray(sample.position);
        mesh.scale.setScalar(sample.scale);

        const r = ((sample.color >>> 16) & 0xff) / 255;
        const g = ((sample.color >>> 8) & 0xff) / 255;
        const b = (sample.color & 0xff) / 255;
        const a = ((sample.color >>> 24) & 0xff) / 255;
        material.color.setRGB(r, g, b);
        material.opacity = a;

        if (texture) {
          const atlas = sampleAtlasFrame(
            Math.max(1, element.tex_row),
            Math.max(1, element.tex_col),
            element.tex_interval,
            localMs,
          );
          texture.offset.fromArray(atlas.offset);
          texture.repeat.fromArray(atlas.repeat);
        }

        if (isBillboard) {
          mesh.quaternion.copy(camera.quaternion);
        } else {
          mesh.quaternion.set(
            sample.direction[0],
            sample.direction[1],
            sample.direction[2],
            sample.direction[3],
          );
          mesh.rotateZ(sample.rad2d);
        }

        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      sceneCleanup = () => {
        if (raf) cancelAnimationFrame(raf);
        geom.dispose();
        material.dispose();
        texture?.dispose?.();
        renderer.dispose();
        renderer.domElement.parentNode?.removeChild(renderer.domElement);
      };
    })();

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      sceneCleanup?.();
    };
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
    track,
    context.wasm,
    element.tex_file,
  ]);

  return { canvasRef };
}
