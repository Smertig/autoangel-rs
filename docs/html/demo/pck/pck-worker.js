// Web Worker for PCK/PKX parsing.
// Supports two modes:
// - 'parseFile': reads JS File objects directly via PckPackage.openFile (no OPFS)
// - 'parse': writes files to OPFS first, then opens via sync access handles (legacy/fallback)

const CDN = new URL(self.location).searchParams.get('cdn');
if (!CDN) throw new Error('Worker requires ?cdn= parameter');

let init, PckPackage, PackageConfig;
let pkg = null;
let syncHandles = [];
let currentOpfsNames = [];
const workerUid = Math.random().toString(36).slice(2, 10);
const LOCK_PREFIX = 'opfs-pck-';

// Hold a Web Lock for this worker's lifetime. The browser releases it
// automatically when the tab/worker is destroyed, letting other workers
// identify orphaned OPFS files.
let lockAcquired;
const lockReady = new Promise(resolve => { lockAcquired = resolve; });
navigator.locks.request(LOCK_PREFIX + workerUid, () => {
  lockAcquired();
  return new Promise(() => {});
});

async function cleanupOrphanedOpfs() {
  await lockReady;
  const root = await navigator.storage.getDirectory();
  const { held } = await navigator.locks.query();
  const aliveUids = new Set(
    held.filter(l => l.name.startsWith(LOCK_PREFIX)).map(l => l.name.slice(LOCK_PREFIX.length))
  );
  for await (const [name] of root.entries()) {
    const uid = name.split('.')[0];
    if (uid && !aliveUids.has(uid)) {
      try { await root.removeEntry(name); } catch {}
    }
  }
}

async function initWasm() {
  const mod = await import(`${CDN}/autoangel.js`);
  init = mod.default;
  PckPackage = mod.PckPackage;
  PackageConfig = mod.PackageConfig;
  await init(`${CDN}/autoangel_bg.wasm`);
}

const opfsCleanup = cleanupOrphanedOpfs();
const wasmReady = initWasm();

async function writeToOpfs(name, file, onChunk) {
  const root = await navigator.storage.getDirectory();
  const fh = await root.getFileHandle(name, { create: true });
  const writable = await fh.createWritable();
  if (onChunk && file.size > 0) {
    const chunkSize = 4 * 1024 * 1024;
    let offset = 0;
    while (offset < file.size) {
      const end = Math.min(offset + chunkSize, file.size);
      const chunk = file.slice(offset, end);
      await writable.write(chunk);
      offset = end;
      onChunk(offset, file.size);
    }
  } else {
    await writable.write(file);
  }
  await writable.close();
  return fh;
}

async function openSyncHandle(fileHandle) {
  return await fileHandle.createSyncAccessHandle();
}

async function removeCurrentFiles() {
  const root = await navigator.storage.getDirectory();
  for (const name of currentOpfsNames) {
    try { await root.removeEntry(name); } catch {}
  }
  currentOpfsNames = [];
}

