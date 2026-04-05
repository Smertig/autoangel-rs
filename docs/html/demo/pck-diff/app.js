import { classifyFiles, formatSize, getExtension, isLikelyText, detectEncoding, decodeText, IMAGE_EXTENSIONS, CANVAS_IMAGE_EXTENSIONS, ENCODINGS, HLJS_LANG, IMAGE_MIME, decodeTGA, decodeDDS, escapeHtml } from '../pck-common.js';
import { resolveCDN } from '../cdn.js';

const CDN = resolveCDN(import.meta.url);

// --- State ---

const sides = {
  left:  { worker: null, pkg: null, loaded: false, fileName: null, msgId: 0, pending: new Map() },
  right: { worker: null, pkg: null, loaded: false, fileName: null, msgId: 0, pending: new Map() },
};

let useOpfs = false;
let PckPackage = null;
let PackageConfig = null;
let diffResult = null; // { added, deleted, modified, unchanged }

// --- Filter/selection state ---

let activeFilters = new Set();  // subset of 'added', 'deleted', 'modified', 'unchanged'
let showUnchanged = false;
let filterText = '';
let selectedPath = null;
let selectedTreeItem = null;
let diffTree = null;
let activeBlobUrls = [];
let imageFitToScreen = true;

// --- DOM refs ---

const dom = {
  chooser: document.getElementById('chooser'),
  errorBanner: document.getElementById('error-banner'),
  compareBtn: document.getElementById('compare-btn'),
  progress: document.getElementById('progress'),
  results: document.getElementById('results'),
  statusbar: document.getElementById('statusbar'),
  status: document.getElementById('status'),
};

// Per-side DOM refs (keyed by 'left' | 'right')
const sideDom = {};
for (const side of ['left', 'right']) {
  const panel = document.getElementById(`${side}-panel`);
  sideDom[side] = {
    panel,
    dropZone: panel.querySelector('.drop-zone'),
    picker: panel.querySelector('.picker'),
    keysToggle: panel.querySelector('.keys-toggle'),
    keysPanel: panel.querySelector('.keys-panel'),
    keysInfo: panel.querySelector('.keys-info'),
    keysReset: panel.querySelector('.keys-reset'),
    statusLine: panel.querySelector('.status-line'),
    key1: panel.querySelector('[data-key="key1"]'),
    key2: panel.querySelector('[data-key="key2"]'),
    guard1: panel.querySelector('[data-key="guard1"]'),
    guard2: panel.querySelector('[data-key="guard2"]'),
  };
}

// --- Error handling ---

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

// --- OPFS Worker (per side) ---

function initWorker(side) {
  const workerUrl = new URL('../pck/pck-worker.js', import.meta.url);
  workerUrl.searchParams.set('cdn', CDN);
  const w = new Worker(workerUrl, { type: 'module' });
  w.onmessage = (e) => {
    const { id, type, message, ...rest } = e.data;
    const state = sides[side];
    const cb = state.pending.get(id);
    if (!cb) return;
    state.pending.delete(id);
    if (type === 'error') cb.reject(new Error(message));
    else cb.resolve(rest);
  };
  sides[side].worker = w;
}

function workerCall(side, msg, transfer) {
  const state = sides[side];
  return new Promise((resolve, reject) => {
    const id = ++state.msgId;
    state.pending.set(id, { resolve, reject });
    state.worker.postMessage({ id, ...msg }, transfer || []);
  });
}

// --- Init WASM ---

const opfsAvailable = typeof navigator !== 'undefined'
  && typeof navigator.storage?.getDirectory === 'function'
  && typeof Worker !== 'undefined';

if (opfsAvailable) {
  try {
    initWorker('left');
    initWorker('right');
    useOpfs = true;
  } catch { /* fall through to in-memory */ }
}

if (!useOpfs) {
  const mod = await import(`${CDN}/autoangel.js`);
  await mod.default(`${CDN}/autoangel_bg.wasm`);
  PckPackage = mod.PckPackage;
  PackageConfig = mod.PackageConfig;
}

dom.status.textContent = 'Ready. Drop packages to compare.';

// --- Keys panel ---

const DEFAULT_KEYS = { key1: '0xA8937462', key2: '0x59374231', guard1: '0xFDFDFEEE', guard2: '0xF00DBEEF' };

function readKeyValues(side) {
  const sd = sideDom[side];
  const vals = {
    key1: sd.key1.value.trim(),
    key2: sd.key2.value.trim(),
    guard1: sd.guard1.value.trim(),
    guard2: sd.guard2.value.trim(),
  };
  const isDefault = Object.keys(DEFAULT_KEYS).every(k => vals[k].toLowerCase() === DEFAULT_KEYS[k].toLowerCase());
  return { vals, isDefault };
}

function getCustomConfig(side) {
  const { vals, isDefault } = readKeyValues(side);
  if (isDefault) return null;
  const parse = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`Invalid key value: "${v}"`);
    return n >>> 0;
  };
  return { key1: parse(vals.key1), key2: parse(vals.key2), guard1: parse(vals.guard1), guard2: parse(vals.guard2) };
}

function updateKeysIndicator(side) {
  const sd = sideDom[side];
  const { vals, isDefault } = readKeyValues(side);
  sd.keysToggle.classList.toggle('has-custom', !isDefault);
  sd.keysReset.disabled = isDefault;
  sd.keysInfo.textContent = isDefault
    ? 'Default keys. Change values and re-open a file to use custom keys.'
    : 'Custom keys set. Re-open a file to apply.';
  sd.keysInfo.classList.toggle('custom', !isDefault);
  for (const k of ['key1', 'key2', 'guard1', 'guard2']) {
    sd[k].classList.toggle('modified', vals[k].toLowerCase() !== DEFAULT_KEYS[k].toLowerCase());
  }
}

// Set up keys panel handlers for each side
for (const side of ['left', 'right']) {
  const sd = sideDom[side];

  sd.keysToggle.onclick = () => {
    const wasHidden = sd.keysPanel.classList.toggle('hidden');
    sd.keysToggle.classList.toggle('active', !wasHidden);
  };

  sd.keysReset.onclick = () => {
    for (const [k, v] of Object.entries(DEFAULT_KEYS)) sd[k].value = v;
    updateKeysIndicator(side);
  };

  for (const k of ['key1', 'key2', 'guard1', 'guard2']) {
    sd[k].oninput = () => updateKeysIndicator(side);
  }
}

// --- File loading ---

