import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PickedItem } from '@shared/hooks/useFileDrop';
import {
  clearSessions,
  deleteHandle,
  deleteHandles,
  deleteSession,
  getHandles,
  listSessions,
  putHandles,
  putSession,
} from './idb';
import {
  isStrictSubset,
  mostRecentByAt,
  pushRecent,
  sessionIdFromFileIds,
  setRecentEntryState,
  touchRecent,
  type RecentEntry,
  type Session,
  type SessionFile,
} from './types';

const SAVE_DEBOUNCE_MS = 500;
const EXPLORED_FLUSH_MS = 500;

export interface OpenedSession {
  /** PickedItems collected from each file's stored handles, in load order. */
  items: PickedItem[];
  /** SessionFiles for which we couldn't get a usable handle. */
  failed: SessionFile[];
  /** Entry to auto-select once the session finishes loading (head of recent ring). */
  pendingSelection: RecentEntry | null;
}

export interface SessionsApi {
  sessions: Session[];
  loading: boolean;
  upsertCurrent: (files: SessionFile[]) => void;
  saveHandles: (fileId: string, handles: FileSystemFileHandle[]) => Promise<void>;
  /** Fresh exploration (tree click): bump to head + refresh `at`. */
  recordExplored: (sessionId: string, entry: RecentEntry) => void;
  /** Revisit via recents UI: refresh `at` only, keep list order. */
  recordTouched: (sessionId: string, entry: RecentEntry) => void;
  /**
   * Replace the format-owned `state` blob on a recent entry. Doesn't change
   * list order, `at`, or `exploredCount` — purely a state write. No-op when
   * the entry is missing from the ring.
   */
  recordEntryState: (
    sessionId: string,
    key: { pckName: string; path: string },
    state: unknown,
  ) => void;
  /**
   * Replace the format-owned per-format state for this session, keyed by
   * `formatName` (typically `FormatDescriptor.name`).
   */
  recordFormatState: (sessionId: string, formatName: string, state: unknown) => void;
  openSession: (session: Session) => Promise<OpenedSession>;
  removeOne: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

function sortByRecency(list: Session[]): Session[] {
  return [...list].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

export function useSessions(): SessionsApi {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  // Mirror of `sessions` so callbacks can read the current list without
  // taking a dependency on it (which would re-create them on every state
  // change). Updated synchronously after each render.
  const sessionsRef = useRef<Session[]>([]);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const upsertDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Hash we last wrote to IDB during this page session — used to skip
  // identical no-op upserts (StrictMode double-effects, render churn).
  const lastUpsertedRef = useRef<string | null>(null);
  // Per-session flush timers for explored-count writes; coalesces rapid
  // tree clicks into one IDB write.
  const exploredFlushRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    let cancelled = false;
    listSessions()
      .then((all) => {
        if (!cancelled) setSessions(sortByRecency(all));
      })
      .catch((e: unknown) => {
        console.warn('Failed to load PCK session history:', e);
      })
      .finally(() => setLoading(false));
    return () => {
      cancelled = true;
      if (upsertDebounceRef.current) clearTimeout(upsertDebounceRef.current);
      for (const t of exploredFlushRef.current.values()) clearTimeout(t);
      exploredFlushRef.current.clear();
    };
  }, []);

