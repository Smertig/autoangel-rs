/// <reference lib="webworker" />

import { getExtension } from '@shared/util/files';
import { EXTRACTOR_LOADERS, type RefExtractor } from './extractors';
import { expandDirRef } from './resolver';
import { SCHEMA_VERSION, type CachedSlotIndex, type Edge } from './types';
import type { MainToWorker, WorkerToMain } from './worker-protocol';

type IndexerState = 'init' | 'idle' | 'indexing' | 'paused';

let cdn: string | null = null;
let state: IndexerState = 'init';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wasm: any = null;

let extractors: RefExtractor[] | null = null;
async function loadExtractors(): Promise<RefExtractor[]> {
  if (extractors) return extractors;
  extractors = await Promise.all(EXTRACTOR_LOADERS.map((load) => load()));
  return extractors;
}

async function initWasm(cdnUrl: string): Promise<void> {
  const mod = await import(/* @vite-ignore */ `${cdnUrl}/autoangel.js`);
  await mod.default(`${cdnUrl}/autoangel_bg.wasm`);
  wasm = mod;
}

function post(msg: WorkerToMain): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (self as any).postMessage(msg);
}

interface SlotJob {
  pckFile: File;
  pkxFiles: File[];
  fileList: string[];
  /** Cumulative edge buffer (seed + extracted). Used to compose IDB
   *  records and to detect duplicate seeds on resume. */
  edges: Edge[];
  perTypeVersions: Record<string, number>;
  /** Per-extractor file index to resume from. Set on partial cache
   *  hit; cleared as each extractor finishes. */
  cursor: Record<string, number>;
  /** Set true on `detach`; the loop's per-iteration check drops the
   *  slot before further work or persistence. */
  cancelled: boolean;
  /** True once the slot's record has been emitted as final (no more
   *  `slotDone` should land for this pkgId). */
  done: boolean;
  /** Lazily-built `normalizedKey -> canonical` map of the slot's
   *  fileList. Used for dir-ref expansion via the shared
   *  `expandDirRef`; the per-slot cache avoids re-normalizing the
   *  full list per ref. */
  pathIndex: Map<string, string> | null;
}

const slotJobs = new Map<number, SlotJob>();
const queue: number[] = [];
let workerLoopRunning = false;

/** Compute and post the slot's per-extractor file totals as soon as
 *  it's attached, so the main thread has a stable indexer denominator
 *  before the slot's turn comes up in the processing queue. */
async function emitSlotMeta(pkgId: number, job: SlotJob): Promise<void> {
  const exs = await loadExtractors();
  const perExtTotal: Record<string, number> = {};
  for (const ex of exs) perExtTotal[ex.name] = 0;
  for (const f of job.fileList) {
    const ext = getExtension(f);
    for (const ex of exs) {
      if (ex.ext === ext) {
        perExtTotal[ex.name] = (perExtTotal[ex.name] ?? 0) + 1;
        break;
      }
    }
  }
  if (job.cancelled) return;
  post({ type: 'slotMeta', pkgId, perExtTotal });
}

/** Build a `normalizedKey -> canonical` map from a slot's fileList,
 *  cached on the SlotJob and shared between dir-ref expansion and
 *  any other key-based lookup. The cache amortizes the cost across
 *  every dir ref the slot's extractors emit. */
function getOrBuildPathIndex(job: SlotJob): Map<string, string> {
  if (job.pathIndex) return job.pathIndex;
  // `job.fileList` items are already in canonical JS form (lowercase +
  // forward-slash) — keyed by themselves.
  const m = new Map<string, string>();
  for (const f of job.fileList) m.set(f, f);
  job.pathIndex = m;
  return m;
}

const BATCH_SIZE = 200;
const CHECKPOINT_EVERY = 5000;
const YIELD_MS = 25;

async function openPkg(job: SlotJob): Promise<unknown> {
  const opts: Record<string, unknown> = {};
  if (job.pkxFiles.length > 0) opts.pkxFiles = job.pkxFiles;
  return await wasm.PckPackage.openFile(job.pckFile, opts);
}

