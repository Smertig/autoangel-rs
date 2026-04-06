// Web Worker for OPFS-based PCK/PKX parsing.
// Receives files from main thread, writes to OPFS, opens via sync access handles.

const CDN = new URL(self.location).searchParams.get('cdn');
if (!CDN) throw new Error('Worker requires ?cdn= parameter');

let init, PckPackage, PackageConfig;
let pkg = null;
let syncHandles = [];
const workerUid = Math.random().toString(36).slice(2, 10);

async function initWasm() {
  const mod = await import(`${CDN}/autoangel.js`);
  init = mod.default;
  PckPackage = mod.PckPackage;
  PackageConfig = mod.PackageConfig;
  await init(`${CDN}/autoangel_bg.wasm`);
}

const wasmReady = initWasm();

async function writeToOpfs(name, file) {
  const root = await navigator.storage.getDirectory();
  const fh = await root.getFileHandle(name, { create: true });
  const writable = await fh.createWritable();
  await writable.write(file);
  await writable.close();
  return fh;
}

async function openSyncHandle(fileHandle) {
  return await fileHandle.createSyncAccessHandle();
}

async function handleParse(pckFile, pkxFile, keys) {
  await wasmReady;

  if (pkg) { pkg.free(); pkg = null; }
  for (const h of syncHandles) { try { h.close(); } catch {} }
  syncHandles = [];

  // Write file(s) to OPFS
  const pckHandle = await writeToOpfs(`${workerUid}.pck`, pckFile);
  const pckSync = await openSyncHandle(pckHandle);
  syncHandles.push(pckSync);

  const config = keys ? PackageConfig.withKeys(keys.key1, keys.key2, keys.guard1, keys.guard2) : undefined;

  try {
    if (pkxFile) {
      const pkxHandle = await writeToOpfs(`${workerUid}.pkx`, pkxFile);
      const pkxSync = await openSyncHandle(pkxHandle);
      syncHandles.push(pkxSync);
      pkg = PckPackage.open2(pckSync, pkxSync, config);
    } else {
      pkg = PckPackage.open(pckSync, config);
    }
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

function handleGetFile(path) {
  if (!pkg) throw new Error('No package loaded');
  const data = pkg.getFile(path);
  if (!data) throw new Error('File not found or decompression failed');
  // Return as transferable ArrayBuffer
  const buf = data.buffer;
  return { data: buf, byteOffset: data.byteOffset, byteLength: data.byteLength };
}

function handleFileEntries(id) {
  if (!pkg) throw new Error('No package loaded');
  let lastProgressTime = 0;
  const wasmEntries = pkg.fileEntries({
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
      const result = await handleParse(e.data.pckFile, e.data.pkxFile, e.data.keys);
      self.postMessage({ id, type: 'result', ...result });
    } else if (type === 'getFile') {
      const { data, byteOffset, byteLength } = handleGetFile(e.data.path);
      self.postMessage({ id, type: 'result', data, byteOffset, byteLength }, [data]);
    } else if (type === 'fileEntries') {
      const entries = handleFileEntries(id);
      self.postMessage({ id, type: 'result', entries });
    }
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err.message || String(err) });
  }
};
