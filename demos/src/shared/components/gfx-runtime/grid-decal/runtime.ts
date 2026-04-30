import { createAnimatedGroupPair } from '../animated-group';
import { createNoopRuntime } from '../noop';
import { createGridDecalMesh } from './mesh';
import { resolvePreloadedTexture } from '../texture';
import { type DurationContext, type DurationElement, keyPointSetDurationSec } from '../duration';
import type { ElementBody } from '../../gfx/types';
import type { GfxElementRuntime, SpawnOpts } from '../types';

type GridDecalBody = Extract<ElementBody, { kind: 'grid_decal_3d' }>;

/**
 * Duration for grid_decal_3d = max(KPS duration, lastKey.time_ms / 1000).
 * The KPS animates RGBA / scale / position; GridAnimation animates per-vertex
 * positions+colors. Either may outlive the other, and the engine waits for
 * both before considering the element finished.
 */
export function computeGridDecalDurationSec(
  el: DurationElement,
  _ctx: DurationContext,
): number {
  const kpsDur = keyPointSetDurationSec(el.key_point_set);
  if (el.body.kind !== 'grid_decal_3d') return kpsDur;
  const keys = el.body.animation_keys;
  const gridDurSec = keys.length > 0 ? keys[keys.length - 1].time_ms / 1000 : 0;
  return Math.max(kpsDur, gridDurSec);
}

/**
 * Runtime for grid_decal_3d (engine type 210). Mirrors A3DGridDecalEx::Update_3D
 * + Fill_Verts_3D — vertex grid is rebuilt every tick from GridAnimation lerp
 * + (optionally) view-basis projection, then KP color is composed per vertex
 * and KP alpha drives material.opacity.
 */
export function spawnGridDecalRuntime(
  body: GridDecalBody,
  opts: SpawnOpts,
): GfxElementRuntime {
  // Engine: no tex_file → no render slot.
  if (!opts.element.tex_file) return createNoopRuntime(opts.three);
  const preTex = resolvePreloadedTexture(
    opts.element.tex_file, opts.pkg, opts.preloadedTextures, 'grid_decal_3d',
  );
  if (!preTex) return createNoopRuntime(opts.three);

  const { outer, animated, animator } = createAnimatedGroupPair(
    opts.three, opts.element, opts.gfxScale,
  );
  const mesh = createGridDecalMesh(
    body, opts.element, opts.three, opts.camera ?? null,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mesh.setTexture(preTex as any);
  animated.add(mesh.object3D);

  let elapsed = 0;
  let elapsedMs = 0;
  let finished = false;

  return {
    root: outer,
    tick(dt) {
      const scaled = dt * opts.gfxSpeed;
      elapsed += dt;
      elapsedMs += scaled * 1000;
      const sample = animator?.tickTo(elapsedMs, animated);
      if (sample) {
        // aff_by_scl=false: cancel the keypoint scale that tickTo wrote onto
        // animated. Must run *after* tickTo (which set the scale) and *before*
        // writeFrame (so this frame's mesh isn't drawn at the wrong scale).
        if (!body.aff_by_scl) animated.scale.setScalar(1);
        mesh.writeFrame(sample, elapsedMs);
      }
      if (opts.timeSpanSec !== undefined && elapsed >= opts.timeSpanSec) finished = true;
    },
    dispose() {
      mesh.dispose();
      outer.removeFromParent?.();
    },
    finished: () => finished,
  };
}
