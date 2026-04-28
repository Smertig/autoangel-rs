import type { Edge } from './types';
import { normalizePathKey } from './pathKey';
import { resolveCandidates } from './resolver';

export interface IndexState {
  /** All edges in insertion order. */
  edges: Edge[];
  /** Normalized fromPath -> edges. (`fromPath` is already normalized
   *  upstream, so the key is just `e.fromPath`.) */
  byFrom: Map<string, Edge[]>;
  /** Normalized resolved-target -> edges. We re-normalize on insertion
   *  because `e.resolved` carries the canonical (mixed-case) path for
   *  display, but lookups are always normalized. */
  byTo: Map<string, Edge[]>;
  /** Edges with resolved == null. */
  dangling: Edge[];
  /** Per-pkg outgoing edge count, maintained incrementally on
   *  insert/remove so the chip popover doesn't have to scan all
   *  edges. */
  edgesByPkg: Map<number, number>;
  /** Per-pkg incoming edge count: number of resolved edges whose
   *  target path belongs to that pkg. Maintained against
   *  `pkgIdByPath` (which the hook keeps in sync with the loaded
   *  slots' fileLists). */
  inDegreeByPkg: Map<number, number>;
  /** Normalized canonical path -> pkg that owns it. The hook
   *  populates this when slots attach/detach; the reducer reads it
   *  for incoming-degree accounting. */
  pkgIdByPath: Map<string, number>;
  /** Approximate byte cost of all edges, maintained incrementally so
   *  the banner doesn't have to walk the entire edge list on every
   *  render. */
  bytes: number;
}

export function createIndexState(): IndexState {
  return {
    edges: [],
    byFrom: new Map(),
    byTo: new Map(),
    dangling: [],
    edgesByPkg: new Map(),
    inDegreeByPkg: new Map(),
    pkgIdByPath: new Map(),
    bytes: 0,
  };
}

function incInDegree(s: IndexState, resolvedKey: string): void {
  const owner = s.pkgIdByPath.get(resolvedKey);
  if (owner === undefined) return;
  s.inDegreeByPkg.set(owner, (s.inDegreeByPkg.get(owner) ?? 0) + 1);
}

function edgeBytes(e: Edge): number {
  let n = 32; // numeric fields + JSON overhead.
  n += e.fromPath.length;
  n += e.fromName.length;
  n += e.kind.length;
  n += e.raw.length;
  for (const c of e.candidates) n += c.length;
  if (e.resolved) n += e.resolved.length;
  return n;
}

function pushTo<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const bucket = m.get(k);
  if (bucket) bucket.push(v);
  else m.set(k, [v]);
}

function bindEdge(s: IndexState, e: Edge): void {
  pushTo(s.byFrom, e.fromPath, e);
  if (e.resolved !== null) {
    const key = normalizePathKey(e.resolved);
    pushTo(s.byTo, key, e);
    incInDegree(s, key);
  } else {
    s.dangling.push(e);
  }
}

export function addEdges(s: IndexState, batch: readonly Edge[]): void {
  for (const e of batch) {
    s.edges.push(e);
    bindEdge(s, e);
    s.edgesByPkg.set(e.fromPkgId, (s.edgesByPkg.get(e.fromPkgId) ?? 0) + 1);
    s.bytes += edgeBytes(e);
  }
}

/** Drop all edges whose source belongs to `pkgId`. Edges *targeting*
 *  paths formerly in `pkgId` are not removed here — they become
 *  dangling once the path index loses them, picked up by the next
 *  `reresolve` call. */
export function removeSlot(s: IndexState, pkgId: number): void {
  let droppedBytes = 0;
  const kept: Edge[] = [];
  for (const e of s.edges) {
    if (e.fromPkgId === pkgId) {
      droppedBytes += edgeBytes(e);
    } else {
      kept.push(e);
    }
  }
  s.edges = kept;
  s.byFrom.clear();
  s.byTo.clear();
  s.dangling.length = 0;
  s.edgesByPkg.delete(pkgId);
  s.inDegreeByPkg.clear();
  s.bytes = Math.max(0, s.bytes - droppedBytes);
  for (const e of kept) bindEdge(s, e);
}

/** Replace `pkgIdByPath` (the hook owns this) and recompute
 *  `inDegreeByPkg` from scratch. Call after slot churn. Bytes /
 *  edgesByPkg are unaffected (pkg ownership is independent of the
 *  edges' fromPkgId). */
export function rebuildOwnership(
  s: IndexState,
  pkgIdByPath: Map<string, number>,
): void {
  s.pkgIdByPath = pkgIdByPath;
  s.inDegreeByPkg.clear();
  for (const e of s.edges) {
    if (e.resolved !== null) incInDegree(s, normalizePathKey(e.resolved));
  }
}

/** Re-walks every edge against the new path index. Re-binds dangling
 *  ones that now resolve and demotes ones whose former target is gone.
 *  Pure JS, expected to run on every slot-set change. */
export function reresolve(s: IndexState, pathIndex: Map<string, string>): void {
  s.byTo.clear();
  s.dangling.length = 0;
  s.inDegreeByPkg.clear();
  for (const e of s.edges) {
    e.resolved = resolveCandidates(e.candidates, pathIndex);
    if (e.resolved !== null) {
      const key = normalizePathKey(e.resolved);
      pushTo(s.byTo, key, e);
      incInDegree(s, key);
    } else {
      s.dangling.push(e);
    }
  }
}
