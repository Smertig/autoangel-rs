import {
  TEXT_EXTENSIONS, BINARY_EXTENSIONS, IMAGE_EXTENSIONS, CANVAS_IMAGE_EXTENSIONS,
  IMAGE_MIME, HLJS_LANG, ENCODINGS,
  getExtension, formatSize, escapeHtml, classifyFiles,
  detectBOM, detectUTF16Pattern, detectEncoding, decodeText, isLikelyText,
  renderCanvasImage, initImageDecoders,
  showInlineProgress,
} from '../pck-common.js';
import { resolveCDN } from '../cdn.js';

const CDN = resolveCDN(import.meta.url);

// --- State ---

let pkg = null;
let fileTree = null;
let selectedPath = null;
let selectedTreeItem = null;
let currentEncoding = 'auto';
let filterText = '';
let filterTextLower = '';
let filterDebounceTimer = 0;
let renderGeneration = 0;

// --- DOM refs ---

const dom = {
  status: document.getElementById('status'),
  errorBanner: document.getElementById('error-banner'),
  drop: document.getElementById('drop'),
  picker: document.getElementById('picker'),
  explorer: document.getElementById('explorer'),
  sidebar: document.getElementById('sidebar'),
  tree: document.getElementById('tree'),
  filterInput: document.getElementById('filter-input'),
  divider: document.getElementById('divider'),
  breadcrumb: document.getElementById('breadcrumb'),
  preview: document.getElementById('preview'),
  actions: document.getElementById('actions'),
  statusbar: document.getElementById('statusbar'),
  filecount: document.getElementById('filecount'),
  format: document.getElementById('format'),
  keysToggle: document.getElementById('keys-toggle'),
  keysPanel: document.getElementById('keys-panel'),
  keysInfo: document.getElementById('keys-info'),
  keysReset: document.getElementById('keys-reset'),
  key1: document.getElementById('key1'),
  key2: document.getElementById('key2'),
  guard1: document.getElementById('guard1'),
  guard2: document.getElementById('guard2'),
};

function showError(msg) {
  dom.errorBanner.innerHTML = '';
  const text = document.createElement('span');
  text.className = 'error-text';
  text.textContent = msg;
  const dismiss = document.createElement('button');
  dismiss.className = 'error-dismiss';
  dismiss.textContent = '\u00d7';
  dismiss.onclick = hideError;
  dom.errorBanner.append(text, dismiss);
  dom.errorBanner.classList.remove('hidden');
}

function hideError() {
  dom.errorBanner.classList.add('hidden');
  dom.errorBanner.innerHTML = '';
}

// --- Worker ---

let worker = null;
let workerMsgId = 0;
const workerPending = new Map();

function workerCall(msg, transfer, onProgress) {
  return new Promise((resolve, reject) => {
    const id = ++workerMsgId;
    workerPending.set(id, { resolve, reject, onProgress });
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
    if (type === 'progress') {
      if (cb.onProgress) cb.onProgress(rest);
      return;
    }
    workerPending.delete(id);
    if (type === 'error') cb.reject(new Error(message));
    else cb.resolve(rest);
  };
}

// --- Init WASM (in-memory fallback) ---

let PckPackage = null;
let PackageConfig = null;

const workerAvailable = typeof Worker !== 'undefined';

if (workerAvailable) {
  try {
    initWorker();
  } catch { /* fall through to in-memory */ }
}

// Always load WASM in main thread (needed for image decoding; also used for PCK parsing when no worker)
const wasmMod = await import(`${CDN}/autoangel.js`);
await wasmMod.default(`${CDN}/autoangel_bg.wasm`);
initImageDecoders(wasmMod.decodeDds, wasmMod.decodeTga);

if (!worker) {
  PckPackage = wasmMod.PckPackage;
  PackageConfig = wasmMod.PackageConfig;
}

dom.status.textContent = 'Ready. Open a .pck file.';

// --- Keys panel ---

const DEFAULT_KEYS = { key1: '0xA8937462', key2: '0x59374231', guard1: '0xFDFDFEEE', guard2: '0xF00DBEEF' };

function readKeyValues() {
  const vals = { key1: dom.key1.value.trim(), key2: dom.key2.value.trim(), guard1: dom.guard1.value.trim(), guard2: dom.guard2.value.trim() };
  const isDefault = Object.keys(DEFAULT_KEYS).every(k => vals[k].toLowerCase() === DEFAULT_KEYS[k].toLowerCase());
  return { vals, isDefault };
}

function getCustomConfig() {
  const { vals, isDefault } = readKeyValues();
  if (isDefault) return null;
  const parse = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`Invalid key value: "${v}"`);
    return n >>> 0;
  };
  return { key1: parse(vals.key1), key2: parse(vals.key2), guard1: parse(vals.guard1), guard2: parse(vals.guard2) };
}

