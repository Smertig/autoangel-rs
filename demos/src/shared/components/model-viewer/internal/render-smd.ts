import type { AutoangelModule } from '../../../../types/autoangel';
import { resolvePath, collectSkinPaths, tryLoadSki, discoverStckPaths } from '@shared/util/model-dependencies';
import { ensureThree, getThree } from './three';
import { type GetFile, withWarnOnThrow } from './paths';
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
import { type AnimEvent, buildAnimEventMap } from './event-map';
import { getViewer } from './viewer';
import { mountScene } from './scene';

// "站立" (standing) — preferred default animation clip
const PREFERRED_ANIM_HINT = '\u7AD9\u7ACB';

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
  getFile: GetFile,
  smdPath: string,
  smdData: Uint8Array,
  listFiles: ((prefix: string) => string[]) | undefined,
  opts?: {
    additionalSkins?: { paths: string[]; basePath: string };
    boneScaleInfo?: { entries: BoneScaleData[]; isNew: boolean; baseBone: string | undefined };
    eventMapFromAnimNames?: (animNames: string[]) => Map<string, AnimEvent[]> | undefined;
    source?: { data: Uint8Array; ext: string };
    initialClipName?: string;
  },
): Promise<void> {
  let smdSkinPaths: string[] = [];
  let smdTcksDir: string | undefined;
  let skelData: { skeleton: any; bones: any[]; boneNames: string[]; tmpRoot: any; footOffset: number } | null = null;
  {
    using smd = wasm.SmdModel.parse(smdData);
    smdSkinPaths = smd.skinPaths || [];
    smdTcksDir = smd.tcksDir;
    const bonRelPath: string = smd.skeletonPath;
    if (bonRelPath) {
      const bonPath = resolvePath(bonRelPath, smdPath);
      const bonData = await getFile(bonPath);
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
  if (allSkinPaths.length === 0) {
    throw new Error('No skin files referenced by SMD');
  }

  // Discover animation file paths (no parsing yet — clips are loaded lazily on click)
  const animNames: string[] = [];
  let loadClip: ((name: string) => Promise<any>) | undefined;
  if (listFiles && skelData) {
    const stckPaths = discoverStckPaths(smdPath, smdTcksDir, listFiles);
    const stckPathByName = new Map<string, string>();
    for (const stckPath of stckPaths) {
      const clipName = stckPath.split('\\').pop()!.replace(/\.stck$/i, '');
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
      const stckData = await getFile(path);
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
    const ski = await tryLoadSki(skiPath, getFile);
    if (!ski) { console.warn('[model] SKI not found:', skiPath); continue; }

    const { meshes, stats } = await loadSkinFile(wasm, getFile, ski.archivePath, ski.data, useSkinning ? skelData!.skeleton : undefined, useSkinning ? skelData!.boneNames : undefined);
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
  {
    const v = getViewer(container);
    if (v.mixer) { v.mixer.stopAllAction(); v.mixer = null; }
    v.onBeforeRender = null;
    if (animNames.length > 0 && loadClip) {
      v.mixer = new THREE.AnimationMixer(group);
      if (opts?.initialClipName && !animNames.includes(opts.initialClipName)) {
        console.warn(`[model] initialClipName '${opts.initialClipName}' not in track set; falling back to idle heuristic`);
      }
      const preferredName = (opts?.initialClipName && animNames.includes(opts.initialClipName))
        ? opts.initialClipName
        : animNames.find((n) => n.includes(PREFERRED_ANIM_HINT)) ?? animNames[0];
      try {
        const clip = await loadClip(preferredName);
        initialClip = { name: preferredName, clip };
        v.mixer.clipAction(clip).play();
      } catch (e) {
        console.warn('[model] Failed to load initial clip:', preferredName, e);
      }

      if (skelData?.bones.some((b: any) => b.userData.wholeScale || b.userData.lenScale)) {
        const animBones = skelData!.bones;
        v.onBeforeRender = () => {
          applyBoneScalesToHierarchy(animBones);
        };
      }
    }
  }

  mountScene(
    container, group, totalStats,
    opts?.source?.data ?? smdData,
    opts?.source?.ext ?? '.smd',
    animNames, loadClip, initialClip, skelData?.skeleton, animEventMap,
  );
}

export interface RenderOptions {
  listFiles?: (prefix: string) => string[];
  initialClipName?: string;
}

export async function renderEcm(
  container: HTMLElement,
  wasm: AutoangelModule,
  getFileRaw: GetFile,
  ecmPath: string,
  opts: RenderOptions = {},
): Promise<void> {
  await ensureThree();
  const getFile = withWarnOnThrow(getFileRaw);

  const ecmData = await getFile(ecmPath);
  if (!ecmData) throw new Error(`File not found: ${ecmPath}`);
  using ecm = wasm.EcmModel.parse(ecmData);

  const smdPath = resolvePath(ecm.skinModelPath, ecmPath);
  const smdData = await getFile(smdPath);
  if (!smdData) throw new Error(`File not found: ${smdPath}`);

  // Snapshot additionalSkins before ecm's `using` scope frees it.
  const additionalSkinPaths = [...(ecm.additionalSkins || [])];

  await renderFromSmd(container, wasm, getFile, smdPath, smdData, opts.listFiles, {
    additionalSkins: { paths: additionalSkinPaths, basePath: ecmPath },
    boneScaleInfo: ecm.boneScaleCount > 0 ? readEcmBoneScales(ecm) : undefined,
    eventMapFromAnimNames: (animNames) => buildAnimEventMap(ecm, animNames),
    source: { data: ecmData, ext: '.ecm' },
    initialClipName: opts.initialClipName,
  });
}

export async function renderSmd(
  container: HTMLElement,
  wasm: AutoangelModule,
  getFileRaw: GetFile,
  smdPath: string,
  opts: RenderOptions = {},
): Promise<void> {
  await ensureThree();
  const getFile = withWarnOnThrow(getFileRaw);

  const smdData = await getFile(smdPath);
  if (!smdData) throw new Error(`File not found: ${smdPath}`);

  await renderFromSmd(container, wasm, getFile, smdPath, smdData, opts.listFiles, {
    initialClipName: opts.initialClipName,
  });
}
