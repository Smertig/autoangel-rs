/**
 * Persistent history of PCK package sessions the user has opened locally.
 *
 * Per-file `state` and per-format `formatStates` are opaque blobs — the
 * recents/session layer never reads or interprets them; the format that
 * wrote a blob owns its schema and any versioning.
 */

export interface SessionFile {
  /** Stable id derived from `name|size|lastModified` (lowercased name). */
  fileId: string;
  /** Original `.pck` filename (e.g. `gfx.pck`). */
  pckName: string;
  pckSize: number;
}

export interface RecentEntry {
  /** `.pck` filename the entry lives in, e.g. `gfx.pck`. Matches `SessionFile.pckName`. */
  pckName: string;
  /** Full path inside the package, backslash-delimited to match the tree. */
  path: string;
  /** Last-clicked timestamp; head of the ring buffer wins on dedup. */
  at: number;
  /** Per-file state — e.g. ECM/SMD selected clip, scrub pos. */
  state?: unknown;
}

export interface Session {
  /** Stable hash of the sorted `files[].fileId` values — same set = same session. */
  id: string;
  files: SessionFile[];
  firstOpenedAt: number;
  lastUsedAt: number;
  /** Number of times this exact set has been loaded. */
  openCount: number;
  /**
   * Total file-click counter for this session — increments on every tree
   * click, recent-entry revisit, and cross-file navigation, regardless of
   * whether the click introduced a new path or revisited an existing one.
   * On legacy sessions recorded before this redefinition, the stored value
   * happens to equal the unique-paths count and is treated as the starting
   * point for the new counter.
   */
  exploredCount: number;
  /**
   * Tree-file clicks recorded during this session, head = most recent.
   * Deduplicated by (pckName, path). Capped at `RECENT_ENTRIES_CAP`. Absent
   * on sessions recorded before this field existed — treat as empty.
   */
  recentEntries?: RecentEntry[];
  /**
   * Per-format settings keyed by `FormatDescriptor.name` (e.g. `'ecm'`,
   * `'smd'`) — playback speed, loop mode. Carries settings that should
   * follow the *kind* of file rather than any one file.
   */
  formatStates?: Record<string, unknown>;
}

/** Hard cap on per-session recent history. Writes trim from the tail. */
export const RECENT_ENTRIES_CAP = 1000;

/** Stable id for a single dropped file. */
export function fileFingerprint(file: { name: string; size: number; lastModified: number }): string {
  return `${file.name.toLowerCase()}|${file.size}|${file.lastModified}`;
}

/** Stable session id from a list of file ids. Order-independent. */
export function sessionIdFromFileIds(fileIds: readonly string[]): string {
  return [...fileIds].sort().join('\n');
}

/**
 * True when every id in `prev` also appears in `next` and `next` has strictly
 * more ids — i.e. the user added one or more packages to the previous set.
 * Used to decide whether to carry a session's `recentEntries` forward when
 * the loaded-set fingerprint changes.
 */
export function isStrictSubset(prev: readonly string[], next: readonly string[]): boolean {
  if (prev.length === 0 || prev.length >= next.length) return false;
  const nextSet = new Set(next);
  return prev.every((id) => nextSet.has(id));
}

/**
 * Returns a new ring buffer with `entry` moved (or inserted) at the head.
 * Dedup key is `(pckName, path)` — re-clicking an existing entry promotes it
 * without duplicating. Tail is trimmed to `RECENT_ENTRIES_CAP`. When the
 * caller's `entry` lacks `state` but a same-key entry already in the ring
 * has one, the existing `state` is carried forward so re-clicking a file
 * doesn't wipe its persisted viewer state.
 */
export function pushRecent(buf: readonly RecentEntry[] | undefined, entry: RecentEntry): RecentEntry[] {
  const prev = buf ?? [];
  // Already at the head — nothing to reorder. Return the same reference so
  // callers can detect the no-op and skip downstream updates.
  if (prev.length > 0 && prev[0].pckName === entry.pckName && prev[0].path === entry.path) {
    return prev as RecentEntry[];
  }
  const existing = prev.find((e) => e.pckName === entry.pckName && e.path === entry.path);
  const filtered = prev.filter((e) => !(e.pckName === entry.pckName && e.path === entry.path));
  const merged: RecentEntry =
    entry.state === undefined && existing?.state !== undefined
      ? { ...entry, state: existing.state }
      : entry;
  filtered.unshift(merged);
  if (filtered.length > RECENT_ENTRIES_CAP) filtered.length = RECENT_ENTRIES_CAP;
  return filtered;
}

/**
 * Mark an entry as "last touched" without moving it in the list. Used when
 * re-visiting a file via the recents UI: the auto-jump-on-reopen target is
 * derived from the max `at` across the ring, but the list order is purely
 * the history of fresh (tree-click) explorations. Returns the same reference
 * if the entry doesn't exist in the buffer, or if the `at` is unchanged.
 */
export function touchRecent(buf: readonly RecentEntry[] | undefined, entry: RecentEntry): RecentEntry[] {
  const prev = buf ?? [];
  const idx = prev.findIndex((e) => e.pckName === entry.pckName && e.path === entry.path);
  if (idx < 0) return prev as RecentEntry[];
  if (prev[idx].at === entry.at) return prev as RecentEntry[];
  const next = prev.slice();
  next[idx] = { ...next[idx], at: entry.at };
  return next;
}

/**
 * Replace `state` on the matching entry without changing list order or `at`.
 * Returns the same reference on miss / referential-equal, so callers can
 * skip the downstream write.
 */
export function setRecentEntryState(
  buf: readonly RecentEntry[] | undefined,
  key: { pckName: string; path: string },
  state: unknown,
): RecentEntry[] {
  const prev = buf ?? [];
  const idx = prev.findIndex((e) => e.pckName === key.pckName && e.path === key.path);
  if (idx < 0) return prev as RecentEntry[];
  if (prev[idx].state === state) return prev as RecentEntry[];
  const next = prev.slice();
  next[idx] = { ...next[idx], state };
  return next;
}

/**
 * Pick the entry whose `at` is highest — "most recently active" regardless
 * of whether it was reached via a fresh tree click or a recent-entry jump.
 * Returns `null` for an empty ring.
 */
export function mostRecentByAt(buf: readonly RecentEntry[] | undefined): RecentEntry | null {
  if (!buf || buf.length === 0) return null;
  let best = buf[0];
  for (let i = 1; i < buf.length; i++) {
    if (buf[i].at > best.at) best = buf[i];
  }
  return best;
}
