import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { GfxScene } from './GfxScene';
import { ElementSidebar } from './sidebar/ElementSidebar';
import { ParameterDrawer } from './ParameterDrawer';
import { TransportBar } from './TransportBar';
import { buildTree, flattenTree, type TreeRow } from './sidebar/buildTree';
import { useGfxPreload } from './hooks/useGfxPreload';
import {
  RENDERABLE_KINDS,
  computeGfxDurationSec,
  elementSkipReason,
} from '../gfx-runtime/registry';
import { resolveEnginePath, ENGINE_PATH_PREFIXES } from './util/resolveEnginePath';
import type { ElementBodyKind, GfxElement, ViewerCtx } from './types';
import styles from './GfxViewer.module.css';

interface GfxViewerProps {
  data: Uint8Array;
  context: ViewerCtx;
}

export function GfxViewer({ data, context }: GfxViewerProps) {
  const parsed = useMemo(() => {
    try {
      return { ok: true as const, value: context.wasm.parseGfx(data) };
    } catch (e: unknown) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  }, [data, context.wasm]);

  if (!parsed.ok) {
    return <div className={styles.error}>Parse error: {parsed.error}</div>;
  }

  return <GfxViewerInner parsed={parsed.value} context={context} />;
}

function GfxViewerInner({ parsed, context }: { parsed: any; context: ViewerCtx }) {
  const { preloadedGfx, preloadedTextures, ready } = useGfxPreload(parsed, context);

  const tree = useMemo<TreeRow[]>(() => {
    if (!ready) return [];
    return buildTree(parsed, {
      resolve: (p: string) => {
        const r = resolveEnginePath(p, ENGINE_PATH_PREFIXES.gfx, context.findFile);
        return r ? ((preloadedGfx.get(r) as { elements: GfxElement[] } | undefined) ?? null) : null;
      },
      visiting: new Set(),
    });
  }, [parsed, preloadedGfx, ready, context.findFile]);

  const elementByKey = useMemo(() => flattenTree(tree), [tree]);

  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(elementByKey.keys()));
  useEffect(() => { setEnabled(new Set(elementByKey.keys())); }, [elementByKey]);

  const [solo, setSolo] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [runtimeKey, setRuntimeKey] = useState(0);
  const [loopPulse, setLoopPulse] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);

  const playingRef = useRef(playing); playingRef.current = playing;
  const speedRef = useRef(speed); speedRef.current = speed;
  const tRef = useRef(0);
  useEffect(() => {
    tRef.current = 0;
    setCurrentSec(0);
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (playingRef.current) tRef.current += dt * speedRef.current;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // Push tRef into state on a low-frequency interval, gated so React only
    // re-renders the viewer when the displayed value would actually change.
    // Stops entirely while paused (no updates → no re-renders).
    const interval = setInterval(() => {
      if (!playingRef.current) return;
      setCurrentSec((prev) => (Math.abs(tRef.current - prev) > 0.005 ? tRef.current : prev));
    }, 100);
    return () => { cancelAnimationFrame(raf); clearInterval(interval); };
  }, [runtimeKey]);

  const totalSec = useMemo(() => {
    if (!ready) return 0;
    const d = computeGfxDurationSec(parsed, {
      resolve: (p: string) => {
        const r = resolveEnginePath(p, ENGINE_PATH_PREFIXES.gfx, context.findFile);
        return r ? ((preloadedGfx.get(r) as any) ?? null) : null;
      },
      visiting: new Set(),
      isRenderable: (k: ElementBodyKind) => RENDERABLE_KINDS.has(k),
    });
    return d > 0 ? d : Infinity;
  }, [parsed, preloadedGfx, ready, context.findFile]);

  const isSupported = useCallback((kind: ElementBodyKind) => RENDERABLE_KINDS.has(kind), []);

  const shouldSpawn = useCallback((el: GfxElement) => {
    if (elementSkipReason(el)) return false;
    return RENDERABLE_KINDS.has(el.body.kind);
  }, []);

  const toggleEnabled = useCallback((k: string) => {
    setEnabled((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  }, []);
  const toggleSolo = useCallback((k: string) => setSolo((prev) => (prev === k ? null : k)), []);
  const toggleExpand = useCallback((k: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  }, []);

  const onLoop = useCallback(() => {
    setLoopPulse(true);
    setTimeout(() => setLoopPulse(false), 200);
    tRef.current = 0;
  }, []);

  const drawerElement = selectedKey != null ? (elementByKey.get(selectedKey) ?? null) : null;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.headerBadge}>GFX v{parsed.version}</span>
        <span className={styles.headerSubtitle}>
          {parsed.elements.length} element{parsed.elements.length === 1 ? '' : 's'}
          {' · '}scale {parsed.default_scale.toFixed(3)}
          {' · '}speed {parsed.play_speed.toFixed(3)}
          {' · '}alpha {parsed.default_alpha.toFixed(3)}
        </span>
      </div>
      {!ready ? (
        <div className={styles.loading}>Loading…</div>
      ) : (
        <div className={styles.split}>
          <ElementSidebar
            tree={tree}
            enabled={enabled}
            solo={solo}
            expanded={expanded}
            selectedIndex={selectedKey}
            isSupported={isSupported}
            onToggle={toggleEnabled}
            onSolo={toggleSolo}
            onSelect={setSelectedKey}
            onExpandToggle={toggleExpand}
          />
          <div className={styles.right}>
            <div className={styles.canvasWrap}>
              <GfxScene
                parsed={parsed}
                runtimeKey={runtimeKey}
                playing={playing}
                speed={speed}
                enabled={enabled}
                solo={solo}
                preloadedGfx={preloadedGfx}
                preloadedTextures={preloadedTextures}
                findFile={context.findFile}
                shouldSpawn={shouldSpawn}
                onLoop={onLoop}
              />
              <ParameterDrawer
                element={drawerElement}
                context={context}
                onClose={() => setSelectedKey(null)}
              />
            </div>
            <TransportBar
              playing={playing}
              onPlayToggle={() => setPlaying((p) => !p)}
              onRestart={() => setRuntimeKey((k) => k + 1)}
              currentSec={currentSec}
              totalSec={totalSec}
              speed={speed}
              onSpeedChange={setSpeed}
              loopPulse={loopPulse}
            />
          </div>
        </div>
      )}
    </div>
  );
}
