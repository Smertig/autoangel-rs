// Web Worker for OPFS-based PCK/PKX parsing.
// Receives files from main thread, writes to OPFS, opens via sync access handles.

const CDN = 'https://cdn.jsdelivr.net/npm/autoangel@0.8.0';

let init, PckPackage;
let pkg = null;

async function initWasm() {
  const mod = await import(`${CDN}/autoangel.js`);
  init = mod.default;
  PckPackage = mod.PckPackage;
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

async function handleParse(pckFile, pkxFile) {
  await wasmReady;

  if (pkg) { pkg.free(); pkg = null; }

  // Write file(s) to OPFS
  const pckHandle = await writeToOpfs('current.pck', pckFile);
  const pckSync = await openSyncHandle(pckHandle);

  try {
    if (pkxFile) {
      const pkxHandle = await writeToOpfs('current.pkx', pkxFile);
      const pkxSync = await openSyncHandle(pkxHandle);
      try {
        pkg = PckPackage.open2(pckSync, pkxSync);
      } catch (e) {
        pkxSync.close();
        throw e;
      }
    } else {
      pkg = PckPackage.open(pckSync);
    }
  } catch (e) {
    pckSync.close();
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

self.onmessage = async (e) => {
  const { id, type } = e.data;
  try {
    if (type === 'parse') {
      const result = await handleParse(e.data.pckFile, e.data.pkxFile);
      self.postMessage({ id, type: 'result', ...result });
    } else if (type === 'getFile') {
      const { data, byteOffset, byteLength } = handleGetFile(e.data.path);
      self.postMessage({ id, type: 'result', data, byteOffset, byteLength }, [data]);
    }
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err.message || String(err) });
  }
};