function updateKeysIndicator() {
  const { vals, isDefault } = readKeyValues();
  dom.keysToggle.classList.toggle('has-custom', !isDefault);
  dom.keysReset.disabled = isDefault;
  dom.keysInfo.textContent = isDefault
    ? 'Default keys. Change values and re-open a file to use custom keys.'
    : 'Custom keys set. Re-open a file to apply.';
  dom.keysInfo.classList.toggle('custom', !isDefault);
  for (const k of ['key1', 'key2', 'guard1', 'guard2']) {
    dom[k].classList.toggle('modified', vals[k].toLowerCase() !== DEFAULT_KEYS[k].toLowerCase());
  }
}

dom.keysToggle.onclick = () => {
  const wasHidden = dom.keysPanel.classList.toggle('hidden');
  dom.keysToggle.classList.toggle('active', !wasHidden);
};

dom.keysReset.onclick = () => {
  for (const [k, v] of Object.entries(DEFAULT_KEYS)) dom[k].value = v;
  updateKeysIndicator();
};

for (const k of ['key1', 'key2', 'guard1', 'guard2']) {
  dom[k].oninput = updateKeysIndicator;
}

// --- Unified file data access (works in both modes) ---

async function getFileData(path) {
  if (worker) {
    const result = await workerCall({ type: 'getFile', path });
    return new Uint8Array(result.data, result.byteOffset, result.byteLength);
  } else {
    return await pkg.getFile(path);
  }
}

// --- File loading ---

async function loadFiles(files) {
  const { pck: pckFile, pkxFiles } = classifyFiles(files);
  if (!pckFile) { showError('No .pck file found.'); return; }

  const label = pkxFiles.length > 0 ? `${pckFile.name} + ${pkxFiles.map(f => f.name).join(' + ')}` : pckFile.name;
  const totalSize = pckFile.size + pkxFiles.reduce((s, f) => s + f.size, 0);

  let customKeys;
  try {
    customKeys = getCustomConfig();
  } catch (e) {
    showError(e.message);
    return;
  }

  hideError();
  const statusFill = showInlineProgress(dom.status, `Parsing ${label} (${(totalSize / 1e6).toFixed(1)} MB)\u2026`);
  dom.preview.innerHTML = '<div class="placeholder">Parsing\u2026</div>';
  dom.actions.innerHTML = '';
  dom.tree.innerHTML = '';
  dom.filterInput.value = '';
  filterText = '';
  filterTextLower = '';

  if (pkg) { pkg.free(); pkg = null; }

  let fileList, version;

  const onWorkerProgress = ({ phase, index, total }) => {
    if (phase === 'parse') {
      const pct = Math.round(((index + 1) / total) * 100);
      statusFill.style.width = `${pct}%`;
    }
  };

  try {
    if (worker) {
      const result = await workerCall({ type: 'parseFile', pckFile, pkxFiles, keys: customKeys }, undefined, onWorkerProgress);
      fileList = result.fileList;
      version = result.version;
    } else {
      // In-memory fallback (no worker available)
      if (pkxFiles.length > 0) {
        showError('.pkx files require a modern browser with Web Worker support');
        return;
      }
      const pckBytes = new Uint8Array(await pckFile.arrayBuffer());
      const config = customKeys ? PackageConfig.withKeys(customKeys.key1, customKeys.key2, customKeys.guard1, customKeys.guard2) : undefined;
      pkg = await PckPackage.parse(pckBytes, config, { onProgress: (index, total) => onWorkerProgress({ phase: 'parse', index, total }) });
      fileList = pkg.fileList();
      version = pkg.version;
    }
  } catch (e) {
    showError(e.message || String(e));
    dom.status.classList.remove('has-progress');
    return;
  }

  fileTree = buildTree(fileList);

  dom.status.textContent = label;
  dom.status.classList.remove('has-progress');
  dom.filecount.textContent = `${fileList.length} files`;
  dom.format.textContent = `format v0x${version.toString(16).toUpperCase()}`;
  dom.explorer.classList.remove('hidden');
  dom.statusbar.classList.remove('hidden');
  dom.drop.classList.add('compact');

  selectedPath = null;
  selectedTreeItem = null;
  rerenderTree();
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
    node.files.push({ name: parts[parts.length - 1], fullPath: path, fullPathLower: path.toLowerCase() });
  }

  return root;
}

// --- Tree filtering ---

function isFileVisible(file) {
  if (filterTextLower && !file.fullPathLower.includes(filterTextLower)) return false;
  return true;
}

function hasFolderVisibleDescendants(node) {
  for (const file of node.files) {
    if (isFileVisible(file)) return true;
  }
  for (const [, child] of node.children) {
    if (hasFolderVisibleDescendants(child)) return true;
  }
  return false;
}

