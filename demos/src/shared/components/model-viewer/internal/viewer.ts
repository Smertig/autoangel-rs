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
  dispose(): void;
  _disposeScene(): void;
}

let viewer: Viewer | null = null;

export function getViewer(container: HTMLElement): Viewer {
  if (viewer && viewer.container === container) return viewer;
  if (viewer) viewer.dispose();

  const { THREE } = getThree();
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth || 400, container.clientHeight || 400);

  container.classList.add('model-active');
  container.replaceChildren(renderer.domElement);

  const resizeObs = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (width > 0 && height > 0 && viewer && viewer.camera) {
      viewer.camera.aspect = width / height;
      viewer.camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }
  });
  resizeObs.observe(container);

  let animId: number;
  const clock = new THREE.Clock();
  function animate() {
    animId = requestAnimationFrame(animate);
    const delta = clock.getDelta();
    if (viewer && viewer.mixer) viewer.mixer.update(delta);
    if (viewer && viewer.onBeforeRender) viewer.onBeforeRender();
    if (viewer && viewer.onFrameUpdate) viewer.onFrameUpdate();
    if (viewer && viewer.controls) viewer.controls.update();
    if (viewer && viewer.scene) renderer.render(viewer.scene, viewer.camera);
  }
  animate();

  viewer = {
    container,
    renderer,
    resizeObs,
    scene: null,
    camera: null,
    controls: null,
    mixer: null,
    onBeforeRender: null,
    onFrameUpdate: null,
    dispose() {
      cancelAnimationFrame(animId);
      resizeObs.disconnect();
      if (this.controls) this.controls.dispose();
      renderer.dispose();
      this.container.classList.remove('model-active');
      this._disposeScene();
      viewer = null;
    },
    _disposeScene() {
      if (!this.scene) return;
      this.scene.traverse((c: any) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (c.material.map) c.material.map.dispose();
          c.material.dispose();
        }
      });
      this.scene = null;
    },
  };
  return viewer;
}

/** Dispose the current persistent viewer (if any) and clear the singleton. */
export function disposeViewer(): void {
  if (viewer) {
    viewer.dispose();
    viewer = null;
  }
}
