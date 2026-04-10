// --- Extension maps ---

export const TEXT_EXTENSIONS = new Set([
  '.txt', '.cfg', '.ini', '.xml', '.json', '.lua', '.py', '.lst',
  '.action', '.border', '.log', '.csv', '.htm', '.html', '.css',
  '.js', '.shtml', '.conf', '.properties', '.yaml', '.yml',
  '.gfx',
]);

export const MODEL_EXTENSIONS = new Set(['.ecm', '.ski']);

export const BINARY_EXTENSIONS = new Set([
  '.ani', '.dat', '.data', '.db', '.bin',
  '.exe', '.dll', '.so', '.o', '.obj', '.lib', '.pdb',
  '.zip', '.rar', '.gz', '.7z', '.tar', '.cab',
  '.wav', '.mp3', '.ogg', '.wma', '.flac',
  '.avi', '.mp4', '.wmv', '.flv', '.mkv', '.bik',
  '.ttf', '.otf', '.fon',
  '.doc', '.xls', '.ppt',
  '.pck', '.pkx', '.smd', '.bon', '.att', '.stck',
]);

export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.cur', '.webp']);

export const CANVAS_IMAGE_EXTENSIONS = new Set(['.tga', '.dds']);

export const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.cur': 'image/x-icon',
  '.webp': 'image/webp',
};

export const HLJS_LANG = {
  '.ini': 'ini',
  '.cfg': 'ini',
  '.conf': 'ini',
  '.properties': 'ini',
  '.xml': 'xml',
  '.html': 'xml',
  '.htm': 'xml',
  '.shtml': 'xml',
  '.json': 'json',
  '.lua': 'lua',
  '.py': 'python',
  '.js': 'javascript',
  '.css': 'css',
  '.yaml': 'yaml',
  '.yml': 'yaml',
};

export const ENCODINGS = ['auto', 'gbk', 'utf-8', 'utf-16le', 'utf-16be', 'shift_jis', 'euc-kr', 'windows-1252', 'iso-8859-1'];

// --- Utilities ---

export function getExtension(path) {
  const dot = path.lastIndexOf('.');
  return dot >= 0 ? path.slice(dot).toLowerCase() : '';
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- File classification ---

export function classifyFiles(files) {
  let pck = null;
  const pkxParts = []; // { file, order }
  for (const f of files) {
    const name = f.name.toLowerCase();
    if (name.endsWith('.pck')) {
      pck = f;
    } else if (name.endsWith('.pkx')) {
      pkxParts.push({ file: f, order: 0 });
    } else {
      const m = name.match(/\.pkx(\d+)$/);
      if (m) pkxParts.push({ file: f, order: parseInt(m[1], 10) });
    }
  }
  if (!pck && pkxParts.length > 0) { pck = pkxParts.shift().file; }
  pkxParts.sort((a, b) => a.order - b.order);
  const pkxFiles = pkxParts.map(p => p.file);
  return { pck, pkxFiles };
}

// --- Encoding detection ---

// Returns { encoding, bomLength } or null
export function detectBOM(data) {
  if (data.length >= 3 && data[0] === 0xEF && data[1] === 0xBB && data[2] === 0xBF) return { encoding: 'utf-8', bomLength: 3 };
  if (data.length >= 2 && data[0] === 0xFF && data[1] === 0xFE) return { encoding: 'utf-16le', bomLength: 2 };
  if (data.length >= 2 && data[0] === 0xFE && data[1] === 0xFF) return { encoding: 'utf-16be', bomLength: 2 };
  return null;
}

// Returns 'utf-16le' | 'utf-16be' | null based on alternating null bytes
export function detectUTF16Pattern(data) {
  if (data.length < 4) return null;
  let leScore = 0, beScore = 0;
  const checkLen = Math.min(64, data.length & ~1);
  for (let i = 0; i < checkLen; i += 2) {
    if (data[i] !== 0 && data[i + 1] === 0) leScore++;
    if (data[i] === 0 && data[i + 1] !== 0) beScore++;
  }
  const pairs = checkLen / 2;
  if (leScore > pairs * 0.8) return 'utf-16le';
  if (beScore > pairs * 0.8) return 'utf-16be';
  return null;
}

export function detectEncoding(data) {
  if (data.length < 2) return 'gbk';
  const bom = detectBOM(data);
  if (bom) return bom.encoding;
  return detectUTF16Pattern(data) || 'gbk';
}

export function decodeText(data, encoding) {
  const bom = detectBOM(data);
  const offset = (bom && bom.encoding === encoding) ? bom.bomLength : 0;
  const view = offset > 0 ? data.subarray(offset) : data;
  return new TextDecoder(encoding).decode(view);
}

// --- Text detection heuristic ---

export function isLikelyText(data, ext) {
  if (data.length === 0) return false;
  if (ext && BINARY_EXTENSIONS.has(ext)) return false;
  if (ext && TEXT_EXTENSIONS.has(ext)) return true;
  if (detectBOM(data)) return true;
  if (detectUTF16Pattern(data)) return true;

  // Check first 1KB for null bytes and control character density
  const check = data.subarray(0, Math.min(1024, data.length));
  let controlCount = 0;
  for (let i = 0; i < check.length; i++) {
    const b = check[i];
    if (b === 0) return false;
    if ((b >= 0x01 && b <= 0x08) || (b >= 0x0E && b <= 0x1F)) controlCount++;
  }
  if (check.length > 0 && controlCount / check.length > 0.05) return false;

  return true;
}

// --- Hex dump ---

/**
 * Generate hex dump rows from binary data.
 * @param {Uint8Array} data
 * @param {number} [maxBytes=4096]
 * @returns {{ offset: string, hex: string, ascii: string }[]}
 */
export function hexDumpRows(data, maxBytes = 4096) {
  const bytes = data.subarray(0, maxBytes);
  const rows = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.subarray(i, i + 16);
    rows.push({
      offset: i.toString(16).padStart(8, '0'),
      hex: [...chunk].map(b => b.toString(16).padStart(2, '0')).join(' ').padEnd(47),
      ascii: [...chunk].map(b => (b >= 0x20 && b <= 0x7e) ? String.fromCharCode(b) : '.').join(''),
    });
  }
  return rows;
}

// --- WASM image decoders (injected at init) ---

let _decodeDds = null;
let _decodeTga = null;

export function initImageDecoders(decodeDds, decodeTga) {
  _decodeDds = decodeDds;
  _decodeTga = decodeTga;
}

/**
 * Decode a .dds or .tga buffer to a canvas via WASM.
 * @param {Uint8Array} data
 * @param {string} ext - '.dds' or '.tga'
 * @returns {{ canvas: HTMLCanvasElement, width: number, height: number }}
 */
export function renderCanvasImage(data, ext) {
  const decoded = ext === '.dds' ? _decodeDds(data) : _decodeTga(data);
  const { width, height } = decoded;
  const rgba = decoded.intoRgba();

  const imageData = new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength), width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').putImageData(imageData, 0, 0);
  return { canvas, width, height };
}

/**
 * Replace container contents with a text label + thin progress bar.
 * @returns {HTMLDivElement} The fill element — set its style.width to update progress.
 */
export function showInlineProgress(container, text) {
  const label = document.createElement('span');
  label.className = 'status-text';
  label.textContent = text;
  const bar = document.createElement('div');
  bar.className = 'status-bar';
  const fill = document.createElement('div');
  fill.className = 'status-bar-fill';
  bar.appendChild(fill);
  container.replaceChildren(label, bar);
  container.classList.add('has-progress');
  return fill;
}
