const LOCAL_PKG = '../../../../autoangel-wasm/pkg';
const CDN = new URLSearchParams(location.search).has('local')
  ? new URL(LOCAL_PKG, import.meta.url).href
  : 'https://cdn.jsdelivr.net/npm/autoangel@0.8.0';

// --- Extension maps ---

const TEXT_EXTENSIONS = new Set([
  '.txt', '.cfg', '.ini', '.xml', '.json', '.lua', '.py', '.lst',
  '.action', '.border', '.log', '.csv', '.htm', '.html', '.css',
  '.js', '.shtml', '.conf', '.properties', '.yaml', '.yml',
]);

const BINARY_EXTENSIONS = new Set([
  '.ani', '.dat', '.data', '.db', '.bin',
  '.exe', '.dll', '.so', '.o', '.obj', '.lib', '.pdb',
  '.zip', '.rar', '.gz', '.7z', '.tar', '.cab',
  '.wav', '.mp3', '.ogg', '.wma', '.flac',
  '.avi', '.mp4', '.wmv', '.flv', '.mkv', '.bik',
  '.ttf', '.otf', '.fon',
  '.doc', '.xls', '.ppt',
  '.pck', '.pkx', '.smd', '.ski', '.bon', '.att', '.ecm', '.gfx', '.stck',
]);

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.cur', '.webp']);

const CANVAS_IMAGE_EXTENSIONS = new Set(['.tga', '.dds']);

const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.cur': 'image/x-icon',
  '.webp': 'image/webp',
};

const HLJS_LANG = {
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

const ENCODINGS = ['auto', 'gbk', 'utf-8', 'utf-16le', 'utf-16be', 'shift_jis', 'euc-kr', 'windows-1252', 'iso-8859-1'];

// --- State ---

let pkg = null;
let fileTree = null;
let selectedPath = null;
let selectedTreeItem = null;
let currentEncoding = 'auto';
let useOpfs = false;

// --- DOM refs ---

const dom = {
  status: document.getElementById('status'),
  drop: document.getElementById('drop'),
  picker: document.getElementById('picker'),
  explorer: document.getElementById('explorer'),
  sidebar: document.getElementById('sidebar'),
  tree: document.getElementById('tree'),
  divider: document.getElementById('divider'),
  breadcrumb: document.getElementById('breadcrumb'),
  preview: document.getElementById('preview'),
  actions: document.getElementById('actions'),
  statusbar: document.getElementById('statusbar'),
  filecount: document.getElementById('filecount'),
  format: document.getElementById('format'),
};

// --- OPFS Worker ---

let worker = null;
let workerMsgId = 0;
const workerPending = new Map();

function workerCall(msg, transfer) {
  return new Promise((resolve, reject) => {
    const id = ++workerMsgId;
    workerPending.set(id, { resolve, reject });
    worker.postMessage({ id, ...msg }, transfer || []);
  });
}

function initWorker() {
  const workerUrl = new URL('./pck-worker.js', import.meta.url);
  workerUrl.searchParams.set('cdn', CDN);
  worker = new Worker(workerUrl, { type: 'module' });
  worker.onmessage = (e) => {
    const { id, type, message, ...rest } = e.data;
    const cb = workerPending.get(id);
    if (!cb) return;
    workerPending.delete(id);
    if (type === 'error') cb.reject(new Error(message));
    else cb.resolve(rest);
  };
}

// --- Init WASM (in-memory fallback) ---

let PckPackage = null;

const opfsAvailable = typeof navigator !== 'undefined'
  && typeof navigator.storage?.getDirectory === 'function'
  && typeof Worker !== 'undefined';

if (opfsAvailable) {
  try {
    initWorker();
    useOpfs = true;
  } catch { /* fall through to in-memory */ }
}

if (!useOpfs) {
  const mod = await import(`${CDN}/autoangel.js`);
  await mod.default(`${CDN}/autoangel_bg.wasm`);
  PckPackage = mod.PckPackage;
}

dom.status.textContent = 'Ready. Open a .pck file.';

// --- File classification ---

function classifyFiles(files) {
  let pck = null, pkx = null;
  for (const f of files) {
    const ext = f.name.toLowerCase().split('.').pop();
    if (ext === 'pck') pck = f;
    else if (ext === 'pkx') pkx = f;
  }
  if (!pck && pkx) { pck = pkx; pkx = null; }
  return { pck, pkx };
}

// --- Unified file data access (works in both modes) ---

async function getFileData(path) {
  if (useOpfs) {
    const result = await workerCall({ type: 'getFile', path });
    return new Uint8Array(result.data, result.byteOffset, result.byteLength);
  } else {
    return pkg.getFile(path);
  }
}

// --- File loading ---

async function loadFiles(files) {
  const { pck: pckFile, pkx: pkxFile } = classifyFiles(files);
  if (!pckFile) { dom.status.textContent = 'No .pck file found.'; return; }

  const label = pkxFile ? `${pckFile.name} + ${pkxFile.name}` : pckFile.name;
  const totalSize = pckFile.size + (pkxFile?.size || 0);

  dom.status.textContent = `Parsing ${label} (${(totalSize / 1e6).toFixed(1)} MB)\u2026`;
  dom.preview.innerHTML = '<div class="placeholder">Parsing\u2026</div>';
  dom.actions.innerHTML = '';
  dom.tree.innerHTML = '';

  if (pkg) { pkg.free(); pkg = null; }

  let fileList, version;

  try {
    if (useOpfs) {
      const result = await workerCall({ type: 'parse', pckFile, pkxFile });
      fileList = result.fileList;
      version = result.version;
    } else {
      if (pkxFile) {
        dom.status.textContent = 'Error: .pkx files require OPFS support (use a modern browser with HTTPS)';
        return;
      }
      const pckBytes = new Uint8Array(await pckFile.arrayBuffer());
      pkg = PckPackage.parse(pckBytes);
      fileList = pkg.fileList();
      version = pkg.version;
    }
  } catch (e) {
    dom.status.textContent = `Error: ${e.message || e}`;
    return;
  }

  fileTree = buildTree(fileList);

  dom.status.textContent = label;
  dom.filecount.textContent = `${fileList.length} files`;
  dom.format.textContent = `format v0x${version.toString(16).toUpperCase()}`;
  dom.explorer.classList.remove('hidden');
  dom.statusbar.classList.remove('hidden');
  dom.drop.classList.add('compact');

  selectedPath = null;
  selectedTreeItem = null;
  renderTree(fileTree, dom.tree, 0);
  showPlaceholder('Select a file to preview');
  updateBreadcrumb([]);
}

// --- Tree data structure ---

function buildTree(paths) {
  const root = { name: '', children: new Map(), files: [] };

  for (const path of paths) {
    const parts = path.split('\\');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts[i];
      if (!node.children.has(dir)) {
        node.children.set(dir, { name: dir, children: new Map(), files: [] });
      }
      node = node.children.get(dir);
    }
    node.files.push({ name: parts[parts.length - 1], fullPath: path });
  }

  return root;
}

