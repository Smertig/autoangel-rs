import type { AutoangelModule, GfxEffect } from '../../../../types/autoangel';
import type { PackageView } from '@shared/package';
import { basename } from '@shared/util/path';
import { resolvePath, collectSkinPaths, tryLoadSki, tryFallbackSkiPath, discoverStckPaths } from '@shared/util/model-dependencies';
import { ensureThree, getThree } from './three';
import { type SkinStats, loadSkinFile } from './mesh';
import {
  type BoneScaleData,
  readEcmBoneScales,
  applyBoneScales,
  computeFootOffset,
  applyBoneScalesToHierarchy,
  buildSkeleton,
} from './skeleton';
import { ClipCache, buildAnimationClip } from './clip';
import { type AnimEvent, buildAnimEventMap, EVENT_GFX, EVENT_SOUND } from './event-map';
import { getViewer } from './viewer';
import { mountScene, type LoopMode } from './scene';
import type { ModelStatePorts } from '../state';
import { createGfxEventScheduler, type GfxEventScheduler } from '../../gfx-runtime/scheduler';
import {
  spawnElementRuntime,
  isRenderableKind,
  computeElementDurationSec,
  computeGfxDurationSec,
} from '../../gfx-runtime/registry';
import { createGfxLoader } from '../../gfx-runtime/loader';
import { preloadGfxGraph } from '../../gfx-runtime/preload';
import type { DurationContext, GfxLike, IsRenderable } from '../../gfx-runtime/duration';
import { createNoopRuntime } from '../../gfx-runtime/noop';
import { attachToHook } from '../../gfx-runtime/hook';
import { ENGINE_PATH_PREFIXES } from '../../gfx/util/resolveEnginePath';
import { ALL_ELEMENT_BODY_KINDS } from '../../gfx/util/kindLabel';
import type { ElementBodyKind } from '../../gfx/types';
import type { PreloadedTexture } from '../../gfx-runtime/types';

// "站立" (standing) — preferred default animation clip
export const PREFERRED_ANIM_HINT = '\u7AD9\u7ACB';

/**
 * Find an "idle" clip the viewer can fall through to after a one-shot clip
 * ends and its GFX is still playing out. Returns the first non-self match
 * containing PREFERRED_ANIM_HINT, or null when none qualifies — including
 * the case where the *only* matching clip is `currentClip` itself.
 */
export function findIdleClipName(
  animNames: ReadonlyArray<string>,
  currentClip: string,
): string | null {
  return animNames.find((n) => n !== currentClip && n.includes(PREFERRED_ANIM_HINT)) ?? null;
}

/**
 * Shared renderer driven by an already-fetched SMD. Both the ECM path
 * (wraps this after parsing ECM) and the raw-SMD path (calls this directly)
 * end up here. `opts` carries ECM-specific enhancements — when absent, we
 * render a plain SMD: skeleton + meshes + any STCK animations found, with
 * no bone scaling, no additional skin variants, and no animation events.
 */
