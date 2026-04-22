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
import { sessionIdFromFileIds, type Session, type SessionFile } from './types';

const SAVE_DEBOUNCE_MS = 500;
const EXPLORED_FLUSH_MS = 500;

export interface OpenedSession {
  /** PickedItems collected from each file's stored handles, in load order. */
  items: PickedItem[];
  /** SessionFiles for which we couldn't get a usable handle. */
  failed: SessionFile[];
}

export interface SessionsApi {
  sessions: Session[];
  loading: boolean;
  upsertCurrent: (files: SessionFile[]) => void;
  saveHandles: (fileId: string, handles: FileSystemFileHandle[]) => Promise<void>;
  incrementExplored: (sessionId: string) => void;
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
      lastUpsertedRef.current = id;
      const now = Date.now();
      const prev = sessionsRef.current;
      const idx = prev.findIndex((s) => s.id === id);
      const existing = idx >= 0 ? prev[idx] : null;
      const merged: Session = existing
        ? { ...existing, files, lastUsedAt: now, openCount: existing.openCount + 1 }
        : {
            id,
            files,
            firstOpenedAt: now,
            lastUsedAt: now,
            openCount: 1,
            exploredCount: 0,
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

  const incrementExplored = useCallback((sessionId: string) => {
    const target = sessionsRef.current.find((s) => s.id === sessionId);
    if (!target) return;
    // Optimistic in-memory bump; IDB write is debounced per-session below.
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, exploredCount: s.exploredCount + 1 } : s)),
    );
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
    return { items, failed };
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
      incrementExplored,
      openSession,
      removeOne,
      clearAll,
    }),
    [sessions, loading, upsertCurrent, saveHandles, incrementExplored, openSession, removeOne, clearAll],
  );
}
