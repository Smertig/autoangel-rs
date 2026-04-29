import { spawnParticleRuntime, computeParticleDurationSec } from './particle/runtime';
import { spawnContainerRuntime, computeContainerDurationSec } from './container';
import { spawnDecalRuntime, computeDecalDurationSec } from './decal/runtime';
import { createNoopRuntime } from './noop';
import type { DurationContext, DurationElement, GfxLike } from './duration';
import type { ElementBody, ElementBodyKind } from '../gfx/types';
import type { GfxElement } from '../../../types/autoangel';
import type { GfxElementRuntime, SpawnOpts } from './types';

/** Kinds that produce a real (non-noop) runtime. Keep in sync with the switch
 *  in `spawnElementRuntime`. */
export const RENDERABLE_KINDS: ReadonlySet<ElementBodyKind> = new Set([
  'particle', 'container', 'decal',
]);

export function isRenderableKind(kind: ElementBodyKind): boolean {
  return RENDERABLE_KINDS.has(kind);
}

export function spawnElementRuntime(
  body: ElementBody,
  opts: SpawnOpts,
): GfxElementRuntime {
  if (opts.kindFilter && !opts.kindFilter(body.kind)) {
    return createNoopRuntime(opts.three);
  }
  switch (body.kind) {
    case 'particle':
      return spawnParticleRuntime(body, opts);
    case 'container':
      return spawnContainerRuntime(body, opts);
    case 'decal':
      return spawnDecalRuntime(body, opts);
    default:
      return createNoopRuntime(opts.three);
  }
}

/** Mirrors the spawn switch — each renderable kind's helper lives next to
 *  its spawner. Non-renderable kinds return 0 (they spawn as noops). */
export function computeElementDurationSec(
  el: DurationElement,
  ctx: DurationContext,
): number {
  const kind = el.body.kind;
  if (!ctx.isRenderable(kind)) return 0;
  switch (kind) {
    case 'particle': return computeParticleDurationSec(el, ctx);
    case 'container': return computeContainerDurationSec(el, ctx);
    case 'decal': return computeDecalDurationSec(el, ctx);
    default: return 0;
  }
}

/** Predicted lifetime of a whole GFX file = max over its renderable elements. */
export function computeGfxDurationSec(
  gfx: GfxLike | null | undefined,
  ctx: DurationContext,
): number {
  if (!gfx) return 0;
  let max = 0;
  for (const el of gfx.elements) {
    const d = computeElementDurationSec(el, ctx);
    if (d > max) max = d;
  }
  return max;
}

/**
 * Auto-loop signal: true when at least one runtime implements `finished()`
 * and every runtime that implements it is finished. Runtimes without
 * `finished()` (infinite emitters) play forever — we never auto-loop a
 * scene composed exclusively of them.
 */
export function allActiveFinished(runtimes: Iterable<GfxElementRuntime>): boolean {
  let anyHasFinished = false;
  for (const rt of runtimes) {
    if (rt.finished) {
      anyHasFinished = true;
      if (!rt.finished()) return false;
    }
  }
  return anyHasFinished;
}

/**
 * Label describing why an element won't be visible in the model-viewer
 * preview, or `null` if it will render. Drives the GFX tooltip's
 * "not previewed" summary. Keep in sync with `spawnElementRuntime` +
 * per-spawner skip rules.
 */
export function elementSkipReason(element: GfxElement): string | null {
  const body = element.body;
  if (!body) return 'unknown';
  switch (body.kind) {
    case 'particle':
    case 'container':
      return null;
    case 'decal':
      // Type 101 (screen-space) parses but has no runtime — needs an
      // orthographic/HUD pass not in MVP.
      return element.type_id === 101 ? 'decal (screen-space)' : null;
    default:
      return body.kind;
  }
}
