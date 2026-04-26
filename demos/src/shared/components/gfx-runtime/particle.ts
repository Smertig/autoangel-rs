import { d3dBlendToThreeFactor } from '../gfx/util/blendModes';
import { buildSimConfig } from '../gfx/previews/particle/config';
import { createParticleMesh } from '../gfx/previews/particle/mesh';
import { createSimState, tickSim } from '../gfx/previews/particle/simulation';
import { resolvePreloadedTexture } from '../gfx/previews/particle/texture';
import { createAnimatedGroupPair } from './animated-group';
import { createNoopRuntime } from './noop';
import { type DurationContext, type DurationElement, keyPointSetDurationSec } from './duration';
import type { ElementBody } from '../gfx/previews/types';
import type { GfxElementRuntime, SpawnOpts } from './types';

type ParticleBody = Extract<ElementBody, { kind: 'particle' }>;

// Emitter `ttl` and `emission_rate` are NOT factored in yet — a particle whose
// KPS ends well before its emitter winds down may be cut short. Acceptable for
// one-shot ECM events; revisit if persistent buff-style GFX truncate.
export function computeParticleDurationSec(
  el: DurationElement,
  _ctx: DurationContext,
): number {
  return keyPointSetDurationSec(el.key_point_set);
}

/**
 * Adapter that wraps the standalone particle simulation as a GfxElementRuntime
 * the ECM scheduler can drive. The texture loads asynchronously: the mesh
 * starts un-textured (colored quads from per-instance color) and `setTexture`
 * swaps in the real texture once `loadParticleTexture` resolves. If the texture
 * can't be resolved or fails to load, particles stay as colored quads —
 * acceptable degradation, same as the standalone preview's no-texture path.
 */
export function spawnParticleRuntime(
  body: ParticleBody,
  opts: SpawnOpts,
): GfxElementRuntime {
  // Engine drops textureless particles: A3DGFXRenderSlot binds NULL + a
  // PS_NO_TEX shader that this game's shaders.pck doesn't ship. Such
  // elements are editor leftovers — render nothing instead of opaque
  // white quads. The standalone particle preview keeps the colored-quad
  // fallback for explicit inspection.
  if (!opts.element.tex_file) return createNoopRuntime(opts.three);

  const THREE = opts.three;
  const { outer, animated, animator } = createAnimatedGroupPair(
    THREE, opts.element, opts.gfxScale,
  );
  let elapsedMs = 0;

  const cfg = buildSimConfig(body, 1, 1, opts.element.affectors);
  // puffCount=0 — engine A3DParticleEmitter starts empty (m_fRemainder=0)
  // and emits gradually at the configured rate. The default puffCount=30
  // exists for the standalone preview so the canvas isn't blank when you
  // first open it; for an event-fired GFX it spawns 30 particles in the
  // same frame at the hook, producing a white blob instead of a stream.
  const state = createSimState(0);
  const rng = Math.random;

  const element = opts.element;
  const preTex = resolvePreloadedTexture(element.tex_file, opts.findFile, opts.preloadedTextures, 'particle');
  if (!preTex) return createNoopRuntime(THREE);
  const mesh = createParticleMesh(cfg, {
    texture: preTex,
    srcBlend: d3dBlendToThreeFactor(element.src_blend, THREE),
    dstBlend: d3dBlendToThreeFactor(element.dest_blend, THREE),
  } as any, THREE);
  animated.add(mesh.object3D);

  let elapsed = 0;
  let finished = false;
  let disposed = false;

  return {
    root: outer,
    tick(dt) {
      const scaled = dt * opts.gfxSpeed;
      elapsed += dt;
      elapsedMs += scaled * 1000;
      animator?.tickTo(elapsedMs, animated);
      tickSim(scaled, state, cfg, rng);
      mesh.writeState(state);
      if (opts.timeSpanSec !== undefined && elapsed >= opts.timeSpanSec) {
        finished = true;
      }
    },
    dispose() {
      disposed = true;
      mesh.dispose();
      outer.removeFromParent?.();
    },
    finished: () => finished,
  };
}
