import type * as ThreeModule from 'three';
import type { PreloadedTexture } from '../../gfx-runtime/types';
import type { GfxLike } from '../../gfx-runtime/duration';
import type { HoverCanvasRenderArgs } from '@shared/components/hover-preview/types';
import { resolvePath } from '@shared/util/model-dependencies';
import { ensureThree, getThree } from './three';
import { disposeSkinMeshes, loadAllSkins } from './mesh';
import {
  type BoneScaleData,
  applyBoneScales,
  applyBoneScalesToHierarchy,
  computeFootOffset,
  readEcmBoneScales,
} from './skeleton';
import { buildAnimationClip } from './clip';
import { buildAnimEventMap, EVENT_GFX, type AnimEvent } from './event-map';
import { setupHoverScene } from './hover-scene';
import { disposePreloadedTextures, preloadGfxGraph } from '../../gfx-runtime/preload';
import { createGfxEventScheduler } from '../../gfx-runtime/scheduler';
import { isRenderableKind } from '../../gfx-runtime/registry';
import { ENGINE_PATH_PREFIXES } from '../../gfx/util/resolveEnginePath';
import { createSpawnFromPreloaded } from './gfx-spawn';
import {
  loadBonSkeleton,
  pickDefaultClip,
  resolveAnimatedSkinPaths,
  type SkeletonBuildResult,
} from './animated-assets';

type SkelData = SkeletonBuildResult & { footOffset: number };

/**
 * Animated hover preview for ECM: matches the full EcmViewer's first paint
 * — default clip plays on loop with skeleton + skin variants + bone scaling
 * + GFX events firing — minus controls, sound events, and tail/idle
 * cross-fade. Falls back to a static render when the skeleton is missing
 * (some ECMs reference a `.bon` that isn't shipped).
 */
