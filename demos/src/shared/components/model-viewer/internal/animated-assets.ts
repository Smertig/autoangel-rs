import type { AutoangelModule } from '../../../../types/autoangel';
import type { Animation, SmdAction } from 'autoangel';
import type { PackageView } from '@shared/package';
import { basename } from '@shared/util/path';
import {
  collectSkinPaths, discoverStckPaths, resolvePath, tryFallbackSkiPath,
} from '@shared/util/model-dependencies';
import { buildSkeleton } from './skeleton';
import { PREFERRED_ANIM_HINT } from './render-smd';

export type SkeletonBuildResult = ReturnType<typeof buildSkeleton>;

export type HoverLogTag = '[smd-hover]' | '[ecm-hover]';

/** Returns `null` when the BON is absent or fails to parse so callers can
 *  fall through to a static render — broken BONs are common enough in the
 *  wild that the hover preview shouldn't surface them as errors. */
export async function loadBonSkeleton(
  wasm: AutoangelModule,
  pkg: PackageView,
  bonRelPath: string,
  ownerPath: string,
  logTag: HoverLogTag,
): Promise<SkeletonBuildResult | null> {
  if (!bonRelPath) return null;
  const bonData = await pkg.read(resolvePath(bonRelPath, ownerPath));
  if (!bonData) return null;
  try {
    return buildSkeleton(wasm, bonData);
  } catch (e) {
    console.warn(`${logTag} skeleton build failed:`, e);
    return null;
  }
}

interface ResolveAnimatedSkinPathsOptions {
  pkg: PackageView;
  /** SMD path — referenced skin paths resolve relative to this. */
  basePath: string;
  smdSkinPaths: string[];
  /** ECM (or other parent) path — additional skin paths resolve relative to
   *  this. Defaults to `basePath` for the plain-SMD case. */
  originPath?: string;
  additionalSkinPaths?: string[];
}

/** Throws if neither the SMD references nor the heuristic fallback yields
 *  any SKI — the hover wrapper turns that into the format-specific UI. */
export async function resolveAnimatedSkinPaths(
  opts: ResolveAnimatedSkinPathsOptions,
): Promise<string[]> {
  const { pkg, basePath, smdSkinPaths, originPath = basePath, additionalSkinPaths = [] } = opts;
  const all = collectSkinPaths(basePath, smdSkinPaths, originPath, additionalSkinPaths);
  if (all.length > 0) return all;
  const fallback = await tryFallbackSkiPath(basePath, pkg);
  if (!fallback) throw new Error('No skin files referenced by SMD');
  return [fallback];
}

/** Tagged-union return for the clip-source dispatcher. `embedded` lights up
 *  for BON v<6 models whose timeline lives in the skeleton plus an
 *  `SmdAction` list; `stck` is the original modern path with one STCK file
 *  per clip; `none` means we have neither a usable embedded timeline nor any
 *  STCKs to enumerate. */
export type AnimatedClipsSource =
  | {
      kind: 'stck';
      animNames: string[];
      defaultClipName: string | null;
      defaultStckPath: string | null;
      /** Parallel to `animNames`; `render-smd.ts` uses this to map clip name → archive path. */
      stckPaths: string[];
    }
  | {
      kind: 'embedded';
      animNames: string[];
      defaultClipName: string | null;
      defaultAction: SmdAction | null;
    }
  | { kind: 'none'; animNames: []; defaultClipName: null };

export interface PickClipOptions {
  smdPath: string;
  smdTcksDir: string | undefined;
  smdActions: SmdAction[];
  embeddedAnimation: Animation | null;
  pkg: PackageView;
}

export function pickDefaultClip(opts: PickClipOptions): AnimatedClipsSource {
  const useEmbedded =
    opts.embeddedAnimation != null
    && opts.smdActions.length > 0
    && opts.smdActions.every((a) => a.tck_file == null);

  if (useEmbedded) {
    const animNames = opts.smdActions.map((a) => a.name);
    const found = opts.smdActions.find((a) => a.name.includes(PREFERRED_ANIM_HINT))
      ?? opts.smdActions[0]
      ?? null;
    return {
      kind: 'embedded',
      animNames,
      defaultClipName: found?.name ?? null,
      defaultAction: found,
    };
  }

  const stckPaths = discoverStckPaths(opts.smdPath, opts.smdTcksDir, opts.pkg);
  const animNames = stckPaths.map((p) => basename(p).replace(/\.stck$/i, ''));
  if (animNames.length === 0) return { kind: 'none', animNames: [], defaultClipName: null };
  let idx = animNames.findIndex((n) => n.includes(PREFERRED_ANIM_HINT));
  if (idx < 0) idx = 0;
  return {
    kind: 'stck',
    animNames,
    defaultClipName: animNames[idx],
    defaultStckPath: stckPaths[idx],
    stckPaths,
  };
}