async function handleParse(id, pckFile, pkxFiles, keys) {
  await Promise.all([wasmReady, opfsCleanup]);

  if (pkg) { pkg.free(); pkg = null; }
  for (const h of syncHandles) { try { h.close(); } catch {} }
  syncHandles = [];

  await removeCurrentFiles();

  const config = keys ? PackageConfig.withKeys(keys.key1, keys.key2, keys.guard1, keys.guard2) : undefined;

  // Compute total bytes for write progress
  const allFiles = [{ name: `${workerUid}.pck`, file: pckFile }];
  for (let i = 0; i < pkxFiles.length; i++) {
    const ext = i === 0 ? 'pkx' : `pkx${i}`;
    allFiles.push({ name: `${workerUid}.${ext}`, file: pkxFiles[i] });
  }
  const totalBytes = allFiles.reduce((s, f) => s + f.file.size, 0);

  // Write all files to OPFS with progress
  const fileHandles = [];
  let prevFileWritten = 0;
  for (const { name, file } of allFiles) {
    const fh = await writeToOpfs(name, file, (written, _size) => {
      const current = prevFileWritten + written;
      self.postMessage({ id, type: 'progress', phase: 'write', written: current, totalBytes });
    });
    prevFileWritten += file.size;
    fileHandles.push(fh);
    currentOpfsNames.push(name);
  }

  // Open sync handles
  const pckSync = await openSyncHandle(fileHandles[0]);
  syncHandles.push(pckSync);

  const onProgress = (index, total) => {
    self.postMessage({ id, type: 'progress', phase: 'parse', index, total });
  };

  try {
    const pkxHandles = [];
    for (let i = 1; i < fileHandles.length; i++) {
      const sh = await openSyncHandle(fileHandles[i]);
      syncHandles.push(sh);
      pkxHandles.push(sh);
    }

    const opts = { onProgress, progressIntervalMs: 16 };
    if (pkxHandles.length > 0) opts.pkxHandles = pkxHandles;
    if (config) opts.config = config;

    pkg = await PckPackage.open(pckSync, opts);
  } catch (e) {
    for (const h of syncHandles) { try { h.close(); } catch {} }
    syncHandles = [];
    throw e;
  }

  return {
    fileList: pkg.fileList(),
    version: pkg.version,
    fileCount: pkg.fileCount,
  };
}

async function handleParseFile(id, pckFile, pkxFiles, keys) {
  await wasmReady;

  if (pkg) { pkg.free(); pkg = null; }

  const config = keys ? PackageConfig.withKeys(keys.key1, keys.key2, keys.guard1, keys.guard2) : undefined;

  const onProgress = (index, total) => {
    self.postMessage({ id, type: 'progress', phase: 'parse', index, total });
  };

  const opts = { onProgress, progressIntervalMs: 16 };
  if (pkxFiles.length > 0) opts.pkxFiles = pkxFiles;
  if (config) opts.config = config;

  pkg = await PckPackage.openFile(pckFile, opts);

  return {
    fileList: pkg.fileList(),
    version: pkg.version,
    fileCount: pkg.fileCount,
  };
}

async function handleGetFile(path) {
  if (!pkg) throw new Error('No package loaded');
  const data = await pkg.getFile(path);
  if (!data) throw new Error('File not found or decompression failed');
  // Return as transferable ArrayBuffer
  const buf = data.buffer;
  return { data: buf, byteOffset: data.byteOffset, byteLength: data.byteLength };
}

async function handleFileEntries(id) {
  if (!pkg) throw new Error('No package loaded');
  let lastProgressTime = 0;
  const wasmEntries = await pkg.fileEntries({
    onProgress: (_path, index, total) => {
      const now = performance.now();
      if (index === 0 || index === total - 1 || now - lastProgressTime >= 1000 / 60) {
        self.postMessage({ id, type: 'progress', index, total });
        lastProgressTime = now;
      }
    }
  });
  const entries = wasmEntries.map(e => {
    const plain = { path: e.path, size: e.size, compressedSize: e.compressedSize, hash: e.hash };
    e.free();
    return plain;
  });
  return entries;
}

self.onmessage = async (e) => {
  const { id, type } = e.data;
  try {
    if (type === 'parse') {
      const result = await handleParse(id, e.data.pckFile, e.data.pkxFiles || [], e.data.keys);
      self.postMessage({ id, type: 'result', ...result });
    } else if (type === 'parseFile') {
      const result = await handleParseFile(id, e.data.pckFile, e.data.pkxFiles || [], e.data.keys);
      self.postMessage({ id, type: 'result', ...result });
    } else if (type === 'getFile') {
      const { data, byteOffset, byteLength } = await handleGetFile(e.data.path);
      self.postMessage({ id, type: 'result', data, byteOffset, byteLength }, [data]);
    } else if (type === 'fileEntries') {
      const entries = await handleFileEntries(id);
      self.postMessage({ id, type: 'result', entries });
    }
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err.message || String(err) });
  }
};