async function loadPackage(side, files) {
  const { pck: pckFile, pkx: pkxFile } = classifyFiles(files);
  if (!pckFile) { showError('No .pck file found.'); return; }

  const label = pkxFile ? `${pckFile.name} + ${pkxFile.name}` : pckFile.name;
  const totalSize = pckFile.size + (pkxFile?.size || 0);

  let customKeys;
  try {
    customKeys = getCustomConfig(side);
  } catch (e) {
    showError(e.message);
    return;
  }

  hideError();
  const sd = sideDom[side];
  sd.statusLine.textContent = `Parsing ${label}\u2026`;
  sd.statusLine.classList.remove('loaded');

  // Free previous package for in-memory mode
  if (!useOpfs && sides[side].pkg) {
    sides[side].pkg.free();
    sides[side].pkg = null;
  }

  try {
    if (useOpfs) {
      await workerCall(side, { type: 'parse', pckFile, pkxFile, keys: customKeys });
    } else {
      if (pkxFile) {
        showError('.pkx files require OPFS support (use a modern browser with HTTPS)');
        return;
      }
      const pckBytes = new Uint8Array(await pckFile.arrayBuffer());
      const config = customKeys ? PackageConfig.withKeys(customKeys.key1, customKeys.key2, customKeys.guard1, customKeys.guard2) : undefined;
      sides[side].pkg = PckPackage.parse(pckBytes, config);
    }
  } catch (e) {
    showError(e.message || String(e));
    sd.statusLine.textContent = '';
    return;
  }

  sides[side].loaded = true;
  sides[side].fileName = label;

  sd.statusLine.textContent = `\u2713 ${label} (${formatSize(totalSize)})`;
  sd.statusLine.classList.add('loaded');

  updateCompareButton();
}

// --- Compare button ---

function updateCompareButton() {
  dom.compareBtn.disabled = !(sides.left.loaded && sides.right.loaded);
}

dom.compareBtn.onclick = () => {
  if (sides.left.loaded && sides.right.loaded) {
    startComparison();
  }
};

async function getFileEntries(side) {
  const progressItem = document.getElementById(`progress-${side}`);
  const label = progressItem.querySelector('.progress-label');
  const fill = progressItem.querySelector('.progress-fill');

  label.textContent = `Computing hashes for ${side} package...`;
  fill.className = 'progress-fill indeterminate';

  let entries;
  if (useOpfs) {
    const result = await workerCall(side, { type: 'fileEntries' });
    entries = result.entries;
  } else {
    const wasmEntries = sides[side].pkg.fileEntries();
    entries = wasmEntries.map(e => {
      const plain = { path: e.path, size: e.size, compressedSize: e.compressedSize, hash: e.hash };
      e.free();
      return plain;
    });
  }

  label.textContent = `Done (${entries.length} files)`;
  fill.className = 'progress-fill done';

  return entries;
}

function classifyDiff(leftEntries, rightEntries) {
  const leftMap = new Map(leftEntries.map(e => [e.path, e]));
  const rightMap = new Map(rightEntries.map(e => [e.path, e]));

  const added = [];    // only in right
  const deleted = [];  // only in left
  const modified = []; // in both, different hash
  const unchanged = []; // in both, same hash

  for (const [path, entry] of rightMap) {
    if (!leftMap.has(path)) {
      added.push({ path, right: entry });
    }
  }

  for (const [path, entry] of leftMap) {
    if (!rightMap.has(path)) {
      deleted.push({ path, left: entry });
    } else {
      const rightEntry = rightMap.get(path);
      if (entry.hash !== rightEntry.hash) {
        modified.push({ path, left: entry, right: rightEntry });
      } else {
        unchanged.push({ path, left: entry, right: rightEntry });
      }
    }
  }

  return { added, deleted, modified, unchanged };
}

function showResults() {
  dom.progress.classList.add('hidden');
  dom.chooser.classList.add('hidden');
  dom.results.classList.remove('hidden');
  dom.statusbar.classList.remove('hidden');

  renderSummaryBar();
  diffTree = buildDiffTree();
  rerenderTree();
  updateStatusBar();
  initDivider();
}

function handleNewCompare() {
  diffResult = null;
  diffTree = null;
  currentDiffState = null;
  activeFilters.clear();
  showUnchanged = false;
  filterText = '';
  selectedPath = null;
  selectedTreeItem = null;
  document.getElementById('filter-input').value = '';
  document.getElementById('show-unchanged').checked = false;
  dom.results.classList.add('hidden');
  dom.statusbar.classList.add('hidden');
  dom.chooser.classList.remove('hidden', 'dimmed');
  updateCompareButton();
}

// --- Summary bar ---

function renderSummaryBar() {
  document.getElementById('summary-left-name').textContent = sides.left.fileName || 'Left';
  document.getElementById('summary-right-name').textContent = sides.right.fileName || 'Right';

  const statsContainer = document.getElementById('summary-stats');
  statsContainer.innerHTML = '';

  const badges = [
    { status: 'added', prefix: '+', count: diffResult.added.length },
    { status: 'deleted', prefix: '\u2212', count: diffResult.deleted.length },
    { status: 'modified', prefix: '~', count: diffResult.modified.length },
    { status: 'unchanged', prefix: '', count: diffResult.unchanged.length },
  ];

  for (const { status, prefix, count } of badges) {
    const btn = document.createElement('button');
    btn.className = `stat-badge ${status}`;
    if (activeFilters.has(status)) btn.classList.add('active');
    btn.textContent = `${prefix}${count} ${status}`;
    btn.onclick = () => {
      if (activeFilters.has(status)) {
        activeFilters.delete(status);
      } else {
        activeFilters.add(status);
      }
      btn.classList.toggle('active', activeFilters.has(status));
      rerenderTree();
    };
    statsContainer.appendChild(btn);
  }

  document.getElementById('swap-btn').onclick = handleSwap;
  document.getElementById('new-compare-btn').onclick = handleNewCompare;

  // Show unchanged toggle
  const showUnchangedCheckbox = document.getElementById('show-unchanged');
  const showUnchangedLabel = document.getElementById('show-unchanged-label');
  showUnchangedCheckbox.checked = showUnchanged;
  showUnchangedLabel.textContent = `Show unchanged (${diffResult.unchanged.length})`;
  showUnchangedCheckbox.onchange = () => {
    showUnchanged = showUnchangedCheckbox.checked;
    rerenderTree();
  };

  // Filter input
  const filterInput = document.getElementById('filter-input');
  filterInput.value = filterText;
  filterInput.oninput = () => {
    filterText = filterInput.value;
    rerenderTree();
  };
}

// --- Diff tree building ---

function buildDiffTree() {
  const root = { name: '', children: new Map(), files: [] };

  function addEntries(entries, status) {
    for (const entry of entries) {
      const parts = entry.path.split('\\');
      let node = root;
      for (let i = 0; i < parts.length - 1; i++) {
        const dir = parts[i];
        if (!node.children.has(dir)) {
          node.children.set(dir, { name: dir, children: new Map(), files: [] });
        }
        node = node.children.get(dir);
      }
      node.files.push({
        name: parts[parts.length - 1],
        fullPath: entry.path,
        status,
        left: entry.left || null,
        right: entry.right || null,
      });
    }
  }

  addEntries(diffResult.added, 'added');
  addEntries(diffResult.deleted, 'deleted');
  addEntries(diffResult.modified, 'modified');
  addEntries(diffResult.unchanged, 'unchanged');

  return root;
}

// --- Folder status computation ---

const STATUS_LETTER = { added: 'A', deleted: 'D', modified: 'M', unchanged: '' };

function computeFolderStatus(node) {
  const found = new Set();

  for (const file of node.files) {
    if (!isFileVisible(file)) continue;
    found.add(file.status);
  }

  for (const [, child] of node.children) {
    const childStatus = computeFolderStatus(child);
    if (childStatus !== null) found.add(childStatus);
  }

  if (found.size === 0) return null;
  if (found.size === 1) return [...found][0];
  // Mixed statuses (e.g. added + deleted) → show as modified
  found.delete('unchanged');
  if (found.size === 0) return 'unchanged';
  if (found.size === 1) return [...found][0];
  return 'modified';
}

