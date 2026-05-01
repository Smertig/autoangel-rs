import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildTree, emptyTreeNode, type TreeNode } from '@shared/components/FileTree';
import type { KeyConfig } from '@shared/components/KeysPanel';
import type { PackageDrop } from '@shared/util/files';
import { normalizePath } from '@shared/util/path';
import { ColorAllocator, PACKAGE_COLORS } from './colors';
import { fileFingerprint } from './history/types';

// --- Public types ---

export interface PackageSlot {
  pkgId: number;
  stem: string;
  colorIndex: number;
  color: string;
  fileList: string[];
  tree: TreeNode;
  version: number;
  /** Number of files inside the .pck. */
  fileCount: number;
  /** Original `.pck` filename as the user dropped it. */
  pckName: string;
  /** Size in bytes of the `.pck` file on disk. */
  pckSize: number;
  /** Stable id for the underlying `.pck` (`name|size|mtime`). */
  fileId: string;
}

export interface LoadingEntry {
  /** The transient pkgId being parsed; stable React key while this parse is alive. */
  pkgId: number;
  stem: string;
  /** The color already reserved for this package — rendered as a progress bar fill. */
  color: string;
  /** 0..100, or null = indeterminate (parse started but no progress reported yet). */
  progress: number | null;
}

export interface UsePackageSlotsResult {
  /** Loaded slots, ordered by pkgId. */
  slots: PackageSlot[];
  /**
   * Packages currently being parsed. Entries appear as soon as parsing starts
   * and are removed on success or failure. Ordered by insertion (pkgId asc).
   */
  loadingEntries: LoadingEntry[];
  /**
   * Parses drops in parallel; successes appear in `slots` even if some drops
   * fail. If any drop fails, an aggregated error is thrown after successful
   * slots have been added.
   */
  loadPackages: (drops: PackageDrop[], keys: KeyConfig | null) => Promise<void>;
  /**
   * Terminates the worker for `pkgId` and removes the slot. Pending `getFile`
   * calls against that slot reject with `PackageRemovedError`.
   */
  removeSlot: (pkgId: number) => void;
  /**
   * Replaces the slot for `pkgId` with a new one parsed from `drop`, keeping
   * the old slot's `colorIndex` on the new slot. Throws if `pkgId` is unknown.
   */
  replaceSlot: (pkgId: number, drop: PackageDrop, keys: KeyConfig | null) => Promise<void>;
  /**
   * Returns decompressed file data for `path` in the slot identified by
   * `pkgId`. Rejects with `PackageRemovedError` if the slot is removed
   * mid-call.
   */
  getFile: (pkgId: number, path: string) => Promise<Uint8Array>;
  /**
   * Returns the underlying `pck`/`pkx` File handles for `pkgId`, or
   * `null` if the slot is unknown. Used by the cross-reference indexer
   * to read the package independently of the rendering worker.
   */
  getSlotInputs: (pkgId: number) => { pckFile: File; pkxFiles: File[] } | null;
}

/**
 * Rejection used for `getFile` promises that were in flight when their slot
 * was removed. Callers distinguish via `err instanceof PackageRemovedError`
 * and should treat it as a silent abort, not surface an error banner.
 */
export class PackageRemovedError extends Error {}

// --- Internals ---

interface PendingEntry {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  /**
   * Called for every `progress` message matching this request id. The rest of
   * the message payload (minus `id`/`type`) is forwarded as-is so callers can
   * read `{phase, index, total}`.
   */
  onProgress?: (data: unknown) => void;
}

interface InternalSlot {
  public: PackageSlot;
  pckFile: File;
  pkxFiles: File[];
  worker: Worker;
  pending: Map<number, PendingEntry>;
  msgIdCounter: number;
}

interface ParseResult {
  fileList: string[];
  version: number;
  fileCount: number;
}

/**
 * Post a message to `worker` and return a promise that resolves (or rejects)
 * when the worker replies with a matching id. The returned promise rejects
 * with `PackageRemovedError` if `removeSlot` tears down the pending map.
 * Progress messages for the same id are forwarded to `onProgress` when
 * provided (the handler is kept until the request settles).
 */
function postRequest<T>(
  slot: InternalSlot,
  msg: Record<string, unknown>,
  onProgress?: (data: unknown) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = ++slot.msgIdCounter;
    slot.pending.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
      onProgress,
    });
    slot.worker.postMessage({ id, ...msg });
  });
}

/**
 * Install the canonical onmessage handler for a slot's worker. `progress`
 * messages are dispatched to the request's `onProgress` callback (if any);
 * `chunk` messages are still ignored (the multi-package viewer has no use for
 * streaming entry chunks). `result`, `done`, and `error` messages settle the
 * matching pending entry.
 */