// --- Tree rendering ---

function renderTree(node, container, depth) {
  // Sort: folders first (alphabetical), then files (alphabetical)
  const folders = [...node.children.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const files = [...node.files].sort((a, b) => a.name.localeCompare(b.name));

  for (const [name, child] of folders) {
    const item = document.createElement('div');

    const row = document.createElement('div');
    row.className = 'tree-item';
    row.style.paddingLeft = `${8 + depth * 16}px`;

    const arrow = document.createElement('span');
    arrow.className = 'tree-arrow';
    arrow.textContent = '\u25B6';

    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.textContent = '\uD83D\uDCC1';

    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = name;

    row.append(arrow, icon, label);

    const childContainer = document.createElement('div');
    childContainer.className = 'tree-children';

    row.onclick = (e) => {
      e.stopPropagation();
      const isExpanded = childContainer.classList.contains('expanded');
      if (isExpanded) {
        childContainer.classList.remove('expanded');
        arrow.classList.remove('expanded');
        icon.textContent = '\uD83D\uDCC1';
      } else {
        if (!childContainer.hasChildNodes()) {
          renderTree(child, childContainer, depth + 1);
        }
        childContainer.classList.add('expanded');
        arrow.classList.add('expanded');
        icon.textContent = '\uD83D\uDCC2';
      }
    };

    item.append(row, childContainer);
    container.appendChild(item);

    // Auto-expand if this folder is the only child at this level
    if (folders.length + files.length === 1) {
      renderTree(child, childContainer, depth + 1);
      childContainer.classList.add('expanded');
      arrow.classList.add('expanded');
      icon.textContent = '\uD83D\uDCC2';
    }
  }

  for (const file of files) {
    const row = document.createElement('div');
    row.className = 'tree-item';
    row.style.paddingLeft = `${8 + depth * 16}px`;

    const arrow = document.createElement('span');
    arrow.className = 'tree-arrow leaf';

    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.textContent = fileIcon(file.name);

    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = file.name;

    row.append(arrow, icon, label);

    row.onclick = (e) => {
      e.stopPropagation();
      selectFile(file.fullPath, row);
    };

    container.appendChild(row);
  }
}

function fileIcon(name) {
  const ext = getExtension(name);
  if (IMAGE_EXTENSIONS.has(ext) || CANVAS_IMAGE_EXTENSIONS.has(ext)) return '\uD83D\uDDBC\uFE0F';
  if (TEXT_EXTENSIONS.has(ext)) return '\uD83D\uDCC4';
  return '\uD83D\uDCCE';
}

// --- File selection ---

function selectFile(path, treeRow) {
  if (selectedTreeItem) selectedTreeItem.classList.remove('selected');
  if (treeRow) {
    treeRow.classList.add('selected');
    selectedTreeItem = treeRow;
  }
  selectedPath = path;

  const parts = path.split('\\');
  updateBreadcrumb(parts);
  previewFile(path);
}

// --- Breadcrumb ---

function updateBreadcrumb(parts) {
  dom.breadcrumb.innerHTML = '';

  // Root
  const root = document.createElement('span');
  root.className = parts.length > 0 ? 'crumb' : 'crumb-current';
  root.textContent = '\uD83D\uDCE6 root';
  if (parts.length > 0) {
    root.onclick = () => {
      showPlaceholder('Select a file to preview');
      dom.actions.innerHTML = '';
      if (selectedTreeItem) selectedTreeItem.classList.remove('selected');
      selectedPath = null;
      selectedTreeItem = null;
    };
  }
  dom.breadcrumb.appendChild(root);

  for (let i = 0; i < parts.length; i++) {
    const sep = document.createElement('span');
    sep.className = 'crumb-sep';
    sep.textContent = '\u25B8';
    dom.breadcrumb.appendChild(sep);

    const crumb = document.createElement('span');
    const isLast = i === parts.length - 1;
    crumb.className = isLast ? 'crumb-current' : 'crumb';
    crumb.textContent = parts[i];
    dom.breadcrumb.appendChild(crumb);
  }
}

// --- File preview ---

async function previewFile(path, encoding) {
  const data = await getFileData(path);
  if (!data) {
    showPlaceholder('File not found or decompression failed');
    dom.actions.innerHTML = '';
    return;
  }

  currentEncoding = encoding || 'auto';

  const ext = getExtension(path);
  const size = data.byteLength;
  const isText = isLikelyText(data, ext);

  // Actions bar
  dom.actions.innerHTML = '';
  const info = document.createElement('span');
  info.className = 'file-info';
  info.textContent = formatSize(size);
  dom.actions.appendChild(info);

  // Encoding selector (for text files)
  if (isText) {
    const detected = detectEncoding(data);

    const encLabel = document.createElement('span');
    encLabel.className = 'file-info';
    encLabel.textContent = 'Encoding:';
    dom.actions.appendChild(encLabel);

    const select = document.createElement('select');
    select.className = 'encoding-select';
    for (const enc of ENCODINGS) {
      const opt = document.createElement('option');
      opt.value = enc;
      opt.textContent = enc === 'auto' ? `auto (${detected})` : enc;
      if (enc === currentEncoding) opt.selected = true;
      select.appendChild(opt);
    }
    select.onchange = () => {
      currentEncoding = select.value;
      renderTextContent(data, ext, currentEncoding);
    };
    dom.actions.appendChild(select);
  }

  const dlBtn = document.createElement('button');
  dlBtn.className = 'btn btn-primary';
  dlBtn.textContent = '\u2B07 Download';
  dlBtn.onclick = () => downloadFile(path, data);
  dom.actions.appendChild(dlBtn);

  // Native image preview
  if (IMAGE_EXTENSIONS.has(ext) && IMAGE_MIME[ext]) {
    showImagePreview(data, ext);
    return;
  }

  if (CANVAS_IMAGE_EXTENSIONS.has(ext)) {
    showCanvasImagePreview(data, ext);
    return;
  }

  // Text preview
  if (isText) {
    renderTextContent(data, ext, currentEncoding);
    return;
  }

  // Hex dump fallback
  showHexDump(data);
}

function showPlaceholder(msg) {
  const div = document.createElement('div');
  div.className = 'placeholder';
  div.textContent = msg;
  dom.preview.innerHTML = '';
  dom.preview.appendChild(div);
}

function renderTextContent(data, ext, encoding) {
  const resolved = encoding === 'auto' ? detectEncoding(data) : encoding;
  const text = decodeText(data, resolved);

  const pre = document.createElement('pre');
  const code = document.createElement('code');

  const lang = HLJS_LANG[ext];
  if (lang && typeof hljs !== 'undefined') {
    code.className = `language-${lang}`;
    code.textContent = text;
    hljs.highlightElement(code);
  } else {
    code.textContent = text;
  }

  pre.appendChild(code);
  dom.preview.innerHTML = '';
  dom.preview.appendChild(pre);
}

function showImagePreview(data, ext) {
  const blob = new Blob([data], { type: IMAGE_MIME[ext] });
  const url = URL.createObjectURL(blob);

  const container = document.createElement('div');
  container.className = 'image-preview';

  const img = document.createElement('img');
  img.src = url;
  img.onload = () => {
    URL.revokeObjectURL(url);
    const info = document.createElement('div');
    info.className = 'image-info';
    info.textContent = `${img.naturalWidth} \u00D7 ${img.naturalHeight}`;
    container.appendChild(info);
  };

  container.appendChild(img);
  dom.preview.innerHTML = '';
  dom.preview.appendChild(container);
}

const CANVAS_DECODERS = { '.tga': decodeTGA, '.dds': decodeDDS };

function showCanvasImagePreview(data, ext) {
  const decode = CANVAS_DECODERS[ext];
  if (!decode) { showHexDump(data); return; }

  try {
    const imageData = decode(data);

    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    canvas.className = 'canvas-preview';
    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);

    const container = document.createElement('div');
    container.className = 'image-preview';
    container.appendChild(canvas);

    const info = document.createElement('div');
    info.className = 'image-info';
    info.textContent = `${imageData.width} \u00D7 ${imageData.height} (${ext.slice(1).toUpperCase()})`;
    container.appendChild(info);

    dom.preview.innerHTML = '';
    dom.preview.appendChild(container);
  } catch (e) {
    showPlaceholder(`Failed to decode ${ext}: ${e.message}`);
  }
}

