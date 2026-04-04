const CDN = 'https://cdn.jsdelivr.net/npm/autoangel@0.8.0';

// --- State ---

let data = null;
let lists = [];          // { index, caption, entryCount, list }
let entrySummaries = []; // cached { id, name, index } for current list
let lastEntryPerList = new Map(); // listIndex -> last selected entryIndex
let selectedListIdx = -1;
let selectedEntryIdx = -1;
let selectedListEl = null;
let selectedEntryEl = null;

// --- DOM refs ---

const dom = {
  status: document.getElementById('status'),
  drop: document.getElementById('drop'),
  picker: document.getElementById('picker'),
  explorer: document.getElementById('explorer'),
  listFilter: document.getElementById('list-filter'),
  listsContent: document.getElementById('lists-content'),
  entriesTitle: document.getElementById('entries-title'),
  entrySearch: document.getElementById('entry-search'),
  entriesContent: document.getElementById('entries-content'),
  detailTitle: document.getElementById('detail-title'),
  detailContent: document.getElementById('detail-content'),
  statusbar: document.getElementById('statusbar'),
  infoLists: document.getElementById('info-lists'),
  infoVersion: document.getElementById('info-version'),
  infoEntries: document.getElementById('info-entries'),
};

// --- Init WASM ---

const { default: init, ElementsData } = await import(`${CDN}/autoangel.js`);
await init(`${CDN}/autoangel_bg.wasm`);
dom.status.textContent = 'Ready. Open an elements.data file.';

// --- File loading ---

async function loadFile(file) {
  dom.status.textContent = `Parsing ${file.name} (${(file.size / 1e6).toFixed(1)} MB)\u2026`;
  showPlaceholder(dom.detailContent, 'Parsing\u2026');
  dom.listsContent.innerHTML = '';
  dom.entriesContent.innerHTML = '';

  for (const info of lists) info.list.free();
  lists = [];
  entrySummaries = [];
  lastEntryPerList.clear();
  if (data) { data.free(); data = null; }

  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    data = ElementsData.parse(bytes);
  } catch (e) {
    dom.status.textContent = `Error: ${e.message || e}`;
    return;
  }

  // Build list metadata
  lists = [];
  let totalEntries = 0;
  for (let i = 0; i < data.listCount; i++) {
    const list = data.getList(i);
    const entryCount = list.entryCount;
    lists.push({ index: i, caption: list.caption, entryCount, list });
    totalEntries += entryCount;
  }

  dom.status.textContent = file.name;
  dom.infoLists.textContent = `${lists.length} lists`;
  dom.infoVersion.textContent = `v${data.version}`;
  dom.infoEntries.textContent = `${totalEntries} total entries`;
  dom.explorer.classList.remove('hidden');
  dom.statusbar.classList.remove('hidden');
  dom.drop.classList.add('compact');

  selectedListIdx = -1;
  selectedEntryIdx = -1;
  selectedListEl = null;
  selectedEntryEl = null;

  renderLists('');
  dom.entriesTitle.textContent = 'Entries';
  dom.entriesContent.innerHTML = '';
  showPlaceholder(dom.detailContent, 'Select an entry to view details');
  dom.listFilter.value = '';
  dom.entrySearch.value = '';
}

// --- List rendering ---

function renderLists(filter) {
  dom.listsContent.innerHTML = '';
  const lowerFilter = filter.toLowerCase();

  for (const info of lists) {
    if (lowerFilter && !info.caption.toLowerCase().includes(lowerFilter)) continue;

    const el = document.createElement('div');
    el.className = 'list-item';
    if (info.index === selectedListIdx) {
      el.classList.add('selected');
      selectedListEl = el;
    }

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = info.entryCount;

    el.textContent = info.caption;
    el.appendChild(badge);

    el.onclick = () => selectList(info.index, el);
    dom.listsContent.appendChild(el);
  }
}

// --- List selection ---

function selectList(listIndex, el) {
  if (selectedListEl) selectedListEl.classList.remove('selected');
  el.classList.add('selected');
  selectedListEl = el;
  selectedListIdx = listIndex;
  selectedEntryIdx = -1;
  selectedEntryEl = null;

  const info = lists[listIndex];
  dom.entriesTitle.textContent = `${info.caption} (${info.entryCount})`;
  dom.entrySearch.value = '';
  showPlaceholder(dom.detailContent, 'Select an entry to view details');

  // Cache entry ID/Name summaries once per list selection (avoids N+1 WASM calls on search)
  cacheEntrySummaries(info);
  renderEntries(info, '');

  // Auto-select last-viewed entry for this list, or first entry
  if (info.entryCount > 0) {
    const restoreIdx = lastEntryPerList.get(listIndex) ?? 0;
    // Find the DOM element for this entry index (position matches entrySummaries order when unfiltered)
    const domIdx = entrySummaries.findIndex(s => s.index === restoreIdx);
    const targetEl = domIdx >= 0 ? dom.entriesContent.children[domIdx] : dom.entriesContent.children[0];
    const entryIdx = domIdx >= 0 ? restoreIdx : entrySummaries[0]?.index ?? 0;
    if (targetEl) {
      selectEntry(info, entryIdx, targetEl);
      targetEl.scrollIntoView({ block: 'nearest' });
    }
  }
}

function cacheEntrySummaries(listInfo) {
  entrySummaries = [];
  const { list, entryCount } = listInfo;
  const fieldNames = list.fieldNames();
  const hasId = fieldNames.includes('ID');
  const hasName = fieldNames.includes('Name');

  for (let i = 0; i < entryCount; i++) {
    const entry = list.getEntry(i);
    const id = hasId ? String(entry.getField('ID')) : String(i);
    const name = hasName ? String(entry.getField('Name') ?? '') : '';
    entry.free();
    entrySummaries.push({ index: i, id, name });
  }
}

