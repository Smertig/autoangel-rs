import { describe, it, expect } from 'vitest';
import { sampleConeDirection } from '../spawn/cone';

describe('sampleConeDirection', () => {
  it('returns axis exactly when angle is 0', () => {
    const axis: [number, number, number] = [0, 0, 1];
    const d = sampleConeDirection(axis, 0, () => 0.5);
    expect(d[0]).toBeCloseTo(0);
    expect(d[1]).toBeCloseTo(0);
    expect(d[2]).toBeCloseTo(1);
  });

  it('returns unit vectors for any axis / angle / rng sequence', () => {
    const axis: [number, number, number] = [0, 0, 1];
    let r = 0;
    const mockRng = () => {
      r += 0.1;
      return r % 1;
    };
    for (let i = 0; i < 10; i++) {
      const d = sampleConeDirection(axis, Math.PI / 4, mockRng);
      const len = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
      expect(len).toBeCloseTo(1, 5);
    }
  });

  it('respects cone half-angle: result is within angle of axis', () => {
    const axis: [number, number, number] = [0, 0, 1];
    const halfAngle = Math.PI / 6; // 30 deg
    let r = 0;
    const mockRng = () => {
      r += 0.137;
      return r % 1;
    };
    for (let i = 0; i < 20; i++) {
      const d = sampleConeDirection(axis, halfAngle, mockRng);
      const dot = d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2];
      const angleToAxis = Math.acos(Math.min(1, dot));
      expect(angleToAxis).toBeLessThanOrEqual(halfAngle + 1e-6);
    }
  });

  it('handles axis near vertical (up fallback)', () => {
    const axis: [number, number, number] = [0, 1, 0];
    const d = sampleConeDirection(axis, Math.PI / 4, () => 0.3);
    const len = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
    expect(len).toBeCloseTo(1, 5);
  });
});