// --- Visibility checks ---

function isFileVisible(file) {
  // Check status filters
  if (activeFilters.size > 0 && !activeFilters.has(file.status)) return false;
  if (!showUnchanged && file.status === 'unchanged' && !activeFilters.has('unchanged')) return false;

  // Check text filter
  if (filterText && !file.fullPath.toLowerCase().includes(filterText.toLowerCase())) return false;

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

// --- Tree rendering ---

function rerenderTree() {
  const treeContainer = document.getElementById('tree');
  treeContainer.innerHTML = '';
  if (diffTree) {
    renderDiffTree(diffTree, treeContainer, 0);
  }
}

function renderDiffTree(node, container, depth) {
  const folders = [...node.children.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const files = [...node.files].sort((a, b) => a.name.localeCompare(b.name));

  const visibleFiles = files.filter(f => isFileVisible(f));
  const visibleFolders = folders.filter(([, child]) => hasFolderVisibleDescendants(child));

  for (const [name, child] of visibleFolders) {
    const folderStatus = computeFolderStatus(child);
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

    if (folderStatus === 'unchanged') {
      row.classList.add('unchanged');
    } else if (folderStatus) {
      const badge = document.createElement('span');
      badge.className = `diff-badge ${folderStatus}`;
      badge.textContent = STATUS_LETTER[folderStatus];
      row.appendChild(badge);
    }

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
          renderDiffTree(child, childContainer, depth + 1);
        }
        childContainer.classList.add('expanded');
        arrow.classList.add('expanded');
        icon.textContent = '\uD83D\uDCC2';
      }
    };

    item.append(row, childContainer);
    container.appendChild(item);

    // Auto-expand single-child folders
    if (visibleFolders.length + visibleFiles.length === 1) {
      renderDiffTree(child, childContainer, depth + 1);
      childContainer.classList.add('expanded');
      arrow.classList.add('expanded');
      icon.textContent = '\uD83D\uDCC2';
    }
  }

  for (const file of visibleFiles) {
    const row = document.createElement('div');
    row.className = `tree-item ${file.status}`;
    row.dataset.path = file.fullPath;
    row.dataset.status = file.status;
    row.style.paddingLeft = `${8 + depth * 16}px`;

    const arrow = document.createElement('span');
    arrow.className = 'tree-arrow leaf';

    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.textContent = '\uD83D\uDCC4';

    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = file.name;

    row.append(arrow, icon, label);

    if (file.status !== 'unchanged') {
      const badge = document.createElement('span');
      badge.className = `diff-badge ${file.status}`;
      badge.textContent = STATUS_LETTER[file.status];
      row.appendChild(badge);
    }

    row.onclick = (e) => {
      e.stopPropagation();
      selectFile(file.fullPath, file.status, row);
    };

    if (selectedPath === file.fullPath) {
      row.classList.add('selected');
      selectedTreeItem = row;
    }

    container.appendChild(row);
  }
}

// --- File data fetching ---

async function getFileData(side, path) {
  if (useOpfs) {
    const result = await workerCall(side, { type: 'getFile', path });
    return new Uint8Array(result.data, result.byteOffset, result.byteLength);
  } else {
    return sides[side].pkg.getFile(path);
  }
}

// --- File selection ---

// Cached state for diff toggle (avoids re-fetching on view switch)
let currentDiffState = null;

async function selectFile(path, status, treeRow) {
  if (selectedTreeItem) selectedTreeItem.classList.remove('selected');
  if (treeRow) { treeRow.classList.add('selected'); selectedTreeItem = treeRow; }
  selectedPath = path;

  const preview = document.getElementById('preview');
  const contentHeader = document.getElementById('content-header');
  const actions = document.getElementById('actions');
  // Revoke any blob URLs from the previous preview
  for (const url of activeBlobUrls) URL.revokeObjectURL(url);
  activeBlobUrls = [];

  preview.innerHTML = '<div class="placeholder">Loading...</div>';
  contentHeader.innerHTML = '';
  actions.innerHTML = '';
  currentDiffState = null;

  try {
    if (status === 'modified') {
      const [leftData, rightData] = await Promise.all([
        getFileData('left', path),
        getFileData('right', path),
      ]);
      await previewModified(leftData, rightData, path);
    } else if (status === 'added') {
      const data = await getFileData('right', path);
      previewSingleFile(data, path, 'added');
    } else if (status === 'deleted') {
      const data = await getFileData('left', path);
      previewSingleFile(data, path, 'deleted');
    } else {
      const data = await getFileData('right', path);
      previewSingleFile(data, path, 'unchanged');
    }
  } catch (e) {
    preview.innerHTML = '';
    const err = document.createElement('div');
    err.className = 'placeholder';
    err.textContent = `Error: ${e.message}`;
    preview.appendChild(err);
  }
}

// --- Modified file routing ---

async function previewModified(leftData, rightData, path) {
  const ext = getExtension(path);
  if (isLikelyText(leftData, ext) && isLikelyText(rightData, ext)) {
    previewModifiedText(leftData, rightData, path, ext);
  } else if (IMAGE_EXTENSIONS.has(ext) || CANVAS_IMAGE_EXTENSIONS.has(ext)) {
    await previewModifiedImage(leftData, rightData, path, ext);
  } else {
    previewModifiedBinary(leftData, rightData, path);
  }
}

// --- Image diff (side-by-side, swipe, onion skin) ---

async function createImageElement(data, ext) {
  if (CANVAS_IMAGE_EXTENSIONS.has(ext)) {
    const decode = ext === '.tga' ? decodeTGA : decodeDDS;
    const imageData = decode(data);
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    canvas.getContext('2d').putImageData(imageData, 0, 0);
    return { el: canvas, width: imageData.width, height: imageData.height };
  }

  const blob = new Blob([data], { type: IMAGE_MIME[ext] });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
  // Don't revoke here — cloned images still need this URL.
  // URLs are revoked when the preview is replaced (via activeBlobUrls).
  activeBlobUrls.push(url);
  return { el: img, width: img.naturalWidth, height: img.naturalHeight };
}