export async function renderFromSmd(
  container: HTMLElement,
  wasm: AutoangelModule,
  pkg: PackageView,
  smdPath: string,
  smdData: Uint8Array,
  opts?: {
    additionalSkins?: { paths: string[]; basePath: string };
    boneScaleInfo?: { entries: BoneScaleData[]; isNew: boolean; baseBone: string | undefined };
    eventMapFromAnimNames?: (animNames: string[]) => Map<string, AnimEvent[]> | undefined;
    source?: { data: Uint8Array; ext: string };
    initialClipName?: string;
    onNavigateToFile?: (path: string) => void;
    state?: ModelStatePorts;
  },
): Promise<void> {
  let smdSkinPaths: string[] = [];
  let smdTcksDir: string | undefined;
  let skelData: { skeleton: any; bones: any[]; boneNames: string[]; tmpRoot: any; hooksByName: Map<string, any>; footOffset: number } | null = null;
  {
    using smd = wasm.SmdModel.parse(smdData);
    smdSkinPaths = smd.skinPaths || [];
    smdTcksDir = smd.tcksDir;
    const bonRelPath: string = smd.skeletonPath;
    if (bonRelPath) {
      const bonPath = resolvePath(bonRelPath, smdPath);
      const bonData = await pkg.read(bonPath);
      if (bonData) {
        try {
          const built = buildSkeleton(wasm, bonData);
          skelData = { ...built, footOffset: 0 };
          console.log(
            `[model] Skeleton built: ${skelData.boneNames.length} bones`,
          );
        } catch (e) {
          console.warn('[model] Failed to build skeleton:', e);
        }
      }
    }
  }

  if (skelData && opts?.boneScaleInfo) {
    const { entries, isNew, baseBone } = opts.boneScaleInfo;
    applyBoneScales(skelData.bones, entries, isNew);
    skelData.footOffset = computeFootOffset(
      skelData.bones, skelData.boneNames, baseBone, skelData.tmpRoot,
    );
    console.log(`[model] Bone scaling: ${entries.length} entries, footOffset=${skelData.footOffset.toFixed(3)}`);
  }

  const allSkinPaths = collectSkinPaths(
    smdPath,
    smdSkinPaths,
    opts?.additionalSkins?.basePath ?? smdPath,
    opts?.additionalSkins?.paths ?? [],
  );
  let skinFallbackWarning: string | undefined;
  if (allSkinPaths.length === 0) {
    const fallback = await tryFallbackSkiPath(smdPath, pkg);
    if (!fallback) throw new Error('No skin files referenced by SMD');
    allSkinPaths.push(fallback);
    skinFallbackWarning = `No skin declared by SMD/ECM. Showing ${basename(fallback)} as a guess — the game picks one of the *.ski variants in this folder at runtime.`;
    console.warn(`[model] ${skinFallbackWarning}`);
  }

  // Discover animation file paths (no parsing yet — clips are loaded lazily on click)
  const animNames: string[] = [];
  let loadClip: ((name: string) => Promise<any>) | undefined;
  if (skelData) {
    const stckPaths = discoverStckPaths(smdPath, smdTcksDir, pkg);
    const stckPathByName = new Map<string, string>();
    for (const stckPath of stckPaths) {
      const clipName = basename(stckPath).replace(/\.stck$/i, '');
      animNames.push(clipName);
      stckPathByName.set(clipName, stckPath);
    }
    console.log(`[model] Animation clips discovered: ${animNames.length}`);

    const clipCache = new ClipCache(50);
    const boneNames = skelData.boneNames;
    loadClip = async (name: string): Promise<any> => {
      const cached = clipCache.get(name);
      if (cached) return cached;
      const path = stckPathByName.get(name);
      if (!path) throw new Error('Animation path not in track directory');
      const stckData = await pkg.read(path);
      if (!stckData) throw new Error('Failed to read STCK file from archive');
      const clip = buildAnimationClip(wasm, stckData, name, boneNames);
      if (!clip) throw new Error('No bone tracks matched or zero duration');
      clipCache.set(name, clip);
      return clip;
    };
  }

  // Callers that own an ECM handle can build an event map here while the
  // `using ecm` scope is still alive.
  const animEventMap = animNames.length > 0
    ? opts?.eventMapFromAnimNames?.(animNames)
    : undefined;

  // Only use skinning if we have animations to play
  const useSkinning = animNames.length > 0 && skelData != null;

  const { THREE } = getThree();
  const group = new THREE.Group();
  // Apply foot offset as group-level Y shift (design doc section 13 step 4)
  if (skelData && skelData.footOffset !== 0) {
    group.position.y -= skelData.footOffset;
  }
  const totalStats: SkinStats = { verts: 0, tris: 0, meshes: 0, textures: 0 };

  if (useSkinning && skelData) {
    const rootBones = skelData.bones.filter(
      (b: any) => !b.parent || b.parent.type !== 'Bone'
    );
    for (const rb of rootBones) group.add(rb);
  }

  for (const skiPath of allSkinPaths) {
    const ski = await tryLoadSki(skiPath, pkg);
    if (!ski) { console.warn('[model] SKI not found:', skiPath); continue; }

    const { meshes, stats } = await loadSkinFile(wasm, pkg, ski.archivePath, ski.data, useSkinning ? skelData!.skeleton : undefined, useSkinning ? skelData!.boneNames : undefined);
    for (const m of meshes) group.add(m);
    totalStats.verts += stats.verts;
    totalStats.tris += stats.tris;
    totalStats.meshes += stats.meshes;
    totalStats.textures += stats.textures;
  }

  if (group.children.length === 0) {
    throw new Error('No meshes could be built from skin files');
  }

  // Set up AnimationMixer and eagerly load the preferred clip
  let initialClip: { name: string; clip: any } | null = null;
  let scheduler: GfxEventScheduler | null = null;
  let currentAction: any = null;
  let mixerFinishedListener: ((evt: any) => void) | null = null;
  type Phase = 'PLAY_SELECTED' | 'TAIL' | 'IDLE_LOOPING';
  let phase: Phase = 'PLAY_SELECTED';
  let tailIdleAction: any = null;
  let loopModePref: LoopMode = opts?.state?.initialFormatState?.loopMode ?? 'loop';
  // The selected action's `.time` clamps at clipDuration under LoopOnce, so
  // we count tail seconds ourselves to drive the cursor across the shaded zone.
  let tailElapsedSec = 0;
  let tailDurSec = 0;
  const v = getViewer(container);
  {
    if (v.mixer) { v.mixer.stopAllAction(); v.mixer = null; }
    v.onBeforeRender = null;
    if (animNames.length > 0 && loadClip) {
      v.mixer = new THREE.AnimationMixer(group);
      // ModelPreview embeds set `initialClipName` directly (no entry state);
      // PCK shell flow leaves it undefined and routes via `initialEntryState`.
      const requestedClipName = opts?.initialClipName ?? opts?.state?.initialEntryState?.clip;
      if (requestedClipName && !animNames.includes(requestedClipName)) {
        console.warn(`[model] requested clip '${requestedClipName}' not in track set; falling back to idle heuristic`);
      }
      const preferredName = (requestedClipName && animNames.includes(requestedClipName))
        ? requestedClipName
        : animNames.find((n) => n.includes(PREFERRED_ANIM_HINT)) ?? animNames[0];
      try {
        const clip = await loadClip(preferredName);
        initialClip = { name: preferredName, clip };
        currentAction = v.mixer.clipAction(clip);
        currentAction.loop = THREE.LoopOnce;
        currentAction.clampWhenFinished = true;
        currentAction.play();
        // Eager first paint covered the static pose; mixer only advances once ticked.
        v.requestRender();
      } catch (e) {
        console.warn('[model] Failed to load initial clip:', preferredName, e);
      }
    }
  }

  const gfxLoader = animNames.length > 0
    ? createGfxLoader(wasm, pkg)
    : null;

  let gfxKinds: Set<ElementBodyKind> = new Set(ALL_ELEMENT_BODY_KINDS);
  let currentClipName: string | null = initialClip?.name ?? null;

  let setTotalDur: (t: number) => void = () => {};

  // Owner of every decoded texture preloaded for the active clip; disposed
  // before each rebuild and on viewer teardown.
  let currentTextures: Map<string, PreloadedTexture> | null = null;
  function disposeCurrentTextures() {
    if (!currentTextures) return;
    for (const tex of currentTextures.values()) tex.dispose?.();
    currentTextures = null;
  }

  /** One pre-resolved GFX event for the active clip. */
  type ScheduledEffect = {
    ev: AnimEvent;
    startSec: number;
    durationSec: number;
    gfx: GfxLike | null;
    resolved: string | null;
  };

  const buildEffectList = async (
    gfxEvents: AnimEvent[],
    isRenderable: IsRenderable,
  ): Promise<{
    effects: ScheduledEffect[];
    preloadedGfx: Map<string, GfxLike>;
    preloadedTextures: Map<string, PreloadedTexture>;
  }> => {
    const resolveGfxPath = (p: string) =>
      pkg.resolveEngine(p, ENGINE_PATH_PREFIXES.gfx);
    const resolvedPaths = gfxEvents.map((ev) => resolveGfxPath(ev.filePath));

    const { preloadedGfx, preloadedTextures } = await preloadGfxGraph({
      wasm,
      pkg,
      seeds: resolvedPaths.filter((p): p is string => p != null),
    }) as { preloadedGfx: Map<string, GfxLike>; preloadedTextures: Map<string, PreloadedTexture> };

    const resolveDur = (p: string) => preloadedGfx.get(resolveGfxPath(p) ?? '') ?? null;
    const effects: ScheduledEffect[] = gfxEvents.map((ev, i) => {
      const resolved = resolvedPaths[i];
      const gfx = resolved ? preloadedGfx.get(resolved) ?? null : null;
      const startSec = ev.startTime / 1000;
      let durationSec: number;
      if (ev.timeSpan > 0) {
        durationSec = ev.timeSpan / 1000;
      } else if (gfx && resolved) {
        const ctx: DurationContext = {
          resolve: resolveDur,
          visiting: new Set([resolved]),
          isRenderable,
        };
        durationSec = computeGfxDurationSec(gfx, ctx);
      } else {
        durationSec = 0;
      }
      return { ev, startSec, durationSec, gfx, resolved };
    });
    return { effects, preloadedGfx, preloadedTextures };
  };

  const rebuildSchedulerForClip = async (clipName: string) => {
    scheduler?.disposeAll();
    scheduler = null;
    const clipDur = currentAction?.getClip?.()?.duration ?? 0;
    // `isRenderable` excludes both unsupported kinds (which would spawn
    // noop runtimes contributing nothing visible) and kinds the user has
    // toggled off — so an unrendered lightning sibling can't keep the
    // cursor waiting for a 3s tail when the actual particle finishes in 1s.
    const isRenderable = (kind: string) =>
      gfxKinds.has(kind as ElementBodyKind) && isRenderableKind(kind as ElementBodyKind);
    const finishWithoutTail = () => { tailDurSec = 0; setTotalDur(clipDur); };
    if (gfxKinds.size === 0) { finishWithoutTail(); return; }
    if (!gfxLoader) { finishWithoutTail(); return; }
    const events = animEventMap?.get(clipName) ?? [];
    // Milestone B: only GFX (type 100). Sound events (101) stay timeline-only.
    const gfxEvents = events.filter((e) => e.type === EVENT_GFX);
    if (gfxEvents.length === 0) { finishWithoutTail(); return; }

    const { effects, preloadedGfx, preloadedTextures } = await buildEffectList(gfxEvents, isRenderable);
    // Hand texture-cache ownership to the new scheduler scope; the previous
    // scope's textures (if any) get freed below before the new map takes over.
    disposeCurrentTextures();
    currentTextures = preloadedTextures;

    // Hold-forever elements yield Infinity from keyPointSetDurationSec; treat
    // them as a no-loop signal — the engine doesn't restart persistent GFX.
    // Scrubber range comes from the *finite* events only so the scrubber
    // stays usable; the loop-wrap predicate becomes unsatisfiable.
    let longestFiniteEnd = 0;
    let anyInfinite = false;
    for (const e of effects) {
      const tEnd = e.startSec + e.durationSec;
      if (!isFinite(tEnd)) anyInfinite = true;
      else if (tEnd > longestFiniteEnd) longestFiniteEnd = tEnd;
    }
    const totalDur = Math.max(clipDur, longestFiniteEnd);
    tailDurSec = anyInfinite ? Infinity : Math.max(0, totalDur - clipDur);
    setTotalDur(totalDur);

    // Index effects by event identity so the spawn callback finds its entry
    // in O(1). Same `AnimEvent` reference flows through scheduler events.
    const effectByEvent = new Map<AnimEvent, ScheduledEffect>();
    for (const e of effects) effectByEvent.set(e.ev, e);

    const localScheduler = createGfxEventScheduler({
      events: gfxEvents,
      bones: skelData?.bones ?? [],
      sceneRoot: group,
      spawn: (ev) => {
        const effect = effectByEvent.get(ev);
        if (!effect?.gfx || !effect.resolved) return createNoopRuntime(THREE);
        // Cycle guard pre-populated with this event's own path so a
        // self-referential Container(gfx_path=self) is caught at depth 1.
        const visiting = new Set<string>([effect.resolved]);
        const resolveGfxPath = (p: string) =>
          pkg.resolveEngine(p, ENGINE_PATH_PREFIXES.gfx);
        const durCtx: DurationContext = {
          resolve: (p) => preloadedGfx.get(resolveGfxPath(p) ?? '') ?? null,
          visiting,
          isRenderable,
        };
        for (const el of effect.gfx.elements) {
          const rt = spawnElementRuntime(el.body, {
            three: THREE,
            gfxScale: ev.gfxScale,
            gfxSpeed: ev.gfxSpeed,
            timeSpanSec: ev.timeSpan > 0
              ? ev.timeSpan / 1000
              : computeElementDurationSec(el, durCtx),
            pkg,
            element: el,
            visiting,
            kindFilter: (kind) => gfxKinds.has(kind),
            preloadedGfx,
            preloadedTextures,
            camera: v.camera,
          });
          // ECM events usually target hooks (HH_*); prefer hooks then fall
          // back to bones, then to scene root if neither matches.
          const hooks = skelData?.hooksByName;
          const bones = skelData?.bones;
          const findAttachPoint = (name: string) => {
            if (!name) return undefined;
            const hook = hooks?.get(name);
            if (hook) return hook;
            return bones?.find((b) => b.name === name);
          };
          attachToHook(rt.root, {
            hookName: ev.hookName,
            hookOffset: ev.hookOffset,
            hookYaw: ev.hookYaw,
            hookPitch: ev.hookPitch,
            hookRot: ev.hookRot,
            bindParent: ev.bindParent,
          }, findAttachPoint, group);
          localScheduler.attachRuntime(rt);
        }
        return createNoopRuntime(THREE);
      },
    });
    scheduler = localScheduler;
  };

  function stopIdleAction() {
    if (!tailIdleAction) return;
    try { tailIdleAction.stop(); } catch { /* mixer already gone */ }
    tailIdleAction = null;
  }

  function enterPlaySelected(timeSec: number) {
    stopIdleAction();
    if (currentAction) {
      currentAction.reset();
      currentAction.time = Math.max(0, timeSec);
      currentAction.play();
    }
    phase = 'PLAY_SELECTED';
    tailElapsedSec = 0;
  }

  function startCrossfadeToIdleIfAvailable() {
    const idleName = currentClipName ? findIdleClipName(animNames, currentClipName) : null;
    if (!idleName || !loadClip) return;
    crossfadeToIdle(idleName).catch((e) => {
      console.warn('[model] crossfade to idle failed; freezing instead:', e);
    });
  }

  function onSelectedClipFinished() {
    if (phase !== 'PLAY_SELECTED') return;
    phase = 'TAIL';
    if (tailDurSec <= 0) {
      onTailComplete();
      return;
    }
    startCrossfadeToIdleIfAvailable();
  }

  async function crossfadeToIdle(idleName: string) {
    const clip = await loadClip!(idleName);
    if (phase !== 'TAIL') return;
    const action = v.mixer.clipAction(clip);
    action.loop = THREE.LoopRepeat;
    action.clampWhenFinished = false;
    action.reset();
    action.play();
    if (currentAction) currentAction.crossFadeTo(action, 0.25, false);
    tailIdleAction = action;
  }

  function onTailComplete() {
    if (phase !== 'TAIL') return;
    stopIdleAction();
    // Predicted durations are estimates; force-dispose stragglers so they
    // don't leak past the visible right edge of the scrubber.
    scheduler?.disposeAll();
    if (loopModePref === 'loop') {
      enterPlaySelected(0);
      scheduler?.onLoop();
    } else if (loopModePref === 'once') {
      phase = 'IDLE_LOOPING';
    }
    // pingpong: deferred — no tail extension.
  }

  function getClipDur(): number {
    return currentAction?.getClip?.()?.duration ?? 0;
  }

  function getVirtualTime(): number {
    if (phase === 'PLAY_SELECTED') {
      return currentAction && isFinite(currentAction.time) ? currentAction.time : 0;
    }
    return getClipDur() + tailElapsedSec;
  }

  function seekVirtual(virtualT: number) {
    if (!v.mixer || !currentAction) return;
    const clipDur = getClipDur();
    if (virtualT < clipDur) {
      enterPlaySelected(virtualT);
    } else {
      currentAction.time = clipDur;
      tailElapsedSec = virtualT - clipDur;
      if (phase === 'PLAY_SELECTED') {
        phase = 'TAIL';
        // tickToClipTime is idempotent on already-fired events; this catches
        // up `last` so subsequent ticks don't replay events the user skipped.
        if (scheduler) scheduler.tickToClipTime(clipDur);
        startCrossfadeToIdleIfAvailable();
      }
    }
    v.mixer.update(0);
  }

  if (v.mixer) {
    mixerFinishedListener = (evt: any) => {
      if (evt.action !== currentAction) return;
      onSelectedClipFinished();
    };
    v.mixer.addEventListener('finished', mixerFinishedListener);
  }

  // Per-frame driver: bone scaling (if needed) + scheduler tick.
  const needsBoneScale = skelData?.bones.some(
    (b: any) => b.userData.wholeScale || b.userData.lenScale,
  );
  if (v.mixer || needsBoneScale) {
    const animBones = skelData?.bones;
    v.onBeforeRender = () => {
      if (needsBoneScale && animBones) applyBoneScalesToHierarchy(animBones);
      // Tail counter + GFX runtimes follow the mixer's timeScale so the speed
      // slider scales the whole pipeline (clip + particles + tail) together.
      // timeScale === 0 (paused) zeroes the dt and freezes everything.
      const dt = v.lastDt * (v.mixer?.timeScale ?? 1);
      if (scheduler) {
        if (currentAction && isFinite(currentAction.time)) {
          scheduler.tickToClipTime(currentAction.time);
        }
        scheduler.tickRuntimes(dt);
      }
      if (phase === 'TAIL' || phase === 'IDLE_LOOPING') {
        tailElapsedSec += dt;
      }
      if (phase === 'TAIL' && tailElapsedSec >= tailDurSec) {
        onTailComplete();
      }
    };
  }

  // Keep the render loop alive in TAIL so `tailElapsedSec` advances. Pausing
  // takes timeScale to 0; gating here lets the loop fully sleep when paused.
  v.isAuxAnimating = () => phase === 'TAIL' && (v.mixer?.timeScale ?? 0) > 0;

  if (initialClip) void rebuildSchedulerForClip(initialClip.name);

  // test-only: read via window.__gfxRuntimeCount in Playwright specs
  if (typeof window !== 'undefined') {
    (window as any).__gfxRuntimeCount = () => scheduler?._activeCount() ?? 0;
    (window as any).__gfxEventsFired = () => scheduler?._eventsFired() ?? 0;
    // diagnostic: dump every active runtime's mesh tree to console.table
    // (world position/scale, material color/opacity, texture present, etc.)
    (window as any).__gfxRuntimeDump = () => {
      const rts = scheduler?._activeRuntimes() ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = [];
      const tmpVec = new THREE.Vector3();
      const tmpScale = new THREE.Vector3();
      rts.forEach((rt, rtIdx) => {
        const root = rt.root;
        if (!root) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        root.traverse((obj: any) => {
          const mat = obj.material;
          const geom = obj.geometry;
          if (!mat || !geom) return;
          obj.getWorldPosition(tmpVec);
          obj.getWorldScale(tmpScale);
          rows.push({
            rt: rtIdx,
            type: obj.type,
            geom: geom.parameters?.width
              ? `${geom.parameters.width.toFixed(2)}x${geom.parameters.height.toFixed(2)}`
              : (geom.attributes?.position?.count ?? '?') + 'v',
            visible: obj.visible,
            wPos: `${tmpVec.x.toFixed(2)},${tmpVec.y.toFixed(2)},${tmpVec.z.toFixed(2)}`,
            wScale: `${tmpScale.x.toFixed(2)},${tmpScale.y.toFixed(2)},${tmpScale.z.toFixed(2)}`,
            color: mat.color ? '#' + mat.color.getHexString() : '?',
            opacity: mat.opacity?.toFixed(2),
            map: mat.map ? 'yes' : 'no',
          });
        });
      });
      // eslint-disable-next-line no-console
      console.table(rows);
      return rows.length;
    };
  }

  // Tear down GFX scheduler + mixer loop listener on viewer disposal.
  // Wraps v.dispose so React unmount / path change / renderer re-init all
  // route through the same cleanup (cf. useRenderEffect + disposeViewer).
  const prevDispose = v.dispose.bind(v);
  v.dispose = () => {
    scheduler?.disposeAll();
    scheduler = null;
    disposeCurrentTextures();
    v.isAuxAnimating = null;
    if (mixerFinishedListener && v.mixer) {
      try { v.mixer.removeEventListener('finished', mixerFinishedListener); } catch { /* mixer already gone */ }
    }
    mixerFinishedListener = null;
    // test-only: drop the hooks so a later viewer doesn't report stale counts
    if (typeof window !== 'undefined') {
      delete (window as any).__gfxRuntimeCount;
      delete (window as any).__gfxEventsFired;
      delete (window as any).__gfxRuntimeDump;
    }
    prevDispose();
  };

  // Tooltip GFX lookup — mirrors the scheduler's spawn-path resolution,
  // sharing `gfxLoader` so repeat hovers are cached. Returns null on any
  // failure; caller uses that to leave the base tooltip unchanged.
  const lookupGfx = gfxLoader
    ? async (filePath: string): Promise<GfxEffect | null> => {
        const resolved = pkg.resolveEngine(filePath, ENGINE_PATH_PREFIXES.gfx);
        if (!resolved) return null;
        const gfx = await gfxLoader.load(resolved);
        return (gfx as GfxEffect | null) ?? null;
      }
    : undefined;

  const sceneApi = mountScene(
    container, group, totalStats,
    opts?.source?.data ?? smdData,
    opts?.source?.ext ?? '.smd',
    animNames, loadClip, initialClip, skelData?.skeleton, animEventMap,
    async (clipName, action) => {
      currentAction = action;
      currentClipName = clipName;
      // scene.ts::stopAllAction already cleared the mixer; just drop the
      // local reference and rearm PLAY_SELECTED for the new clip.
      phase = 'PLAY_SELECTED';
      tailIdleAction = null;
      tailElapsedSec = 0;
      await rebuildSchedulerForClip(clipName);
    },
    {
      lookupGfx,
      gfxToggle: gfxLoader ? {
        kinds: gfxKinds,
        allKinds: ALL_ELEMENT_BODY_KINDS,
        onChange: (next) => {
          // Skip the dispose+rebuild churn when the set is identical
          // (clicking "All" while already All, etc.).
          if (
            next.size === gfxKinds.size
            && [...next].every((k) => gfxKinds.has(k))
          ) return;
          gfxKinds = next;
          // Rebuild the scheduler so currently-spawned runtimes for newly-
          // disabled kinds disappear, and newly-enabled kinds re-fire on the
          // next clip iteration.
          if (currentClipName) void rebuildSchedulerForClip(currentClipName);
        },
      } : undefined,
      warning: skinFallbackWarning,
      // Engine-prefix routing stays here, not in the tooltip: GFX events live
      // under `gfx\`, sound events under `sound\`. Adding event types later
      // (e.g. camera shakes) means extending this switch, not scene.ts.
      resolveFilePath: (ev: AnimEvent) => {
        const prefixes = ev.type === EVENT_GFX
          ? ENGINE_PATH_PREFIXES.gfx
          : ev.type === EVENT_SOUND
            ? ENGINE_PATH_PREFIXES.sound
            : null;
        if (!prefixes) return null;
        return pkg.resolveEngine(ev.filePath, prefixes);
      },
      onNavigateToFile: opts?.onNavigateToFile,
      onLoopModeChange: (m) => { loopModePref = m; },
      timeOps: { getVirtualTime, seekVirtual },
      state: opts?.state,
    },
  );

  // Wire scrubber-extended-range plumbing: rebuildSchedulerForClip computes
  // totalDur after preloading every referenced GFX, then calls setTotalDur,
  // which forwards to scene.ts so the scrubber maps `0..1000` → [0, totalDur].
  setTotalDur = (t: number) => { sceneApi.setTotalDuration(t); };
}

