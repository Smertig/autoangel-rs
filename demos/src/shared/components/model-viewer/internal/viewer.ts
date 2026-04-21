import { getThree } from './three';

export interface Viewer {
  container: HTMLElement;
  renderer: any;
  resizeObs: ResizeObserver;
  scene: any;
  camera: any;
  controls: any;
  mixer: any;
  /** Called each frame after mixer.update() to apply foot offset / bone scaling. */
  onBeforeRender: (() => void) | null;
  /** Called each frame to update transport bar UI (scrubber, time display). */
  onFrameUpdate: (() => void) | null;
  /** Seconds elapsed since last frame; available inside onBeforeRender/onFrameUpdate. */
  lastDt: number;
  dispose(): void;
  _disposeScene(): void;
}

// Keyed per-container so multiple viewer instances (e.g. several ModelPreview
// cards expanded at once) don't steal each other's canvas. WeakMap so an
// orphaned container (cleanup miss) can still be collected — the active rAF
// loop is what actually keeps a viewer alive, so correct disposal is still
// required; this is belt-and-suspenders against the Map pinning detached
// DOM indefinitely.
const viewers = new WeakMap<HTMLElement, Viewer>();

export function getViewer(container: HTMLElement): Viewer {
  const existing = viewers.get(container);
  if (existing) return existing;

  const { THREE } = getThree();
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth || 400, container.clientHeight || 400);

  container.classList.add('model-active');
  container.replaceChildren(renderer.domElement);

  const v: Viewer = {
    container,
    renderer,
    resizeObs: null as unknown as ResizeObserver, // filled in below
    scene: null,
    camera: null,
    controls: null,
    mixer: null,
    onBeforeRender: null,
    onFrameUpdate: null,
    lastDt: 0,
    dispose() {
      cancelAnimationFrame(animId);
      v.resizeObs.disconnect();
      if (v.controls) v.controls.dispose();
      renderer.dispose();
      v.container.classList.remove('model-active');
      v._disposeScene();
      viewers.delete(container);
    },
    _disposeScene() {
      if (!v.scene) return;
      v.scene.traverse((c: any) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (c.material.map) c.material.map.dispose();
          c.material.dispose();
        }
      });
      v.scene = null;
    },
  };

  v.resizeObs = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (width > 0 && height > 0 && v.camera) {
      v.camera.aspect = width / height;
      v.camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }
  });
  v.resizeObs.observe(container);

  let animId: number;
  const clock = new THREE.Clock();
  function animate() {
    animId = requestAnimationFrame(animate);
    const delta = clock.getDelta();
    v.lastDt = delta;
    if (v.mixer) v.mixer.update(delta);
    if (v.onBeforeRender) v.onBeforeRender();
    if (v.onFrameUpdate) v.onFrameUpdate();
    if (v.controls) v.controls.update();
    if (v.scene) renderer.render(v.scene, v.camera);
  }
  animate();

  viewers.set(container, v);
  return v;
}

/** Dispose the viewer bound to the given container (if any). */
export function disposeViewer(container: HTMLElement): void {
  const v = viewers.get(container);
  if (v) v.dispose();
}