// --- TGA decoder ---

function decodeTGA(buf) {
  const d = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const idLen = d.getUint8(0);
  const colorMapType = d.getUint8(1);
  const imageType = d.getUint8(2);
  const width = d.getUint16(12, true);
  const height = d.getUint16(14, true);
  const bpp = d.getUint8(16);
  const descriptor = d.getUint8(17);
  const topToBottom = (descriptor & 0x20) !== 0;

  const colorMapStart = d.getUint16(3, true);
  const colorMapLen = d.getUint16(5, true);
  const colorMapBpp = d.getUint8(7);
  const colorMapBytes = colorMapType ? colorMapLen * (colorMapBpp / 8) : 0;

  let offset = 18 + idLen + colorMapBytes;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const isRLE = imageType >= 9;
  const baseType = isRLE ? imageType - 8 : imageType;

  // Read color map if present
  let colorMap = null;
  if (colorMapType && colorMapLen > 0) {
    const cmBytesPerEntry = colorMapBpp / 8;
    const cmOffset = 18 + idLen;
    colorMap = [];
    for (let i = 0; i < colorMapLen; i++) {
      const o = cmOffset + i * cmBytesPerEntry;
      if (cmBytesPerEntry === 3) colorMap.push([buf[o + 2], buf[o + 1], buf[o], 255]);
      else if (cmBytesPerEntry === 4) colorMap.push([buf[o + 2], buf[o + 1], buf[o], buf[o + 3]]);
      else colorMap.push([buf[o], buf[o], buf[o], 255]);
    }
  }

  // Reusable pixel buffer to avoid per-pixel array allocations
  const px = [0, 0, 0, 255];

  function readPixel() {
    px[3] = 255;
    if (baseType === 1 && colorMap) {
      const idx = (bpp === 16) ? d.getUint16(offset, true) : buf[offset];
      offset += bpp / 8;
      const c = colorMap[idx - colorMapStart] || px;
      px[0] = c[0]; px[1] = c[1]; px[2] = c[2]; px[3] = c[3];
    } else if (baseType === 3) {
      px[0] = px[1] = px[2] = buf[offset++];
      if (bpp === 16) px[3] = buf[offset++];
    } else {
      px[2] = buf[offset++]; px[1] = buf[offset++]; px[0] = buf[offset++];
      if (bpp === 32) px[3] = buf[offset++];
    }
  }

  function writePixel(pixIdx) {
    const row = topToBottom ? Math.floor(pixIdx / width) : height - 1 - Math.floor(pixIdx / width);
    const j = ((row * width) + (pixIdx % width)) * 4;
    pixels[j] = px[0]; pixels[j + 1] = px[1]; pixels[j + 2] = px[2]; pixels[j + 3] = px[3];
  }

  let pixIdx = 0;
  const totalPixels = width * height;

  if (isRLE) {
    while (pixIdx < totalPixels) {
      const packet = buf[offset++];
      const count = (packet & 0x7F) + 1;
      if (packet & 0x80) {
        readPixel();
        for (let i = 0; i < count && pixIdx < totalPixels; i++) writePixel(pixIdx++);
      } else {
        for (let i = 0; i < count && pixIdx < totalPixels; i++) {
          readPixel();
          writePixel(pixIdx++);
        }
      }
    }
  } else {
    for (let i = 0; i < totalPixels; i++) {
      readPixel();
      writePixel(i);
    }
  }

  return new ImageData(pixels, width, height);
}

