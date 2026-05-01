/** Bumped only on incompatible structural change to CachedSlotIndex. */
export const SCHEMA_VERSION = 1;

/** Extractor output. Serializable, scope-tag-free; engine-prefix knowledge
 *  lives inside each extractor. */
export interface RawRef {
  /** Free-form panel-grouping label. Examples: 'skin-model', 'skeleton',
   *  'additional-skin', 'child-ecm', 'animation', 'gfx', 'model', 'texture'. */
  kind: string;
  /** Human-readable display string for broken-link rendering. */
  raw: string;
  /** Already-prefixed/relative-resolved candidate paths in priority order.
   *  The resolver picks the first one that hits the merged path index. */
  candidates: string[];
  /** Optional: for refs that target a directory rather than one file
   *  (e.g. SMD's tcksDir → many .stck animations). Each entry is a
   *  candidate directory prefix in priority order. The indexer expands
   *  the first dir that has any matching member into one edge per file
   *  whose path ends with `dirExt`. */
  dirCandidates?: string[];
  /** When `dirCandidates` is set, the indexer keeps only directory
   *  members whose path ends with this lowercase extension. */
  dirExt?: string;
}

/** One edge in the index. Stored both in memory and in IDB. */
export interface Edge {
  fromPkgId: number;
  fromPath: string;     // canonical via normalizePath
  fromName: string;     // RefExtractor.name — used for type-scoped invalidation
  kind: string;
  raw: string;
  candidates: string[];
  /** Canonical path of the first candidate that resolved against the
   *  merged path index at the time this edge was last (re-)resolved.
   *  Re-bound on slot churn. */
  resolved: string | null;
}

/** Per-slot IDB record. Keyed by `fileId` in the 'slot-index' object store. */
export interface CachedSlotIndex {
  fileId: string;
  schemaVersion: number;
  /** Map of RefExtractor.name -> version that produced the cached
   *  edges. Contains *finished* extractors only — extractors that have
   *  fully scanned every file of their extension at the cached
   *  version. */
  perTypeVersions: Record<string, number>;
  /** Partial-write resume: map of name -> first not-yet-indexed file
   *  index in the slot's fileList for that extractor. Absent for
   *  fully-indexed types. */
  cursor?: Record<string, number>;
  /** Version of the extractor that produced each `cursor` entry.
   *  Required for invalidation: a cursor is only safe to resume when
   *  the current extractor still emits at the same version. Older
   *  records without this field force a re-scan of any in-progress
   *  extractor — safe but slower. */
  cursorVersions?: Record<string, number>;
  edges: Edge[];
  indexedAt: number;
}