async function previewModifiedImage(leftData, rightData, path, ext) {
  const preview = document.getElementById('preview');
  const contentHeader = document.getElementById('content-header');
  const actions = document.getElementById('actions');

  preview.innerHTML = '<div class="placeholder">Loading images\u2026</div>';
  contentHeader.innerHTML = '';
  actions.innerHTML = '';

  let leftImg, rightImg;
  try {
    [leftImg, rightImg] = await Promise.all([
      createImageElement(leftData, ext),
      createImageElement(rightData, ext),
    ]);
  } catch (e) {
    preview.innerHTML = '';
    const err = document.createElement('div');
    err.className = 'placeholder';
    err.textContent = `Failed to decode image: ${e.message}`;
    preview.appendChild(err);
    return;
  }

  // Content header: path + size change
  const pathSpan = document.createElement('span');
  pathSpan.className = 'content-path';
  pathSpan.textContent = path;
  contentHeader.appendChild(pathSpan);

  const sizeSpan = document.createElement('span');
  sizeSpan.className = 'content-size';
  sizeSpan.textContent = `${formatSize(leftData.byteLength)} \u2192 ${formatSize(rightData.byteLength)}`;
  contentHeader.appendChild(sizeSpan);

  // Tab bar
  const tabs = document.createElement('div');
  tabs.className = 'image-compare-tabs';

  const modes = ['Side-by-side', 'Swipe', 'Onion skin'];
  let activeMode = 'Side-by-side';

  for (const mode of modes) {
    const btn = document.createElement('button');
    btn.className = 'btn';
    if (mode === activeMode) btn.classList.add('active');
    btn.textContent = mode;
    btn.onclick = () => {
      if (mode === activeMode) return;
      activeMode = mode;
      for (const b of tabs.children) b.classList.remove('active');
      btn.classList.add('active');
      renderImageMode(activeMode, leftImg, rightImg, leftData, rightData, preview);
    };
    tabs.appendChild(btn);
  }

  actions.appendChild(tabs);

  // Fit/Real size toggle
  const fitToggle = document.createElement('button');
  fitToggle.className = 'btn btn-small';
  fitToggle.textContent = 'Real size';
  fitToggle.title = 'Switch between fit-to-screen and real pixel size';
  fitToggle.onclick = () => {
    imageFitToScreen = !imageFitToScreen;
    fitToggle.textContent = imageFitToScreen ? 'Real size' : 'Fit to screen';
    renderImageMode(activeMode, leftImg, rightImg, leftData, rightData, preview);
  };
  actions.appendChild(fitToggle);

  // Render default mode
  renderImageMode(activeMode, leftImg, rightImg, leftData, rightData, preview);
}

function cloneImageElement(imgInfo) {
  if (imgInfo.el instanceof HTMLCanvasElement) {
    const canvas = document.createElement('canvas');
    canvas.width = imgInfo.width;
    canvas.height = imgInfo.height;
    canvas.getContext('2d').drawImage(imgInfo.el, 0, 0);
    return canvas;
  }
  const img = new Image();
  img.src = imgInfo.el.src;
  img.width = imgInfo.width;
  img.height = imgInfo.height;
  return img;
}

function renderImageMode(mode, leftImg, rightImg, leftData, rightData, preview) {
  preview.innerHTML = '';
  preview.style.padding = '';
  preview.style.overflow = '';

  const container = document.createElement('div');
  container.className = 'image-compare' + (imageFitToScreen ? '' : ' real-size');
  preview.appendChild(container);

  if (mode === 'Side-by-side') {
    renderImageSideBySide(leftImg, rightImg, leftData, rightData, container);
  } else if (mode === 'Swipe') {
    renderImageSwipe(leftImg, rightImg, container);
  } else {
    renderImageOnionSkin(leftImg, rightImg, container);
  }
}

function renderImageSideBySide(leftImg, rightImg, leftData, rightData, container) {
  const sbs = document.createElement('div');
  sbs.className = 'image-sbs';

  for (const [img, data, title] of [[leftImg, leftData, 'Old'], [rightImg, rightData, 'New']]) {
    const panel = document.createElement('div');
    panel.className = 'image-sbs-panel';

    const el = cloneImageElement(img);
    panel.appendChild(el);

    const label = document.createElement('div');
    label.className = 'image-sbs-label';
    label.textContent = `${title}: ${img.width} \u00D7 ${img.height} (${formatSize(data.byteLength)})`;
    panel.appendChild(label);

    sbs.appendChild(panel);
  }

  container.appendChild(sbs);
}

