// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';

// Stub the canvas hook so the component tree mounts without touching three.js.
vi.mock('../previews/particle/useParticleCanvas', () => ({
  useParticleCanvas: () => ({
    canvasRef: { current: null },
    readoutRef: { current: null },
  }),
}));

import { render, screen, cleanup } from '@testing-library/react';
import { ParticlePreview } from '../previews/ParticlePreview';

afterEach(cleanup);

const body: any = {
  kind: 'particle',
  quota: 500,
  particle_width: 1,
  particle_height: 1,
  three_d_particle: false,
  facing: 0,
  scale_no_off: false,
  no_scale: undefined,
  org_pt: undefined,
  is_use_par_uv: false,
  is_start_on_grnd: false,
  stop_emit_when_fade: false,
  init_random_texture: true,
  z_offset: undefined,
  emitter: {
    emission_rate: 120,
    angle: 0.3,
    speed: 2.0,
    par_acc: 0,
    acc_dir: [0, 1, 0],
    acc: 0,
    ttl: 2.0,
    color_min: 0xffffe080,
    color_max: 0xffff4000,
    scale_min: 0.3,
    scale_max: 1.0,
    rot_min: 0,
    rot_max: 0,
    is_surface: false,
    is_bind: false,
    is_drag: undefined,
    drag_pow: undefined,
    par_ini_dir: undefined,
    is_use_hsv_interp: undefined,
    shape: { shape: 'point' },
  },
  tail_lines: [],
};

const element: any = {
  type_id: 120,
  name: 'spark',
  tex_file: '粒子\\火星1.dds',
  src_blend: 5,
  dest_blend: 2,
  tex_row: 1,
  tex_col: 1,
  repeat_count: 0,
  repeat_delay: 0,
  tex_interval: 0,
  tile_mode: 0,
  z_enable: 0,
  is_dummy: 0,
  priority: 0,
};

const ctx: any = {
  path: '',
  ext: '.gfx',
  getData: async () => new Uint8Array(),
  listFiles: () => [],
  wasm: {},
};

describe('ParticlePreview', () => {
  it('renders tinted thumb when collapsed', () => {
    render(<ParticlePreview body={body} element={element} context={ctx} expanded={false} />);
    expect(screen.getByText('P')).toBeDefined();
  });

  it('surfaces key emitter fields when expanded', () => {
    render(<ParticlePreview body={body} element={element} context={ctx} expanded={true} />);
    expect(screen.getByText('quota')).toBeDefined();
    expect(screen.getByText('emission_rate')).toBeDefined();
    expect(screen.getByText('ttl')).toBeDefined();
    expect(screen.getByText('angle')).toBeDefined();
    expect(screen.getByText('speed')).toBeDefined();
  });

  it('formats blend mode as readable label', () => {
    render(<ParticlePreview body={body} element={element} context={ctx} expanded={true} />);
    // src=5 dst=2  → SrcAlpha / One  (additive)
    expect(screen.getByText(/SrcAlpha \/ One\s+\(additive\)/)).toBeDefined();
  });

  it('renders simulation for ellipsoid shape (not ShapePending)', () => {
    const ellipsoidBody = {
      ...body,
      emitter: {
        ...body.emitter,
        shape: {
          shape: 'ellipsoid',
          area_size: [1, 1, 1],
          is_avg_gen: false,
          alpha_seg: 8,
          beta_seg: 8,
        },
      },
    };
    render(
      <ParticlePreview
        body={ellipsoidBody}
        element={element}
        context={ctx}
        expanded={true}
      />,
    );
    // Field panel still renders.
    expect(screen.getByText('emission_rate')).toBeDefined();
    // The "coming later" placeholder should NOT appear for ellipsoid.
    expect(screen.queryByText(/simulation for/i)).toBeNull();
  });

  it('still shows ShapePending for unsupported shapes (cylinder)', () => {
    const cylinderBody = {
      ...body,
      emitter: {
        ...body.emitter,
        shape: {
          shape: 'cylinder',
          area_size: [1, 1, 1],
          is_avg_gen: false,
          alpha_seg: 8,
          beta_seg: 8,
        },
      },
    };
    render(
      <ParticlePreview
        body={cylinderBody}
        element={element}
        context={ctx}
        expanded={true}
      />,
    );
    expect(screen.getByText(/simulation for/i)).toBeDefined();
    expect(screen.getByText('cylinder')).toBeDefined();
  });
});
