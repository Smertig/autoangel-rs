// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  type ChangelogEntry,
  type ChangelogScope,
  hasUnseen,
  markScopeSeen,
  readLastSeen,
  initLastSeenIfMissing,
  entriesForScope,
  LAST_SEEN_KEY,
} from '../changelog';

const ENTRIES: ChangelogEntry[] = [
  { id: 'old-pck',       date: '2026-01-01', scope: 'pck',       title: 'old pck' },
  { id: 'mid-elements',  date: '2026-02-01', scope: 'elements',  title: 'old elements' },
  { id: 'shared-1',      date: '2026-03-01', scope: 'shared',    title: 'shared change' },
  { id: 'new-pck',       date: '2026-04-01', scope: 'pck',       title: 'new pck' },
  { id: 'new-pck-2',     date: '2026-04-01', scope: 'pck',       title: 'same-day second pck' },
];

describe('changelog tracking', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('initLastSeenIfMissing', () => {
    it('on first visit, initializes lastSeen to latest id per scope (no dot for historical entries)', () => {
      initLastSeenIfMissing(ENTRIES);
      const last = readLastSeen();
      // Same-date tie ('new-pck' and 'new-pck-2'): stable desc sort preserves input order, so 'new-pck' is first.
      expect(last.pck).toBe('new-pck');
      expect(last.elements).toBe('mid-elements');
      expect(last['pck-diff']).toBeUndefined();
      expect(last.shared).toBe('shared-1');
    });

    it('does nothing if lastSeen already exists', () => {
      localStorage.setItem(LAST_SEEN_KEY, JSON.stringify({ pck: 'old-pck' }));
      initLastSeenIfMissing(ENTRIES);
      expect(readLastSeen()).toEqual({ pck: 'old-pck' });
    });
  });

  describe('hasUnseen', () => {
    it('returns false right after initLastSeenIfMissing', () => {
      initLastSeenIfMissing(ENTRIES);
      expect(hasUnseen('pck', ENTRIES)).toBe(false);
      expect(hasUnseen('elements', ENTRIES)).toBe(false);
      expect(hasUnseen('pck-diff', ENTRIES)).toBe(false);
    });

    it('returns true for a demo whose lastSeen is older than its newest entry', () => {
      localStorage.setItem(LAST_SEEN_KEY, JSON.stringify({ pck: 'old-pck', shared: 'shared-1' }));
      expect(hasUnseen('pck', ENTRIES)).toBe(true);
    });

    it('counts shared-scope entries as unseen for every demo', () => {
      localStorage.setItem(LAST_SEEN_KEY, JSON.stringify({
        pck: 'new-pck-2', elements: 'mid-elements',
      }));
      expect(hasUnseen('elements', ENTRIES)).toBe(true);
      expect(hasUnseen('pck-diff', ENTRIES)).toBe(true);
      expect(hasUnseen('pck', ENTRIES)).toBe(true);
    });

    it('returns false when in-scope entries are all seen and there are no shared entries newer', () => {
      localStorage.setItem(LAST_SEEN_KEY, JSON.stringify({
        pck: 'new-pck-2', elements: 'mid-elements', shared: 'shared-1',
      }));
      expect(hasUnseen('pck', ENTRIES)).toBe(false);
      expect(hasUnseen('elements', ENTRIES)).toBe(false);
      expect(hasUnseen('pck-diff', ENTRIES)).toBe(false);
    });
  });

  describe('markScopeSeen', () => {
    it('advances current scope and shared scope to their latest ids', () => {
      localStorage.setItem(LAST_SEEN_KEY, JSON.stringify({}));
      markScopeSeen('pck', ENTRIES);
      const last = readLastSeen();
      expect(last.pck).toBe('new-pck');
      expect(last.shared).toBe('shared-1');
      expect(last.elements).toBeUndefined();
      expect(last['pck-diff']).toBeUndefined();
    });

    it('is a no-op for scopes with no entries', () => {
      markScopeSeen('pck-diff', ENTRIES);
      expect(readLastSeen()['pck-diff']).toBeUndefined();
    });
  });

  describe('entriesForScope', () => {
    it('returns scope-matching entries plus shared entries, sorted date desc', () => {
      const result = entriesForScope('pck', ENTRIES);
      expect(result.map(e => e.id)).toEqual(['new-pck', 'new-pck-2', 'shared-1', 'old-pck']);
    });

    it('returns all entries when scope is null (view-all mode)', () => {
      const result = entriesForScope(null, ENTRIES);
      expect(result).toHaveLength(ENTRIES.length);
      expect(result[0].date).toBe('2026-04-01');
      expect(result.at(-1)!.date).toBe('2026-01-01');
    });
  });
});