function renderImageSwipe(leftImg, rightImg, container) {
  const swipe = document.createElement('div');
  swipe.className = 'image-swipe';

  // Base (left/old) image — fully visible underneath
  const baseEl = cloneImageElement(leftImg);
  baseEl.style.display = 'block';
  baseEl.style.width = '100%';
  swipe.appendChild(baseEl);

  // Overlay (right/new) image — positioned on top, clipped via clip-path
  const overEl = cloneImageElement(rightImg);
  overEl.className = 'swipe-top';
  swipe.appendChild(overEl);

  // Divider line
  const divider = document.createElement('div');
  divider.className = 'swipe-divider';
  swipe.appendChild(divider);

  // Labels
  const labelLeft = document.createElement('div');
  labelLeft.className = 'swipe-label swipe-label-left';
  labelLeft.textContent = 'Old';
  swipe.appendChild(labelLeft);

  const labelRight = document.createElement('div');
  labelRight.className = 'swipe-label swipe-label-right';
  labelRight.textContent = 'New';
  swipe.appendChild(labelRight);

  container.appendChild(swipe);

  requestAnimationFrame(() => {
    function updateSwipe(x) {
      const rect = swipe.getBoundingClientRect();
      const pxPos = Math.max(0, Math.min(x - rect.left, rect.width));
      const pct = (pxPos / rect.width) * 100;
      divider.style.left = pct + '%';
      overEl.style.clipPath = `inset(0 0 0 ${pct}%)`;
    }

    // Initial position at center
    updateSwipe(swipe.getBoundingClientRect().left + swipe.offsetWidth / 2);

    swipe.addEventListener('mousedown', (e) => {
      e.preventDefault();
      updateSwipe(e.clientX);
      const onMove = (e) => updateSwipe(e.clientX);
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    swipe.addEventListener('touchstart', (e) => {
      e.preventDefault();
      updateSwipe(e.touches[0].clientX);
    }, { passive: false });
    swipe.addEventListener('touchmove', (e) => {
      e.preventDefault();
      updateSwipe(e.touches[0].clientX);
    }, { passive: false });
  });
}

function renderImageOnionSkin(leftImg, rightImg, container) {
  const onion = document.createElement('div');
  onion.className = 'image-onion';

  // Base (left/old) image
  const baseEl = cloneImageElement(leftImg);
  baseEl.style.opacity = '0.5';
  onion.appendChild(baseEl);

  // Top (right/new) image
  const topEl = cloneImageElement(rightImg);
  topEl.className = 'onion-top';
  topEl.style.opacity = '0.5';
  onion.appendChild(topEl);

  container.appendChild(onion);

  // Slider controls
  const sliderRow = document.createElement('div');
  sliderRow.className = 'image-onion-slider';

  const oldLabel = document.createElement('span');
  oldLabel.className = 'onion-label';
  oldLabel.style.textAlign = 'right';
  oldLabel.textContent = 'Old';

  const range = document.createElement('input');
  range.type = 'range';
  range.min = '0';
  range.max = '100';
  range.value = '50';

  const valLabel = document.createElement('span');
  valLabel.className = 'onion-label';
  valLabel.textContent = 'Opacity: 50%';

  const newLabel = document.createElement('span');
  newLabel.className = 'onion-label';
  newLabel.textContent = 'New';

  range.oninput = () => {
    const v = range.value;
    baseEl.style.opacity = 1 - v / 100;
    topEl.style.opacity = v / 100;
    valLabel.textContent = `${v}%`;
  };

  sliderRow.append(oldLabel, range, valLabel, newLabel);
  container.appendChild(sliderRow);

  // Size the top image to match base after layout
  requestAnimationFrame(() => {
    topEl.style.width = baseEl.offsetWidth + 'px';
    topEl.style.height = baseEl.offsetHeight + 'px';
  });
}

// --- Binary diff ---

function previewModifiedBinary(leftData, rightData, path) {
  const preview = document.getElementById('preview');
  const contentHeader = document.getElementById('content-header');
  const actions = document.getElementById('actions');
  preview.innerHTML = '';
  actions.innerHTML = '';

  // Content header
  contentHeader.innerHTML = '';
  const pathEl = document.createElement('span');
  pathEl.className = 'content-path';
  pathEl.textContent = path;
  contentHeader.appendChild(pathEl);

  // Size comparison card
  const sizeCard = document.createElement('div');
  sizeCard.className = 'binary-size-card';
  const oldSize = leftData.byteLength;
  const newSize = rightData.byteLength;
  const delta = newSize - oldSize;
  const pct = oldSize > 0 ? ((delta / oldSize) * 100).toFixed(1) : '\u221E';
  const sign = delta >= 0 ? '+' : '';
  sizeCard.innerHTML = `
    <div class="size-row"><span class="size-label">Old:</span> <span>${formatSize(oldSize)}</span></div>
    <div class="size-row"><span class="size-label">New:</span> <span>${formatSize(newSize)}</span></div>
    <div class="size-row"><span class="size-label">Delta:</span> <span>${sign}${formatSize(Math.abs(delta))} (${sign}${pct}%)</span></div>
  `;
  preview.appendChild(sizeCard);

  // Find first differing offset
  const minLen = Math.min(oldSize, newSize);
  let firstDiff = -1;
  for (let i = 0; i < minLen; i++) {
    if (leftData[i] !== rightData[i]) { firstDiff = i; break; }
  }
  if (firstDiff === -1 && oldSize !== newSize) firstDiff = minLen;

  if (firstDiff >= 0) {
    // Show hex dump around first difference
    const contextBytes = 32; // bytes before the diff to show
    const showBytes = 128;   // total bytes to show
    const start = Math.max(0, firstDiff - contextBytes) & ~0xF; // align to 16-byte boundary

    const hexSection = document.createElement('div');
    hexSection.className = 'binary-hex-diff';

    const title = document.createElement('div');
    title.className = 'hex-diff-title';
    title.textContent = `First difference at offset 0x${firstDiff.toString(16).toUpperCase().padStart(8, '0')}`;
    hexSection.appendChild(title);

    // Old hex
    const oldHex = renderHexRegion(leftData, start, showBytes, firstDiff, 'Old');
    hexSection.appendChild(oldHex);

    // New hex
    const newHex = renderHexRegion(rightData, start, showBytes, firstDiff, 'New');
    hexSection.appendChild(newHex);

    preview.appendChild(hexSection);
  }
}

function renderHexRegion(data, start, maxBytes, highlightOffset, label) {
  const div = document.createElement('div');
  div.className = 'hex-region';

  const header = document.createElement('div');
  header.className = 'hex-region-label';
  header.textContent = label;
  div.appendChild(header);

  const pre = document.createElement('div');
  pre.className = 'hex-dump';

  const end = Math.min(start + maxBytes, data.byteLength);
  const lines = [];
  for (let i = start; i < end; i += 16) {
    const chunk = data.subarray(i, Math.min(i + 16, end));
    const offset = i.toString(16).padStart(8, '0');
    const hexParts = [];
    const asciiParts = [];
    for (let j = 0; j < 16; j++) {
      if (j < chunk.length) {
        const byteOffset = i + j;
        const isHighlight = byteOffset >= highlightOffset && byteOffset < highlightOffset + 16;
        const hex = chunk[j].toString(16).padStart(2, '0');
        hexParts.push(isHighlight ? `<span class="hex-highlight">${hex}</span>` : hex);
        const ch = chunk[j] >= 0x20 && chunk[j] <= 0x7e ? String.fromCharCode(chunk[j]) : '.';
        asciiParts.push(isHighlight ? `<span class="hex-highlight">${escapeHtml(ch)}</span>` : escapeHtml(ch));
      } else {
        hexParts.push('  ');
        asciiParts.push(' ');
      }
    }
    lines.push(`<span class="hex-offset">${offset}</span>  ${hexParts.join(' ')}  ${asciiParts.join('')}`);
  }

  pre.innerHTML = lines.join('\n');
  div.appendChild(pre);
  return div;
}

function showHexDump(data, container) {
  const maxBytes = 4096;
  const bytes = data.subarray(0, maxBytes);
  const lines = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.subarray(i, i + 16);
    const offset = i.toString(16).padStart(8, '0');
    const hex = [...chunk].map(b => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = [...chunk].map(b => (b >= 0x20 && b <= 0x7e) ? String.fromCharCode(b) : '.').join('');
    lines.push(
      `<span class="hex-offset">${offset}</span>  <span class="hex-bytes">${hex.padEnd(47)}</span>  <span class="hex-ascii">${escapeHtml(ascii)}</span>`
    );
  }
  if (data.byteLength > maxBytes) {
    lines.push(`\n<span class="hex-offset">... ${formatSize(data.byteLength - maxBytes)} more</span>`);
  }
  const div = document.createElement('div');
  div.className = 'hex-dump';
  div.innerHTML = lines.join('\n');
  container.appendChild(div);
}

// --- Text diff preview ---

function previewModifiedText(leftData, rightData, path, ext) {
  const leftEnc = detectEncoding(leftData);
  const rightEnc = detectEncoding(rightData);
  const leftText = decodeText(leftData, leftEnc);
  const rightText = decodeText(rightData, rightEnc);

  const changes = Diff.diffLines(leftText, rightText);

  // Content header
  const contentHeader = document.getElementById('content-header');
  contentHeader.innerHTML = '';

  const pathSpan = document.createElement('span');
  pathSpan.className = 'content-path';
  pathSpan.textContent = path;
  contentHeader.appendChild(pathSpan);

  const sizeSpan = document.createElement('span');
  sizeSpan.className = 'content-size';
  sizeSpan.textContent = `${formatSize(leftData.byteLength)} \u2192 ${formatSize(rightData.byteLength)}`;
  contentHeader.appendChild(sizeSpan);

  if (leftEnc !== rightEnc) {
    const encSpan = document.createElement('span');
    encSpan.className = 'content-size';
    encSpan.textContent = `(${leftEnc} \u2192 ${rightEnc})`;
    contentHeader.appendChild(encSpan);
  } else if (leftEnc !== 'gbk') {
    const encSpan = document.createElement('span');
    encSpan.className = 'content-size';
    encSpan.textContent = `(${leftEnc})`;
    contentHeader.appendChild(encSpan);
  }

  // Cache state for toggle
  currentDiffState = { changes, leftText, rightText, ext };

  // Actions: toggle buttons
  const actions = document.getElementById('actions');
  actions.innerHTML = '';

  const toggle = document.createElement('div');
  toggle.className = 'diff-toggle';

  const btnUnified = document.createElement('button');
  btnUnified.className = 'btn active';
  btnUnified.textContent = 'Unified';

  const btnSideBySide = document.createElement('button');
  btnSideBySide.className = 'btn';
  btnSideBySide.textContent = 'Side-by-side';

  btnUnified.onclick = () => {
    if (btnUnified.classList.contains('active')) return;
    btnUnified.classList.add('active');
    btnSideBySide.classList.remove('active');
    renderDiffView('unified');
  };

  btnSideBySide.onclick = () => {
    if (btnSideBySide.classList.contains('active')) return;
    btnSideBySide.classList.add('active');
    btnUnified.classList.remove('active');
    renderDiffView('side-by-side');
  };

  toggle.append(btnUnified, btnSideBySide);
  actions.appendChild(toggle);

  // Render unified by default
  renderDiffView('unified');
}

function renderDiffView(mode) {
  if (!currentDiffState) return;
  const preview = document.getElementById('preview');
  preview.innerHTML = '';

  const { changes } = currentDiffState;

  if (mode === 'side-by-side') {
    const contentEl = document.getElementById('content');
    if (contentEl.offsetWidth < 600) {
      const notice = document.createElement('div');
      notice.className = 'placeholder';
      notice.textContent = 'Panel too narrow for side-by-side view. Showing unified diff instead.';
      preview.appendChild(notice);
      const container = document.createElement('div');
      container.className = 'diff-view';
      preview.appendChild(container);
      renderUnifiedDiff(changes, container);
    } else {
      preview.style.padding = '0';
      preview.style.overflow = 'hidden';
      renderSideBySideDiff(changes, preview);
    }
  } else {
    preview.style.padding = '';
    preview.style.overflow = '';
    const container = document.createElement('div');
    container.className = 'diff-view';
    preview.appendChild(container);
    renderUnifiedDiff(changes, container);
  }
}

// --- Unified diff renderer ---

function splitLines(value) {
  // Split into lines, preserving the fact that a trailing newline means an empty final entry
  const lines = value.split('\n');
  // If the value ends with \n, the last split element is '' — remove it since it's not a real line
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

function renderUnifiedDiff(changes, container) {
  let oldLine = 1;
  let newLine = 1;

  // Pre-compute which changes are "context" to identify collapsible regions
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const lines = splitLines(change.value);

    if (change.added) {
      for (const line of lines) {
        const div = createDiffLine('added', null, newLine, line);
        container.appendChild(div);
        newLine++;
      }
    } else if (change.removed) {
      for (const line of lines) {
        const div = createDiffLine('removed', oldLine, null, line);
        container.appendChild(div);
        oldLine++;
      }
    } else {
      // Context lines — collapse if more than 6 lines and not first/last change
      const isFirst = (i === 0);
      const isLast = (i === changes.length - 1);

      if (lines.length > 6 && !isFirst && !isLast) {
        // Show first 3 lines
        for (let j = 0; j < 3; j++) {
          const div = createDiffLine('context', oldLine, newLine, lines[j]);
          container.appendChild(div);
          oldLine++;
          newLine++;
        }

        // Collapsible separator
        const hiddenCount = lines.length - 6;
        const sep = createHunkSeparator(hiddenCount, lines.slice(3, lines.length - 3), oldLine, newLine, container);
        container.appendChild(sep);
        oldLine += hiddenCount;
        newLine += hiddenCount;

        // Show last 3 lines
        for (let j = lines.length - 3; j < lines.length; j++) {
          const div = createDiffLine('context', oldLine, newLine, lines[j]);
          container.appendChild(div);
          oldLine++;
          newLine++;
        }
      } else if (lines.length > 6 && isFirst) {
        // First change: show only last 3 context lines
        const hiddenCount = lines.length - 3;
        const sep = createHunkSeparator(hiddenCount, lines.slice(0, hiddenCount), oldLine, newLine, container);
        container.appendChild(sep);
        oldLine += hiddenCount;
        newLine += hiddenCount;

        for (let j = hiddenCount; j < lines.length; j++) {
          const div = createDiffLine('context', oldLine, newLine, lines[j]);
          container.appendChild(div);
          oldLine++;
          newLine++;
        }
      } else if (lines.length > 6 && isLast) {
        // Last change: show only first 3 context lines
        for (let j = 0; j < 3; j++) {
          const div = createDiffLine('context', oldLine, newLine, lines[j]);
          container.appendChild(div);
          oldLine++;
          newLine++;
        }

        const hiddenCount = lines.length - 3;
        const sep = createHunkSeparator(hiddenCount, lines.slice(3), oldLine, newLine, container);
        container.appendChild(sep);
        oldLine += hiddenCount;
        newLine += hiddenCount;
      } else {
        for (const line of lines) {
          const div = createDiffLine('context', oldLine, newLine, line);
          container.appendChild(div);
          oldLine++;
          newLine++;
        }
      }
    }
  }
}

function createDiffLine(type, oldNum, newNum, content) {
  const div = document.createElement('div');
  div.className = `diff-line ${type}`;

  const gutterOld = document.createElement('span');
  gutterOld.className = 'diff-gutter';
  gutterOld.textContent = oldNum != null ? oldNum : '';

  const gutterNew = document.createElement('span');
  gutterNew.className = 'diff-gutter';
  gutterNew.textContent = newNum != null ? newNum : '';

  const code = document.createElement('span');
  code.className = 'diff-code';
  code.textContent = content;

  div.append(gutterOld, gutterNew, code);
  return div;
}

function createHunkSeparator(hiddenCount, hiddenLines, startOld, startNew, parentContainer) {
  const sep = document.createElement('div');
  sep.className = 'diff-hunk-sep';
  sep.textContent = `\u22EF ${hiddenCount} unchanged lines`;

  sep.onclick = () => {
    // Replace separator with actual lines
    const frag = document.createDocumentFragment();
    let ol = startOld;
    let nl = startNew;
    for (const line of hiddenLines) {
      const div = createDiffLine('context', ol, nl, line);
      frag.appendChild(div);
      ol++;
      nl++;
    }
    sep.replaceWith(frag);
  };

  return sep;
}

// --- Side-by-side diff renderer ---

function renderSideBySideDiff(changes, container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'diff-side-by-side';

  const leftCol = document.createElement('div');
  leftCol.className = 'diff-column';

  const rightCol = document.createElement('div');
  rightCol.className = 'diff-column';

  let oldLine = 1;
  let newLine = 1;

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const lines = splitLines(change.value);
    const isFirst = i === 0;
    const isLast = i === changes.length - 1;

    if (change.removed) {
      for (const line of lines) {
        leftCol.appendChild(createSideDiffLine('removed', oldLine, line));
        rightCol.appendChild(createSideDiffLine('blank', null, ''));
        oldLine++;
      }
    } else if (change.added) {
      for (const line of lines) {
        leftCol.appendChild(createSideDiffLine('blank', null, ''));
        rightCol.appendChild(createSideDiffLine('added', newLine, line));
        newLine++;
      }
    } else {
      // Context lines with collapsing
      if (lines.length > 6 && !isFirst && !isLast) {
        for (let j = 0; j < 3; j++) {
          leftCol.appendChild(createSideDiffLine('context', oldLine, lines[j]));
          rightCol.appendChild(createSideDiffLine('context', newLine, lines[j]));
          oldLine++; newLine++;
        }
        const hiddenCount = lines.length - 6;
        const hiddenLines = lines.slice(3, lines.length - 3);
        const sepOld = oldLine, sepNew = newLine;
        const leftSep = createSideHunkSep(hiddenCount, hiddenLines, sepOld, sepNew, leftCol, rightCol, 'left');
        const rightSep = createSideHunkSep(hiddenCount, hiddenLines, sepOld, sepNew, leftCol, rightCol, 'right');
        leftSep._sibling = rightSep; rightSep._sibling = leftSep;
        leftCol.appendChild(leftSep); rightCol.appendChild(rightSep);
        oldLine += hiddenCount; newLine += hiddenCount;
        for (let j = lines.length - 3; j < lines.length; j++) {
          leftCol.appendChild(createSideDiffLine('context', oldLine, lines[j]));
          rightCol.appendChild(createSideDiffLine('context', newLine, lines[j]));
          oldLine++; newLine++;
        }
      } else if (lines.length > 6 && isFirst) {
        const hiddenCount = lines.length - 3;
        const hiddenLines = lines.slice(0, hiddenCount);
        const sepOld = oldLine, sepNew = newLine;
        const leftSep = createSideHunkSep(hiddenCount, hiddenLines, sepOld, sepNew, leftCol, rightCol, 'left');
        const rightSep = createSideHunkSep(hiddenCount, hiddenLines, sepOld, sepNew, leftCol, rightCol, 'right');
        leftSep._sibling = rightSep; rightSep._sibling = leftSep;
        leftCol.appendChild(leftSep); rightCol.appendChild(rightSep);
        oldLine += hiddenCount; newLine += hiddenCount;
        for (let j = hiddenCount; j < lines.length; j++) {
          leftCol.appendChild(createSideDiffLine('context', oldLine, lines[j]));
          rightCol.appendChild(createSideDiffLine('context', newLine, lines[j]));
          oldLine++; newLine++;
        }
      } else if (lines.length > 6 && isLast) {
        for (let j = 0; j < 3; j++) {
          leftCol.appendChild(createSideDiffLine('context', oldLine, lines[j]));
          rightCol.appendChild(createSideDiffLine('context', newLine, lines[j]));
          oldLine++; newLine++;
        }
        const hiddenCount = lines.length - 3;
        const hiddenLines = lines.slice(3);
        const sepOld = oldLine, sepNew = newLine;
        const leftSep = createSideHunkSep(hiddenCount, hiddenLines, sepOld, sepNew, leftCol, rightCol, 'left');
        const rightSep = createSideHunkSep(hiddenCount, hiddenLines, sepOld, sepNew, leftCol, rightCol, 'right');
        leftSep._sibling = rightSep; rightSep._sibling = leftSep;
        leftCol.appendChild(leftSep); rightCol.appendChild(rightSep);
        oldLine += hiddenCount; newLine += hiddenCount;
      } else {
        for (const line of lines) {
          leftCol.appendChild(createSideDiffLine('context', oldLine, line));
          rightCol.appendChild(createSideDiffLine('context', newLine, line));
          oldLine++; newLine++;
        }
      }
    }
  }

  wrapper.append(leftCol, rightCol);
  container.appendChild(wrapper);

  // Synchronized scrolling
  let syncing = false;
  leftCol.addEventListener('scroll', () => {
    if (syncing) return; syncing = true;
    rightCol.scrollTop = leftCol.scrollTop;
    syncing = false;
  });
  rightCol.addEventListener('scroll', () => {
    if (syncing) return; syncing = true;
    leftCol.scrollTop = rightCol.scrollTop;
    syncing = false;
  });
}

function createSideHunkSep(hiddenCount, hiddenLines, startOld, startNew, leftCol, rightCol, side) {
  const sep = document.createElement('div');
  sep.className = 'diff-hunk-sep';
  sep.textContent = `\u22EF ${hiddenCount} unchanged lines`;
  sep.onclick = () => {
    // Expand both columns simultaneously
    const leftFrag = document.createDocumentFragment();
    const rightFrag = document.createDocumentFragment();
    let ol = startOld, nl = startNew;
    for (const line of hiddenLines) {
      leftFrag.appendChild(createSideDiffLine('context', ol, line));
      rightFrag.appendChild(createSideDiffLine('context', nl, line));
      ol++; nl++;
    }
    // Find the sibling separator and replace both
    const mySibling = sep._sibling;
    if (side === 'left') {
      sep.replaceWith(leftFrag);
      mySibling.replaceWith(rightFrag);
    } else {
      sep.replaceWith(rightFrag);
      mySibling.replaceWith(leftFrag);
    }
  };
  return sep;
}

function createSideDiffLine(type, lineNum, content) {
  const div = document.createElement('div');
  div.className = `diff-line ${type}`;

  const gutter = document.createElement('span');
  gutter.className = 'diff-gutter';
  gutter.textContent = lineNum != null ? lineNum : '';

  const code = document.createElement('span');
  code.className = 'diff-code';
  code.textContent = content;

  div.append(gutter, code);
  return div;
}

// --- Single file preview (added/deleted/unchanged) ---

function previewSingleFile(data, path, status) {
  const preview = document.getElementById('preview');
  const contentHeader = document.getElementById('content-header');
  const actions = document.getElementById('actions');
  preview.innerHTML = '';
  actions.innerHTML = '';

  // Content header
  contentHeader.innerHTML = '';
  const pathEl = document.createElement('span');
  pathEl.className = 'content-path';
  pathEl.textContent = path;
  const sizeEl = document.createElement('span');
  sizeEl.className = 'content-size';
  sizeEl.textContent = formatSize(data.byteLength);
  contentHeader.append(pathEl, sizeEl);

  // Status banner
  const banner = document.createElement('div');
  banner.className = `diff-banner ${status}`;
  banner.textContent = status === 'added' ? 'New file (not in left package)'
    : status === 'deleted' ? 'Removed file (not in right package)'
    : 'Unchanged';
  preview.appendChild(banner);

  const ext = getExtension(path);

  // Image preview
  if (IMAGE_EXTENSIONS.has(ext) && IMAGE_MIME[ext]) {
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
    preview.appendChild(container);
    return;
  }

  if (CANVAS_IMAGE_EXTENSIONS.has(ext)) {
    try {
      const decode = ext === '.tga' ? decodeTGA : decodeDDS;
      const imageData = decode(data);
      const canvas = document.createElement('canvas');
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      canvas.className = 'canvas-preview';
      canvas.getContext('2d').putImageData(imageData, 0, 0);
      const container = document.createElement('div');
      container.className = 'image-preview';
      container.appendChild(canvas);
      const info = document.createElement('div');
      info.className = 'image-info';
      info.textContent = `${imageData.width} \u00D7 ${imageData.height} (${ext.slice(1).toUpperCase()})`;
      container.appendChild(info);
      preview.appendChild(container);
    } catch (e) {
      const err = document.createElement('div');
      err.className = 'placeholder';
      err.textContent = `Failed to decode ${ext}: ${e.message}`;
      preview.appendChild(err);
    }
    return;
  }

  // Text preview
  if (isLikelyText(data, ext)) {
    const encoding = detectEncoding(data);
    const text = decodeText(data, encoding);
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
    preview.appendChild(pre);
    return;
  }

  // Hex dump fallback
  showHexDump(data, preview);
}

// --- Swap functionality ---

function handleSwap() {
  // Swap side state
  const tmpWorker = sides.left.worker;
  const tmpPkg = sides.left.pkg;
  const tmpLoaded = sides.left.loaded;
  const tmpFileName = sides.left.fileName;
  const tmpMsgId = sides.left.msgId;
  const tmpPending = sides.left.pending;

  sides.left.worker = sides.right.worker;
  sides.left.pkg = sides.right.pkg;
  sides.left.loaded = sides.right.loaded;
  sides.left.fileName = sides.right.fileName;
  sides.left.msgId = sides.right.msgId;
  sides.left.pending = sides.right.pending;

  sides.right.worker = tmpWorker;
  sides.right.pkg = tmpPkg;
  sides.right.loaded = tmpLoaded;
  sides.right.fileName = tmpFileName;
  sides.right.msgId = tmpMsgId;
  sides.right.pending = tmpPending;

  // Swap sideDom refs
  const tmpDom = sideDom.left;
  sideDom.left = sideDom.right;
  sideDom.right = tmpDom;

  // Re-classify: added <-> deleted, modified and unchanged stay
  if (diffResult) {
    const newAdded = diffResult.deleted.map(e => ({ path: e.path, right: e.left }));
    const newDeleted = diffResult.added.map(e => ({ path: e.path, left: e.right }));
    const newModified = diffResult.modified.map(e => ({ path: e.path, left: e.right, right: e.left }));
    const newUnchanged = diffResult.unchanged.map(e => ({ path: e.path, left: e.right, right: e.left }));
    diffResult = { added: newAdded, deleted: newDeleted, modified: newModified, unchanged: newUnchanged };
  }

  // Clear selection and diff state
  selectedPath = null;
  selectedTreeItem = null;
  currentDiffState = null;
  const preview = document.getElementById('preview');
  preview.innerHTML = '<div class="placeholder">Select a file to view its diff</div>';
  preview.style.padding = '';
  preview.style.overflow = '';
  document.getElementById('content-header').innerHTML = '';
  document.getElementById('actions').innerHTML = '';

  // Re-render
  renderSummaryBar();
  diffTree = buildDiffTree();
  rerenderTree();
  updateStatusBar();
}

// --- Status bar ---

function updateStatusBar() {
  if (!diffResult) return;
  const changed = diffResult.added.length + diffResult.deleted.length + diffResult.modified.length;
  const leftTotal = diffResult.deleted.length + diffResult.modified.length + diffResult.unchanged.length;
  const rightTotal = diffResult.added.length + diffResult.modified.length + diffResult.unchanged.length;
  dom.status.textContent = `${changed} files changed \u00B7 ${sides.left.fileName}: ${leftTotal} files \u00B7 ${sides.right.fileName}: ${rightTotal} files`;
}

// --- Resizable divider ---

let dividerInitialized = false;
function initDivider() {
  if (dividerInitialized) return;
  dividerInitialized = true;
  const divider = document.getElementById('divider');
  const sidebar = document.getElementById('sidebar');
  let startX, startWidth;

  divider.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    startWidth = sidebar.offsetWidth;
    divider.classList.add('dragging');

    const onMouseMove = (e) => {
      const delta = e.clientX - startX;
      const newWidth = Math.max(180, Math.min(startWidth + delta, window.innerWidth * 0.5));
      sidebar.style.width = `${newWidth}px`;
    };

    const onMouseUp = () => {
      divider.classList.remove('dragging');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

async function startComparison() {
  hideError();
  dom.chooser.classList.add('dimmed');
  dom.compareBtn.disabled = true;

  // Show progress
  dom.progress.classList.remove('hidden');
  // Reset progress bars to indeterminate
  for (const side of ['left', 'right']) {
    const item = document.getElementById(`progress-${side}`);
    item.querySelector('.progress-label').textContent = `Computing hashes for ${side} package...`;
    item.querySelector('.progress-fill').className = 'progress-fill indeterminate';
  }

  try {
    const [leftResult, rightResult] = await Promise.all([
      getFileEntries('left'),
      getFileEntries('right'),
    ]);

    const diff = classifyDiff(leftResult, rightResult);
    diffResult = diff;

    showResults();
  } catch (e) {
    showError(e.message || String(e));
    dom.chooser.classList.remove('dimmed');
    dom.compareBtn.disabled = false;
    dom.progress.classList.add('hidden');
  }
}

// --- Drop zone + file picker handlers ---

for (const side of ['left', 'right']) {
  const sd = sideDom[side];

  sd.picker.onchange = (e) => {
    if (e.target.files.length) loadPackage(side, e.target.files);
  };

  sd.dropZone.ondragover = (e) => {
    e.preventDefault();
    sd.dropZone.classList.add('over');
  };

  sd.dropZone.ondragleave = () => sd.dropZone.classList.remove('over');

  sd.dropZone.ondrop = (e) => {
    e.preventDefault();
    sd.dropZone.classList.remove('over');
    if (e.dataTransfer.files.length) loadPackage(side, e.dataTransfer.files);
  };
}

// --- Keyboard shortcuts ---

function navigateTree(direction, skipUnchanged = false) {
  const tree = document.getElementById('tree');
  // Get all visible file tree items (not folders)
  const items = [...tree.querySelectorAll('.tree-item[data-path]')];
  if (items.length === 0) return;

  let currentIdx = items.findIndex(el => el.classList.contains('selected'));
  let nextIdx = currentIdx;

  do {
    nextIdx += direction;
    if (nextIdx < 0 || nextIdx >= items.length) return; // at boundary
  } while (skipUnchanged && items[nextIdx].dataset.status === 'unchanged');

  items[nextIdx].click();
  items[nextIdx].scrollIntoView({ block: 'nearest' });
}

function toggleDiffView() {
  const toggle = document.querySelector('.diff-toggle');
  if (!toggle) return;
  const buttons = toggle.querySelectorAll('.btn');
  const activeIdx = [...buttons].findIndex(b => b.classList.contains('active'));
  const nextIdx = activeIdx === 0 ? 1 : 0;
  buttons[nextIdx].click();
}

function handleEscape() {
  const filterInput = document.getElementById('filter-input');
  if (filterInput.value) {
    filterInput.value = '';
    filterInput.dispatchEvent(new Event('input'));
  } else {
    handleNewCompare();
  }
}

document.addEventListener('keydown', (e) => {
  // Skip when typing in inputs
  if (e.target.matches('input, select, textarea')) {
    if (e.key === 'Escape') {
      e.target.blur();
      e.preventDefault();
    }
    return;
  }

  // Only active when results view is visible
  if (dom.results.classList.contains('hidden')) return;

  switch (e.key) {
    case 'ArrowUp':
    case 'ArrowDown':
      e.preventDefault();
      navigateTree(e.key === 'ArrowDown' ? 1 : -1);
      break;
    case 'n':
      navigateTree(1, true); // skip unchanged
      break;
    case 'p':
      navigateTree(-1, true); // skip unchanged
      break;
    case 'u':
      toggleDiffView();
      break;
    case '/':
      e.preventDefault();
      document.getElementById('filter-input').focus();
      break;
    case 'Escape':
      handleEscape();
      break;
  }
});
