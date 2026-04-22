import { describe, expect, it } from 'vitest';
import {
  RECENT_ENTRIES_CAP,
  fileFingerprint,
  mostRecentByAt,
  pushRecent,
  sessionIdFromFileIds,
  touchRecent,
  type RecentEntry,
} from '../history/types';

describe('fileFingerprint', () => {
  it('is stable for the same name+size+mtime', () => {
    const a = fileFingerprint({ name: 'gfx.pck', size: 1024, lastModified: 12345 });
    const b = fileFingerprint({ name: 'gfx.pck', size: 1024, lastModified: 12345 });
    expect(a).toBe(b);
  });

  it('differs when size differs', () => {
    const a = fileFingerprint({ name: 'gfx.pck', size: 1024, lastModified: 1 });
    const b = fileFingerprint({ name: 'gfx.pck', size: 2048, lastModified: 1 });
    expect(a).not.toBe(b);
  });

  it('lowercases the name so case-only renames collapse', () => {
    const a = fileFingerprint({ name: 'Gfx.PCK', size: 1024, lastModified: 1 });
    const b = fileFingerprint({ name: 'gfx.pck', size: 1024, lastModified: 1 });
    expect(a).toBe(b);
  });
});

describe('sessionIdFromFileIds', () => {
  it('is stable for the same set regardless of input order', () => {
    const a = sessionIdFromFileIds(['gfx|1|1', 'models|2|2', 'fonts|3|3']);
    const b = sessionIdFromFileIds(['models|2|2', 'fonts|3|3', 'gfx|1|1']);
    expect(a).toBe(b);
  });

  it('differs when the set differs', () => {
    const a = sessionIdFromFileIds(['gfx|1|1', 'models|2|2']);
    const b = sessionIdFromFileIds(['gfx|1|1', 'models|2|2', 'ui|3|3']);
    expect(a).not.toBe(b);
  });

  it('produces an empty string for an empty set', () => {
    expect(sessionIdFromFileIds([])).toBe('');
  });

  it('keeps single-file sessions distinct by fingerprint', () => {
    const a = sessionIdFromFileIds(['gfx|1|1']);
    const b = sessionIdFromFileIds(['gfx|2|1']);
    expect(a).not.toBe(b);
  });
});

describe('pushRecent', () => {
  const mk = (pckName: string, path: string, at: number): RecentEntry => ({ pckName, path, at });

  it('accepts an undefined buffer as empty', () => {
    const result = pushRecent(undefined, mk('gfx.pck', 'a', 1));
    expect(result).toEqual([mk('gfx.pck', 'a', 1)]);
  });

  it('inserts new entries at the head', () => {
    const buf = [mk('gfx.pck', 'a', 1)];
    const result = pushRecent(buf, mk('gfx.pck', 'b', 2));
    expect(result.map((e) => e.path)).toEqual(['b', 'a']);
  });

  it('dedups a non-head entry and promotes it to the head with a fresh `at`', () => {
    const buf = [mk('gfx.pck', 'b', 2), mk('gfx.pck', 'a', 1)];
    const result = pushRecent(buf, mk('gfx.pck', 'a', 99));
    expect(result).toEqual([mk('gfx.pck', 'a', 99), mk('gfx.pck', 'b', 2)]);
  });

  it('returns the same buffer reference when the entry is already at the head', () => {
    const buf: RecentEntry[] = [mk('gfx.pck', 'a', 1), mk('gfx.pck', 'b', 2)];
    const result = pushRecent(buf, mk('gfx.pck', 'a', 99));
    expect(result).toBe(buf);
  });

  it('treats the same path in different packages as distinct entries', () => {
    const buf = [mk('gfx.pck', 'shared/tex.dds', 1)];
    const result = pushRecent(buf, mk('ui.pck', 'shared/tex.dds', 2));
    expect(result).toHaveLength(2);
    expect(result[0].pckName).toBe('ui.pck');
    expect(result[1].pckName).toBe('gfx.pck');
  });

  it('does not mutate the input buffer', () => {
    const buf: RecentEntry[] = [mk('gfx.pck', 'a', 1)];
    const snapshot = [...buf];
    pushRecent(buf, mk('gfx.pck', 'b', 2));
    expect(buf).toEqual(snapshot);
  });

  it('trims to RECENT_ENTRIES_CAP from the tail', () => {
    const buf: RecentEntry[] = Array.from({ length: RECENT_ENTRIES_CAP }, (_, i) =>
      mk('gfx.pck', `p${i}`, i),
    );
    const result = pushRecent(buf, mk('gfx.pck', 'new', 9999));
    expect(result).toHaveLength(RECENT_ENTRIES_CAP);
    expect(result[0].path).toBe('new');
    // Oldest tail entry (p0) should have been dropped.
    expect(result[result.length - 1].path).toBe(`p${RECENT_ENTRIES_CAP - 2}`);
  });
});

describe('touchRecent', () => {
  const mk = (pckName: string, path: string, at: number): RecentEntry => ({ pckName, path, at });

  it('returns the same reference when the entry is not in the buffer', () => {
    const buf: RecentEntry[] = [mk('gfx.pck', 'a', 1)];
    const result = touchRecent(buf, mk('gfx.pck', 'missing', 99));
    expect(result).toBe(buf);
  });

  it('returns the same reference when the `at` is unchanged', () => {
    const buf: RecentEntry[] = [mk('gfx.pck', 'a', 1), mk('gfx.pck', 'b', 2)];
    const result = touchRecent(buf, mk('gfx.pck', 'b', 2));
    expect(result).toBe(buf);
  });

  it('updates `at` in place without reordering', () => {
    const buf: RecentEntry[] = [mk('gfx.pck', 'a', 1), mk('gfx.pck', 'b', 2), mk('gfx.pck', 'c', 3)];
    const result = touchRecent(buf, mk('gfx.pck', 'b', 99));
    expect(result).not.toBe(buf);
    expect(result.map((e) => e.path)).toEqual(['a', 'b', 'c']);
    expect(result[1].at).toBe(99);
    // Surrounding entries are untouched.
    expect(result[0]).toBe(buf[0]);
    expect(result[2]).toBe(buf[2]);
  });

  it('matches by (pckName, path) not by path alone', () => {
    const buf: RecentEntry[] = [mk('gfx.pck', 'shared', 1), mk('ui.pck', 'shared', 2)];
    const result = touchRecent(buf, mk('ui.pck', 'shared', 50));
    expect(result[0].at).toBe(1);
    expect(result[1].at).toBe(50);
  });
});

describe('mostRecentByAt', () => {
  const mk = (pckName: string, path: string, at: number): RecentEntry => ({ pckName, path, at });

  it('returns null for empty or undefined input', () => {
    expect(mostRecentByAt(undefined)).toBeNull();
    expect(mostRecentByAt([])).toBeNull();
  });

  it('returns the sole entry when the ring has one', () => {
    const only = mk('gfx.pck', 'a', 42);
    expect(mostRecentByAt([only])).toBe(only);
  });

  it('picks the highest-`at` entry regardless of list position', () => {
    const oldest = mk('gfx.pck', 'head', 100);
    const middle = mk('gfx.pck', 'middle', 50);
    const touched = mk('gfx.pck', 'tail', 999);
    const buf = [oldest, middle, touched];
    expect(mostRecentByAt(buf)).toBe(touched);
  });
});
