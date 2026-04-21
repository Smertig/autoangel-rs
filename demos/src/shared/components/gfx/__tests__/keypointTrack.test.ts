import { describe, it, expect } from 'vitest';
import { buildTrack, sampleTrack, trackSignature } from '../util/keypointTrack';

const kp = (overrides: Partial<{ time_span: number; color: number; scale: number; position: [number,number,number]; controllers: any[] }>) => ({
  interpolate_mode: 1,
  time_span: 0,
  position: [0, 0, 0] as [number, number, number],
  color: 0xFFFFFFFF,
  scale: 1,
  direction: [0, 0, 0, 1] as [number, number, number, number],
  rad_2d: 0,
  controllers: [],
  ...overrides,
});

describe('buildTrack', () => {
  it('returns an empty track for undefined input', () => {
    const t = buildTrack(undefined);
    expect(t.colors).toEqual([]);
    expect(t.loopable).toBe(false);
    expect(t.unhandledKinds.size).toBe(0);
  });

  it('builds a 2-keypoint loopable track with finite spans', () => {
    const t = buildTrack({
      start_time: 100,
      keypoints: [kp({ time_span: 200, color: 0xFFFF0000 }), kp({ time_span: 100, color: 0xFF00FF00 })],
    });
    expect(t.loopable).toBe(true);
    expect(t.colors).toEqual([0xFFFF0000, 0xFF00FF00]);
    expect(t.spans).toEqual([200, 100]);
    expect(t.startTimeMs).toBe(100);
    expect(t.loopDurationMs).toBe(300);
  });

  it('single hold-forever keypoint → not loopable', () => {
    const t = buildTrack({ start_time: 0, keypoints: [kp({ time_span: -1 })] });
    expect(t.loopable).toBe(false);
    expect(t.colors.length).toBe(1);
  });

  it('records unhandled controller kinds (deferred ones)', () => {
    const t = buildTrack({
      start_time: 0,
      keypoints: [
        kp({ time_span: 100, controllers: [{ start_time: 0, end_time: -1, body: { kind: 'move', dir: [0,0,0], vel: 0, acc: 0 } as any }] }),
        kp({ time_span: 100 }),
      ],
    });
    expect(t.unhandledKinds.has('move')).toBe(true);
    expect(t.unhandledKinds.size).toBe(1);
  });
});

describe('trackSignature', () => {
  it('produces equal strings for tracks with identical content', () => {
    const a = buildTrack({ start_time: 0, keypoints: [kp({ time_span: 100, color: 0xFF112233 })] });
    const b = buildTrack({ start_time: 0, keypoints: [kp({ time_span: 100, color: 0xFF112233 })] });
    expect(trackSignature(a)).toBe(trackSignature(b));
  });

  it('changes when any channel value changes', () => {
    const a = buildTrack({ start_time: 0, keypoints: [kp({ time_span: 100, color: 0xFF112233 })] });
    const b = buildTrack({ start_time: 0, keypoints: [kp({ time_span: 100, color: 0xFF112244 })] });
    expect(trackSignature(a)).not.toBe(trackSignature(b));
  });
});

describe('sampleTrack', () => {
  it('returns first keypoint for a non-loopable track', () => {
    const t = buildTrack({ start_time: 0, keypoints: [kp({ time_span: -1, color: 0xFFAA0000 })] });
    const s = sampleTrack(t, 9999);
    expect(s.color).toBe(0xFFAA0000);
    expect(s.normalized).toBe(0);
  });

  it('lerps between keypoint colors at segment midpoint', () => {
    const t = buildTrack({
      start_time: 0,
      keypoints: [kp({ time_span: 1000, color: 0xFF000000 }), kp({ time_span: 0, color: 0xFFFFFFFF })],
    });
    const s = sampleTrack(t, 500);
    const r = (s.color >>> 16) & 0xff;
    expect(r).toBe(128);
  });

  it('applies a SCALE controller within a segment', () => {
    const t = buildTrack({
      start_time: 0,
      keypoints: [
        kp({
          time_span: 1000,
          scale: 1,
          controllers: [{ start_time: 0, end_time: -1, body: { kind: 'scale', scale_delta: 1, min_scale: 0, max_scale: 10 } as any }],
        }),
        kp({ time_span: 0, scale: 1 }),
      ],
    });
    const s = sampleTrack(t, 500);
    // 1 + 1 * 0.5 = 1.5
    expect(s.scale).toBeCloseTo(1.5);
  });
});
