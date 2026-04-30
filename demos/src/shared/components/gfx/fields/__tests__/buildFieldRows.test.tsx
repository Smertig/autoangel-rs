// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildFieldRowsFor } from '../index';
import { EMPTY_PACKAGE_VIEW } from '@shared/package';

const fakeCtx: any = { pkg: EMPTY_PACKAGE_VIEW, onNavigateToFile: undefined };

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

  it('builds grid_decal_3d rows', () => {
    const body: any = {
      kind: 'grid_decal_3d',
      w_number: 4,
      h_number: 4,
      vertices: [],
      grid_size: 10,
      z_offset: 0.5,
      animation_keys: [
        { time_ms: 0, vertices: [] },
        { time_ms: 500, vertices: [] },
      ],
      aff_by_scl: false,
      rot_from_view: true,
      offset_height: 0.25,
      always_on_ground: true,
    };
    const element: any = {
      tex_file: 'foo.dds',
      tex_row: 1,
      tex_col: 1,
      tex_interval: 0,
      src_blend: 5,
      dest_blend: 6,
      key_point_set: undefined,
    };
    const rows = buildFieldRowsFor(body, element, fakeCtx);
    const labels = rows.map((r: any) => 'divider' in r ? '---' : r.label);
    expect(labels).toMatchSnapshot();
  });
});
