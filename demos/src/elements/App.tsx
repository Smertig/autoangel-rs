import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { ElementsData, ElementsDataList } from '../types/autoangel';
import { resolveCDN } from '../cdn';
import { initWasm } from '../wasm';
import { NavBar } from '@shared/components/NavBar';
import { DropZone } from '@shared/components/DropZone';
import { ErrorBanner } from '@shared/components/ErrorBanner';
import { SourceLink } from '@shared/components/SourceLink';
import { useDividerDrag } from '@shared/hooks/useDividerDrag';
import { ListPanel } from './components/ListPanel';
import { EntryPanel } from './components/EntryPanel';
import { DetailPanel } from './components/DetailPanel';
import { ConfigPanel, ConfigToggleButton } from './components/ConfigPanel';
import type { ListInfo } from './components/ListPanel';
import type { EntrySummary } from './components/EntryPanel';
import styles from './App.module.css';

const cdn = resolveCDN();

// ---- State ----

interface State {
  status: string;
  error: string | null;
  lists: ListInfo[];
  selectedList: number;
  selectedEntry: number;
  entrySummaries: EntrySummary[];
  compact: boolean;
  infoLists: string;
  infoVersion: string;
  infoEntries: string;
  configPanelOpen: boolean;
  configInfo: string;
  configError: string | null;
  hasCustomConfig: boolean;
  detailTitle: string;
  detailFields: Array<{ key: string; value: unknown }>;
  /** Bump to reset the list filter input. */
  listFilterResetKey: number;
  /** Bump to reset the entry search input. */
  entrySearchResetKey: number;
}

const DEFAULT_CONFIG_INFO =
  'No custom config applied. The viewer auto-detects a bundled config from the data file version.';

const initialState: State = {
  status: 'Loading WASM\u2026',
  error: null,
  lists: [],
  selectedList: -1,
  selectedEntry: -1,
  entrySummaries: [],
  compact: false,
  infoLists: '',
  infoVersion: '',
  infoEntries: '',
  configPanelOpen: false,
  configInfo: DEFAULT_CONFIG_INFO,
  configError: null,
  hasCustomConfig: false,
  detailTitle: 'Detail',
  detailFields: [],
  listFilterResetKey: 0,
  entrySearchResetKey: 0,
};

type Action =
  | { type: 'WASM_READY' }
  | { type: 'SET_STATUS'; status: string }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'PARSE_START' }
  | {
      type: 'PARSE_DONE';
      lists: ListInfo[];
      infoLists: string;
      infoVersion: string;
      infoEntries: string;
      label: string;
    }
  | { type: 'PARSE_ERROR'; error: string; label: string }
  | {
      type: 'SELECT_LIST';
      listIndex: number;
      entrySummaries: EntrySummary[];
      autoSelectEntry: number;
    }
  | {
      type: 'SELECT_ENTRY';
      entryIndex: number;
      detailTitle: string;
      detailFields: Array<{ key: string; value: unknown }>;
    }
  | { type: 'TOGGLE_CONFIG_PANEL' }
  | { type: 'CONFIG_APPLIED'; configInfo: string }
  | { type: 'CONFIG_ERROR'; configError: string }
  | { type: 'CONFIG_CLEARED' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'WASM_READY':
      return { ...state, status: 'Ready. Open an elements.data file.' };

    case 'SET_STATUS':
      return { ...state, status: action.status };

    case 'SET_ERROR':
      return { ...state, error: action.error };

    case 'PARSE_START':
      return {
        ...state,
        lists: [],
        selectedList: -1,
        selectedEntry: -1,
        entrySummaries: [],
        detailTitle: 'Detail',
        detailFields: [],
        compact: false,
        infoLists: '',
        infoVersion: '',
        infoEntries: '',
        error: null,
        listFilterResetKey: state.listFilterResetKey + 1,
        entrySearchResetKey: state.entrySearchResetKey + 1,
      };

    case 'PARSE_DONE':
      return {
        ...state,
        lists: action.lists,
        infoLists: action.infoLists,
        infoVersion: action.infoVersion,
        infoEntries: action.infoEntries,
        status: action.label,
        compact: true,
        selectedList: -1,
        selectedEntry: -1,
        entrySummaries: [],
        detailTitle: 'Detail',
        detailFields: [],
      };

    case 'PARSE_ERROR':
      return { ...state, error: action.error, status: action.label };

    case 'SELECT_LIST':
      return {
        ...state,
        selectedList: action.listIndex,
        selectedEntry: action.autoSelectEntry,
        entrySummaries: action.entrySummaries,
        detailTitle: 'Detail',
        detailFields: [],
        entrySearchResetKey: state.entrySearchResetKey + 1,
      };

    case 'SELECT_ENTRY':
      return {
        ...state,
        selectedEntry: action.entryIndex,
        detailTitle: action.detailTitle,
        detailFields: action.detailFields,
      };

    case 'TOGGLE_CONFIG_PANEL':
      return { ...state, configPanelOpen: !state.configPanelOpen };

    case 'CONFIG_APPLIED':
      return {
        ...state,
        configInfo: action.configInfo,
        configError: null,
        hasCustomConfig: true,
      };

    case 'CONFIG_ERROR':
      return { ...state, configError: action.configError };

    case 'CONFIG_CLEARED':
      return {
        ...state,
        configInfo: DEFAULT_CONFIG_INFO,
        configError: null,
        hasCustomConfig: false,
      };

    default:
      return state;
  }
}

