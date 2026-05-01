import type * as ThreeModule from 'three';
import type { HoverCanvasRenderArgs } from '@shared/components/hover-preview/types';
import { basename } from '@shared/util/path';
import {
  collectSkinPaths, discoverStckPaths, resolvePath, tryFallbackSkiPath,
} from '@shared/util/model-dependencies';
import { ensureThree, getThree } from './three';
import { disposeSkinMeshes, loadAllSkins } from './mesh';
import { buildSkeleton } from './skeleton';
import { buildAnimationClip } from './clip';
import { setupHoverScene } from './hover-scene';
import { PREFERRED_ANIM_HINT } from './render-smd';

type SkelData = ReturnType<typeof buildSkeleton>;

/**
 * Animated hover preview for SMD: matches the full SmdViewer's first paint —
 * default clip plays on loop with skeleton + skin — minus controls / GFX
 * events / bone scaling. Picks the same clip the full viewer would (the
 * `站立` / standing heuristic, falling back to the first clip).
 *
 * Falls back to a static render when the skeleton or animation tracks are
 * unavailable, mirroring `renderFromSmd`'s permissive behavior — some SMDs
 * (e.g. portal markers) reference a `.bon` that isn't shipped in the pack.
 */
export async function renderSmdHoverPreview(
  args: HoverCanvasRenderArgs,
): Promise<() => void> {
  const { canvas, path, data, pkg, wasm, cancelled } = args;

  await ensureThree();
  const { THREE } = getThree();

  let skinPaths: string[] = [];
  let tcksDir: string | undefined;
  let skelRelPath = '';
  {
    using smd = wasm.SmdModel.parse(data);
    skinPaths = smd.skinPaths || [];
    tcksDir = smd.tcksDir;
    skelRelPath = smd.skeletonPath;
  }

  let skel: SkelData | null = null;
  if (skelRelPath) {
    const bonData = await pkg.read(resolvePath(skelRelPath, path));
    if (cancelled()) return () => {};
    if (bonData) {
      try { skel = buildSkeleton(wasm, bonData); }
      catch (e) { console.warn('[smd-hover] skeleton build failed:', e); }
    }
  }

  const allSkinPaths = collectSkinPaths(path, skinPaths, path, []);
  if (allSkinPaths.length === 0) {
    const fallback = await tryFallbackSkiPath(path, pkg);
    if (!fallback) throw new Error('No skin files referenced by SMD');
    allSkinPaths.push(fallback);
  }
  if (cancelled()) return () => {};

  // Pick default clip iff the skeleton loaded — without bones, animation
  // can't apply.
  let defaultClipName: string | null = null;
  let defaultStckPath: string | null = null;
  if (skel) {
    const stckPaths = discoverStckPaths(path, tcksDir, pkg);
    const animNames = stckPaths.map((p) => basename(p).replace(/\.stck$/i, ''));
    defaultClipName = animNames.find((n) => n.includes(PREFERRED_ANIM_HINT)) ?? animNames[0] ?? null;
    if (defaultClipName) defaultStckPath = stckPaths[animNames.indexOf(defaultClipName)];
  }

  // Skin meshes bind to the skeleton iff there's an animation to drive them
  // — otherwise SkinnedMesh hits an inconsistent state on first render.
  const useSkinning = skel != null && defaultStckPath != null;

  // Skin loads and (optional) clip fetch are independent — kick them off in
  // parallel so the slowest single read bounds time-to-first-paint.
  const skinOpts = useSkinning
    ? { skeleton: skel!.skeleton, boneNames: skel!.boneNames }
    : undefined;
  const skinsPromise = loadAllSkins(wasm, pkg, allSkinPaths, skinOpts);
  const stckPromise: Promise<Uint8Array | null> = defaultStckPath
    ? pkg.read(defaultStckPath)
    : Promise.resolve(null);

  const [perSkin, stckData] = await Promise.all([skinsPromise, stckPromise]);
  if (cancelled()) {
    for (const ms of perSkin) disposeSkinMeshes(ms);
    return () => {};
  }

  const clip: ThreeModule.AnimationClip | null = (skel && stckData && defaultClipName)
    ? buildAnimationClip(wasm, stckData, defaultClipName, skel.boneNames)
    : null;

  let renderer: ThreeModule.WebGLRenderer | null = null;
  let mixer: ThreeModule.AnimationMixer | null = null;
  let rafId: number | null = null;

  const disposeAll = () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    mixer?.stopAllAction();
    renderer?.dispose();
    for (const ms of perSkin) disposeSkinMeshes(ms);
  };

  try {
    const allMeshes = perSkin.flat();
    if (allMeshes.length === 0) throw new Error('No meshes built from skin files');

    const group = new THREE.Group();
    if (useSkinning && skel) {
      // Root bones become children of the group; skinned meshes reference
      // them via their bound skeleton object.
      const rootBones = skel.bones.filter(
        (b: any) => !b.parent || b.parent.type !== 'Bone',
      );
      for (const rb of rootBones) group.add(rb);
    }
    for (const m of allMeshes) group.add(m);

    const { scene, camera, renderer: r } = setupHoverScene(THREE, canvas, group);
    renderer = r;

    if (clip) {
      mixer = new THREE.AnimationMixer(group);
      const action = mixer.clipAction(clip);
      action.loop = THREE.LoopRepeat;
      action.play();

      let lastT = performance.now();
      const tick = (now: number) => {
        const dt = (now - lastT) / 1000;
        lastT = now;
        mixer!.update(dt);
        renderer!.render(scene, camera);
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    } else {
      renderer.render(scene, camera);
    }

    return disposeAll;
  } catch (e) {
    disposeAll();
    throw e;
  }
}
