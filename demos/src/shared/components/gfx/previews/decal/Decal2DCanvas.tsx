import { useEffect, useRef } from 'react';
import { ensureThree, getThree } from '@shared/components/model-viewer/internal/three';
import { loadParticleTexture } from '../particle/texture';
import { decalBlendingProps } from './blend';
import { useDecalTexture } from './useDecalTexture';
import { readBgColor } from '../../util/bg';
import { sampleAtlasFrame } from '../../util/atlas';
import { sampleTrack, trackSignature, type Track } from '../../util/keypointTrack';
import type { GfxElement, ViewerCtx } from '../types';
import styles from './DecalMount.module.css';

/**
 * Decal2D (type 101) preview — orthographic three.js scene.
 *
 * The engine renders Decal2D in screen-space (A3DTLVERTEX). We approximate
 * that with an orthographic camera whose frustum matches a unit quad — the
 * decal fills the canvas. KPS drives color/scale/rad_2d; position is
 * ignored (screen-space fixed).
 */
export function Decal2DCanvas({
  element,
  context,
  track,
}: {
  element: GfxElement;
  context: ViewerCtx;
  track: Track;
}) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const signature = trackSignature(track);
  const texData = useDecalTexture(element, context);

  useEffect(() => {
    const mount = canvasRef.current;
    if (!mount) return;
    if (typeof WebGLRenderingContext === 'undefined') return;

    let disposed = false;
    let raf = 0;
    let sceneCleanup: (() => void) | null = null;

    (async () => {
      await ensureThree();
      if (disposed) return;
      const { THREE } = getThree();

      // Fill the whole mount rectangle (matches Decal3D's sizing).
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

      const resizeObs = new ResizeObserver(() => {
        const next = sizeOf(mount);
        if (next.w !== w || next.h !== h) {
          w = next.w; h = next.h;
          renderer.setSize(w, h);
        }
      });
      resizeObs.observe(mount);

      const scene = new THREE.Scene();
      scene.background = readBgColor(THREE, mount);
      // Unit quad centered at origin; camera frustum = [-0.5, 0.5] on both axes.
      const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, -1, 1);

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

      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        ...decalBlendingProps(element.src_blend, element.dest_blend, THREE),
      });

      // 1×1 plane fills the orthographic frustum.
      const geom = new THREE.PlaneGeometry(1, 1);
      const mesh = new THREE.Mesh(geom, material);
      scene.add(mesh);

      const startMs = performance.now();
      const tick = () => {
        const now = performance.now();
        const localMs = track.loopable ? (now - startMs) % track.loopDurationMs : 0;
        const sample = sampleTrack(track, localMs);

        // Screen-space: ignore KPS position; only scale + 2D rotation.
        mesh.scale.setScalar(sample.scale);
        mesh.quaternion.identity();
        mesh.rotateZ(sample.rad2d);

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

        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      sceneCleanup = () => {
        if (raf) cancelAnimationFrame(raf);
        resizeObs.disconnect();
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
    // `track` is intentionally omitted — `signature` is its content hash, so
    // the closure's captured ref is always valid for the current signature.
  }, [
    signature,
    element.src_blend,
    element.dest_blend,
    element.tex_row,
    element.tex_col,
    element.tex_interval,
    texData,
    context.wasm,
    element.tex_file,
  ]);

  return <div ref={canvasRef} className={styles.mount} data-testid="decal-2d-canvas" />;
}
