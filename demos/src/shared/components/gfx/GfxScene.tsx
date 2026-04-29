import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { GfxElementRuntime } from '../gfx-runtime/types';
import styles from './GfxScene.module.css';

export interface GfxSceneProps {
  /** Parsed GFX file. */
  parsed: { elements: any[] };
  /** Bumped by parent on restart → triggers full dispose + respawn. */
  runtimeKey: number;
  playing: boolean;
  speed: number;
  /** Path-keys (e.g. '0', '2.1') of currently-enabled elements. */
  enabled: Set<string>;
  /** Path-key of soloed element, or null. */
  solo: string | null;
  /** Caller-supplied spawn — receives the path key + element, returns a runtime
   *  or null for kinds the runtime can't render. */
  spawn: (key: string, element: any) => GfxElementRuntime | null;
  /** Called when every active runtime has reported finished() and the scene
   *  is about to respawn (auto-loop). */
  onLoop: () => void;
}

export function GfxScene(props: GfxSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playingRef = useRef(props.playing);
  const speedRef = useRef(props.speed);
  const runtimesRef = useRef<Map<string, GfxElementRuntime>>(new Map());
  const onLoopRef = useRef(props.onLoop);
  const parsedRef = useRef(props.parsed);
  const spawnRef = useRef(props.spawn);
  const enabledRef = useRef(props.enabled);
  const soloRef = useRef(props.solo);

  // Keep refs in sync with props that the rAF loop reads each frame.
  playingRef.current = props.playing;
  speedRef.current = props.speed;
  onLoopRef.current = props.onLoop;
  parsedRef.current = props.parsed;
  spawnRef.current = props.spawn;
  enabledRef.current = props.enabled;
  soloRef.current = props.solo;

  // Mount + spawn + rAF — re-runs when runtimeKey changes (full restart).
  useEffect(() => {
    const host = hostRef.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101015);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(0, 1.5, 4);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(typeof window !== 'undefined' ? window.devicePixelRatio : 1);
    host.appendChild(renderer.domElement);

    const runtimes = new Map<string, GfxElementRuntime>();
    runtimesRef.current = runtimes;
    props.parsed.elements.forEach((el, i) => {
      const key = String(i);
      const rt = props.spawn(key, el);
      if (rt) {
        runtimes.set(key, rt);
        scene.add(rt.root);
        // Initial visibility — match enabled/solo at spawn time.
        const visibleNow = props.solo ? key === props.solo : props.enabled.has(key);
        rt.root.visible = visibleNow;
      }
    });

    const onResize = () => {
      const r = host.getBoundingClientRect();
      const w = Math.max(1, r.width);
      const h = Math.max(1, r.height);
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    onResize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    ro?.observe(host);

    let last = performance.now();
    let rafId = 0;
    let visible = (typeof document === 'undefined') || document.visibilityState !== 'hidden';
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (playingRef.current) {
        const scaled = dt * speedRef.current;
        for (const rt of runtimes.values()) rt.tick(scaled);
      }
      if (playingRef.current && runtimes.size > 0) {
        // Check whether all runtimes that report finished() are finished.
        // If no runtime reports finished(), the scene plays forever.
        let anyHasFinished = false;
        let allFinished = true;
        for (const rt of runtimes.values()) {
          if (rt.finished) {
            anyHasFinished = true;
            if (!rt.finished()) { allFinished = false; break; }
          }
        }
        if (anyHasFinished && allFinished) {
          onLoopRef.current();
          // Dispose + respawn.
          for (const rt of runtimes.values()) {
            // remove root from scene first so disposed material/geometry references
            // don't linger in the scene graph.
            scene.remove(rt.root);
            rt.dispose();
          }
          runtimes.clear();
          // Capture current parsed/spawn/enabled/solo via refs so we don't pick up
          // a stale closure if the parent passed new ones since mount.
          const elements = parsedRef.current.elements;
          const spawnFn = spawnRef.current;
          const enabledNow = enabledRef.current;
          const soloNow = soloRef.current;
          elements.forEach((el, i) => {
            const key = String(i);
            const rt = spawnFn(key, el);
            if (rt) {
              runtimes.set(key, rt);
              scene.add(rt.root);
              rt.root.visible = soloNow ? key === soloNow : enabledNow.has(key);
            }
          });
          last = performance.now();
        }
      }
      renderer.render(scene, camera);
      // Only re-arm while the tab is visible — when hidden we let the loop freeze
      // instead of running at the browser's throttled ~1 Hz cadence.
      if (visible) rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    const onVisibilityChange = () => {
      const nowVisible = document.visibilityState !== 'hidden';
      if (nowVisible && !visible) {
        visible = true;
        // Reset the clock so the first frame after resume doesn't see a giant dt.
        last = performance.now();
        rafId = requestAnimationFrame(loop);
      } else if (!nowVisible && visible) {
        visible = false;
        // The currently-pending rAF will run once and then not reschedule
        // (loop checks `visible` before calling requestAnimationFrame).
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      cancelAnimationFrame(rafId);
      ro?.disconnect();
      for (const rt of runtimes.values()) rt.dispose();
      runtimes.clear();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
    // We want the full mount/unmount cycle to fire when runtimeKey changes
    // (restart) but NOT when other props (enabled/solo/playing/speed) change.
    // parsed/spawn are read fresh on each mount via the props closure — that's
    // fine because runtimeKey is the only "restart" signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.runtimeKey]);

  // Apply visibility changes — enabled/solo can flip without restarting.
  useEffect(() => {
    for (const [key, rt] of runtimesRef.current) {
      rt.root.visible = props.solo ? key === props.solo : props.enabled.has(key);
    }
  }, [props.enabled, props.solo]);

  return <div ref={hostRef} className={styles.canvasHost} data-testid="gfx-scene" />;
}