// --- DDS decoder (DXT1/DXT3/DXT5 + uncompressed) ---

function decodeDDS(buf) {
  const d = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  if (d.getUint32(0, true) !== 0x20534444) throw new Error('Not a DDS file');

  const height = d.getUint32(12, true);
  const width = d.getUint32(16, true);
  const pfFlags = d.getUint32(80, true);
  const fourCC = d.getUint32(84, true);
  const rgbBitCount = d.getUint32(88, true);
  const rMask = d.getUint32(92, true);
  const gMask = d.getUint32(96, true);
  const bMask = d.getUint32(100, true);
  const aMask = d.getUint32(104, true);

  const dataOffset = 128;
  const pixels = new Uint8ClampedArray(width * height * 4);

  const FOURCC = pfFlags & 0x4;
  const DXT1 = 0x31545844;
  const DXT3 = 0x33545844;
  const DXT5 = 0x35545844;

  if (FOURCC && fourCC === DXT1) {
    decodeDXT1(buf, dataOffset, width, height, pixels);
  } else if (FOURCC && fourCC === DXT3) {
    decodeDXT3(buf, dataOffset, width, height, pixels);
  } else if (FOURCC && fourCC === DXT5) {
    decodeDXT5(buf, dataOffset, width, height, pixels);
  } else if (pfFlags & 0x40) {
      decodeUncompressedDDS(buf, dataOffset, width, height, rgbBitCount, rMask, gMask, bMask, aMask, pixels);
  } else {
    throw new Error(`Unsupported DDS format (fourCC: 0x${fourCC.toString(16)})`);
  }

  return new ImageData(pixels, width, height);
}