export async function renderEcmHoverPreview(
  args: HoverCanvasRenderArgs,
): Promise<() => void> {
  const { canvas, path, data, pkg, wasm, cancelled } = args;

  await ensureThree();
  const { THREE } = getThree();

  // Pull everything off the wasm-owned ECM in one scope; events stay
  // unfiltered because the default clip name isn't known yet (depends on
  // STCK enumeration further down).
  let smdRelPath: string;
  let additionalSkinPaths: string[];
  let boneScaleInfo: { entries: BoneScaleData[]; isNew: boolean; baseBone: string | undefined } | undefined;
  let allEvents: Map<string, AnimEvent[]>;
  {
    using ecm = wasm.EcmModel.parse(data);
    smdRelPath = ecm.skinModelPath;
    additionalSkinPaths = [...(ecm.additionalSkins || [])];
    if (ecm.boneScaleCount > 0) boneScaleInfo = readEcmBoneScales(ecm);
    allEvents = buildAnimEventMap(ecm);
  }

  const smdPath = resolvePath(smdRelPath, path);
  const smdData = await pkg.read(smdPath);
  if (!smdData) throw new Error(`SMD not found: ${smdPath}`);
  if (cancelled()) return () => {};

  let smdSkinPaths: string[] = [];
  let smdTcksDir: string | undefined;
  let skelRelPath = '';
  {
    using smd = wasm.SmdModel.parse(smdData);
    smdSkinPaths = smd.skinPaths || [];
    smdTcksDir = smd.tcksDir;
    skelRelPath = smd.skeletonPath;
  }

  // Missing BON falls through to a static render — some ECMs reference a
  // `.bon` that isn't shipped in the pack.
  const built = await loadBonSkeleton(wasm, pkg, skelRelPath, smdPath, '[ecm-hover]');
  if (cancelled()) return () => {};
  const skel: SkelData | null = built ? { ...built, footOffset: 0 } : null;

  if (skel && boneScaleInfo) {
    applyBoneScales(skel.bones, boneScaleInfo.entries, boneScaleInfo.isNew);
    skel.footOffset = computeFootOffset(
      skel.bones, skel.boneNames, boneScaleInfo.baseBone, skel.tmpRoot,
    );
  }

  const allSkinPaths = await resolveAnimatedSkinPaths({
    pkg, basePath: smdPath, smdSkinPaths, originPath: path, additionalSkinPaths,
  });
  if (cancelled()) return () => {};

  const { defaultClipName, defaultStckPath } = skel
    ? pickDefaultClip(smdPath, smdTcksDir, pkg)
    : { defaultClipName: null, defaultStckPath: null };
  const animEvents: AnimEvent[] = defaultClipName
    ? (allEvents.get(defaultClipName) ?? []).filter((e) => e.type === EVENT_GFX)
    : [];

  const useSkinning = skel != null && defaultStckPath != null;
  const skinOpts = useSkinning
    ? { skeleton: skel!.skeleton, boneNames: skel!.boneNames }
    : undefined;

  // Skin loads, STCK fetch, and GFX preload are independent — fan out so
  // the slowest single read bounds time-to-first-paint.
  const skinsPromise = loadAllSkins(wasm, pkg, allSkinPaths, skinOpts);
  const stckPromise: Promise<Uint8Array | null> = defaultStckPath
    ? pkg.read(defaultStckPath)
    : Promise.resolve(null);
  const gfxSeeds = animEvents
    .map((e) => pkg.resolveEngine(e.filePath, ENGINE_PATH_PREFIXES.gfx))
    .filter((p): p is string => p != null);
  const gfxPromise = gfxSeeds.length > 0
    ? preloadGfxGraph({ wasm, pkg, seeds: gfxSeeds })
    : Promise.resolve({ preloadedGfx: new Map(), preloadedTextures: new Map() });

  const [perSkin, stckData, gfx] = await Promise.all([skinsPromise, stckPromise, gfxPromise]);
  const preloadedGfx = gfx.preloadedGfx as Map<string, GfxLike>;
  const preloadedTextures = gfx.preloadedTextures as Map<string, PreloadedTexture>;
  if (cancelled()) {
    for (const ms of perSkin) disposeSkinMeshes(ms);
    disposePreloadedTextures(preloadedTextures);
    return () => {};
  }

  const clip: ThreeModule.AnimationClip | null = (skel && stckData && defaultClipName)
    ? buildAnimationClip(wasm, stckData, defaultClipName, skel.boneNames)
    : null;

  let renderer: ThreeModule.WebGLRenderer | null = null;
  let mixer: ThreeModule.AnimationMixer | null = null;
  let scheduler: ReturnType<typeof createGfxEventScheduler> | null = null;
  let rafId: number | null = null;

  const disposeAll = () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    scheduler?.disposeAll();
    mixer?.stopAllAction();
    renderer?.dispose();
    for (const ms of perSkin) disposeSkinMeshes(ms);
    disposePreloadedTextures(preloadedTextures);
  };

  try {
    const allMeshes = perSkin.flat();
    if (allMeshes.length === 0) throw new Error('No meshes built from skin files');

    const group = new THREE.Group();
    if (skel?.footOffset) group.position.y -= skel.footOffset;
    if (useSkinning && skel) {
      const rootBones = skel.bones.filter(
        (b: any) => !b.parent || b.parent.type !== 'Bone',
      );
      for (const rb of rootBones) group.add(rb);
    }
    for (const m of allMeshes) group.add(m);

    const { scene, camera, renderer: r } = setupHoverScene(THREE, canvas, group);
    renderer = r;

    if (!clip) {
      renderer.render(scene, camera);
      return disposeAll;
    }

    mixer = new THREE.AnimationMixer(group);
    const action = mixer.clipAction(clip);
    action.loop = THREE.LoopRepeat;
    action.play();

    if (animEvents.length > 0) {
      const resolveGfxPath = (p: string) =>
        pkg.resolveEngine(p, ENGINE_PATH_PREFIXES.gfx);
      const localScheduler = createGfxEventScheduler({
        events: animEvents,
        bones: skel!.bones,
        sceneRoot: group,
        spawn: createSpawnFromPreloaded({
          three: THREE,
          pkg,
          skel,
          sceneRoot: group,
          camera,
          preloadedGfx,
          preloadedTextures,
          isRenderable: (kind) => isRenderableKind(kind),
          kindFilter: () => true,
          lookupEffect: (ev) => {
            const resolved = resolveGfxPath(ev.filePath);
            const fx = resolved ? preloadedGfx.get(resolved) : null;
            return fx && resolved ? { fx, resolved } : null;
          },
          attachRuntime: (rt) => localScheduler.attachRuntime(rt),
        }),
      });
      scheduler = localScheduler;
    }

    const needsBoneScale = skel?.bones.some(
      (b: any) => b.userData.wholeScale || b.userData.lenScale,
    ) ?? false;

    let lastT = performance.now();
    let lastClipTime = 0;
    const tick = (now: number) => {
      const dt = (now - lastT) / 1000;
      lastT = now;
      mixer!.update(dt);
      if (needsBoneScale) applyBoneScalesToHierarchy(skel!.bones);
      if (scheduler) {
        const t = action.time;
        // LoopRepeat resets `time` to 0 on wrap; detect that and notify the
        // scheduler so non-once events become eligible again.
        if (t < lastClipTime) scheduler.onLoop();
        scheduler.tickToClipTime(t);
        scheduler.tickRuntimes(dt);
        lastClipTime = t;
      }
      renderer!.render(scene, camera);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return disposeAll;
  } catch (e) {
    disposeAll();
    throw e;
  }
}
