// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DefaultPreview } from '../previews/DefaultPreview';

const decalBody: any = {
  kind: 'decal',
  width: 4.5,
  height: 2.0,
  rot_from_view: true,
  grnd_norm_only: false,
  no_scale: [false, true],
  org_pt: undefined,
  z_offset: 0.1,
  match_surface: undefined,
  surface_use_parent_dir: undefined,
  max_extent: undefined,
  yaw_effect: true,
  tail_lines: ['Affector=...'],
};

const element: any = { type_id: 100, name: 'd1', tex_file: '', src_blend: 5, dest_blend: 6 };
const ctx: any = { path: '', ext: '.gfx', getData: async () => new Uint8Array(), wasm: {} };

describe('DefaultPreview', () => {
  it('renders one row per non-null field, skipping tail_lines from flow', () => {
    render(<DefaultPreview body={decalBody} element={element} context={ctx} expanded={true} />);
    expect(screen.getByText('width')).toBeDefined();
    expect(screen.getByText('height')).toBeDefined();
    expect(screen.getByText('z_offset')).toBeDefined();
    // tail_lines does not appear as a regular label row; it only surfaces inside <details>
    expect(screen.queryByText('tail_lines')).toBeNull();
  });
  it('pairs *_min / *_max into a single row within nested emitter block', () => {
    const particleBody: any = {
      kind: 'particle',
      quota: 100,
      particle_width: 1,
      particle_height: 1,
      three_d_particle: false,
      facing: 0,
      emitter: {
        emission_rate: 50, angle: 0.5, speed: 1, par_acc: undefined,
        acc_dir: [0, 0, 0], acc: 0, ttl: 2.0,
        color_min: 0xFFFF0000, color_max: 0xFF0000FF,
        scale_min: 0.5, scale_max: 1.5,
        rot_min: undefined, rot_max: undefined,
        is_surface: false, is_bind: false,
        is_drag: undefined, drag_pow: undefined,
        par_ini_dir: undefined,
        is_use_hsv_interp: undefined,
        shape: { shape: 'point' },
      },
      scale_no_off: undefined, no_scale: undefined, org_pt: undefined,
      is_use_par_uv: undefined, is_start_on_grnd: undefined,
      stop_emit_when_fade: undefined, init_random_texture: undefined,
      z_offset: undefined,
      tail_lines: [],
    };
    render(<DefaultPreview body={particleBody} element={element} context={ctx} expanded={true} />);
    // Paired labels for color_min/color_max and scale_min/scale_max should appear
    // under the base name (without the _min/_max suffix).
    expect(screen.getByText('color')).toBeDefined();
    expect(screen.getByText('scale')).toBeDefined();
  });
});
