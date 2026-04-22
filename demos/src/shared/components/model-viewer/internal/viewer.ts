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
  /**
   * Schedule one rAF render pass. Idempotent per frame. Callers must invoke
   * this after mutating scene/camera/mixer/onBeforeRender state so the change
   * becomes visible; during OrbitControls damping and active mixer playback
   * the render loop self-sustains via an internal activity probe.
   */
  requestRender(): void;
  /**
   * Install or replace `v.controls`. Wires the `'change'` event so damping
   * and user interaction automatically trigger renders. Pass `null` to
   * detach.
   */
  setControls(controls: any | null): void;
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

  let scheduledRaf = 0;
  let controlsChangeHandler: (() => void) | null = null;
  const clock = new THREE.Clock();

  // Returns true while the mixer holds an action that would visibly advance
  // on the next `mixer.update(dt)`. `AnimationAction.isRunning()` consults
  // the action's own timeScale but not the mixer's, so we must guard on
  // `mixer.timeScale` too — the transport bar pauses playback by setting it
  // to 0. `mixer._actions` is private (underscore-prefixed) but stable across
  // Three.js releases; filtered by `.isRunning()` it avoids plumbing
  // track/untrack calls through every clipAction site.
  function isMixerActive(): boolean {
    const mixer = v.mixer;
    if (!mixer || mixer.timeScale === 0) return false;
    const actions = mixer._actions as any[] | undefined;
    if (!actions) return false;
    for (let i = 0; i < actions.length; i++) {
      if (actions[i].isRunning()) return true;
    }
    return false;
  }

  function renderFrame() {
    scheduledRaf = 0;
    const delta = clock.getDelta();
    v.lastDt = delta;
    if (v.mixer) v.mixer.update(delta);
    if (v.onBeforeRender) v.onBeforeRender();
    if (v.onFrameUpdate) v.onFrameUpdate();
    // `controls.update()` emits `'change'` when damping produces motion,
    // which re-arms the scheduler via the handler installed in setControls.
    if (v.controls) v.controls.update();
    if (v.scene) renderer.render(v.scene, v.camera);
    if (isMixerActive()) requestRender();
  }

  function requestRender() {
    if (scheduledRaf !== 0) return;
    scheduledRaf = requestAnimationFrame(renderFrame);
  }

  function detachControlsListener() {
    if (v.controls && controlsChangeHandler) {
      try { v.controls.removeEventListener('change', controlsChangeHandler); } catch { /* already gone */ }
      controlsChangeHandler = null;
    }
  }

  function setControls(controls: any | null) {
    detachControlsListener();
    v.controls = controls;
    if (controls) {
      controlsChangeHandler = () => requestRender();
      controls.addEventListener('change', controlsChangeHandler);
    }
  }

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
    requestRender,
    setControls,
    dispose() {
      if (scheduledRaf !== 0) {
        cancelAnimationFrame(scheduledRaf);
        scheduledRaf = 0;
      }
      detachControlsListener();
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
      v.requestRender();
    }
  });
  v.resizeObs.observe(container);

  viewers.set(container, v);
  return v;
}

/** Dispose the viewer bound to the given container (if any). */
export function disposeViewer(container: HTMLElement): void {
  const v = viewers.get(container);
  if (v) v.dispose();
}
