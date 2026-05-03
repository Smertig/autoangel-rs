import type * as ThreeModule from 'three';
import type { SmdAction } from 'autoangel';
import type { HoverCanvasRenderArgs } from '@shared/components/hover-preview/types';
import { ensureThree, getThree } from './three';
import { disposeSkinMeshes, loadAllSkins } from './mesh';
import { buildAnimationClip } from './clip';
import { setupHoverScene } from './hover-scene';
import {
  type AnimatedClipsSource,
  loadBonSkeleton,
  pickDefaultClip,
  resolveAnimatedSkinPaths,
  type SkeletonBuildResult,
} from './animated-assets';

type SkelData = SkeletonBuildResult;

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
  let smdActions: SmdAction[] = [];
  {
    const smd = wasm.parseSmd(data);
    skinPaths = smd.skin_paths || [];
    tcksDir = smd.tcks_dir ?? undefined;
    skelRelPath = smd.skeleton_path;
    smdActions = smd.actions ?? [];
  }

  const skel: SkelData | null = await loadBonSkeleton(wasm, pkg, skelRelPath, path, '[smd-hover]');
  if (cancelled()) return () => {};

  const allSkinPaths = await resolveAnimatedSkinPaths({ pkg, basePath: path, smdSkinPaths: skinPaths });
  if (cancelled()) return () => {};

  // Pick default clip iff the skeleton loaded — without bones, animation
  // can't apply. Embedded mode lights up for BON v<6 models; the hover's
  // STCK path stays null in that case (Tasks 5/6 wire embedded playback).
  const clipsSource: AnimatedClipsSource = skel
    ? pickDefaultClip({
        smdPath: path,
        smdTcksDir: tcksDir,
        smdActions,
        embeddedAnimation: skel.embedded_animation ?? null,
        pkg,
      })
    : { mode: 'none' as const, animNames: [], defaultClipName: null };
  const defaultClipName = clipsSource.defaultClipName;
  const defaultStckPath = clipsSource.mode === 'stck' ? clipsSource.defaultStckPath : null;

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
