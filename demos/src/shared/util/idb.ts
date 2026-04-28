/** Shared IndexedDB plumbing: a per-DB connection cache plus thin
 *  promise wrappers around the request and transaction APIs. Each
 *  feature-specific module (sessions, slot-index cache, etc.) builds
 *  on these. */

export interface OpenIDBOptions {
  name: string;
  version: number;
  /** Called inside the `upgradeneeded` handler with the in-flight
   *  database and its open transaction. Use it to create / drop
   *  object stores. */
  upgrade(db: IDBDatabase, tx: IDBTransaction): void;
}

const connections = new Map<string, Promise<IDBDatabase>>();

export function openIDB(opts: OpenIDBOptions): Promise<IDBDatabase> {
  const cached = connections.get(opts.name);
  if (cached) return cached;
  const p = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(opts.name, opts.version);
    req.onupgradeneeded = () => {
      // The non-null assertion is safe inside `onupgradeneeded` —
      // browsers always supply a transaction at this point.
      opts.upgrade(req.result, req.transaction!);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () =>
      reject(new Error(`IndexedDB open blocked: ${opts.name}`));
  });
  connections.set(opts.name, p);
  return p;
}

export function reqAwait<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function txAwait(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    tx.onerror = () => reject(tx.error);
  });
}

/** Close and forget the cached connection for `name`. Tests use this
 *  before `indexedDB.deleteDatabase` so the delete doesn't block on
 *  an open handle. */
export async function closeAndForgetIDB(name: string): Promise<void> {
  const cached = connections.get(name);
  if (!cached) return;
  connections.delete(name);
  try {
    const db = await cached;
    db.close();
  } catch {
    // Open failed; nothing to close.
  }
}
