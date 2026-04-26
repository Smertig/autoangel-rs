import { describe, it, expect } from 'vitest';
import { findIdleClipName, PREFERRED_ANIM_HINT } from '../render-smd';

describe('findIdleClipName', () => {
  const STAND = PREFERRED_ANIM_HINT;            // '站立'
  const STAND2 = STAND + '_2';

  it('returns null when no clip matches the hint', () => {
    expect(findIdleClipName(['attack', 'walk'], 'attack')).toBeNull();
  });

  it('returns the first matching clip', () => {
    expect(findIdleClipName(['attack', STAND, 'walk'], 'attack')).toBe(STAND);
  });

  it('skips the current clip even if it matches', () => {
    expect(findIdleClipName([STAND, STAND2, 'attack'], STAND)).toBe(STAND2);
  });

  it('returns null when only the current clip matches', () => {
    expect(findIdleClipName([STAND, 'attack'], STAND)).toBeNull();
  });
});
