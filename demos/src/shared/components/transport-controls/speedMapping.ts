export const SPEED_MIN = 0.25;
export const SPEED_MAX = 4;
export const SPEED_PRESETS = [0.25, 0.5, 1, 2, 4] as const;

const SNAP_TOLERANCE_PCT = 0.02;
const SPEED_LOG_MIN = Math.log(SPEED_MIN);
const SPEED_LOG_RANGE = Math.log(SPEED_MAX) - SPEED_LOG_MIN;

export const speedToFraction = (s: number) =>
  (Math.log(s) - SPEED_LOG_MIN) / SPEED_LOG_RANGE;

export const fractionToSpeed = (f: number) =>
  Math.exp(f * SPEED_LOG_RANGE + SPEED_LOG_MIN);

const PRESET_FRACTIONS = SPEED_PRESETS.map(speedToFraction);

/** Clamp to [SPEED_MIN, SPEED_MAX] then snap to a preset if within tolerance. */
export function snapSpeedToPreset(speed: number): number {
  const clamped = Math.max(SPEED_MIN, Math.min(SPEED_MAX, speed));
  const f = speedToFraction(clamped);
  for (let i = 0; i < SPEED_PRESETS.length; i++) {
    if (Math.abs(PRESET_FRACTIONS[i] - f) < SNAP_TOLERANCE_PCT) return SPEED_PRESETS[i];
  }
  return clamped;
}
