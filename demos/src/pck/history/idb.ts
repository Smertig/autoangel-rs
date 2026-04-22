/**
 * IndexedDB wrapper for PCK session history. Stores:
 *   - `sessions`  — Session records keyed by hash of file ids.
 *   - `handles`   — `FileSystemFileHandle[]` keyed by SessionFile.fileId.
 */

import type { Session } from './types';

const DB_NAME = 'autoangel-pck-history';
const DB_VERSION = 5;
const SESSIONS_STORE = 'sessions';
const HANDLES_STORE = 'handles';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Wipe sessions on every upgrade — they're auto-tracked and regenerate
      // on first drop. Handles survive (recreating them costs a user-prompt
      // round-trip and their schema is unchanged).
      for (const name of ['recents', 'workspaces', SESSIONS_STORE]) {
        if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
      }
      db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(HANDLES_STORE)) {
        db.createObjectStore(HANDLES_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
  return dbPromise;
}

function txAwait(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    tx.onerror = () => reject(tx.error);
  });
}

function reqAwait<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// --- sessions ---

export async function listSessions(): Promise<Session[]> {
  const db = await openDb();
  const tx = db.transaction(SESSIONS_STORE, 'readonly');
  const all = await reqAwait(tx.objectStore(SESSIONS_STORE).getAll() as IDBRequest<Session[]>);
  await txAwait(tx);
  return all;
}

export async function putSession(session: Session): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(SESSIONS_STORE, 'readwrite');
  tx.objectStore(SESSIONS_STORE).put(session);
  await txAwait(tx);
}

export async function deleteSession(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(SESSIONS_STORE, 'readwrite');
  tx.objectStore(SESSIONS_STORE).delete(id);
  await txAwait(tx);
}

export async function clearSessions(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([SESSIONS_STORE, HANDLES_STORE], 'readwrite');
  tx.objectStore(SESSIONS_STORE).clear();
  tx.objectStore(HANDLES_STORE).clear();
  await txAwait(tx);
}

// --- handles ---

/**
 * Read all stored handles for a file id. Always returns an array; the first
 * element is the `.pck`, the rest are `.pkx*` in load order.
 */
export async function getHandles(id: string): Promise<FileSystemFileHandle[]> {
  const db = await openDb();
  const tx = db.transaction(HANDLES_STORE, 'readonly');
  const value = (await reqAwait(
    tx.objectStore(HANDLES_STORE).get(id) as IDBRequest<FileSystemFileHandle[] | undefined>,
  )) ?? [];
  await txAwait(tx);
  return value;
}

export async function putHandles(id: string, handles: FileSystemFileHandle[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(HANDLES_STORE, 'readwrite');
  tx.objectStore(HANDLES_STORE).put(handles, id);
  await txAwait(tx);
}

export async function deleteHandle(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(HANDLES_STORE, 'readwrite');
  tx.objectStore(HANDLES_STORE).delete(id);
  await txAwait(tx);
}

export async function deleteHandles(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(HANDLES_STORE, 'readwrite');
  const store = tx.objectStore(HANDLES_STORE);
  for (const id of ids) store.delete(id);
  await txAwait(tx);
}

/** Test-only: drop the cached connection so a new `openDb` reopens the database. */
export function _resetForTests(): void {
  dbPromise = null;
}
