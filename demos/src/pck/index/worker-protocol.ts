import type { CachedSlotIndex, Edge } from './types';

export interface AttachMsg {
  type: 'attach';
  pkgId: number;
  pckFile: File;
  pkxFiles: File[];
  fileList: string[];
  /** Currently-known per-extractor versions (used by the worker only as
   *  metadata to stamp on emitted records). */
  currentVersions: Record<string, number>;
  /** Pre-invalidated cache record, if any. The worker treats its
   *  `edges` as already-extracted seed and resumes any partial cursor. */
  cachedRecord: CachedSlotIndex | null;
}

export type MainToWorker =
  | { type: 'init'; cdn: string }
  | AttachMsg
  | { type: 'detach'; pkgId: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'reindex'; pkgId: number; names: string[] };

export type WorkerToMain =
  | { type: 'ready' }
  | { type: 'edges'; pkgId: number; edges: Edge[] }
  | {
      type: 'slotMeta';
      pkgId: number;
      /** Constant for the slot's lifetime: extractor name → file
       *  count for that extractor's extension in this slot. Sent
       *  once after attach so the chip popover can show denominators
       *  before any progress arrives. */
      perExtTotal: Record<string, number>;
    }
  | {
      type: 'progress';
      pkgId: number;
      /** Cumulative count of files processed across all extractors for
       *  this slot. */
      indexed: number;
      /** Constant per slot: count of files in `fileList` whose
       *  extension has a matching extractor. Set at slot-scan start
       *  and unchanged for the rest of the sweep. */
      total: number;
      /** Per-extractor cumulative file counts for this slot. */
      perExtIndexed: Record<string, number>;
      /** Last file processed at the time this batch was emitted.
       *  May be undefined for the initial pre-scan progress. */
      currentPath: string | undefined;
    }
  | {
      type: 'slotDone';
      pkgId: number;
      record: CachedSlotIndex;
      /** True iff this is the final emit for the slot's sweep (no
       *  more `edges`/`progress` messages will follow). Checkpoint
       *  emits set this to false. */
      final: boolean;
    }
  | {
      type: 'error';
      pkgId: number | null;
      path: string | null;
      message: string;
    };