function highlightLabel(el, text) {
  if (!filterTextLower) {
    el.textContent = text;
    return;
  }
  const lower = text.toLowerCase();
  const idx = lower.indexOf(filterTextLower);
  if (idx === -1) {
    el.textContent = text;
    return;
  }
  el.textContent = text.slice(0, idx);
  const mark = document.createElement('mark');
  mark.textContent = text.slice(idx, idx + filterTextLower.length);
  el.appendChild(mark);
  el.appendChild(document.createTextNode(text.slice(idx + filterTextLower.length)));
}

function rerenderTree() {
  const gen = ++renderGeneration;
  if (!fileTree) {
    dom.tree.innerHTML = '';
    return;
  }
  const buffer = document.createDocumentFragment();
  renderTreeAsync(fileTree, buffer, 0, gen).then(() => {
    if (renderGeneration !== gen) return;
    dom.tree.innerHTML = '';
    dom.tree.appendChild(buffer);
  });
}

// --- Tree rendering (async, cancellable) ---

let renderItemCount = 0;

function yieldToMain() {
  return new Promise(r => setTimeout(r, 0));
}

async function renderTreeAsync(node, container, depth, gen) {
  if (depth === 0) renderItemCount = 0;
  if (renderGeneration !== gen) return;

  const folders = [...node.children.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const files = [...node.files].sort((a, b) => a.name.localeCompare(b.name));

  const visibleFiles = files.filter(f => isFileVisible(f));
  const visibleFolders = folders.filter(([, child]) => hasFolderVisibleDescendants(child));
  const autoExpand = !!filterText;

  for (const [name, child] of visibleFolders) {
    if (renderGeneration !== gen) return;

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
    highlightLabel(label, name);

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
          renderTreeAsync(child, childContainer, depth + 1, renderGeneration);
        }
        childContainer.classList.add('expanded');
        arrow.classList.add('expanded');
        icon.textContent = '\uD83D\uDCC2';
      }
    };

    item.append(row, childContainer);
    container.appendChild(item);

    if (autoExpand || visibleFolders.length + visibleFiles.length === 1) {
      await renderTreeAsync(child, childContainer, depth + 1, gen);
      if (renderGeneration !== gen) return;
      childContainer.classList.add('expanded');
      arrow.classList.add('expanded');
      icon.textContent = '\uD83D\uDCC2';
    }

    if (++renderItemCount % 500 === 0) {
      await yieldToMain();
      if (renderGeneration !== gen) return;
    }
  }

  for (const file of visibleFiles) {
    if (renderGeneration !== gen) return;

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
    highlightLabel(label, file.name);

    row.append(arrow, icon, label);

    row.onclick = (e) => {
      e.stopPropagation();
      selectFile(file.fullPath, row);
    };

    if (file.fullPath === selectedPath) {
      row.classList.add('selected');
      selectedTreeItem = row;
    }

    container.appendChild(row);

    if (++renderItemCount % 500 === 0) {
      await yieldToMain();
      if (renderGeneration !== gen) return;
    }
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

function showCanvasImagePreview(data, ext) {
  try {
    const { canvas, width, height } = renderCanvasImage(data, ext);
    canvas.className = 'canvas-preview';

    const container = document.createElement('div');
    container.className = 'image-preview';
    container.appendChild(canvas);

    const info = document.createElement('div');
    info.className = 'image-info';
    info.textContent = `${width} \u00D7 ${height} (${ext.slice(1).toUpperCase()})`;
    container.appendChild(info);

    dom.preview.innerHTML = '';
    dom.preview.appendChild(container);
  } catch (e) {
    showPlaceholder(`Failed to decode ${ext}: ${e.message}`);
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

// --- Filter input ---

dom.filterInput.oninput = () => {
  clearTimeout(filterDebounceTimer);
  filterDebounceTimer = setTimeout(() => {
    filterText = dom.filterInput.value;
    filterTextLower = filterText.toLowerCase();
    rerenderTree();
  }, 60);
};

// --- Keyboard shortcuts ---

document.addEventListener('keydown', (e) => {
  // Skip when typing in inputs (except Escape)
  if (e.target.matches('input, select, textarea')) {
    if (e.key === 'Escape') {
      e.target.blur();
      e.preventDefault();
    }
    return;
  }

  // Only active when explorer is visible
  if (dom.explorer.classList.contains('hidden')) return;

  switch (e.key) {
    case '/':
      e.preventDefault();
      dom.filterInput.focus();
      break;
    case 'Escape':
      if (dom.filterInput.value) {
        dom.filterInput.value = '';
        dom.filterInput.dispatchEvent(new Event('input'));
      }
      break;
  }
});

// --- Boot ---

initDivider();
