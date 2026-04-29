import { useEffect, useRef } from 'react';
import { getThree } from '../model-viewer/internal/three';
import { getViewer, type Viewer } from '../model-viewer/internal/viewer';
import { spawnElementRuntime, allActiveFinished } from '../gfx-runtime/registry';
import type { GfxElementRuntime, PreloadedTexture } from '../gfx-runtime/types';
import type { GfxElement } from './types';
import type { FindFile } from './util/resolveEnginePath';
import styles from './GfxScene.module.css';

export interface GfxSceneProps {
  parsed: { elements: GfxElement[]; default_scale: number; play_speed: number };
  /** Bumped by parent on restart → triggers full dispose + respawn. */
  runtimeKey: number;
  playing: boolean;
  speed: number;
  /** Path-keys (e.g. '0', '2.1') of currently-enabled elements. */
  enabled: Set<string>;
  /** Path-key of soloed element, or null. */
  solo: string | null;
  preloadedGfx: Map<string, unknown>;
  preloadedTextures: Map<string, PreloadedTexture>;
  findFile: FindFile;
  /** True if this element should get a runtime. False rows still appear in
   *  the parent's sidebar, but no runtime is spawned. */
  shouldSpawn: (el: GfxElement) => boolean;
  /** Called when every active runtime has reported finished() and the scene
   *  is about to respawn. */
  onLoop: () => void;
}

type LiveProps = Pick<GfxSceneProps,
  'playing' | 'speed' | 'parsed' | 'enabled' | 'solo' | 'onLoop'
  | 'shouldSpawn' | 'preloadedGfx' | 'preloadedTextures' | 'findFile'>;

export function GfxScene(props: GfxSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimesRef = useRef<Map<string, GfxElementRuntime>>(new Map());
  const viewerRef = useRef<Viewer | null>(null);
  const liveRef = useRef<LiveProps>(props);
  liveRef.current = props;

  useEffect(() => {
    const host = hostRef.current!;
    // Parent gates GfxScene on `ready`, which only fires after useGfxPreload
    // awaits ensureThree(); getThree() is safe synchronously here.
    const { THREE, OrbitControls } = getThree();
    const v = getViewer(host);
    viewerRef.current = v;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101015);
    v.scene = scene;

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(0, 1.5, 4);
    camera.lookAt(0, 0, 0);
    v.camera = camera;

    const controls = new OrbitControls(camera, v.renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    v.setControls(controls);

    const runtimes = new Map<string, GfxElementRuntime>();
    runtimesRef.current = runtimes;

    const spawnAll = () => {
      const live = liveRef.current;
      for (let i = 0; i < live.parsed.elements.length; i++) {
        const el = live.parsed.elements[i];
        const key = String(i);
        if (!live.shouldSpawn(el)) continue;
        const rt = spawnElementRuntime(el.body, {
          three: THREE,
          gfxScale: live.parsed.default_scale ?? 1,
          gfxSpeed: live.parsed.play_speed ?? 1,
          timeSpanSec: undefined,
          findFile: live.findFile,
          element: el,
          preloadedGfx: live.preloadedGfx,
          preloadedTextures: live.preloadedTextures,
        });
        if (!rt) continue;
        runtimes.set(key, rt);
        scene.add(rt.root);
        rt.root.visible = live.solo ? key === live.solo : live.enabled.has(key);
      }
    };
    spawnAll();

    // Freeze the loop entirely while the tab is hidden — getViewer's rAF
    // self-sustains via isAuxAnimating, so returning false halts it.
    let visible = (typeof document === 'undefined') || document.visibilityState !== 'hidden';
    v.isAuxAnimating = () => liveRef.current.playing && visible && runtimes.size > 0;
    v.onFrameUpdate = () => {
      const live = liveRef.current;
      if (!live.playing || !visible) return;
      const scaled = v.lastDt * live.speed;
      for (const rt of runtimes.values()) rt.tick(scaled);

      if (allActiveFinished(runtimes.values())) {
        live.onLoop();
        for (const rt of runtimes.values()) {
          scene.remove(rt.root);
          rt.dispose();
        }
        runtimes.clear();
        spawnAll();
      }
    };

    const onVisibilityChange = () => {
      const nowVisible = document.visibilityState !== 'hidden';
      if (nowVisible !== visible) {
        visible = nowVisible;
        if (visible) v.requestRender();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    v.requestRender();

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      for (const rt of runtimes.values()) rt.dispose();
      runtimes.clear();
      v.dispose();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.runtimeKey]);

  useEffect(() => {
    for (const [key, rt] of runtimesRef.current) {
      rt.root.visible = props.solo ? key === props.solo : props.enabled.has(key);
    }
    viewerRef.current?.requestRender();
  }, [props.enabled, props.solo]);

  useEffect(() => {
    if (props.playing) viewerRef.current?.requestRender();
  }, [props.playing]);

  return <div ref={hostRef} className={styles.canvasHost} data-testid="gfx-scene" />;
}
