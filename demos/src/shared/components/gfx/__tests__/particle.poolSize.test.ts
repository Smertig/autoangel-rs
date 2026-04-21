import { describe, it, expect } from 'vitest';
import { resolvePoolSize } from '../previews/particle/simulation';

// Mirrors A3DParticleSystemEx::Init + SetPoolSize:
//   pool = int(ttl * rate) + 1
//   if quota == -1 || pool <= quota: use pool
//   else:                            use quota
//   clamp to [1, 750]  (engine _max_quota)

describe('resolvePoolSize', () => {
  it('quota -1 → uses natural pool (rate × ttl + 1)', () => {
    expect(resolvePoolSize(-1, 40, 1)).toBe(41);
  });

  it('quota > natural pool → uses natural pool', () => {
    // int(0.5 * 10) + 1 = 6, quota=100 → 6
    expect(resolvePoolSize(100, 10, 0.5)).toBe(6);
  });

  it('quota < natural pool → uses quota', () => {
    // int(0.65 * 300) + 1 = 196, quota=40 → 40
    expect(resolvePoolSize(40, 300, 0.65)).toBe(40);
  });

  it('clamps to engine hard cap 750', () => {
    expect(resolvePoolSize(-1, 1000, 10)).toBe(750);
    expect(resolvePoolSize(5000, 1000, 10)).toBe(750);
  });

  it('returns at least 1 for degenerate inputs', () => {
    expect(resolvePoolSize(-1, 0, 0)).toBe(1);
    expect(resolvePoolSize(-1, 40, 0)).toBe(1);
  });
});