// --- Entry rendering ---

function renderEntries(listInfo, search) {
  dom.entriesContent.innerHTML = '';
  const lowerSearch = search.toLowerCase();

  for (const summary of entrySummaries) {
    if (lowerSearch) {
      if (!summary.id.includes(lowerSearch) && !summary.name.toLowerCase().includes(lowerSearch)) continue;
    }

    const el = document.createElement('div');
    el.className = 'entry-item';
    if (summary.index === selectedEntryIdx) {
      el.classList.add('selected');
      selectedEntryEl = el;
    }

    const idSpan = document.createElement('span');
    idSpan.className = 'entry-id';
    idSpan.textContent = summary.id;
    el.appendChild(idSpan);

    el.appendChild(document.createTextNode(summary.name || `entry #${summary.index}`));

    const entryIndex = summary.index;
    el.onclick = () => selectEntry(listInfo, entryIndex, el);

    dom.entriesContent.appendChild(el);
  }
}

// --- Entry selection ---

function selectEntry(listInfo, entryIndex, el) {
  if (selectedEntryEl) selectedEntryEl.classList.remove('selected');
  el.classList.add('selected');
  selectedEntryEl = el;
  selectedEntryIdx = entryIndex;
  lastEntryPerList.set(selectedListIdx, entryIndex);

  const entry = listInfo.list.getEntry(entryIndex);
  const keys = entry.keys();

  dom.detailTitle.textContent = `Entry #${entryIndex}`;
  renderDetail(entry, keys);
  entry.free();
}

// --- Detail rendering ---

function renderDetail(entry, keys) {
  const table = document.createElement('table');
  table.className = 'detail-table';

  for (const key of keys) {
    const value = entry.getField(key);
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.className = 'field-name';
    tdName.textContent = key;

    const tdValue = document.createElement('td');
    tdValue.className = 'field-value';

    if (value instanceof Uint8Array) {
      tdValue.classList.add('bytes-value');
      renderBytesField(tdValue, value);
    } else if (typeof value === 'number') {
      tdValue.classList.add('number-value');
      tdValue.textContent = Number.isInteger(value) ? value.toString() : value.toFixed(6);
    } else if (typeof value === 'string') {
      tdValue.classList.add('string-value');
      tdValue.textContent = `"${value}"`;
    } else {
      tdValue.textContent = String(value);
    }

    tr.append(tdName, tdValue);
    table.appendChild(tr);
  }

  dom.detailContent.innerHTML = '';
  dom.detailContent.appendChild(table);
}

function renderBytesField(container, bytes) {
  const toggle = document.createElement('span');
  toggle.className = 'bytes-toggle';
  toggle.textContent = `[${bytes.length} bytes] show`;

  const hexDiv = document.createElement('div');
  hexDiv.className = 'bytes-hex';

  toggle.onclick = () => {
    const expanded = hexDiv.classList.toggle('expanded');
    toggle.textContent = `[${bytes.length} bytes] ${expanded ? 'hide' : 'show'}`;
    if (expanded && !hexDiv.hasChildNodes()) {
      hexDiv.textContent = formatHex(bytes);
    }
  };

  container.append(toggle, hexDiv);
}

function formatHex(bytes) {
  const lines = [];
  const limit = Math.min(bytes.length, 1024);
  for (let i = 0; i < limit; i += 16) {
    const chunk = bytes.subarray(i, Math.min(i + 16, limit));
    const offset = i.toString(16).padStart(6, '0');
    const hex = [...chunk].map(b => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = [...chunk].map(b => (b >= 0x20 && b <= 0x7e) ? String.fromCharCode(b) : '.').join('');
    lines.push(`${offset}  ${hex.padEnd(47)}  ${ascii}`);
  }
  if (bytes.length > limit) {
    lines.push(`... ${bytes.length - limit} more bytes`);
  }
  return lines.join('\n');
}

// --- Placeholder ---

function showPlaceholder(container, msg) {
  const div = document.createElement('div');
  div.className = 'placeholder';
  div.textContent = msg;
  container.innerHTML = '';
  container.appendChild(div);
}

// --- Resizable dividers ---

function initDivider(dividerEl, panelEl) {
  dividerEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panelEl.offsetWidth;
    dividerEl.classList.add('dragging');

    const onMouseMove = (e) => {
      const delta = e.clientX - startX;
      const newWidth = Math.max(140, Math.min(startWidth + delta, window.innerWidth * 0.4));
      panelEl.style.width = `${newWidth}px`;
    };

    const onMouseUp = () => {
      dividerEl.classList.remove('dragging');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

// --- Event handlers ---

dom.picker.onchange = (e) => {
  if (e.target.files[0]) loadFile(e.target.files[0]);
};

dom.drop.ondragover = (e) => {
  e.preventDefault();
  dom.drop.classList.add('over');
};

dom.drop.ondragleave = () => dom.drop.classList.remove('over');

dom.drop.ondrop = (e) => {
  e.preventDefault();
  dom.drop.classList.remove('over');
  if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
};

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

dom.listFilter.oninput = debounce(() => renderLists(dom.listFilter.value), 150);

dom.entrySearch.oninput = debounce(() => {
  if (selectedListIdx >= 0) {
    renderEntries(lists[selectedListIdx], dom.entrySearch.value);
  }
}, 150);

// --- Boot ---

initDivider(document.getElementById('divider1'), document.getElementById('lists-panel'));
initDivider(document.getElementById('divider2'), document.getElementById('entries-panel'));
