import {
  closeAndForgetIDB,
  openIDB,
  reqAwait,
  txAwait,
} from '@shared/util/idb';
import type { CachedSlotIndex } from './types';
import { SCHEMA_VERSION } from './types';

const DB_NAME = 'autoangel-pck-index';
const DB_VERSION = 1;
const STORE = 'slot-index';

const openDb = () =>
  openIDB({
    name: DB_NAME,
    version: DB_VERSION,
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'fileId' });
      }
    },
  });

export async function loadCachedSlotIndex(
  fileId: string,
): Promise<CachedSlotIndex | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const got = await reqAwait(
      tx.objectStore(STORE).get(fileId) as IDBRequest<CachedSlotIndex | undefined>,
    );
    await txAwait(tx);
    return got ?? null;
  } catch (e) {
    console.warn('[index/idb] load failed:', e);
    return null;
  }
}

export async function putCachedSlotIndex(
  record: CachedSlotIndex,
): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    await txAwait(tx);
  } catch (e) {
    console.warn('[index/idb] put failed:', e);
  }
}

/** Pure: returns the cached record with stale per-type edges/versions
 *  stripped, or `null` when the whole record must be discarded. Edges
 *  from extractors that *finished* under the cached version are kept,
 *  AND edges from extractors that have an *in-progress* cursor whose
 *  version still matches — so a tab close mid-sweep can resume from
 *  the last checkpoint instead of re-scanning from zero. */
export function applyCacheInvalidation(
  cached: CachedSlotIndex,
  currentVersions: Record<string, number>,
): CachedSlotIndex | null {
  if (cached.schemaVersion !== SCHEMA_VERSION) return null;

  // Names of extractors whose cached output is still valid: either they
  // finished at the current version, or they have a partial cursor at
  // the current version.
  const keptNames = new Set<string>();
  const newPerType: Record<string, number> = {};
  for (const [name, ver] of Object.entries(cached.perTypeVersions)) {
    if (currentVersions[name] === ver) {
      keptNames.add(name);
      newPerType[name] = ver;
    }
  }

  const newCursor: Record<string, number> = {};
  const newCursorVersions: Record<string, number> = {};
  if (cached.cursor && cached.cursorVersions) {
    for (const [name, idx] of Object.entries(cached.cursor)) {
      const cachedVer = cached.cursorVersions[name];
      if (cachedVer !== undefined && currentVersions[name] === cachedVer) {
        keptNames.add(name);
        newCursor[name] = idx;
        newCursorVersions[name] = cachedVer;
      }
    }
  }

  const newEdges = cached.edges.filter((e) => keptNames.has(e.fromName));

  return {
    ...cached,
    perTypeVersions: newPerType,
    cursor:
      Object.keys(newCursor).length > 0 ? newCursor : undefined,
    cursorVersions:
      Object.keys(newCursorVersions).length > 0 ? newCursorVersions : undefined,
    edges: newEdges,
  };
}

/** Wipe every cached slot record. Used by the "clear cached
 *  indices" affordance in the footer; callers are responsible for
 *  also clearing in-memory state for currently-loaded slots. */
export async function clearAllCachedSlotIndexes(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    await txAwait(tx);
  } catch (e) {
    console.warn('[index/idb] clear failed:', e);
  }
}

/** Test-only: close and forget the cached connection so a new openDb
 *  reopens (and `indexedDB.deleteDatabase` won't block on it). */
export const _resetForTests = (): Promise<void> => closeAndForgetIDB(DB_NAME);
