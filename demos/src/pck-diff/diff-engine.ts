import { DiffStatus, DiffStatusValue, StatusCounts } from './types';
import type { EntryInfo } from '../pck/worker-protocol';

/**
 * Pure diff state machine — no React dependency.
 * Tracks file statuses, hashes, and the verify queue.
 */
export class DiffEngine {
  fileStatus: Map<string, DiffStatusValue> = new Map();
  statusCounts: StatusCounts = { added: 0, deleted: 0, modified: 0, unchanged: 0, pending: 0 };

  leftHashes: Map<string, number> = new Map();   // path -> compressed hash (u32)
  rightHashes: Map<string, number> = new Map();

  verifyQueue: string[] = [];
  verifierBusy = false;
  verifyTotal = 0;
  verifyDone = 0;

  sharedPaths: string[] = [];
  scannedLeft: Set<string> = new Set();
  scannedRight: Set<string> = new Set();

  // Callbacks wired up by the React layer
  onStatusChange?: () => void;
  onVerifyNeeded?: (path: string) => void;
  onVerifyProgress?: () => void;

  private trackStatusChange(oldStatus: DiffStatusValue | undefined, newStatus: DiffStatusValue) {
    if (oldStatus) this.statusCounts[oldStatus]--;
    this.statusCounts[newStatus]++;
  }

  setFileStatus(path: string, newStatus: DiffStatusValue) {
    const old = this.fileStatus.get(path);
    if (old !== newStatus) {
      if (old) this.statusCounts[old]--;
      this.statusCounts[newStatus]++;
      this.fileStatus.set(path, newStatus);
    }
  }

  deleteFileStatus(path: string) {
    const old = this.fileStatus.get(path);
    if (old) this.statusCounts[old]--;
    this.fileStatus.delete(path);
  }

  clearFileStatus() {
    this.statusCounts = { added: 0, deleted: 0, modified: 0, unchanged: 0, pending: 0 };
    this.fileStatus.clear();
  }

  initFileStatus(leftFiles: string[], rightFiles: string[]) {
    const leftSet = new Set(leftFiles);
    const rightSet = new Set(rightFiles);

    this.clearFileStatus();
    this.leftHashes.clear();
    this.rightHashes.clear();
    this.verifyQueue.length = 0;
    this.verifierBusy = false;
    this.verifyTotal = 0;
    this.verifyDone = 0;
    this.sharedPaths = [];
    this.scannedLeft.clear();
    this.scannedRight.clear();

    for (const p of rightFiles) {
      if (!leftSet.has(p)) this.setFileStatus(p, DiffStatus.ADDED);
    }
    for (const p of leftFiles) {
      if (!rightSet.has(p)) this.setFileStatus(p, DiffStatus.DELETED);
      else {
        this.setFileStatus(p, DiffStatus.PENDING);
        this.sharedPaths.push(p);
      }
    }
    this.sharedPaths.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  onHashChunk(side: 'left' | 'right', entries: EntryInfo[]) {
    const hashes = side === 'left' ? this.leftHashes : this.rightHashes;
    const other = side === 'left' ? this.rightHashes : this.leftHashes;

    for (const e of entries) {
      hashes.set(e.path, e.hash);
      if (other.has(e.path) && this.fileStatus.get(e.path) === DiffStatus.PENDING) {
        if (hashes.get(e.path) === other.get(e.path)) {
          this.setFileStatus(e.path, DiffStatus.UNCHANGED);
        } else {
          // Hash mismatch — need content verification
          this.verifyQueue.push(e.path);
          this.verifyTotal++;
          this.onVerifyProgress?.();
          this.onVerifyNeeded?.(e.path);
        }
      }
    }

    this.onStatusChange?.();
  }

  getVerifyNext(): string | null {
    if (this.verifierBusy || this.verifyQueue.length === 0) return null;
    this.verifierBusy = true;
    return this.verifyQueue.shift()!;
  }

  resolveVerification(path: string, match: boolean) {
    if (this.fileStatus.get(path) === DiffStatus.PENDING) {
      this.setFileStatus(path, match ? DiffStatus.UNCHANGED : DiffStatus.MODIFIED);
    }
    this.verifierBusy = false;
    this.verifyDone++;
    this.onVerifyProgress?.();
    this.onStatusChange?.();
  }

  swap() {
    // Swap hashes
    const tmpHashes = new Map(this.leftHashes);
    this.leftHashes.clear();
    for (const [k, v] of this.rightHashes) this.leftHashes.set(k, v);
    this.rightHashes.clear();
    for (const [k, v] of tmpHashes) this.rightHashes.set(k, v);

    // Swap scanned sets
    const tmpScanned = new Set(this.scannedLeft);
    this.scannedLeft.clear();
    for (const p of this.scannedRight) this.scannedLeft.add(p);
    this.scannedRight.clear();
    for (const p of tmpScanned) this.scannedRight.add(p);

    // Flip added <-> deleted
    for (const [path, status] of this.fileStatus) {
      if (status === DiffStatus.ADDED) this.setFileStatus(path, DiffStatus.DELETED);
      else if (status === DiffStatus.DELETED) this.setFileStatus(path, DiffStatus.ADDED);
    }
  }

  collectBatch(side: 'left' | 'right', getVisiblePendingPaths: () => string[], batchSize = 1000): string[] {
    const scanned = side === 'left' ? this.scannedLeft : this.scannedRight;
    const paths: string[] = [];
    const pathSet = new Set<string>();

    for (const p of getVisiblePendingPaths()) {
      if (!scanned.has(p)) { paths.push(p); pathSet.add(p); }
      if (paths.length >= batchSize) return paths;
    }
    for (const p of this.sharedPaths) {
      if (!scanned.has(p) && !pathSet.has(p)) { paths.push(p); pathSet.add(p); }
      if (paths.length >= batchSize) return paths;
    }
    return paths;
  }
}
