// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildFieldRowsFor } from '../index';

const fakeCtx: any = { findFile: () => null, onNavigateToFile: undefined };

describe('buildFieldRowsFor', () => {
  it('builds particle rows', () => {
    const body: any = {
      kind: 'particle',
      quota: 100,
      particle_width: 1, particle_height: 1,
      three_d_particle: false, facing: 0,
      emitter: {
        emission_rate: 60, ttl: 1, angle: 0, speed: 1,
        is_bind: false, is_surface: false,
        color_min: 0xffffffff, color_max: 0xffffffff,
        scale_min: 1, scale_max: 1,
        acc: 0, acc_dir: [0, 1, 0],
      },
    };
    const element: any = { tex_file: 'x.dds', tex_row: 1, tex_col: 1, src_blend: 5, dest_blend: 6 };
    const rows = buildFieldRowsFor(body, element, fakeCtx);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.find((r: any) => r.label === 'quota')).toBeTruthy();
  });

  it('returns generic rows for unknown kinds via default builder', () => {
    const body: any = { kind: 'lightning_ex', some_field: 42 };
    const element: any = {};
    const rows = buildFieldRowsFor(body, element, fakeCtx);
    expect(rows.length).toBeGreaterThan(0);
  });
});
