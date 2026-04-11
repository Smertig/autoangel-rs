export interface KeyConfig {
  key1: number;
  key2: number;
  guard1: number;
  guard2: number;
}

export interface EntryInfo {
  path: string;
  size: number;
  compressedSize: number;
  hash: number;
}

// Messages from main thread to worker (what we postMessage)
export type WorkerRequest =
  | { type: 'parseFile'; pckFile: File; pkxFiles: File[]; keys?: KeyConfig }
  | { type: 'getFile'; path: string }
  | { type: 'scanEntries'; paths: string[] };

// Messages from worker back to main thread
export type WorkerResponse =
  | { id: number; type: 'result'; fileList: string[]; version: number; fileCount: number }
  | { id: number; type: 'result'; data: ArrayBuffer; byteOffset: number; byteLength: number }
  | { id: number; type: 'progress'; phase: string; index: number; total: number }
  | { id: number; type: 'chunk'; entries: EntryInfo[] }
  | { id: number; type: 'done' }
  | { id: number; type: 'error'; message: string };

// The shape we send (request + id added by the hook)
export type WorkerOutgoing = WorkerRequest & { id: number };
