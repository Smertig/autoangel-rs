import { describe, it, expect } from 'vitest';
import { buildAnimEventMap, clusterEvents, type AnimEvent } from '../event-map';

function ev(overrides: Partial<AnimEvent> & Pick<AnimEvent, 'type' | 'startTime'>): AnimEvent {
  return {
    filePath: 'x.gfx',
    timeSpan: 0,
    once: false,
    hookName: '',
    hookOffset: [0, 0, 0],
    hookYaw: 0,
    hookPitch: 0,
    hookRot: 0,
    bindParent: false,
    gfxScale: 1,
    gfxSpeed: 1,
    ...overrides,
  };
}

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
    expect(e.filePath).toBe('effects\\spark.gfx');
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

describe('clusterEvents', () => {
  it('groups same-type events at identical startTime into one cluster', () => {
    const evs: AnimEvent[] = [
      ev({ type: 100, startTime: 500, filePath: 'a.gfx' }),
      ev({ type: 100, startTime: 500, filePath: 'b.gfx' }),
      ev({ type: 101, startTime: 500, filePath: 'c.wav' }),
      ev({ type: 100, startTime: 1000, filePath: 'd.gfx' }),
    ];
    const clusters = clusterEvents(evs);
    // Two GFX at 500 -> one cluster, one Sound at 500 -> separate, one GFX at 1000 -> separate.
    expect(clusters).toHaveLength(3);
    expect(clusters[0].type).toBe(100);
    expect(clusters[0].startTime).toBe(500);
    expect(clusters[0].events).toHaveLength(2);
    expect(clusters[1].type).toBe(101);
    expect(clusters[1].startTime).toBe(500);
    expect(clusters[1].events).toHaveLength(1);
    expect(clusters[2].type).toBe(100);
    expect(clusters[2].startTime).toBe(1000);
    expect(clusters[2].events).toHaveLength(1);
  });

  it('preserves source order within a cluster', () => {
    const evs: AnimEvent[] = [
      ev({ type: 100, startTime: 500, filePath: 'a.gfx' }),
      ev({ type: 100, startTime: 500, filePath: 'b.gfx' }),
      ev({ type: 100, startTime: 500, filePath: 'c.gfx' }),
    ];
    const [c] = clusterEvents(evs);
    expect(c.events.map((e) => e.filePath)).toEqual(['a.gfx', 'b.gfx', 'c.gfx']);
  });

  it('does not cluster GFX with Sound even at identical startTime', () => {
    const evs: AnimEvent[] = [
      ev({ type: 100, startTime: 250 }),
      ev({ type: 101, startTime: 250 }),
    ];
    const clusters = clusterEvents(evs);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].events).toHaveLength(1);
    expect(clusters[1].events).toHaveLength(1);
  });

  it('returns empty array for empty input', () => {
    expect(clusterEvents([])).toEqual([]);
  });

  it('keeps duplicate identical events (no dedup)', () => {
    const dupA = ev({ type: 100, startTime: 500, filePath: 'a.gfx', hookName: 'HH_hand' });
    const dupB = ev({ type: 100, startTime: 500, filePath: 'a.gfx', hookName: 'HH_hand' });
    const clusters = clusterEvents([dupA, dupB]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].events).toHaveLength(2);
  });
});
