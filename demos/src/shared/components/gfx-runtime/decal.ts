import { createAnimatedGroupPair } from './animated-group';
import { createNoopRuntime } from './noop';
import { createDecalMesh } from '../gfx/previews/decal/mesh';
import { resolvePreloadedTexture } from '../gfx/previews/particle/texture';
import { type DurationContext, type DurationElement, keyPointSetDurationSec } from './duration';
import type { ElementBody } from '../gfx/previews/types';
import type { GfxElementRuntime, SpawnOpts } from './types';

type DecalBody = Extract<ElementBody, { kind: 'decal' }>;

export function computeDecalDurationSec(
  el: DurationElement,
  _ctx: DurationContext,
): number {
  return keyPointSetDurationSec(el.key_point_set);
}

/**
 * Runtime for decal elements (types 100 + 102). Type 101 (screen-space)
 * routes to noop — requires orthographic/HUD pass not in MVP.
 *
 * Mirrors A3DDecalEx::Fill_Verts_3D default (type 100) and Update_Billboard
 * (type 102) engine paths via the shared createDecalMesh factory.
 */
export function spawnDecalRuntime(
  body: DecalBody,
  opts: SpawnOpts,
): GfxElementRuntime {
  // Engine: no tex_file → no render slot, element is a no-op.
  if (!opts.element.tex_file) return createNoopRuntime(opts.three);
  // Type 101 has no runtime — surfaced by elementSkipReason with a label.
  if (opts.element.type_id === 101) return createNoopRuntime(opts.three);

  const preTex = resolvePreloadedTexture(opts.element.tex_file, opts.findFile, opts.preloadedTextures, 'decal');
  if (!preTex) return createNoopRuntime(opts.three);
  const { outer, animated, animator } = createAnimatedGroupPair(
    opts.three, opts.element, opts.gfxScale,
  );
  const decal = createDecalMesh(body, opts.element, opts.three);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  decal.setTexture(preTex as any);
  animated.add(decal.object3D);

  let elapsed = 0;
  let elapsedMs = 0;
  let finished = false;
  let disposed = false;

  return {
    root: outer,
    tick(dt) {
      const scaled = dt * opts.gfxSpeed;
      elapsed += dt;
      elapsedMs += scaled * 1000;
      // No KPS → mesh stays at constructor defaults (white, opaque, atlas
      // frame 0). Engine parity for static decals — Update_3D without
      // affectors keeps m_color = white and atlas only advances when a KPS
      // is present.
      const sample = animator?.tickTo(elapsedMs, animated);
      if (sample) decal.writeFrame(sample, elapsedMs);
      if (opts.timeSpanSec !== undefined && elapsed >= opts.timeSpanSec) finished = true;
    },
    dispose() {
      disposed = true;
      decal.dispose();
      outer.removeFromParent?.();
    },
    finished: () => finished,
  };
}