function unpackRGB565(c) {
  return [
    ((c >> 11) & 0x1F) * 255 / 31 | 0,
    ((c >> 5) & 0x3F) * 255 / 63 | 0,
    (c & 0x1F) * 255 / 31 | 0,
  ];
}

function decodeDXTBlock(buf, offset) {
  const d = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const c0 = d.getUint16(offset, true);
  const c1 = d.getUint16(offset + 2, true);
  const lut = d.getUint32(offset + 4, true);
  const [r0, g0, b0] = unpackRGB565(c0);
  const [r1, g1, b1] = unpackRGB565(c1);

  const colors = [
    [r0, g0, b0, 255],
    [r1, g1, b1, 255],
  ];

  if (c0 > c1) {
    colors[2] = [(2 * r0 + r1) / 3 | 0, (2 * g0 + g1) / 3 | 0, (2 * b0 + b1) / 3 | 0, 255];
    colors[3] = [(r0 + 2 * r1) / 3 | 0, (g0 + 2 * g1) / 3 | 0, (b0 + 2 * b1) / 3 | 0, 255];
  } else {
    colors[2] = [(r0 + r1) / 2 | 0, (g0 + g1) / 2 | 0, (b0 + b1) / 2 | 0, 255];
    colors[3] = [0, 0, 0, 0];
  }

  return { colors, lut };
}

