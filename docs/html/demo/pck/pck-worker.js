// Web Worker for PCK/PKX parsing.
// Reads JS File objects directly via PckPackage.openFile.

const CDN = new URL(self.location).searchParams.get('cdn');
if (!CDN) throw new Error('Worker requires ?cdn= parameter');

let init, PckPackage, PackageConfig;
let pkg = null;

async function initWasm() {
  const mod = await import(`${CDN}/autoangel.js`);
  init = mod.default;
  PckPackage = mod.PckPackage;
  PackageConfig = mod.PackageConfig;
  await init(`${CDN}/autoangel_bg.wasm`);
}

const wasmReady = initWasm();

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
    if (type === 'parseFile') {
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
