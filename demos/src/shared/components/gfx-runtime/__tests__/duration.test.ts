import { describe, it, expect } from 'vitest';
import { computeElementDurationSec, computeGfxDurationSec } from '../registry';
import { type DurationContext } from '../duration';

const noKps = (kind: any, body: any) => ({
  type_id: 0, name: '', src_blend: 0, dest_blend: 0,
  repeat_count: 0, repeat_delay: 0, tex_file: '',
  tex_row: 0, tex_col: 0, tex_interval: 0, tile_mode: 0,
  z_enable: 0, is_dummy: 0, priority: 0,
  body: { kind, ...body }, affectors: [], key_point_set: undefined,
});

const withKps = (el: any, start_time: number, spans: number[]) => ({
  ...el,
  key_point_set: {
    start_time,
    keypoints: spans.map((time_span) => ({
      interpolate_mode: 1, time_span, position: [0, 0, 0], color: 0,
      scale: 1, direction: [0, 0, 0, 1], rad_2d: 0, controllers: [],
    })),
  },
});

const ctx = (overrides: Partial<DurationContext> = {}): DurationContext => ({
  resolve: () => null,
  visiting: new Set(),
  isRenderable: () => true,
  ...overrides,
});

describe('computeElementDurationSec (registry dispatch)', () => {
  it('returns 0 for a particle with no KeyPointSet', () => {
    const el = noKps('particle', { quota: 1, particle_width: 1, particle_height: 1,
      three_d_particle: false, facing: 0, emitter: {} });
    expect(computeElementDurationSec(el, ctx())).toBe(0);
  });

  it('sums KeyPointSet start_time + spans (ms → sec)', () => {
    const el = withKps(noKps('particle', { quota: 1, particle_width: 1, particle_height: 1,
      three_d_particle: false, facing: 0, emitter: {} }), 200, [500, 1000, 300]);
    expect(computeElementDurationSec(el, ctx())).toBeCloseTo(2.0);
  });

  it('returns Infinity for a -1 (hold forever) span', () => {
    const el = withKps(noKps('particle', { quota: 1, particle_width: 1, particle_height: 1,
      three_d_particle: false, facing: 0, emitter: {} }), 0, [-1]);
    expect(computeElementDurationSec(el, ctx())).toBe(Infinity);
  });

  it('returns 0 for non-renderable kinds (filtered by isRenderable)', () => {
    const el = withKps(noKps('particle', { quota: 1, particle_width: 1, particle_height: 1,
      three_d_particle: false, facing: 0, emitter: {} }), 0, [500]);
    const isRenderable = (k: string) => k !== 'particle';
    expect(computeElementDurationSec(el, ctx({ isRenderable }))).toBe(0);
  });
});

describe('computeGfxDurationSec', () => {
  it('returns the max element duration', () => {
    const a = withKps(noKps('particle', { quota: 1, particle_width: 1, particle_height: 1,
      three_d_particle: false, facing: 0, emitter: {} }), 0, [500]);
    const b = withKps(noKps('particle', { quota: 1, particle_width: 1, particle_height: 1,
      three_d_particle: false, facing: 0, emitter: {} }), 0, [1500]);
    const gfx = { elements: [a, b] };
    expect(computeGfxDurationSec(gfx, ctx())).toBeCloseTo(1.5);
  });

  it('recurses into container with cycle guard', () => {
    const inner = withKps(noKps('particle', { quota: 1, particle_width: 1, particle_height: 1,
      three_d_particle: false, facing: 0, emitter: {} }), 0, [800]);
    const innerGfx = { elements: [inner] };
    const container = noKps('container', { gfx_path: 'gfx/foo.gfx' });
    const outerGfx = { elements: [container] };
    const resolve = (p: string) => p === 'gfx/foo.gfx' ? innerGfx : null;
    expect(computeGfxDurationSec(outerGfx, ctx({ resolve }))).toBeCloseTo(0.8);
  });

  it('handles container self-cycle without infinite recursion', () => {
    const container = noKps('container', { gfx_path: 'gfx/self.gfx' });
    const selfGfx = { elements: [container] };
    const resolve = (p: string) => p === 'gfx/self.gfx' ? selfGfx : null;
    expect(computeGfxDurationSec(selfGfx, ctx({ resolve, visiting: new Set(['gfx/self.gfx']) }))).toBe(0);
  });

  it('excludes a non-renderable element from the max', () => {
    const renderable = withKps(noKps('particle', { quota: 1, particle_width: 1, particle_height: 1,
      three_d_particle: false, facing: 0, emitter: {} }), 0, [500]);
    const filtered = withKps(noKps('particle', { quota: 1, particle_width: 1, particle_height: 1,
      three_d_particle: false, facing: 0, emitter: {} }), 0, [3000]);
    const gfx = { elements: [renderable, filtered] };
    // Filter out the 3s sibling — totalDur should reflect only the 0.5s renderable.
    let calls = 0;
    const isRenderable = () => {
      calls++;
      // Reject every other call: alternating, so the 3000ms sibling is dropped first.
      return calls % 2 === 1;
    };
    expect(computeGfxDurationSec(gfx, ctx({ isRenderable }))).toBeCloseTo(0.5);
  });
});
