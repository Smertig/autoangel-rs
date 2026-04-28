import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyCacheInvalidation,
  loadCachedSlotIndex,
  putCachedSlotIndex,
} from './idb';
import {
  addEdges,
  createIndexState,
  rebuildOwnership,
  removeSlot,
  reresolve,
  type IndexState,
} from './reducer';
import { normalizePathKey } from './pathKey';
import { resolveCandidates } from './resolver';
import { EXTRACTOR_LOADERS } from './extractors';
import type { CachedSlotIndex, Edge } from './types';
import type { MainToWorker, WorkerToMain } from './worker-protocol';

/** Slot info the indexer needs. The pck demo derives this from its
 *  `usePackageSlots` internal state. */
export interface IndexedSlot {
  pkgId: number;
  fileId: string;
  pckFile: File;
  pkxFiles: File[];
  fileList: string[];
}

export type IndexerStatus =
  | { kind: 'idle' }
  | { kind: 'indexing'; indexed: number; total: number }
  | { kind: 'paused-loading' }
  | { kind: 'error-disabled' }
  /** User opted out of indexing for this session — show the
   *  enable-indexing prompt in the panel. */
  | { kind: 'disabled' };

export interface FileIndexApi {
  workerReady: boolean;
  errorCount: number;
  status: IndexerStatus;
  /** Last file path the worker reported being processed (any slot).
   *  Surfaced in the indexing banner so users see live activity. */
  currentPath: string | undefined;
  /** Total edges currently in the index across all slots. Surfaced in
   *  the panel as "N references indexed" once the sweep finishes. */
  totalEdges: number;
  /** Approximate in-memory size of the edge table, in bytes. */
  indexBytes: number;
  /** Per-slot progress: pkgId → { indexed, total }. The chip row
   *  reads this to render a per-package fill. */
  progressByPkg: Map<number, SlotProgress>;
  /** Resolves a slot's full status snapshot for hover popovers. Returns
   *  `null` when the indexer hasn't seen this pkgId yet. */
  getSlotDetails(pkgId: number): SlotDetails | null;
  /** Edges sourced from `path` (canonical key). */
  getOutgoing(canonicalPath: string): Edge[];
  /** Edges resolving to `path` (canonical key). */
  getIncoming(canonicalPath: string): Edge[];
}

export interface SlotProgress {
  indexed: number;
  total: number;
  /** Per-extractor (name → count) cumulative file counts. */
  perExtIndexed?: Record<string, number>;
  /** Last file the worker was processing when this update was sent. */
  currentPath?: string;
}

export interface SlotDetails {
  pkgId: number;
  /** Per-extractor breakdown the chip popover renders as
   *  `name · indexed/total`. Absent extractors are skipped. */
  perExt: Array<{ name: string; indexed: number; total: number }>;
  indexed: number;
  total: number;
  /** Last file processed for this slot, if any. */
  currentPath?: string;
  /** Edges this slot is the SOURCE of (its parsed files reference
   *  N targets). */
  outgoingCount: number;
  /** Edges that target a file in this slot (other slots' files
   *  reference this slot N times). */
  incomingCount: number;
  /** True iff the worker has fired final slotDone for this slot. */
  done: boolean;
}

