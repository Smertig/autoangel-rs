import type { ElementBody } from '../types';
import type { KpController } from '../../util/gfxTypes';
import { hasMotionAffector, resolvePoolSize, type ShapeCfg, type SimConfig } from './simulation';

type ParticleBody = Extract<ElementBody, { kind: 'particle' }>;

function buildShapeCfg(emitter: ParticleBody['emitter']): ShapeCfg {
  const s = emitter.shape;
  switch (s.shape) {
    case 'point':
      return { kind: 'point' };
    case 'ellipsoid':
      return {
        kind: 'ellipsoid',
        areaSize: s.area_size,
        isSurface: emitter.is_surface ?? false,
        isAvgGen: s.is_avg_gen ?? false,
        alphaSeg: Math.max(1, s.alpha_seg ?? 10),
        betaSeg: Math.max(1, s.beta_seg ?? 10),
      };
    case 'cylinder':
      return {
        kind: 'cylinder',
        areaSize: s.area_size,
        isSurface: emitter.is_surface ?? false,
        isAvgGen: s.is_avg_gen ?? false,
        alphaSeg: Math.max(1, s.alpha_seg ?? 10),
        betaSeg: Math.max(1, s.beta_seg ?? 10),
      };
    default:
      // Caller gates on shape; fallback to point keeps runtime safe.
      return { kind: 'point' };
  }
}

export function buildSimConfig(
  body: ParticleBody,
  atlasRows: number,
  atlasCols: number,
  affectors: readonly KpController[] = [],
): SimConfig {
  const e = body.emitter;
  const parIniDir: [number, number, number] = e.par_ini_dir ?? [0, 0, 1];
  return {
    quota: resolvePoolSize(body.quota, e.emission_rate, e.ttl),
    emissionRate: e.emission_rate,
    ttl: e.ttl,
    angle: e.angle,
    speed: e.speed,
    parAcc: e.par_acc ?? 0,
    acc: e.acc,
    accDir: e.acc_dir,
    dragPow: e.drag_pow,
    colorMin: e.color_min,
    colorMax: e.color_max,
    scaleMin: e.scale_min,
    scaleMax: e.scale_max,
    rotMin: e.rot_min ?? 0,
    rotMax: e.rot_max ?? 0,
    parIniDir,
    atlasRows,
    atlasCols,
    atlasFrames: atlasRows * atlasCols,
    initRandomTexture: !!body.init_random_texture,
    particleWidth: body.particle_width,
    particleHeight: body.particle_height,
    shape: buildShapeCfg(e),
    affectors,
    hasMotionAffector: hasMotionAffector(affectors),
  };
}