function attachHandler(slot: InternalSlot): void {
  slot.worker.onmessage = (e: MessageEvent) => {
    const { id, type, message, ...rest } = e.data as {
      id: number;
      type: string;
      message?: string;
      [key: string]: unknown;
    };

    if (type === 'chunk') return;

    if (type === 'progress') {
      const entry = slot.pending.get(id);
      entry?.onProgress?.(rest);
      return;
    }

    const entry = slot.pending.get(id);
    if (!entry) return;
    slot.pending.delete(id);

    if (type === 'error') {
      entry.reject(new Error(message ?? 'Worker error'));
    } else {
      entry.resolve(rest);
    }
  };
}

/**
 * Spawn a worker, post the `init` message, and wait for it to settle. Returns
 * the initialized worker or throws if init failed (caller is responsible for
 * terminating if thrown).
 */
async function spawnInitializedWorker(cdn: string): Promise<{ worker: Worker; pending: Map<number, PendingEntry> }> {
  const worker = new Worker(new URL('./pck-worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, PendingEntry>();

  // Temporary slot-like handle so we can reuse postRequest for init.
  const tempSlot = { worker, pending, msgIdCounter: 0 } as InternalSlot;
  attachHandler(tempSlot);

  try {
    await postRequest<unknown>(tempSlot, { type: 'init', cdn });
  } catch (e) {
    worker.terminate();
    throw e;
  }

  return { worker, pending };
}

/** Tear down a slot: reject all pending promises with `PackageRemovedError` and terminate. */
function disposeSlot(slot: InternalSlot): void {
  slot.worker.onmessage = null;
  for (const entry of slot.pending.values()) {
    entry.reject(new PackageRemovedError());
  }
  slot.pending.clear();
  slot.worker.terminate();
}

// --- Hook ---

export function usePackageSlots(cdn: string): UsePackageSlotsResult {
  const slotsRef = useRef<Map<number, InternalSlot>>(new Map());
  const loadingMapRef = useRef<Map<number, LoadingEntry>>(new Map());
  const colorAllocRef = useRef<ColorAllocator>(new ColorAllocator());
  const pkgIdCounterRef = useRef<number>(0);
  // Two counters so per-tick progress updates only invalidate `loadingEntries`
  // (and the chip row) — `slots`, `mergedTree`, and `slotLookup` stay stable.
  const [slotsVersion, setSlotsVersion] = useState<number>(0);
  const [loadingVersion, setLoadingVersion] = useState<number>(0);

  const bumpSlots = useCallback(() => setSlotsVersion((v) => v + 1), []);
  const bumpLoading = useCallback(() => setLoadingVersion((v) => v + 1), []);

  useEffect(() => {
    const slotsMap = slotsRef.current;
    return () => {
      for (const slot of slotsMap.values()) disposeSlot(slot);
      slotsMap.clear();
    };
  }, []);

  const createSlot = useCallback(
    async (
      drop: PackageDrop,
      keys: KeyConfig | null,
      reuseColorIndex: number | null,
    ): Promise<InternalSlot> => {
      const { worker, pending } = await spawnInitializedWorker(cdn);

      const pkgId = ++pkgIdCounterRef.current;
      const colorAlloc = colorAllocRef.current;
      const colorPick =
        reuseColorIndex !== null
          ? { index: reuseColorIndex, color: PACKAGE_COLORS[reuseColorIndex] }
          : colorAlloc.allocate();

      const slot: InternalSlot = {
        public: {
          pkgId,
          stem: drop.stem,
          colorIndex: colorPick.index,
          color: colorPick.color,
          fileList: [],
          tree: emptyTreeNode(),
          version: 0,
          fileCount: 0,
          pckName: drop.pck.name,
          pckSize: drop.pck.size,
          fileId: fileFingerprint(drop.pck),
        },
        pckFile: drop.pck,
        pkxFiles: drop.pkxFiles,
        worker,
        pending,
        msgIdCounter: 0,
      };
      attachHandler(slot);

      // Register the loading entry so the UI can render a placeholder chip for
      // this parse. Removed (below) in `finally` on both success and failure.
      loadingMapRef.current.set(pkgId, {
        pkgId,
        stem: drop.stem,
        color: colorPick.color,
        progress: null,
      });
      bumpLoading();

      try {
        const result = await postRequest<ParseResult>(
          slot,
          {
            type: 'parseFile',
            pckFile: drop.pck,
            pkxFiles: drop.pkxFiles,
            keys: keys ?? undefined,
          },
          (data) => {
            const { index, total } = data as { index?: number; total?: number };
            if (typeof index !== 'number' || typeof total !== 'number' || total <= 0) return;
            const pct = Math.min(100, Math.max(0, Math.round(((index + 1) / total) * 100)));
            const existing = loadingMapRef.current.get(pkgId);
            if (!existing || existing.progress === pct) return;
            loadingMapRef.current.set(pkgId, { ...existing, progress: pct });
            bumpLoading();
          },
        );
        // Normalize at the WASM boundary — see `shared/util/path.ts`.
        const fileList = result.fileList.map(normalizePath);
        slot.public.fileList = fileList;
        slot.public.tree = buildTree(fileList);
        slot.public.version = result.version;
        slot.public.fileCount = result.fileCount;
      } catch (e) {
        disposeSlot(slot);
        if (reuseColorIndex === null) {
          // Only release if we allocated a fresh color (replace preserves caller's color).
          colorAlloc.release(colorPick.index);
        }
        throw e;
      } finally {
        loadingMapRef.current.delete(pkgId);
        bumpLoading();
      }

      return slot;
    },
    [cdn, bumpLoading],
  );

  const loadPackages = useCallback(
    async (drops: PackageDrop[], keys: KeyConfig | null): Promise<void> => {
      const failures: Array<{ stem: string; reason: string }> = [];
      // Insert each slot as soon as its parse finishes so chips and the merged
      // tree appear progressively instead of waiting for the slowest drop.
      await Promise.all(
        drops.map(async (d) => {
          try {
            const slot = await createSlot(d, keys, null);
            slotsRef.current.set(slot.public.pkgId, slot);
            bumpSlots();
          } catch (e) {
            const reason = e instanceof Error ? e.message : String(e);
            failures.push({ stem: d.stem, reason });
          }
        }),
      );

      if (failures.length > 0) {
        const msg =
          'Failed to load: ' + failures.map((f) => `${f.stem} (${f.reason})`).join(', ');
        throw new Error(msg);
      }
    },
    [createSlot, bumpSlots],
  );

  const removeSlot = useCallback(
    (pkgId: number): void => {
      const slot = slotsRef.current.get(pkgId);
      if (!slot) return;
      slotsRef.current.delete(pkgId);
      colorAllocRef.current.release(slot.public.colorIndex);
      disposeSlot(slot);
      bumpSlots();
    },
    [bumpSlots],
  );

  const replaceSlot = useCallback(
    async (pkgId: number, drop: PackageDrop, keys: KeyConfig | null): Promise<void> => {
      const old = slotsRef.current.get(pkgId);
      if (!old) {
        throw new Error(`replaceSlot: unknown pkgId ${pkgId}`);
      }

      const reuseColorIndex = old.public.colorIndex;
      // Remove old slot first — spec: "the old slot is already gone" on failure.
      slotsRef.current.delete(pkgId);
      disposeSlot(old);
      bumpSlots();

      let next: InternalSlot;
      try {
        next = await createSlot(drop, keys, reuseColorIndex);
      } catch (e) {
        // Old slot already terminated. Release reused color (createSlot didn't
        // release it because we told it to reuse). Re-throw with context.
        colorAllocRef.current.release(reuseColorIndex);
        const reason = e instanceof Error ? e.message : String(e);
        throw new Error(`Failed to replace ${drop.stem}: ${reason}`);
      }

      slotsRef.current.set(next.public.pkgId, next);
      bumpSlots();
    },
    [createSlot, bumpSlots],
  );

  const getFile = useCallback(async (pkgId: number, path: string): Promise<Uint8Array> => {
    const slot = slotsRef.current.get(pkgId);
    if (!slot) throw new PackageRemovedError();

    const result = await postRequest<{ data: ArrayBuffer; byteOffset: number; byteLength: number }>(
      slot,
      { type: 'getFile', path },
    );
    return new Uint8Array(result.data, result.byteOffset, result.byteLength);
  }, []);

  const getSlotInputs = useCallback(
    (pkgId: number): { pckFile: File; pkxFiles: File[] } | null => {
      const slot = slotsRef.current.get(pkgId);
      if (!slot) return null;
      return { pckFile: slot.pckFile, pkxFiles: slot.pkxFiles };
    },
    [],
  );

  const slots = useMemo<PackageSlot[]>(() => {
    const arr = [...slotsRef.current.values()];
    arr.sort((a, b) => a.public.pkgId - b.public.pkgId);
    return arr.map((s) => s.public);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotsVersion]);

  const loadingEntries = useMemo<LoadingEntry[]>(() => {
    const arr = [...loadingMapRef.current.values()];
    arr.sort((a, b) => a.pkgId - b.pkgId);
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingVersion]);

  return { slots, loadingEntries, loadPackages, removeSlot, replaceSlot, getFile, getSlotInputs };
}
