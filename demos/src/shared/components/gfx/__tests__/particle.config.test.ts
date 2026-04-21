import { describe, it, expect } from 'vitest';
import { buildSimConfig } from '../previews/particle/config';

function pointBody() {
  return {
    kind: 'particle' as const,
    emitter: {
      shape: { shape: 'point' as const },
      par_ini_dir: [0, 0, 1] as [number, number, number],
      angle: 0,
      speed: 5,
      acc: 0,
      par_acc: 0,
      acc_dir: [0, 1, 0] as [number, number, number],
      drag_pow: undefined,
      color_min: 0xffffffff,
      color_max: 0xffffffff,
      scale_min: 1,
      scale_max: 1,
      rot_min: 0,
      rot_max: 0,
      emission_rate: 10,
      ttl: 2,
    },
    quota: 100,
    init_random_texture: false,
    particle_width: 1,
    particle_height: 1,
    atlas_rows: 1,
    atlas_cols: 1,
  };
}

function ellipsoidBody() {
  const b = pointBody();
  b.emitter.shape = {
    shape: 'ellipsoid' as const,
    area_size: [2, 3, 1] as [number, number, number],
    is_avg_gen: false,
    alpha_seg: 8,
    beta_seg: 8,
  } as any;
  (b.emitter as any).is_surface = true;
  return b;
}

describe('buildSimConfig', () => {
  it('maps point emitter body → point ShapeCfg', () => {
    const cfg = buildSimConfig(pointBody() as any, 1, 1);
    expect(cfg.shape).toEqual({ kind: 'point' });
    expect(cfg.speed).toBe(5);
    // cfg.quota is pool size = min(floor(rate*ttl)+1, body.quota, 750).
    // With rate=10, ttl=2 → natural=21 < body.quota=100 → 21.
    expect(cfg.quota).toBe(21);
    expect(cfg.emissionRate).toBe(10);
    expect(cfg.ttl).toBe(2);
  });

  it('maps ellipsoid emitter body → ellipsoid ShapeCfg with isSurface/isAvgGen/segs', () => {
    const cfg = buildSimConfig(ellipsoidBody() as any, 1, 1);
    expect(cfg.shape).toMatchObject({
      kind: 'ellipsoid',
      areaSize: [2, 3, 1],
      isSurface: true,
      isAvgGen: false,
      alphaSeg: 8,
      betaSeg: 8,
    });
  });
});