async function waitWhilePaused(job: SlotJob): Promise<void> {
  while (state === 'paused' && !job.cancelled) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function processSlot(pkgId: number): Promise<void> {
  const job = slotJobs.get(pkgId);
  if (!job || job.done) return;

  state = 'indexing';
  const exs = await loadExtractors();
  const byExt = new Map<string, RefExtractor>(exs.map((e) => [e.ext, e]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pkg: any = null;
  try {
    pkg = await openPkg(job);
  } catch (err) {
    post({
      type: 'error',
      pkgId,
      path: null,
      message: err instanceof Error ? err.message : String(err),
    });
    job.done = true;
    return;
  }

  let pendingBatch: Edge[] = [];
  const flushEdges = () => {
    if (pendingBatch.length === 0) return;
    post({ type: 'edges', pkgId, edges: pendingBatch });
    pendingBatch = [];
  };

  // Group files by extension up front. Extractors with no matching
  // files still get their version stamped (for invalidation).
  const filesByExt = new Map<string, string[]>();
  for (const f of job.fileList) {
    const ext = getExtension(f);
    const arr = filesByExt.get(ext);
    if (arr) arr.push(f);
    else filesByExt.set(ext, [f]);
  }

  // Slot-fixed total: count of files matched by any extractor. This is
  // the denominator the UI shows; it does not move during the sweep.
  let slotTotal = 0;
  const perExtTotal: Record<string, number> = {};
  const perExtIndexed: Record<string, number> = {};
  for (const ex of byExt.values()) {
    const count = filesByExt.get(ex.ext)?.length ?? 0;
    slotTotal += count;
    perExtTotal[ex.name] = count;
    perExtIndexed[ex.name] = 0;
  }
  let slotIndexed = 0;
  // Bring slotIndexed (and per-ext counts) up to where the cursor /
  // cached version says we already are.
  for (const [ext, ex] of byExt) {
    const count = filesByExt.get(ext)?.length ?? 0;
    if (job.cursor[ex.name] !== undefined) {
      const pre = Math.min(job.cursor[ex.name], count);
      slotIndexed += pre;
      perExtIndexed[ex.name] = pre;
    } else if (job.perTypeVersions[ex.name] === ex.version) {
      slotIndexed += count;
      perExtIndexed[ex.name] = count;
    }
  }
  // slotMeta is emitted at attach time (see `emitSlotMeta`); skip
  // re-emission here. Initial progress still goes out so the indexer
  // banner has a starting indexed count for resumed slots.
  post({
    type: 'progress',
    pkgId,
    indexed: slotIndexed,
    total: slotTotal,
    perExtIndexed: { ...perExtIndexed },
    currentPath: undefined,
  });

  let processedSinceCheckpoint = 0;
  let lastYield = Date.now();

  for (const [ext, ex] of byExt) {
    if (job.cancelled) break;
    // Cache hit: this extractor's edges were already seeded into
    // job.edges and slotIndexed. No re-scan needed.
    if (
      job.perTypeVersions[ex.name] === ex.version &&
      job.cursor[ex.name] === undefined
    ) {
      continue;
    }
    const files = filesByExt.get(ext) ?? [];
    if (files.length === 0) {
      job.perTypeVersions[ex.name] = ex.version;
      continue;
    }
    const startAt = job.cursor[ex.name] ?? 0;
    for (let i = startAt; i < files.length; i++) {
      await waitWhilePaused(job);
      if (job.cancelled) break;

      // `path` already canonical — `job.fileList` was normalized at the
      // WASM boundary in `usePackageSlots`.
      const path = files[i];
      const fromPath = path;
      try {
        const data = await pkg.getFile(path);
        if (!data) throw new Error('decompression failed');
        const refs = ex.extract(data, path, wasm);
        for (const r of refs) {
          // Dir-style refs (e.g. SMD tcksDir → many .stck) expand
          // against the slot's own fileList here; the main thread
          // sees only flat Edges. If no dir candidate has matches,
          // emit one dangling edge so the panel can show "missing
          // animations" via `raw`.
          if (r.dirCandidates && r.dirCandidates.length > 0 && r.dirExt) {
            const matches = expandDirRef(
              r.dirCandidates,
              r.dirExt,
              getOrBuildPathIndex(job),
            );
            if (matches.length === 0) {
              const edge: Edge = {
                fromPkgId: pkgId,
                fromPath,
                fromName: ex.name,
                kind: r.kind,
                raw: r.raw,
                candidates: r.dirCandidates.slice(),
                resolved: null,
              };
              job.edges.push(edge);
              pendingBatch.push(edge);
            } else {
              for (const m of matches) {
                const edge: Edge = {
                  fromPkgId: pkgId,
                  fromPath,
                  fromName: ex.name,
                  kind: r.kind,
                  raw: m,
                  candidates: [m],
                  resolved: null,
                };
                job.edges.push(edge);
                pendingBatch.push(edge);
              }
            }
          } else {
            const edge: Edge = {
              fromPkgId: pkgId,
              fromPath,
              fromName: ex.name,
              kind: r.kind,
              raw: r.raw,
              candidates: r.candidates.slice(),
              resolved: null,
            };
            job.edges.push(edge);
            pendingBatch.push(edge);
          }
        }
      } catch (err) {
        post({
          type: 'error',
          pkgId,
          path,
          message: err instanceof Error ? err.message : String(err),
        });
      }
      processedSinceCheckpoint += 1;
      slotIndexed += 1;
      perExtIndexed[ex.name] = (perExtIndexed[ex.name] ?? 0) + 1;

      if (
        pendingBatch.length >= BATCH_SIZE ||
        Date.now() - lastYield >= YIELD_MS
      ) {
        flushEdges();
        post({
          type: 'progress',
          pkgId,
          indexed: slotIndexed,
          total: slotTotal,
          perExtIndexed: { ...perExtIndexed },
          currentPath: path,
        });
        await new Promise((r) => setTimeout(r, YIELD_MS));
        lastYield = Date.now();
      }
      if (processedSinceCheckpoint >= CHECKPOINT_EVERY && !job.cancelled) {
        job.cursor[ex.name] = i + 1;
        const cursorVersions: Record<string, number> = {};
        for (const cx of byExt.values()) {
          if (job.cursor[cx.name] !== undefined) {
            cursorVersions[cx.name] = cx.version;
          }
        }
        const record: CachedSlotIndex = {
          fileId: '', // main thread fills this in.
          schemaVersion: SCHEMA_VERSION,
          perTypeVersions: { ...job.perTypeVersions },
          cursor: { ...job.cursor },
          cursorVersions,
          edges: job.edges.slice(),
          indexedAt: Date.now(),
        };
        post({ type: 'slotDone', pkgId, record, final: false });
        processedSinceCheckpoint = 0;
      }
    }
    if (!job.cancelled) {
      job.perTypeVersions[ex.name] = ex.version;
      delete job.cursor[ex.name];
    }
  }

  flushEdges();
  // Final progress emit so the UI banner clears.
  if (!job.cancelled) {
    // At completion, every extractor's indexed count equals its total
    // — fill in any extractors we never iterated (those whose ext was
    // already cache-valid and skipped).
    for (const ex of byExt.values()) {
      perExtIndexed[ex.name] = perExtTotal[ex.name];
    }
    post({
      type: 'progress',
      pkgId,
      indexed: slotTotal,
      total: slotTotal,
      perExtIndexed: { ...perExtIndexed },
      currentPath: undefined,
    });
  }
  try {
    pkg.free?.();
  } catch {
    // ignore
  }

  if (!job.cancelled) {
    const record: CachedSlotIndex = {
      fileId: '',
      schemaVersion: SCHEMA_VERSION,
      perTypeVersions: { ...job.perTypeVersions },
      cursor: undefined,
      edges: job.edges,
      indexedAt: Date.now(),
    };
    job.done = true;
    post({ type: 'slotDone', pkgId, record, final: true });
  }
}

async function runQueue(): Promise<void> {
  if (workerLoopRunning) return;
  workerLoopRunning = true;
  try {
    while (queue.length > 0) {
      const pkgId = queue.shift()!;
      const job = slotJobs.get(pkgId);
      if (!job || job.cancelled) continue;
      await processSlot(pkgId);
    }
    state = 'idle';
  } finally {
    workerLoopRunning = false;
  }
}

self.onmessage = async (e: MessageEvent<MainToWorker>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'init':
        cdn = msg.cdn;
        await initWasm(cdn);
        state = 'idle';
        post({ type: 'ready' });
        return;
      case 'attach': {
        const seed = msg.cachedRecord;
        // pkgId is session-local; rewrite cached edges' fromPkgId to
        // the current attach id before seeding so subsequent slotDone
        // records persist with the right id (and so anything keyed
        // off fromPkgId — counters, removeSlot — works correctly).
        const seededEdges: Edge[] = seed?.edges
          ? seed.edges.map((e) => ({ ...e, fromPkgId: msg.pkgId }))
          : [];
        const job: SlotJob = {
          pckFile: msg.pckFile,
          pkxFiles: msg.pkxFiles,
          fileList: msg.fileList,
          edges: seededEdges,
          perTypeVersions: { ...(seed?.perTypeVersions ?? {}) },
          cursor: { ...(seed?.cursor ?? {}) },
          cancelled: false,
          done: false,
          pathIndex: null,
        };
        slotJobs.set(msg.pkgId, job);
        // Emit slotMeta as soon as we receive the attach — without
        // waiting for the slot's turn in the indexing queue. Saves
        // the main thread from walking fileList itself just to know
        // the parseable-file denominator.
        void emitSlotMeta(msg.pkgId, job);
        queue.push(msg.pkgId);
        void runQueue();
        return;
      }
      case 'detach': {
        const job = slotJobs.get(msg.pkgId);
        if (job) job.cancelled = true;
        slotJobs.delete(msg.pkgId);
        return;
      }
      case 'pause':
        if (state === 'indexing') state = 'paused';
        return;
      case 'resume':
        if (state === 'paused') state = 'indexing';
        return;
      case 'reindex': {
        const job = slotJobs.get(msg.pkgId);
        if (!job) return;
        for (const name of msg.names) {
          delete job.perTypeVersions[name];
          delete job.cursor[name];
        }
        job.edges = job.edges.filter((e) => !msg.names.includes(e.fromName));
        job.done = false;
        if (!queue.includes(msg.pkgId)) queue.push(msg.pkgId);
        void runQueue();
        return;
      }
    }
  } catch (err) {
    post({
      type: 'error',
      pkgId: null,
      path: null,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