export function useFileIndex({
  cdn,
  slots,
  loading,
  mergedPathIndex,
  enabled,
}: {
  cdn: string;
  slots: IndexedSlot[];
  /** Count of slots whose initial parse is in flight. The indexer
   *  pauses while this is > 0 to avoid contending with the parse
   *  workers. */
  loading: number;
  /** The merged-across-slots path index (lowercase normalized key →
   *  canonical path). Drives resolution for new edges and re-binding
   *  on slot churn. */
  mergedPathIndex: Map<string, string>;
  /** Whether indexing is enabled for this session. When false the
   *  hook short-circuits — no worker, no edges, status is 'disabled'.
   *  The user opts in per-session via the panel's enable button. */
  enabled: boolean;
}): FileIndexApi {
  const stateRef = useRef<IndexState>(createIndexState());
  const workerRef = useRef<Worker | null>(null);
  const attached = useRef<Set<number>>(new Set());
  const currentVersionsRef = useRef<Record<string, number> | null>(null);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  // Edges-version state — bumped after every addEdges / removeSlot /
  // reresolve so consumers see fresh views. Pure tick; the actual
  // edges live in stateRef.
  const [edgeVersion, setEdgeVersion] = useState(0);
  const [progress, setProgress] = useState<Map<number, SlotProgress>>(
    () => new Map(),
  );
  const [perExtTotals, setPerExtTotals] = useState<
    Map<number, Record<string, number>>
  >(() => new Map());
  /** Slots whose final `slotDone` has fired. Status memo compares
   *  against `attachedSlots` to decide indexing-vs-idle without
   *  flickering between sequential slot sweeps. */
  const [doneSlots, setDoneSlots] = useState<Set<number>>(() => new Set());
  /** Mirror of `attached.current` used as a memo dep so status reacts
   *  when slots are attached/detached. */
  const [attachedSlots, setAttachedSlots] = useState<Set<number>>(
    () => new Set(),
  );
  const [workerReady, setWorkerReady] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const [workerError, setWorkerError] = useState(false);
  const bumpEdges = () => setEdgeVersion((v) => v + 1);

  // Defer worker-side state churn (edge inserts, progress/setPerExt
  // map churn) while any package is being parsed. The worker is also
  // told to pause via the effect below, but messages already in the
  // postMessage queue will land — buffering them here lets the main
  // thread stay snappy during the heavy parse.
  const loadingRef = useRef(loading > 0);
  loadingRef.current = loading > 0;
  const bufferedMsgsRef = useRef<WorkerToMain[]>([]);

  // Mirror of `mergedPathIndex` so the stable processMsg can resolve
  // edges against the current path map without being re-created on
  // every slot change.
  const mergedPathIndexRef = useRef(mergedPathIndex);
  mergedPathIndexRef.current = mergedPathIndex;

  // Stable message dispatcher. Keyed off refs so its identity never
  // changes — `w.onmessage` and the buffer drain both call it.
  const processMsgRef = useRef<(msg: WorkerToMain) => void>(() => {});
  processMsgRef.current = (msg: WorkerToMain) => {
    switch (msg.type) {
      case 'ready':
        setWorkerReady(true);
        break;
      case 'edges': {
        for (const edge of msg.edges) {
          edge.resolved = resolveCandidates(edge.candidates, mergedPathIndexRef.current);
        }
        addEdges(stateRef.current, msg.edges);
        bumpEdges();
        break;
      }
      case 'slotMeta': {
        setPerExtTotals((prev) => {
          const next = new Map(prev);
          next.set(msg.pkgId, msg.perExtTotal);
          return next;
        });
        break;
      }
      case 'progress': {
        setProgress((prev) => {
          const next = new Map(prev);
          next.set(msg.pkgId, {
            indexed: msg.indexed,
            total: msg.total,
            perExtIndexed: msg.perExtIndexed,
            currentPath: msg.currentPath,
          });
          return next;
        });
        break;
      }
      case 'slotDone': {
        const slot = slotsRef.current.find((s) => s.pkgId === msg.pkgId);
        if (slot) {
          const record: CachedSlotIndex = { ...msg.record, fileId: slot.fileId };
          void putCachedSlotIndex(record);
        }
        if (msg.final) {
          setProgress((prev) => {
            const cur = prev.get(msg.pkgId);
            if (!cur) return prev;
            const next = new Map(prev);
            next.set(msg.pkgId, {
              ...cur,
              indexed: cur.total,
              total: cur.total,
              currentPath: undefined,
            });
            return next;
          });
          setDoneSlots((prev) => {
            if (prev.has(msg.pkgId)) return prev;
            const next = new Set(prev);
            next.add(msg.pkgId);
            return next;
          });
        }
        break;
      }
      case 'error':
        setErrorCount((c) => c + 1);
        break;
    }
  };

  // Lazy-load extractor versions once on mount; used for cache
  // invalidation on attach.
  useEffect(() => {
    let cancelled = false;
    void Promise.all(EXTRACTOR_LOADERS.map((l) => l())).then((exs) => {
      if (cancelled) return;
      currentVersionsRef.current = Object.fromEntries(
        exs.map((e) => [e.name, e.version]),
      );
      bumpEdges();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Spawn worker once we have at least one slot AND the user opted
  // into indexing for this session. Disabling tears the worker down
  // and clears the in-memory index — re-enabling spawns fresh.
  const wantWorker = enabled && slots.length > 0;
  useEffect(() => {
    if (!wantWorker || workerRef.current) return;
    const w = new Worker(new URL('./index-worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = w;
    w.onmessage = (e: MessageEvent<WorkerToMain>) => {
      const msg = e.data;
      // While any package is parsing, defer all worker-side state
      // updates. 'ready' is the exception — wasm init is cheap and
      // skipping it would leave chips in a "queued" stale state.
      if (loadingRef.current && msg.type !== 'ready') {
        bufferedMsgsRef.current.push(msg);
        return;
      }
      processMsgRef.current(msg);
    };
    w.onerror = () => setWorkerError(true);
    const init: MainToWorker = { type: 'init', cdn };
    w.postMessage(init);
    return () => {
      w.terminate();
      workerRef.current = null;
      setWorkerReady(false);
    };
  }, [wantWorker, cdn]);

  // Pause / resume according to loading flag. When transitioning to
  // not-loading, drain the message buffer in one batch — React will
  // collapse the synchronous setState calls into a single render.
  useEffect(() => {
    if (!workerReady || !workerRef.current) return;
    if (loading > 0) {
      workerRef.current.postMessage({ type: 'pause' } satisfies MainToWorker);
      return;
    }
    workerRef.current.postMessage({ type: 'resume' } satisfies MainToWorker);
    const buffered = bufferedMsgsRef.current;
    if (buffered.length > 0) {
      bufferedMsgsRef.current = [];
      for (const msg of buffered) processMsgRef.current(msg);
    }
  }, [loading, workerReady]);

  // When the user disables indexing, clear the in-memory index so
  // the panel doesn't keep rendering stale edges from a prior session.
  // The worker spawn effect above tears the worker down on its own
  // (wantWorker becomes false → cleanup runs).
  useEffect(() => {
    if (enabled) return;
    stateRef.current = createIndexState();
    attached.current.clear();
    setAttachedSlots(new Set());
    setDoneSlots(new Set());
    setProgress(new Map());
    setPerExtTotals(new Map());
    bufferedMsgsRef.current = [];
    bumpEdges();
  }, [enabled]);

  // Diff slots: detach gone, attach new.
  useEffect(() => {
    if (!workerReady || !workerRef.current) return;
    const versions = currentVersionsRef.current;
    if (!versions) return;
    const want = new Set(slots.map((s) => s.pkgId));

    // Detach.
    for (const pkgId of [...attached.current]) {
      if (want.has(pkgId)) continue;
      workerRef.current.postMessage({ type: 'detach', pkgId } satisfies MainToWorker);
      removeSlot(stateRef.current, pkgId);
      attached.current.delete(pkgId);
      setAttachedSlots((prev) => {
        if (!prev.has(pkgId)) return prev;
        const next = new Set(prev);
        next.delete(pkgId);
        return next;
      });
      setDoneSlots((prev) => {
        if (!prev.has(pkgId)) return prev;
        const next = new Set(prev);
        next.delete(pkgId);
        return next;
      });
      setProgress((prev) => {
        if (!prev.has(pkgId)) return prev;
        const next = new Map(prev);
        next.delete(pkgId);
        return next;
      });
      setPerExtTotals((prev) => {
        if (!prev.has(pkgId)) return prev;
        const next = new Map(prev);
        next.delete(pkgId);
        return next;
      });
      bumpEdges();
    }

    // Attach.
    for (const slot of slots) {
      if (attached.current.has(slot.pkgId)) continue;
      attached.current.add(slot.pkgId);
      setAttachedSlots((prev) => {
        const next = new Set(prev);
        next.add(slot.pkgId);
        return next;
      });
      void loadCachedSlotIndex(slot.fileId).then((cached) => {
        const validated = cached ? applyCacheInvalidation(cached, versions) : null;
        if (validated && validated.edges.length > 0) {
          // Cached edges retain the fromPkgId they were extracted under
          // — pkgIds are session-local, so we must rewrite them to the
          // current slot's id before seeding, otherwise edgesByPkg gets
          // entries keyed under stale ids.
          const seeded: Edge[] = validated.edges.map((e) => ({
            ...e,
            fromPkgId: slot.pkgId,
            resolved: resolveCandidates(e.candidates, mergedPathIndex),
          }));
          addEdges(stateRef.current, seeded);
          bumpEdges();
        }
        const attach: MainToWorker = {
          type: 'attach',
          pkgId: slot.pkgId,
          pckFile: slot.pckFile,
          pkxFiles: slot.pkxFiles,
          fileList: slot.fileList,
          currentVersions: versions,
          cachedRecord: validated,
        };
        workerRef.current?.postMessage(attach);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, workerReady]);

  // Re-resolve when the merged path index changes.
  useEffect(() => {
    reresolve(stateRef.current, mergedPathIndex);
    bumpEdges();
  }, [mergedPathIndex]);

  // Maintain `pkgIdByPath` ownership for incoming-degree accounting.
  // First-pkg-wins on cross-package collision (matches the existing
  // `findFile` convention).
  useEffect(() => {
    const owner = new Map<string, number>();
    for (const slot of slots) {
      for (const f of slot.fileList) {
        const key = normalizePathKey(f);
        if (!owner.has(key)) owner.set(key, slot.pkgId);
      }
    }
    rebuildOwnership(stateRef.current, owner);
    bumpEdges();
  }, [slots]);

  // Grand total = parseable file count summed across attached slots
  // — sourced from each slot's `slotMeta` (computed off the main
  // thread on attach). Used as the indexer denominator.
  const grandTotal = useMemo(() => {
    let sum = 0;
    for (const rec of perExtTotals.values()) {
      for (const n of Object.values(rec)) sum += n;
    }
    return sum;
  }, [perExtTotals]);

  const status = useMemo<IndexerStatus>(() => {
    if (!enabled) return { kind: 'disabled' };
    if (workerError) return { kind: 'error-disabled' };
    if (loading > 0 && workerReady) return { kind: 'paused-loading' };
    // A slot counts as "fully indexed" only when its final slotDone
    // has fired — not when its progress sums to total. The worker
    // queues slots sequentially and a slot's progress reaches total
    // momentarily before the next one starts; checking doneSlots
    // avoids that flicker.
    const allDone =
      attachedSlots.size > 0 &&
      [...attachedSlots].every((id) => doneSlots.has(id));
    if (allDone || attachedSlots.size === 0) return { kind: 'idle' };
    let indexed = 0;
    for (const v of progress.values()) indexed += v.indexed;
    return { kind: 'indexing', indexed, total: grandTotal };
  }, [
    enabled,
    workerError,
    loading,
    workerReady,
    progress,
    attachedSlots,
    doneSlots,
    grandTotal,
  ]);

  const currentPath = useMemo<string | undefined>(() => {
    let latest: string | undefined;
    for (const v of progress.values()) {
      if (v.currentPath) latest = v.currentPath;
    }
    return latest;
  }, [progress]);

  // Stable lookup callbacks. They re-create only when edges change so
  // panel consumers don't re-memo on every progress message; the
  // reducer's mutated buckets are sliced before return so React still
  // sees a fresh array reference per call.
  const getOutgoingStable = useCallback(
    (p: string) => (stateRef.current.byFrom.get(p) ?? []).slice(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edgeVersion],
  );
  const getIncomingStable = useCallback(
    (p: string) => (stateRef.current.byTo.get(p) ?? []).slice(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edgeVersion],
  );

  // getSlotDetails legitimately depends on progress + perExt + done +
  // edges, so it does change on progress messages — chip popovers
  // need fresh data. Wrap in useCallback so its identity is stable
  // *within* a render where deps haven't shifted.
  const getSlotDetailsStable = useCallback(
    (pkgId: number): SlotDetails | null => {
      const totals = perExtTotals.get(pkgId);
      const prog = progress.get(pkgId);
      if (!totals && !prog) return null;
      const totalsRec = totals ?? {};
      const indexedRec = prog?.perExtIndexed ?? {};
      const perExt = Object.keys(totalsRec)
        .map((name) => ({
          name,
          indexed: indexedRec[name] ?? 0,
          total: totalsRec[name] ?? 0,
        }))
        .filter((row) => row.total > 0);
      return {
        pkgId,
        perExt,
        indexed: prog?.indexed ?? 0,
        total: prog?.total ?? 0,
        currentPath: prog?.currentPath,
        outgoingCount: stateRef.current.edgesByPkg.get(pkgId) ?? 0,
        incomingCount: stateRef.current.inDegreeByPkg.get(pkgId) ?? 0,
        done: doneSlots.has(pkgId),
      };
    },
    [progress, perExtTotals, doneSlots],
  );

  return useMemo<FileIndexApi>(() => {
    const s = stateRef.current;
    return {
      workerReady,
      errorCount,
      status,
      currentPath,
      totalEdges: s.edges.length,
      indexBytes: s.bytes,
      progressByPkg: progress,
      getSlotDetails: getSlotDetailsStable,
      getOutgoing: getOutgoingStable,
      getIncoming: getIncomingStable,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    workerReady,
    errorCount,
    status,
    currentPath,
    edgeVersion,
    progress,
    perExtTotals,
    doneSlots,
  ]);
}
