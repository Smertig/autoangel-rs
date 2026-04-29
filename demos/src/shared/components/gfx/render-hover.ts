import { ensureThree, getThree } from '../model-viewer/internal/three';
import {
  spawnElementRuntime,
  RENDERABLE_KINDS,
  elementSkipReason,
  allActiveFinished,
} from '../gfx-runtime/registry';
import { ENGINE_PATH_PREFIXES, type FindFile } from './util/resolveEnginePath';
import { loadParticleTexture } from '../gfx-runtime/texture';
import type { GfxElement } from './types';
import type { GfxElementRuntime, PreloadedTexture } from '../gfx-runtime/types';
import type { HoverCanvasRenderArgs } from '../hover-preview/types';

/**
 * Animated GFX preview for the hover popover. Strips the full viewer down
 * to: parse, preload textures, spawn runtimes, animate. No sidebar / no
 * controls / no transport bar / nested containers skipped.
 *
 * Returns a cleanup function the caller invokes on unmount; cleanup
 * cancels the rAF loop, disposes runtimes + textures, and disposes the
 * renderer.
 */
export async function renderGfxHoverPreview(args: HoverCanvasRenderArgs): Promise<() => void> {
  const { canvas, data, getData, wasm, cancelled } = args;

  await ensureThree();
  const { THREE } = getThree();

  const parsed = wasm.parseGfx(data);
  const elements: GfxElement[] = parsed.elements ?? [];

  // Hover has no findFile — try each engine prefix per unique tex_file and
  // remember the canonical-cased path that successfully fetches. Dedup so
  // shared textures don't get decoded twice (with the second decode leaking
  // the first via map-key collision).
  const texFiles = new Set<string>();
  for (const el of elements) {
    if (el.tex_file) texFiles.add(el.tex_file);
  }
  const preloadedTextures = new Map<string, PreloadedTexture>();
  await Promise.all([...texFiles].map(async (texFile) => {
    for (const prefix of ENGINE_PATH_PREFIXES.textures) {
      const candidate = prefix + texFile;
      try {
        const buf = await getData(candidate);
        if (!buf || buf.byteLength === 0) continue;
        const tex = await loadParticleTexture(wasm, buf, candidate);
        if (!tex) return;
        if (cancelled()) {
          (tex as PreloadedTexture).dispose?.();
          return;
        }
        preloadedTextures.set(candidate, tex as PreloadedTexture);
        return;
      } catch { /* try next prefix */ }
    }
  }));
  if (cancelled()) {
    for (const tex of preloadedTextures.values()) tex.dispose?.();
    preloadedTextures.clear();
    return () => {};
  }

  // Spawners re-derive paths via `resolveEnginePath(raw, prefixes, findFile)`;
  // we stored the first-prefix-hit candidate above so this lookup converges.
  const findFile: FindFile = (p) => (preloadedTextures.has(p) ? p : null);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101015);

  const w = canvas.clientWidth || 300;
  const h = canvas.clientHeight || 296;
  const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
  camera.position.set(0, 1.5, 4);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);

  const runtimes: GfxElementRuntime[] = [];
  const spawnAll = () => {
    for (const el of elements) {
      if (elementSkipReason(el)) continue;
      if (!RENDERABLE_KINDS.has(el.body.kind)) continue;
      const rt = spawnElementRuntime(el.body, {
        three: THREE,
        gfxScale: parsed.default_scale ?? 1,
        gfxSpeed: parsed.play_speed ?? 1,
        timeSpanSec: undefined,
        findFile,
        element: el,
        preloadedGfx: new Map(),
        preloadedTextures,
      });
      if (!rt) continue;
      runtimes.push(rt);
      scene.add(rt.root);
    }
  };
  spawnAll();

  let last = performance.now();
  let rafId = 0;
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    for (const rt of runtimes) rt.tick(dt);

    if (allActiveFinished(runtimes)) {
      for (const rt of runtimes) {
        scene.remove(rt.root);
        rt.dispose();
      }
      runtimes.length = 0;
      spawnAll();
      last = performance.now();
    }

    renderer.render(scene, camera);
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(rafId);
    for (const rt of runtimes) rt.dispose();
    runtimes.length = 0;
    for (const tex of preloadedTextures.values()) tex.dispose?.();
    preloadedTextures.clear();
    renderer.dispose();
  };
}
