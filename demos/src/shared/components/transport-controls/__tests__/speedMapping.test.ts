import { describe, it, expect } from 'vitest';
import {
  SPEED_MIN, SPEED_MAX, SPEED_PRESETS,
  speedToFraction, fractionToSpeed, snapSpeedToPreset,
} from '../speedMapping';

describe('speedMapping', () => {
  it('maps 1× to fraction 0.5 (centre of log range 0.25..4)', () => {
    expect(speedToFraction(1)).toBeCloseTo(0.5, 6);
    expect(fractionToSpeed(0.5)).toBeCloseTo(1, 6);
  });

  it('maps the endpoints exactly', () => {
    expect(speedToFraction(SPEED_MIN)).toBe(0);
    expect(speedToFraction(SPEED_MAX)).toBe(1);
  });

  it('round-trips every preset', () => {
    for (const s of SPEED_PRESETS) {
      expect(fractionToSpeed(speedToFraction(s))).toBeCloseTo(s, 6);
    }
  });

  it('snaps near-preset fractions to the exact preset', () => {
    expect(snapSpeedToPreset(fractionToSpeed(0.499))).toBe(1);
    expect(snapSpeedToPreset(0.7)).toBeCloseTo(0.7, 6);
  });

  it('clamps out-of-range inputs', () => {
    expect(snapSpeedToPreset(0.1)).toBe(SPEED_MIN);
    expect(snapSpeedToPreset(10)).toBe(SPEED_MAX);
  });
});