function decodeDXT1(buf, offset, w, h, pixels) {
  const bw = (w + 3) >> 2, bh = (h + 3) >> 2;
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const { colors, lut } = decodeDXTBlock(buf, offset);
      offset += 8;
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const x = bx * 4 + px, y = by * 4 + py;
          if (x >= w || y >= h) continue;
          const idx = (lut >> (2 * (4 * py + px))) & 3;
          const c = colors[idx];
          const j = (y * w + x) * 4;
          pixels[j] = c[0]; pixels[j + 1] = c[1]; pixels[j + 2] = c[2]; pixels[j + 3] = c[3];
        }
      }
    }
  }
}

function decodeDXT3(buf, offset, w, h, pixels) {
  const bw = (w + 3) >> 2, bh = (h + 3) >> 2;
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      // 8 bytes of alpha (4-bit per pixel)
      const alphaData = new Uint8Array(16);
      for (let i = 0; i < 4; i++) {
        const row = buf[offset + i * 2] | (buf[offset + i * 2 + 1] << 8);
        for (let j = 0; j < 4; j++) {
          alphaData[i * 4 + j] = ((row >> (j * 4)) & 0xF) * 17;
        }
      }
      offset += 8;

      const { colors, lut } = decodeDXTBlock(buf, offset);
      offset += 8;
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const x = bx * 4 + px, y = by * 4 + py;
          if (x >= w || y >= h) continue;
          const idx = (lut >> (2 * (4 * py + px))) & 3;
          const c = colors[idx];
          const j = (y * w + x) * 4;
          pixels[j] = c[0]; pixels[j + 1] = c[1]; pixels[j + 2] = c[2];
          pixels[j + 3] = alphaData[py * 4 + px];
        }
      }
    }
  }
}

function decodeDXT5(buf, offset, w, h, pixels) {
  const bw = (w + 3) >> 2, bh = (h + 3) >> 2;
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const a0 = buf[offset], a1 = buf[offset + 1];
      // 6 bytes = 48 bits of 3-bit indices, split into two 24-bit halves
      const alphaLo = buf[offset + 2] | (buf[offset + 3] << 8) | (buf[offset + 4] << 16);
      const alphaHi = buf[offset + 5] | (buf[offset + 6] << 8) | (buf[offset + 7] << 16);
      offset += 8;

      const alphaTable = [a0, a1];
      if (a0 > a1) {
        for (let i = 1; i <= 6; i++) alphaTable.push(((7 - i) * a0 + i * a1) / 7 | 0);
      } else {
        for (let i = 1; i <= 4; i++) alphaTable.push(((5 - i) * a0 + i * a1) / 5 | 0);
        alphaTable.push(0, 255);
      }

      const { colors, lut } = decodeDXTBlock(buf, offset);
      offset += 8;
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const x = bx * 4 + px, y = by * 4 + py;
          if (x >= w || y >= h) continue;
          const idx = (lut >> (2 * (4 * py + px))) & 3;
          const c = colors[idx];
          const bitPos = 3 * (py * 4 + px);
          const aIdx = bitPos < 24
            ? (alphaLo >> bitPos) & 7
            : (alphaHi >> (bitPos - 24)) & 7;
          const j = (y * w + x) * 4;
          pixels[j] = c[0]; pixels[j + 1] = c[1]; pixels[j + 2] = c[2];
          pixels[j + 3] = alphaTable[aIdx];
        }
      }
    }
  }
}

function decodeUncompressedDDS(buf, offset, w, h, bpp, rMask, gMask, bMask, aMask, pixels) {
  const bytesPerPixel = bpp / 8;
  const d = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  function maskShift(mask) {
    if (!mask) return [0, 0];
    let shift = 0, bits = 0;
    let m = mask;
    while ((m & 1) === 0) { shift++; m >>= 1; }
    while (m & 1) { bits++; m >>= 1; }
    return [shift, bits];
  }

  const [rShift, rBits] = maskShift(rMask);
  const [gShift, gBits] = maskShift(gMask);
  const [bShift, bBits] = maskShift(bMask);
  const [aShift, aBits] = maskShift(aMask);

  const scale = (val, bits) => bits ? (val * 255 / ((1 << bits) - 1)) | 0 : 255;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let pixel = 0;
      for (let b = 0; b < bytesPerPixel; b++) pixel |= buf[offset++] << (b * 8);
      const j = (y * w + x) * 4;
      pixels[j] = scale((pixel & rMask) >>> rShift, rBits);
      pixels[j + 1] = scale((pixel & gMask) >>> gShift, gBits);
      pixels[j + 2] = scale((pixel & bMask) >>> bShift, bBits);
      pixels[j + 3] = aMask ? scale((pixel & aMask) >>> aShift, aBits) : 255;
    }
  }
}