// ---- App ----

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState);

  // WASM objects held outside React state (mutable, need .free() — must NOT go into state)
  const dataRef = useRef<ElementsData | null>(null);
  const listsRef = useRef<ElementsDataList[]>([]);
  const lastFileBytesRef = useRef<Uint8Array | null>(null);
  const lastFileNameRef = useRef<string>('');
  const lastEntryPerList = useRef<Map<number, number>>(new Map());
  const customConfigTextRef = useRef<string | null>(null);
  const wasmRef = useRef<Awaited<ReturnType<typeof initWasm>> | null>(null);

  // Panel / divider refs for the resizable layout
  const listsPanelRef = useRef<HTMLElement | null>(null);
  const entriesPanelRef = useRef<HTMLElement | null>(null);
  const divider1Ref = useRef<HTMLDivElement | null>(null);
  const divider2Ref = useRef<HTMLDivElement | null>(null);

  useDividerDrag(divider1Ref, listsPanelRef, { min: 140 });
  useDividerDrag(divider2Ref, entriesPanelRef, { min: 140 });

  // Init WASM on mount
  useEffect(() => {
    initWasm(cdn).then(mod => {
      wasmRef.current = mod;
      dispatch({ type: 'WASM_READY' });
    });
  }, []);

  // ---- Core helpers ----

  const freeAll = useCallback(() => {
    for (const list of listsRef.current) list.free();
    listsRef.current = [];
    if (dataRef.current) {
      dataRef.current.free();
      dataRef.current = null;
    }
    lastEntryPerList.current.clear();
  }, []);

  // selectEntry ref breaks the selectList -> selectEntry cycle
  const selectEntryRef = useRef<(listIndex: number, entryIndex: number) => Promise<void>>(
    async () => { /* placeholder until first render */ }
  );

  const selectEntry = useCallback(async (listIndex: number, entryIndex: number) => {
    const listObj = listsRef.current[listIndex];
    if (!listObj) return;

    const entry = await listObj.getEntry(entryIndex);
    const keys = entry.keys();
    const fields: Array<{ key: string; value: unknown }> = [];
    for (const key of keys) {
      const value = await entry.getField(key);
      fields.push({ key, value });
    }
    entry.free();

    lastEntryPerList.current.set(listIndex, entryIndex);

    dispatch({
      type: 'SELECT_ENTRY',
      entryIndex,
      detailTitle: `Entry #${entryIndex}`,
      detailFields: fields,
    });
  }, []);

  selectEntryRef.current = selectEntry;

  const parseAndDisplay = useCallback(async (bytes: Uint8Array, label: string) => {
    const wasm = wasmRef.current;
    if (!wasm) return;

    dispatch({ type: 'PARSE_START' });
    freeAll();

    let data: ElementsData;
    try {
      const config = customConfigTextRef.current
        ? wasm.ElementsConfig.parse(customConfigTextRef.current, 'pw')
        : undefined;
      data = await wasm.ElementsData.parse(bytes, config);
    } catch (e) {
      dispatch({
        type: 'PARSE_ERROR',
        error: (e as Error).message || String(e),
        label,
      });
      return;
    }

    dataRef.current = data;

    const listInfos: ListInfo[] = [];
    let totalEntries = 0;
    for (let i = 0; i < data.listCount; i++) {
      const list = data.getList(i);
      listsRef.current.push(list);
      listInfos.push({ index: i, caption: list.caption, entryCount: list.entryCount });
      totalEntries += list.entryCount;
    }

    dispatch({
      type: 'PARSE_DONE',
      lists: listInfos,
      infoLists: `${listInfos.length} lists`,
      infoVersion: `v${data.version}`,
      infoEntries: `${totalEntries} total entries`,
      label,
    });
  }, [freeAll]);

  // ---- File loading ----

  const loadFile = useCallback(async (file: File) => {
    dispatch({
      type: 'SET_STATUS',
      status: `Parsing ${file.name} (${(file.size / 1e6).toFixed(1)} MB)\u2026`,
    });
    lastFileNameRef.current = file.name;
    const bytes = new Uint8Array(await file.arrayBuffer());
    lastFileBytesRef.current = bytes;
    await parseAndDisplay(bytes, file.name);
  }, [parseAndDisplay]);

  const handleFiles = useCallback((files: File[]) => {
    if (files[0]) loadFile(files[0]);
  }, [loadFile]);

  // ---- List selection ----

  const selectList = useCallback(async (listIndex: number) => {
    const listObj = listsRef.current[listIndex];
    if (!listObj) return;

    // Cache entry ID/Name summaries upfront for search (matches original cacheEntrySummaries)
    const fieldNames = listObj.fieldNames();
    const hasId = fieldNames.includes('ID');
    const hasName = fieldNames.includes('Name');
    const summaries: EntrySummary[] = [];

    for (let i = 0; i < listObj.entryCount; i++) {
      const entry = await listObj.getEntry(i);
      const id = hasId ? String(await entry.getField('ID')) : String(i);
      const name = hasName ? String(await entry.getField('Name') ?? '') : '';
      entry.free();
      summaries.push({ index: i, id, name });
    }

    const restoreIdx = lastEntryPerList.current.get(listIndex) ?? 0;
    const autoSelectEntry = summaries.some(s => s.index === restoreIdx)
      ? restoreIdx
      : (summaries[0]?.index ?? -1);

    dispatch({ type: 'SELECT_LIST', listIndex, entrySummaries: summaries, autoSelectEntry });

    if (autoSelectEntry >= 0) {
      await selectEntryRef.current(listIndex, autoSelectEntry);
    }
  }, []);

  // ---- Entry selection ----

  const handleEntrySelect = useCallback((entryIndex: number) => {
    selectEntry(state.selectedList, entryIndex);
  }, [selectEntry, state.selectedList]);

  // ---- Config ----

  const applyConfig = useCallback((text: string) => {
    const wasm = wasmRef.current;
    if (!wasm) return;

    if (!text.trim()) {
      dispatch({ type: 'CONFIG_ERROR', configError: 'Config text is empty.' });
      return;
    }

    let config;
    try {
      config = wasm.ElementsConfig.parse(text, 'pw');
    } catch (e) {
      dispatch({ type: 'CONFIG_ERROR', configError: (e as Error).message || String(e) });
      return;
    }

    const name = config.name ?? 'unnamed';
    const listCount = config.listCount;
    config.free();

    customConfigTextRef.current = text;
    dispatch({
      type: 'CONFIG_APPLIED',
      configInfo: `Custom config: "${name}" (${listCount} lists)`,
    });

    if (lastFileBytesRef.current) {
      parseAndDisplay(lastFileBytesRef.current, lastFileNameRef.current);
    }
  }, [parseAndDisplay]);

  const clearConfig = useCallback(() => {
    customConfigTextRef.current = null;
    dispatch({ type: 'CONFIG_CLEARED' });
    if (lastFileBytesRef.current) {
      parseAndDisplay(lastFileBytesRef.current, lastFileNameRef.current);
    }
  }, [parseAndDisplay]);

  const loadConfigFile = useCallback(async (file: File) => {
    const text = await file.text();
    applyConfig(text);
  }, [applyConfig]);

  // ---- Render ----

  const showExplorer = state.lists.length > 0;

  return (
    <div className={styles.app}>
      <NavBar active="elements" />
      <header className={styles.header}>
        <DropZone
          accept=".data"
          label={<>Drop an <code>elements.data</code> file here, or</>}
          compact={state.compact}
          onFiles={handleFiles}
        />
        <span className={styles.status}>{state.status}</span>
        <ConfigToggleButton
          open={state.configPanelOpen}
          hasCustomConfig={state.hasCustomConfig}
          onClick={() => dispatch({ type: 'TOGGLE_CONFIG_PANEL' })}
        />
        <SourceLink
          href="https://github.com/Smertig/autoangel-rs/tree/master/demos/elements"
          className={styles.sourceLink}
        />
      </header>

      <ErrorBanner
        message={state.error}
        onDismiss={() => dispatch({ type: 'SET_ERROR', error: null })}
      />

      <ConfigPanel
        open={state.configPanelOpen}
        configInfo={state.configInfo}
        configError={state.configError}
        hasCustomConfig={state.hasCustomConfig}
        onApply={applyConfig}
        onClear={clearConfig}
        onLoadFile={loadConfigFile}
      />

      {showExplorer && (
        <main className={styles.explorer}>
          <aside className={styles.listsPanel} ref={listsPanelRef}>
            <ListPanel
              lists={state.lists}
              selectedIndex={state.selectedList}
              onSelect={selectList}
              resetKey={state.listFilterResetKey}
            />
          </aside>
          <div className={styles.divider} ref={divider1Ref} />
          <section className={styles.entriesPanel} ref={entriesPanelRef}>
            <EntryPanel
              entries={state.entrySummaries}
              selectedIndex={state.selectedEntry}
              title={
                state.selectedList >= 0
                  ? `${state.lists[state.selectedList]?.caption ?? ''} (${state.entrySummaries.length})`
                  : 'Entries'
              }
              onSelect={handleEntrySelect}
              resetKey={state.entrySearchResetKey}
            />
          </section>
          <div className={styles.divider} ref={divider2Ref} />
          <section className={styles.detailPanel}>
            <DetailPanel
              title={state.detailTitle}
              fields={state.detailFields}
            />
          </section>
        </main>
      )}

      {showExplorer && (
        <footer className={styles.statusBar}>
          <span>{state.infoLists}</span>
          <span>{state.infoVersion}</span>
          <span>{state.infoEntries}</span>
        </footer>
      )}
    </div>
  );
}
