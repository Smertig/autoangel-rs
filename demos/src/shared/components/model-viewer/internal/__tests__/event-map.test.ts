import { describe, it, expect } from 'vitest';
import { buildAnimEventMap } from '../event-map';

const ecmStub = {
  combineActionCount: 1,
  combineActionEventCount: () => 1,
  combineActionBaseActionCount: () => 1,
  combineActionBaseActionName: () => 'idle',
  getEvent: () => ({
    event_type: 100,
    start_time: 500,
    time_span: 1000,
    once: true,
    fx_file_path: 'effects\\spark.gfx',
    hook_name: 'HH_hand',
    hook_offset: [1, 2, 3],
    hook_yaw: 0.1,
    hook_pitch: 0.2,
    hook_rot: 0.3,
    bind_parent: true,
    fade_out: 0,
    use_model_alpha: false,
    gfx_scale: 1.5,
    gfx_speed: 0.8,
  }),
};

describe('buildAnimEventMap', () => {
  it('carries all fields end-to-end for matching anim names', () => {
    const map = buildAnimEventMap(ecmStub as any, ['idle']);
    const evs = map.get('idle');
    expect(evs).toHaveLength(1);
    const e = evs![0];
    expect(e.type).toBe(100);
    expect(e.filePath).toBe('spark.gfx');
    expect(e.startTime).toBe(500);
    expect(e.timeSpan).toBe(1000);
    expect(e.once).toBe(true);
    expect(e.hookName).toBe('HH_hand');
    expect(e.hookOffset).toEqual([1, 2, 3]);
    expect(e.hookYaw).toBeCloseTo(0.1);
    expect(e.hookPitch).toBeCloseTo(0.2);
    expect(e.hookRot).toBeCloseTo(0.3);
    expect(e.bindParent).toBe(true);
    expect(e.gfxScale).toBeCloseTo(1.5);
    expect(e.gfxSpeed).toBeCloseTo(0.8);
  });

  it('defaults gfxScale/gfxSpeed to 1 when EcmEvent returns null for them', () => {
    const soundEcm = {
      ...ecmStub,
      getEvent: () => ({
        ...ecmStub.getEvent(),
        event_type: 101,
        gfx_scale: null,  // EcmEvent.gfx_scale is Option<f32>; None → null in JS
        gfx_speed: null,
      }),
    };
    const map = buildAnimEventMap(soundEcm as any, ['idle']);
    const e = map.get('idle')![0];
    expect(e.gfxScale).toBe(1);
    expect(e.gfxSpeed).toBe(1);
  });
});