function showHexDump(data) {
  const maxBytes = 4096;
  const bytes = data.subarray(0, maxBytes);
  const lines = [];

  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.subarray(i, i + 16);
    const offset = i.toString(16).padStart(8, '0');
    const hex = [...chunk].map(b => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = [...chunk].map(b => (b >= 0x20 && b <= 0x7e) ? String.fromCharCode(b) : '.').join('');

    lines.push(
      `<span class="hex-offset">${offset}</span>  ` +
      `<span class="hex-bytes">${hex.padEnd(47)}</span>  ` +
      `<span class="hex-ascii">${escapeHtml(ascii)}</span>`
    );
  }

  if (data.byteLength > maxBytes) {
    lines.push(`\n<span class="hex-offset">... ${formatSize(data.byteLength - maxBytes)} more</span>`);
  }

  const div = document.createElement('div');
  div.className = 'hex-dump';
  div.innerHTML = lines.join('\n');
  dom.preview.innerHTML = '';
  dom.preview.appendChild(div);
}

// --- Encoding detection ---

// Returns { encoding, bomLength } or null
function detectBOM(data) {
  if (data.length >= 3 && data[0] === 0xEF && data[1] === 0xBB && data[2] === 0xBF) return { encoding: 'utf-8', bomLength: 3 };
  if (data.length >= 2 && data[0] === 0xFF && data[1] === 0xFE) return { encoding: 'utf-16le', bomLength: 2 };
  if (data.length >= 2 && data[0] === 0xFE && data[1] === 0xFF) return { encoding: 'utf-16be', bomLength: 2 };
  return null;
}

// Returns 'utf-16le' | 'utf-16be' | null based on alternating null bytes
function detectUTF16Pattern(data) {
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

function detectEncoding(data) {
  if (data.length < 2) return 'gbk';
  const bom = detectBOM(data);
  if (bom) return bom.encoding;
  return detectUTF16Pattern(data) || 'gbk';
}

function decodeText(data, encoding) {
  const bom = detectBOM(data);
  const offset = (bom && bom.encoding === encoding) ? bom.bomLength : 0;
  const view = offset > 0 ? data.subarray(offset) : data;
  return new TextDecoder(encoding).decode(view);
}

// --- Text detection heuristic ---

function isLikelyText(data, ext) {
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

// --- Download ---

function downloadFile(path, data) {
  const blob = new Blob([data]);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = path.split(/[\\/]/).pop();
  a.click();
  URL.revokeObjectURL(a.href);
}

// --- Resizable sidebar ---

function initDivider() {
  let startX, startWidth;

  dom.divider.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    startWidth = dom.sidebar.offsetWidth;
    dom.divider.classList.add('dragging');

    const onMouseMove = (e) => {
      const delta = e.clientX - startX;
      const newWidth = Math.max(180, Math.min(startWidth + delta, window.innerWidth * 0.5));
      dom.sidebar.style.width = `${newWidth}px`;
    };

    const onMouseUp = () => {
      dom.divider.classList.remove('dragging');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

// --- Drag and drop ---

dom.picker.onchange = (e) => {
  if (e.target.files.length) loadFiles(e.target.files);
};

dom.drop.ondragover = (e) => {
  e.preventDefault();
  dom.drop.classList.add('over');
};

dom.drop.ondragleave = () => dom.drop.classList.remove('over');

dom.drop.ondrop = (e) => {
  e.preventDefault();
  dom.drop.classList.remove('over');
  if (e.dataTransfer.files.length) loadFiles(e.dataTransfer.files);
};

// --- Utilities ---

function getExtension(path) {
  const dot = path.lastIndexOf('.');
  return dot >= 0 ? path.slice(dot).toLowerCase() : '';
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- Boot ---

initDivider();
