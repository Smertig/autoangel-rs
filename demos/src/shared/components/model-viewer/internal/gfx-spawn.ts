import type * as ThreeModule from 'three';
import type { PackageView } from '@shared/package';
import type { AnimEvent } from './event-map';
import type { SkeletonBuildResult } from './animated-assets';
import type { GfxLike, IsRenderable } from '../../gfx-runtime/duration';
import type { GfxElementRuntime, PreloadedTexture } from '../../gfx-runtime/types';
import type { ElementBody } from '../../gfx/types';
import { spawnElementRuntime, computeElementDurationSec } from '../../gfx-runtime/registry';
import { createNoopRuntime } from '../../gfx-runtime/noop';
import { attachToHook } from '../../gfx-runtime/hook';
import { ENGINE_PATH_PREFIXES } from '../../gfx/util/resolveEnginePath';

export interface SpawnFromPreloadedOptions {
  three: typeof ThreeModule;
  pkg: PackageView;
  /** `null` skel → all hook lookups miss → events attach to `sceneRoot`. */
  skel: Pick<SkeletonBuildResult, 'hooksByName' | 'bonesByName'> | null;
  sceneRoot: any;
  camera: any;
  preloadedGfx: Map<string, GfxLike>;
  preloadedTextures: Map<string, PreloadedTexture>;
  isRenderable: IsRenderable;
  kindFilter: (kind: ElementBody['kind']) => boolean;
  /** Resolve `event → { fx, resolved }`. ECM hover does
   *  `preloadedGfx.get(resolveGfxPath(ev.filePath))`; SMD viewer uses a
   *  prebuilt `Map<AnimEvent, ScheduledEffect>`. Return `null` for noop. */
  lookupEffect: (ev: AnimEvent) => { fx: GfxLike; resolved: string } | null;
  /** Late-bound: the scheduler doesn't exist yet at factory call time
   *  (chicken-and-egg with `createGfxEventScheduler({ spawn })`), so the
   *  caller closes over `localScheduler` after constructing it. */
  attachRuntime: (rt: GfxElementRuntime) => void;
}

export function createSpawnFromPreloaded(
  opts: SpawnFromPreloadedOptions,
): (ev: AnimEvent) => GfxElementRuntime {
  const {
    three: THREE, pkg, skel, sceneRoot, camera, preloadedGfx, preloadedTextures,
    isRenderable, kindFilter, lookupEffect, attachRuntime,
  } = opts;

  const resolveGfxPath = (p: string) => pkg.resolveEngine(p, ENGINE_PATH_PREFIXES.gfx);
  const findAttachPoint = (name: string) => {
    if (!name) return undefined;
    return skel?.hooksByName.get(name) ?? skel?.bonesByName.get(name);
  };

  return (ev) => {
    const lookup = lookupEffect(ev);
    if (!lookup) return createNoopRuntime(THREE);
    const { fx, resolved } = lookup;
    const visiting = new Set<string>([resolved]);
    const durCtx = {
      resolve: (p: string) => preloadedGfx.get(resolveGfxPath(p) ?? '') ?? null,
      visiting,
      isRenderable,
    };
    for (const el of fx.elements) {
      const rt = spawnElementRuntime(el.body, {
        three: THREE,
        gfxScale: ev.gfxScale,
        gfxSpeed: ev.gfxSpeed,
        timeSpanSec: ev.timeSpan > 0 ? ev.timeSpan / 1000 : computeElementDurationSec(el, durCtx),
        pkg,
        element: el,
        visiting,
        kindFilter,
        preloadedGfx,
        preloadedTextures,
        camera,
      });
      attachToHook(rt.root, {
        hookName: ev.hookName,
        hookOffset: ev.hookOffset,
        hookYaw: ev.hookYaw,
        hookPitch: ev.hookPitch,
        hookRot: ev.hookRot,
        bindParent: ev.bindParent,
      }, findAttachPoint, sceneRoot);
      attachRuntime(rt);
    }
    return createNoopRuntime(THREE);
  };
}