  const upsertCurrent = useCallback((files: SessionFile[]) => {
    if (files.length === 0) {
      lastUpsertedRef.current = null;
      return;
    }
    const id = sessionIdFromFileIds(files.map((f) => f.fileId));
    if (id === lastUpsertedRef.current) return;
    if (upsertDebounceRef.current) clearTimeout(upsertDebounceRef.current);
    upsertDebounceRef.current = setTimeout(() => {
      upsertDebounceRef.current = null;
      const prevId = lastUpsertedRef.current;
      lastUpsertedRef.current = id;
      const now = Date.now();
      const prev = sessionsRef.current;
      const idx = prev.findIndex((s) => s.id === id);
      const existing = idx >= 0 ? prev[idx] : null;

      // Carry recents forward when the user adds a package to an open set.
      // Subset invariant means every inherited pckName is still loaded — no filter.
      let seedRecents: RecentEntry[] = [];
      let seedFormatStates: Record<string, unknown> | undefined;
      if (!existing && prevId && prevId !== id) {
        const prevSession = prev.find((s) => s.id === prevId);
        if (
          prevSession &&
          isStrictSubset(
            prevSession.files.map((f) => f.fileId),
            files.map((f) => f.fileId),
          )
        ) {
          seedRecents = prevSession.recentEntries ?? [];
          seedFormatStates = prevSession.formatStates;
        }
      }

      const seedExplored =
        seedRecents.length > 0
          ? prev.find((s) => s.id === prevId)?.exploredCount ?? seedRecents.length
          : 0;
      const merged: Session = existing
        ? { ...existing, files, lastUsedAt: now, openCount: existing.openCount + 1 }
        : {
            id,
            files,
            firstOpenedAt: now,
            lastUsedAt: now,
            openCount: 1,
            exploredCount: seedExplored,
            recentEntries: seedRecents,
            ...(seedFormatStates ? { formatStates: seedFormatStates } : {}),
          };
      const next =
        idx >= 0 ? prev.map((s, i) => (i === idx ? merged : s)) : [...prev, merged];
      setSessions(sortByRecency(next));
      void putSession(merged);
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const saveHandles = useCallback(async (fileId: string, handles: FileSystemFileHandle[]) => {
    if (handles.length === 0) return;
    try {
      await putHandles(fileId, handles);
    } catch (e) {
      console.warn('Failed to persist FileSystemFileHandles:', e);
    }
  }, []);

  // Per-session debounced IDB flush. Shared by every state-mutation path so
  // a stream of clicks + state writes for the same session coalesce into one
  // write.
  const scheduleSessionFlush = useCallback((sessionId: string) => {
    const flushes = exploredFlushRef.current;
    const existing = flushes.get(sessionId);
    if (existing) clearTimeout(existing);
    flushes.set(
      sessionId,
      setTimeout(() => {
        flushes.delete(sessionId);
        const latest = sessionsRef.current.find((s) => s.id === sessionId);
        if (latest) void putSession(latest);
      }, EXPLORED_FLUSH_MS),
    );
  }, []);

  // `exploredCount` is a total-clicks counter — incremented on every call,
  // even when the transform returns the same buffer ref (e.g. re-clicking
  // the head entry).
  const applyRecentTransform = useCallback(
    (
      sessionId: string,
      transform: (buf: readonly RecentEntry[] | undefined) => RecentEntry[],
    ) => {
      const target = sessionsRef.current.find((s) => s.id === sessionId);
      if (!target) return;
      const next = transform(target.recentEntries);
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, recentEntries: next, exploredCount: s.exploredCount + 1 }
            : s,
        ),
      );
      scheduleSessionFlush(sessionId);
    },
    [scheduleSessionFlush],
  );

  const recordExplored = useCallback(
    (sessionId: string, entry: RecentEntry) => {
      applyRecentTransform(sessionId, (buf) => pushRecent(buf, entry));
    },
    [applyRecentTransform],
  );

  const recordTouched = useCallback(
    (sessionId: string, entry: RecentEntry) => {
      applyRecentTransform(sessionId, (buf) => touchRecent(buf, entry));
    },
    [applyRecentTransform],
  );

  const recordEntryState = useCallback(
    (
      sessionId: string,
      key: { pckName: string; path: string },
      state: unknown,
    ) => {
      const target = sessionsRef.current.find((s) => s.id === sessionId);
      if (!target) return;
      const next = setRecentEntryState(target.recentEntries, key, state);
      if (next === target.recentEntries) return;
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, recentEntries: next } : s)),
      );
      scheduleSessionFlush(sessionId);
    },
    [scheduleSessionFlush],
  );

  const recordFormatState = useCallback(
    (sessionId: string, formatName: string, state: unknown) => {
      const target = sessionsRef.current.find((s) => s.id === sessionId);
      if (!target) return;
      if (target.formatStates?.[formatName] === state) return;
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const nextStates = { ...(s.formatStates ?? {}), [formatName]: state };
          return { ...s, formatStates: nextStates };
        }),
      );
      scheduleSessionFlush(sessionId);
    },
    [scheduleSessionFlush],
  );

  const openSession = useCallback(async (session: Session): Promise<OpenedSession> => {
    type FileOutcome = { ok: true; items: PickedItem[] } | { ok: false; file: SessionFile };
    const outcomes = await Promise.all(
      session.files.map<Promise<FileOutcome>>(async (file) => {
        let handles: FileSystemFileHandle[] = [];
        try {
          handles = await getHandles(file.fileId);
        } catch (e) {
          console.warn('getHandles failed for', file.fileId, e);
        }
        if (handles.length === 0) return { ok: false, file };
        try {
          // Run permission requests in parallel so they share the same
          // click activation — Chrome consumes activation per call.
          const perms = await Promise.all(
            handles.map(async (h) => {
              let p = (await h.queryPermission?.({ mode: 'read' })) ?? 'prompt';
              if (p === 'prompt') p = (await h.requestPermission?.({ mode: 'read' })) ?? 'denied';
              return p;
            }),
          );
          if (perms.some((p) => p !== 'granted')) return { ok: false, file };
          const items = await Promise.all(
            handles.map(async (h) => ({ file: await h.getFile(), handle: h })),
          );
          return { ok: true, items };
        } catch (e) {
          console.warn('Handle read failed for', file.fileId, '— marking stale:', e);
          await deleteHandle(file.fileId).catch(() => undefined);
          return { ok: false, file };
        }
      }),
    );
    const items: PickedItem[] = [];
    const failed: SessionFile[] = [];
    for (const o of outcomes) {
      if (o.ok) items.push(...o.items);
      else failed.push(o.file);
    }
    // Auto-jump target: highest-`at` entry whose package actually came back.
    // Uses `at` (not list order) because recent-entry clicks refresh `at`
    // without reordering — so "last active" may sit deeper in the list.
    const openedPckNames = new Set(
      session.files
        .filter((f) => !failed.some((x) => x.fileId === f.fileId))
        .map((f) => f.pckName),
    );
    const eligible = session.recentEntries?.filter((e) => openedPckNames.has(e.pckName));
    const pendingSelection = mostRecentByAt(eligible);
    return { items, failed, pendingSelection };
  }, []);

  const removeOne = useCallback(async (id: string) => {
    if (lastUpsertedRef.current === id) lastUpsertedRef.current = null;
    const flush = exploredFlushRef.current.get(id);
    if (flush) {
      clearTimeout(flush);
      exploredFlushRef.current.delete(id);
    }
    // Compute orphan handle ids from in-memory state, before mutation.
    const prev = sessionsRef.current;
    const target = prev.find((s) => s.id === id);
    const stillUsed = new Set<string>();
    for (const s of prev) {
      if (s.id === id) continue;
      for (const f of s.files) stillUsed.add(f.fileId);
    }
    const orphanIds =
      target?.files.filter((f) => !stillUsed.has(f.fileId)).map((f) => f.fileId) ?? [];
    setSessions((p) => p.filter((s) => s.id !== id));
    await deleteSession(id);
    if (orphanIds.length > 0) await deleteHandles(orphanIds).catch(() => undefined);
  }, []);

  const clearAll = useCallback(async () => {
    lastUpsertedRef.current = null;
    for (const t of exploredFlushRef.current.values()) clearTimeout(t);
    exploredFlushRef.current.clear();
    setSessions([]);
    await clearSessions();
  }, []);

  return useMemo(
    () => ({
      sessions,
      loading,
      upsertCurrent,
      saveHandles,
      recordExplored,
      recordTouched,
      recordEntryState,
      recordFormatState,
      openSession,
      removeOne,
      clearAll,
    }),
    [
      sessions,
      loading,
      upsertCurrent,
      saveHandles,
      recordExplored,
      recordTouched,
      recordEntryState,
      recordFormatState,
      openSession,
      removeOne,
      clearAll,
    ],
  );
}
