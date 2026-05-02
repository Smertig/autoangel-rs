import type { AutoangelModule } from '../../../../types/autoangel';
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

export function pickDefaultClip(
  smdPath: string,
  tcksDir: string | undefined,
  pkg: PackageView,
): { animNames: string[]; defaultClipName: string | null; defaultStckPath: string | null } {
  const stckPaths = discoverStckPaths(smdPath, tcksDir, pkg);
  const animNames = stckPaths.map((p) => basename(p).replace(/\.stck$/i, ''));
  let idx = animNames.findIndex((n) => n.includes(PREFERRED_ANIM_HINT));
  if (idx < 0 && animNames.length > 0) idx = 0;
  return {
    animNames,
    defaultClipName: idx >= 0 ? animNames[idx] : null,
    defaultStckPath: idx >= 0 ? stckPaths[idx] : null,
  };
}
