/// <reference lib="webworker" />

// Web Worker for PCK/PKX parsing.
// Reads JS File objects directly via PckPackage.openFile.

import type { KeyConfig } from './worker-protocol';

let CDN: string | null = null;
let init: ((wasmPath: string) => Promise<unknown>) | undefined;
let PckPackage: any;
let PackageConfig: any;
let pkg: any = null;

let wasmReady: Promise<void> | null = null;

async function initWasm(cdn: string): Promise<void> {
  CDN = cdn;
  const mod = await import(/* @vite-ignore */ `${cdn}/autoangel.js`);
  init = mod.default;
  PckPackage = mod.PckPackage;
  PackageConfig = mod.PackageConfig;
  await init!(`${cdn}/autoangel_bg.wasm`);
}

function ensureWasm(): Promise<void> {
  if (!wasmReady) throw new Error('Worker not initialized — send {type:"init", cdn} first');
  return wasmReady;
}

async function handleParseFile(
  id: number,
  pckFile: File,
  pkxFiles: File[],
  keys?: KeyConfig,
): Promise<{ fileList: string[]; version: number; fileCount: number }> {
  await ensureWasm();

  if (pkg) {
    pkg.free();
    pkg = null;
  }

  const config = keys
    ? PackageConfig.withKeys(keys.key1, keys.key2, keys.guard1, keys.guard2)
    : undefined;

  const onProgress = (index: number, total: number) => {
    self.postMessage({ id, type: 'progress', phase: 'parse', index, total });
  };

  const opts: Record<string, unknown> = { onProgress, progressIntervalMs: 16 };
  if (pkxFiles.length > 0) opts.pkxFiles = pkxFiles;
  if (config) opts.config = config;

  pkg = await PckPackage.openFile(pckFile, opts);

  return {
    fileList: pkg.fileList(),
    version: pkg.version,
    fileCount: pkg.fileCount,
  };
}

async function handleGetFile(
  path: string,
): Promise<{ data: ArrayBuffer; byteOffset: number; byteLength: number }> {
  if (!pkg) throw new Error('No package loaded');
  const data = await pkg.getFile(path);
  if (!data) throw new Error(`File not found or decompression failed: ${path}`);
  // Return as transferable ArrayBuffer
  const buf: ArrayBuffer = data.buffer;
  return { data: buf, byteOffset: data.byteOffset, byteLength: data.byteLength };
}

async function handleScanEntries(id: number, paths: string[]): Promise<void> {
  if (!pkg) throw new Error('No package loaded');
  await pkg.scanEntries({
    paths,
    intervalMs: 16,
    onChunk: (entries: any[]) => {
      const plain = entries.map((e) => {
        const obj = {
          path: e.path as string,
          size: e.size as number,
          compressedSize: e.compressedSize as number,
          hash: e.hash as number,
        };
        e.free();
        return obj;
      });
      self.postMessage({ id, type: 'chunk', entries: plain });
    },
  });
}

self.onmessage = async (e: MessageEvent) => {
  const { id, type } = e.data as { id: number; type: string };
  try {
    if (type === 'init') {
      wasmReady = initWasm(e.data.cdn as string);
      await wasmReady;
      self.postMessage({ id, type: 'result' });
      return;
    }
    if (type === 'parseFile') {
      const result = await handleParseFile(
        id,
        e.data.pckFile as File,
        (e.data.pkxFiles as File[]) || [],
        e.data.keys as KeyConfig | undefined,
      );
      self.postMessage({ id, type: 'result', ...result });
    } else if (type === 'getFile') {
      const { data, byteOffset, byteLength } = await handleGetFile(e.data.path as string);
      self.postMessage({ id, type: 'result', data, byteOffset, byteLength }, [data]);
    } else if (type === 'scanEntries') {
      await handleScanEntries(id, e.data.paths as string[]);
      self.postMessage({ id, type: 'done' });
    }
  } catch (err) {
    self.postMessage({
      id,
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
