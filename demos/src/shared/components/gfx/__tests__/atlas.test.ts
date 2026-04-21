import { describe, it, expect } from 'vitest';
import { sampleAtlasFrame } from '../util/atlas';

describe('sampleAtlasFrame', () => {
  it('single-frame atlas (1x1) → full UV rect, no animation', () => {
    const f = sampleAtlasFrame(1, 1, 0, 0);
    expect(f.offset).toEqual([0, 0]);
    expect(f.repeat).toEqual([1, 1]);
  });

  it('2x2 atlas at frame 0 → top-left quadrant', () => {
    const f = sampleAtlasFrame(2, 2, 100, 0);
    expect(f.offset).toEqual([0, 0.5]);
    expect(f.repeat).toEqual([0.5, 0.5]);
  });

  it('2x2 atlas walks frames in row-major order at intervalMs cadence', () => {
    const frames = [0, 100, 200, 300, 400].map((t) => sampleAtlasFrame(2, 2, 100, t));
    expect(frames[0].offset).toEqual([0, 0.5]);
    expect(frames[1].offset).toEqual([0.5, 0.5]);
    expect(frames[2].offset).toEqual([0, 0]);
    expect(frames[3].offset).toEqual([0.5, 0]);
    expect(frames[4].offset).toEqual([0, 0.5]);
  });

  it('intervalMs == 0 → frame 0 always', () => {
    expect(sampleAtlasFrame(4, 4, 0, 9999).offset).toEqual([0, 0.75]);
  });

  it('uReverse swaps U direction', () => {
    const a = sampleAtlasFrame(2, 2, 100, 100, true);
    const b = sampleAtlasFrame(2, 2, 100, 100);
    expect(a.repeat[0]).toBe(-b.repeat[0]);
    expect(a.offset[0]).toBeCloseTo(b.offset[0] + b.repeat[0]);
  });

  it('vReverse swaps V direction', () => {
    const a = sampleAtlasFrame(2, 2, 100, 0, false, true);
    const b = sampleAtlasFrame(2, 2, 100, 0);
    expect(a.repeat[1]).toBe(-b.repeat[1]);
  });

  it('uvExchg swaps U and V components in offset and repeat', () => {
    const a = sampleAtlasFrame(2, 2, 100, 100, false, false, true);
    expect(a.offset[0]).toBe(0.5);
    expect(a.offset[1]).toBe(0.5);
  });
});