export interface RenderOptions {
  initialClipName?: string;
  /** Host-provided navigation; undefined when the host can't navigate
   *  (diff view, single-file preview). */
  onNavigateToFile?: (path: string) => void;
  state?: ModelStatePorts;
}

export async function renderEcm(
  container: HTMLElement,
  wasm: AutoangelModule,
  pkg: PackageView,
  ecmPath: string,
  opts: RenderOptions,
): Promise<void> {
  await ensureThree();

  const ecmData = await pkg.read(ecmPath);
  if (!ecmData) throw new Error(`File not found: ${ecmPath}`);
  using ecm = wasm.EcmModel.parse(ecmData);

  const smdPath = resolvePath(ecm.skinModelPath, ecmPath);
  const smdData = await pkg.read(smdPath);
  if (!smdData) throw new Error(`File not found: ${smdPath}`);

  // Snapshot additionalSkins before ecm's `using` scope frees it.
  const additionalSkinPaths = [...(ecm.additionalSkins || [])];

  await renderFromSmd(container, wasm, pkg, smdPath, smdData, {
    additionalSkins: { paths: additionalSkinPaths, basePath: ecmPath },
    boneScaleInfo: ecm.boneScaleCount > 0 ? readEcmBoneScales(ecm) : undefined,
    eventMapFromAnimNames: (animNames) => buildAnimEventMap(ecm, animNames),
    source: { data: ecmData, ext: '.ecm' },
    initialClipName: opts.initialClipName,
    onNavigateToFile: opts.onNavigateToFile,
    state: opts.state,
  });
}

export async function renderSmd(
  container: HTMLElement,
  wasm: AutoangelModule,
  pkg: PackageView,
  smdPath: string,
  opts: RenderOptions,
): Promise<void> {
  await ensureThree();

  const smdData = await pkg.read(smdPath);
  if (!smdData) throw new Error(`File not found: ${smdPath}`);

  await renderFromSmd(container, wasm, pkg, smdPath, smdData, {
    initialClipName: opts.initialClipName,
    state: opts.state,
  });
}
