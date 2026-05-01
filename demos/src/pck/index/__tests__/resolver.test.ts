import { describe, expect, it } from 'vitest';
import { expandDirRef, resolveCandidates } from '../resolver';
import { normalizePath } from '@shared/util/path';

function pathIndex(paths: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of paths) m.set(normalizePath(p), p);
  return m;
}

describe('resolveCandidates', () => {
  const idx = pathIndex(['gfx\\models\\foo.smd', 'models\\bar\\baz.ski']);

  it('returns the canonical path of the first hit', () => {
    expect(
      resolveCandidates(['gfx\\models\\foo.smd', 'gfx\\Models\\foo.smd'], idx),
    ).toBe('gfx\\models\\foo.smd');
  });

  it('is case- and separator-insensitive', () => {
    expect(resolveCandidates(['GFX/Models/Foo.SMD'], idx)).toBe(
      'gfx\\models\\foo.smd',
    );
  });

  it('returns null when nothing resolves', () => {
    expect(resolveCandidates(['gfx\\nope.smd'], idx)).toBeNull();
  });

  it('returns null on empty list', () => {
    expect(resolveCandidates([], idx)).toBeNull();
  });

  it('walks candidates in order — second candidate hits when first misses', () => {
    expect(
      resolveCandidates(['gfx\\Models\\foo.smd', 'gfx\\models\\foo.smd'], idx),
    ).toBe('gfx\\models\\foo.smd');
  });
});

describe('expandDirRef', () => {
  it('returns sorted file paths under the dir, filtered by ext', () => {
    const idx = pathIndex([
      'models\\foo\\tcks_x\\walk.stck',
      'models\\foo\\tcks_x\\run.stck',
      'models\\foo\\tcks_x\\meta.txt',
      'models\\foo\\other.stck',
    ]);
    expect(expandDirRef(['models\\foo\\tcks_x'], '.stck', idx)).toEqual([
      'models\\foo\\tcks_x\\run.stck',
      'models\\foo\\tcks_x\\walk.stck',
    ]);
  });

  it('returns the empty list when no dir candidate has any match', () => {
    const idx = pathIndex(['models\\foo\\bar.stck']);
    expect(expandDirRef(['nope\\dir'], '.stck', idx)).toEqual([]);
  });

  it('falls through to the next candidate when the first is empty', () => {
    const idx = pathIndex(['b\\hit.stck']);
    expect(expandDirRef(['a', 'b'], '.stck', idx)).toEqual(['b\\hit.stck']);
  });

  it('does not match files outside the dir prefix', () => {
    const idx = pathIndex([
      'models\\foo\\tcks_x\\walk.stck',
      'models\\foo\\tcks_x_other\\run.stck',
    ]);
    expect(expandDirRef(['models\\foo\\tcks_x'], '.stck', idx)).toEqual([
      'models\\foo\\tcks_x\\walk.stck',
    ]);
  });
});
