import { spawnElementRuntime, computeElementDurationSec } from './registry';
import { createAnimatedGroupPair } from './animated-group';
import { resolveEnginePath, ENGINE_PATH_PREFIXES } from '../gfx/util/resolveEnginePath';
import { type DurationContext, type DurationElement, keyPointSetDurationSec } from './duration';
import type { ElementBody } from '../gfx/previews/types';
import type { GfxElementRuntime, SpawnOpts } from './types';

type ContainerBody = Extract<ElementBody, { kind: 'container' }>;

export function computeContainerDurationSec(
  el: DurationElement,
  ctx: DurationContext,
): number {
  const ownDur = keyPointSetDurationSec(el.key_point_set);
  if (el.body.kind !== 'container') return ownDur;
  const path = el.body.gfx_path;
  if (!path) return ownDur;
  if (ctx.visiting.has(path)) return ownDur;
  const child = ctx.resolve(path);
  if (!child) return ownDur;
  const next = new Set(ctx.visiting); next.add(path);
  const childCtx: DurationContext = { ...ctx, visiting: next };
  let max = ownDur;
  for (const childEl of child.elements) {
    const d = computeElementDurationSec(childEl, childCtx);
    if (d > max) max = d;
  }
  return max;
}

/**
 * Runtime for GfxContainer elements (type 200). Lazily loads the referenced
 * nested .gfx, spawns one runtime per child element into the container's
 * group, and animates the group via the element's own KeyPointSet if any.
 *
 * Mirrors `A3DGFXContainer::TickAnimation` engine semantics for the common
 * case. Skipped for this milestone: loop_flag nested-restart, out_color
 * tint, dummy_use_g_scale.
 */
export function spawnContainerRuntime(
  body: ContainerBody,
  opts: SpawnOpts,
): GfxElementRuntime {
  const { outer, animated, animator } = createAnimatedGroupPair(
    opts.three, opts.element, opts.gfxScale,
  );
  const children: GfxElementRuntime[] = [];
  let elapsedMs = 0;
  let elapsedSec = 0;
  let disposed = false;
  // Until the async load settles, `finished` stays false so the scheduler
  // can't decide the container is done before its children even mount.
  let loadResolved = false;

  (async () => {
    try {
      const resolved = resolveEnginePath(
        body.gfx_path,
        ENGINE_PATH_PREFIXES.gfx,
        opts.findFile,
      );
      if (!resolved || disposed) return;
      if (opts.visiting?.has(resolved)) {
        console.warn('[gfx-runtime] container cycle skipped:', resolved);
        return;
      }
      const visiting = new Set(opts.visiting ?? []);
      visiting.add(resolved);

      const gfx = await opts.loader.load(resolved);
      if (disposed) return;
      const elements: any[] = (gfx as any)?.elements ?? [];
      for (const el of elements) {
        if (disposed) break;
        const rt = spawnElementRuntime(el.body, {
          ...opts,
          element: el,
          gfxSpeed: opts.gfxSpeed * (body.play_speed ?? 1),
          visiting,
        });
        animated.add(rt.root);
        children.push(rt);
      }
    } catch (e) {
      console.warn('[gfx-runtime] container load failed:', e);
    } finally {
      loadResolved = true;
    }
  })();

  return {
    root: outer,
    tick(dt) {
      elapsedMs += dt * 1000 * opts.gfxSpeed;
      elapsedSec += dt;
      animator?.tickTo(elapsedMs, animated);
      for (const c of children) c.tick(dt);
    },
    dispose() {
      disposed = true;
      for (const c of children) c.dispose();
      outer.removeFromParent?.();
    },
    finished: () => {
      // Engine truncates contained GFX to the event's timeSpan when set.
      if (opts.timeSpanSec !== undefined && elapsedSec >= opts.timeSpanSec) {
        return true;
      }
      if (!loadResolved) return false;
      for (const c of children) {
        if (!c.finished?.()) return false;
      }
      return true;
    },
  };
}
