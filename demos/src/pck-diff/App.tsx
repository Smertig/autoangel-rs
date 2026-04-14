import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import { resolveCDN } from '../cdn';
import { initWasm } from '../wasm';
import type { AutoangelModule } from '@shared/../types/autoangel';
import { useWorker } from '@shared/hooks/useWorker';
import { useDividerDrag } from '@shared/hooks/useDividerDrag';
import { useWorkerInit } from '@shared/hooks/useWorkerInit';
import { NavBar } from '@shared/components/NavBar';
import { ErrorBanner } from '@shared/components/ErrorBanner';
import { classifyFiles, formatSize } from '@shared/util/files';
import { bytesEqual } from '@shared/util/bytes';
import type { KeyConfig } from '@shared/components/KeysPanel';
import type { EntryInfo } from '../pck/worker-protocol';
import {
  DiffStatus,
  DiffStatusValue,
  SideState,
} from './types';
import { DiffEngine } from './diff-engine';
import {
  DiffTreeNode,
  buildDiffTree,
  DiffTree,
  STATUS_PREFIX,
} from './components/DiffTree';
import { ChooserPanel } from './components/ChooserPanel';
import { ProgressPanel } from './components/ProgressPanel';
import { DiffPreview, ContentHeader } from './components/DiffPreview';
import styles from './App.module.css';

const CDN = resolveCDN();
const SCAN_DELAY = Number(new URLSearchParams(location.search).get('scanDelay')) || 0;

class ScanCancelled extends Error {
  constructor() { super('ScanCancelled'); }
}

// --- Phase ---

type Phase = 'chooser' | 'comparing' | 'results';

// --- State types ---

interface SideScanProgress {
  scanned: number;
  total: number;
  done: boolean;
  label: string;
}

interface DiffState {
  phase: Phase;
  left: SideState;
  right: SideState;
  selectedPath: string | null;
  filterText: string;
  activeFilters: Set<DiffStatusValue>;
  error: string | null;
  leftProgress: SideScanProgress;
  rightProgress: SideScanProgress;
  verifyTotal: number;
  verifyDone: number;
  // Tree is rebuilt by diff engine callback (via diffTreeRef)
  treeVersion: number;
  statusVersion: number;
}

type DiffAction =
  | { type: 'SET_SIDE_LOADED'; side: 'left' | 'right'; fileName: string; files: string[] }
  | { type: 'SET_ERROR'; message: string | null }
  | { type: 'START_COMPARE' }
  | { type: 'SHOW_RESULTS' }
  | { type: 'NEW_COMPARE' }
  | { type: 'SELECT_FILE'; path: string | null }
  | { type: 'SET_FILTER'; text: string }
  | { type: 'TOGGLE_FILTER'; status: DiffStatusValue }
  | { type: 'SET_LEFT_PROGRESS'; progress: SideScanProgress }
  | { type: 'SET_RIGHT_PROGRESS'; progress: SideScanProgress }
  | { type: 'SET_VERIFY_PROGRESS'; total: number; done: number }
  | { type: 'TREE_UPDATE' }
  | { type: 'STATUS_UPDATE' }
  | { type: 'SWAP' };

const initialSideState: SideState = { loaded: false, fileName: null, files: null };
const initialScanProgress: SideScanProgress = {
  scanned: 0,
  total: 0,
  done: false,
  label: '',
};

function diffReducer(state: DiffState, action: DiffAction): DiffState {
  switch (action.type) {
    case 'SET_SIDE_LOADED': {
      const side = action.side === 'left' ? 'left' : 'right';
      return {
        ...state,
        [side]: { loaded: true, fileName: action.fileName, files: action.files },
      };
    }
    case 'SET_ERROR':
      return { ...state, error: action.message };
    case 'START_COMPARE':
      return {
        ...state,
        phase: 'comparing',
        leftProgress: { ...initialScanProgress, label: 'Hashing left...' },
        rightProgress: { ...initialScanProgress, label: 'Hashing right...' },
        verifyTotal: 0,
        verifyDone: 0,
      };
    case 'SHOW_RESULTS':
      return { ...state, phase: 'results' };
    case 'NEW_COMPARE':
      return {
        ...state,
        phase: 'chooser',
        left: initialSideState,
        right: initialSideState,
        selectedPath: null,
        filterText: '',
        activeFilters: new Set(),
        error: null,
        leftProgress: initialScanProgress,
        rightProgress: initialScanProgress,
        verifyTotal: 0,
        verifyDone: 0,
        treeVersion: 0,
        statusVersion: 0,
      };
    case 'SELECT_FILE':
      return { ...state, selectedPath: action.path };
    case 'SET_FILTER':
      return { ...state, filterText: action.text };
    case 'TOGGLE_FILTER': {
      const next = new Set(state.activeFilters);
      if (next.has(action.status)) next.delete(action.status);
      else next.add(action.status);
      return { ...state, activeFilters: next };
    }
    case 'SET_LEFT_PROGRESS':
      return { ...state, leftProgress: action.progress };
    case 'SET_RIGHT_PROGRESS':
      return { ...state, rightProgress: action.progress };
    case 'SET_VERIFY_PROGRESS':
      return { ...state, verifyTotal: action.total, verifyDone: action.done };
    case 'TREE_UPDATE':
      return { ...state, treeVersion: state.treeVersion + 1 };
    case 'STATUS_UPDATE':
      return { ...state, statusVersion: state.statusVersion + 1 };
    case 'SWAP': {
      const { left, right } = state;
      return {
        ...state,
        left: right,
        right: left,
        selectedPath: null,
        treeVersion: state.treeVersion + 1,
        statusVersion: state.statusVersion + 1,
      };
    }
    default:
      return state;
  }
}

const initialState: DiffState = {
  phase: 'chooser',
  left: initialSideState,
  right: initialSideState,
  selectedPath: null,
  filterText: '',
  activeFilters: new Set(),
  error: null,
  leftProgress: initialScanProgress,
  rightProgress: initialScanProgress,
  verifyTotal: 0,
  verifyDone: 0,
  treeVersion: 0,
  statusVersion: 0,
};

// --- Worker creation factories ---

function createWorker() {
  return new Worker(new URL('../pck/pck-worker.ts', import.meta.url), { type: 'module' });
}

// --- App ---

export function App() {
  const [state, dispatch] = useReducer(diffReducer, initialState);
  const [wasm, setWasm] = useState<AutoangelModule | null>(null);

  // Per-side keys
  const [leftKeys, setLeftKeys] = useState<KeyConfig | null>(null);
  const [rightKeys, setRightKeys] = useState<KeyConfig | null>(null);

  // Diff engine (mutable, not React state)
  const engineRef = useRef(new DiffEngine());

  // Diff tree ref (rebuilt when engine updates)
  const diffTreeRef = useRef<DiffTreeNode | null>(null);

  // Comparison active flag
  const comparisonActiveRef = useRef(false);

  // Tree container ref for priority-aware scanning
  const treeContainerRef = useRef<HTMLDivElement>(null);

  // Resizable sidebar refs
  const sidebarRef = useRef<HTMLElement | null>(null);
  const diffDividerRef = useRef<HTMLDivElement | null>(null);
  useDividerDrag(diffDividerRef, sidebarRef, { min: 180 });

  // Throttle tree rebuilds
  const treeUpdateTimerRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const treeRebuildTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const treePointerDownRef = useRef(false);

  // Workers: 2 main (getFile) + 2 scanners
  const leftWorker = useWorker(createWorker);
  const rightWorker = useWorker(createWorker);
  const leftScanner = useWorker(createWorker);
  const rightScanner = useWorker(createWorker);

  // Store worker side states for swap
  const workerSidesRef = useRef({
    left: { worker: leftWorker, files: null as string[] | null, pckFile: null as File | null, pkxFiles: [] as File[], customKeys: null as KeyConfig | null },
    right: { worker: rightWorker, files: null as string[] | null, pckFile: null as File | null, pkxFiles: [] as File[], customKeys: null as KeyConfig | null },
  });
  const scannerSidesRef = useRef({
    left: leftScanner,
    right: rightScanner,
  });

  // Init WASM
  useEffect(() => {
    initWasm(CDN).then(setWasm).catch((e) => {
      dispatch({ type: 'SET_ERROR', message: `Failed to load WASM: ${e.message}` });
    });
  }, []);

  // Init workers via useWorkerInit custom hook
  useWorkerInit(leftWorker, CDN);
  useWorkerInit(rightWorker, CDN);
  useWorkerInit(leftScanner, CDN);
  useWorkerInit(rightScanner, CDN);

  // Engine callbacks
  useEffect(() => {
    const engine = engineRef.current;

    engine.onStatusChange = () => {
      scheduleStatusUpdate();
      scheduleTreeRebuild();
    };

    engine.onVerifyProgress = () => {
      dispatch({
        type: 'SET_VERIFY_PROGRESS',
        total: engine.verifyTotal,
        done: engine.verifyDone,
      });
    };

    return () => {
      engine.onStatusChange = undefined;
      engine.onVerifyProgress = undefined;
    };
  }, []);

  // Unmount cleanup: cancel pending timers
  useEffect(() => {
    return () => {
      if (treeUpdateTimerRef.current !== null) {
        cancelAnimationFrame(treeUpdateTimerRef.current);
        treeUpdateTimerRef.current = null;
      }
      if (treeRebuildTimerRef.current !== null) {
        clearTimeout(treeRebuildTimerRef.current);
        treeRebuildTimerRef.current = null;
      }
    };
  }, []);

  // Tree pointer-down suppression
  useEffect(() => {
    const handlePointerUp = () => {
      if (treePointerDownRef.current) {
        treePointerDownRef.current = false;
        if (treeRebuildTimerRef.current === null) {
          doTreeRebuild();
        }
      }
    };
    document.addEventListener('pointerup', handlePointerUp);
    return () => document.removeEventListener('pointerup', handlePointerUp);
  }, []);

  // Helper: schedule a status counter update (fast, no DOM mutation)
  function scheduleStatusUpdate() {
    if (!treeUpdateTimerRef.current) {
      treeUpdateTimerRef.current = requestAnimationFrame(() => {
        treeUpdateTimerRef.current = null;
        dispatch({ type: 'STATUS_UPDATE' });
      });
    }
  }

  function doTreeRebuild() {
    diffTreeRef.current = buildDiffTree(engineRef.current.fileStatus);
    dispatch({ type: 'TREE_UPDATE' });
  }

  function scheduleTreeRebuild() {
    if (!treeRebuildTimerRef.current) {
      treeRebuildTimerRef.current = setTimeout(() => {
        treeRebuildTimerRef.current = null;
        if (treePointerDownRef.current) {
          // Mark as deferred
          treeRebuildTimerRef.current = null;
          return;
        }
        doTreeRebuild();
      }, 500);
    }
  }

  // --- Load package ---

  async function loadPackage(side: 'left' | 'right', files: File[]) {
    const { pck: pckFile, pkxFiles } = classifyFiles(files);
    if (!pckFile) {
      dispatch({ type: 'SET_ERROR', message: 'No .pck file found.' });
      return;
    }

    const customKeys = side === 'left' ? leftKeys : rightKeys;
    const label = pkxFiles.length > 0
      ? `${pckFile.name} + ${pkxFiles.map(f => f.name).join(' + ')}`
      : pckFile.name;

    dispatch({ type: 'SET_ERROR', message: null });

    const worker = side === 'left' ? leftWorker : rightWorker;

    try {
      const result: { fileList: string[] } = await worker.call(
        { type: 'parseFile', pckFile, pkxFiles, keys: customKeys ?? undefined },
        undefined,
        {
          onProgress: (_data: any) => {
            // progress available via inline progress component in chooser
          },
        },
      );

      workerSidesRef.current[side].pckFile = pckFile;
      workerSidesRef.current[side].pkxFiles = pkxFiles;
      workerSidesRef.current[side].customKeys = customKeys;
      workerSidesRef.current[side].files = result.fileList;

      const totalSize = pckFile.size + pkxFiles.reduce((s, f) => s + f.size, 0);
      dispatch({
        type: 'SET_SIDE_LOADED',
        side,
        fileName: `${label} (${formatSize(totalSize)})`,
        files: result.fileList,
      });
    } catch (e: unknown) {
      dispatch({ type: 'SET_ERROR', message: e instanceof Error ? e.message : String(e) });
    }
  }

  // --- Get file data ---

  async function getFileData(side: 'left' | 'right', path: string): Promise<Uint8Array> {
    // Use workerSidesRef so that post-swap calls use the swapped worker
    const worker = workerSidesRef.current[side].worker;
    const result: { data: ArrayBuffer; byteOffset: number; byteLength: number } =
      await worker.call({ type: 'getFile', path });
    return new Uint8Array(result.data, result.byteOffset, result.byteLength);
  }

  // --- Verify queue processing ---

  const processVerifyQueue = useCallback(async () => {
    const engine = engineRef.current;
    while (comparisonActiveRef.current) {
      const path = engine.getVerifyNext();
      if (!path) break;

      // Skip if already resolved
      if (engine.fileStatus.get(path) !== DiffStatus.PENDING) {
        engine.resolveVerification(path, true);
        processVerifyQueue();
        return;
      }

      try {
        const [leftData, rightData] = await Promise.all([
          getFileData('left', path),
          getFileData('right', path),
        ]);
        const match = bytesEqual(leftData, rightData);
        if (comparisonActiveRef.current) {
          engine.resolveVerification(path, match);
          processVerifyQueue();
        }
      } catch {
        if (comparisonActiveRef.current) {
          engine.resolveVerification(path, false);
          processVerifyQueue();
        }
      }
      return;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Wire verify-needed callback
  useEffect(() => {
    engineRef.current.onVerifyNeeded = () => {
      processVerifyQueue();
    };
  }, [processVerifyQueue]);

  // --- Get visible pending paths (for priority scheduling) ---
  // Returns paths whose tree items are currently visible in the DOM
  // (i.e., their parent tree-children container has the 'expanded' CSS class).

  function getVisiblePendingPaths(): string[] {
    const paths: string[] = [];
    const tree = treeContainerRef.current;
    if (!tree) return paths;
    for (const el of tree.querySelectorAll<HTMLElement>('[data-path][data-status="pending"]')) {
      // offsetParent is null when element or ancestor has display:none
      if (el.offsetParent !== null || el.offsetWidth > 0) {
        paths.push(el.dataset.path!);
      }
    }
    return paths;
  }

  // --- Scan loop ---

  async function runScanLoop(side: 'left' | 'right') {
    const engine = engineRef.current;
    const scanner = side === 'left' ? leftScanner : rightScanner;
    const scanned = side === 'left' ? engine.scannedLeft : engine.scannedRight;
    const total = engine.sharedPaths.length;

    while (comparisonActiveRef.current) {
      const batchSize = SCAN_DELAY ? 10 : 1000;
      const batch = engine.collectBatch(side, getVisiblePendingPaths, batchSize);
      if (batch.length === 0) break;

      if (SCAN_DELAY) await new Promise(r => setTimeout(r, SCAN_DELAY));

      const currentBatchSet = new Set(batch);

      try {
        await scanner.call(
          { type: 'scanEntries', paths: batch },
          undefined,
          {
            onChunk: (data: { entries: EntryInfo[] }) => {
              if (!comparisonActiveRef.current) throw new ScanCancelled();

              engine.onHashChunk(side, data.entries);
              for (const e of data.entries) scanned.add(e.path);

              const pct = Math.round((scanned.size / total) * 100);
              const label = `Hashing ${side}: ${scanned.size} / ${total}`;
              if (side === 'left') {
                dispatch({ type: 'SET_LEFT_PROGRESS', progress: { scanned: scanned.size, total, done: false, label } });
              } else {
                dispatch({ type: 'SET_RIGHT_PROGRESS', progress: { scanned: scanned.size, total, done: false, label } });
              }

              // Cancel to reprioritize
              for (const p of getVisiblePendingPaths()) {
                if (!currentBatchSet.has(p) && !scanned.has(p)) {
                  throw new ScanCancelled();
                }
              }
            },
          },
        );
      } catch (e) {
        if (e instanceof ScanCancelled) continue;
        if (comparisonActiveRef.current) continue;
        return;
      }
    }

    if (comparisonActiveRef.current) {
      const label = `Done (${total} shared files)`;
      if (side === 'left') {
        dispatch({ type: 'SET_LEFT_PROGRESS', progress: { scanned: total, total, done: true, label } });
      } else {
        dispatch({ type: 'SET_RIGHT_PROGRESS', progress: { scanned: total, total, done: true, label } });
      }
    }
  }

  // --- Start comparison ---

  async function startComparison() {
    const leftFiles = workerSidesRef.current.left.files;
    const rightFiles = workerSidesRef.current.right.files;
    if (!leftFiles || !rightFiles) return;

    dispatch({ type: 'SET_ERROR', message: null });
    dispatch({ type: 'START_COMPARE' });
    comparisonActiveRef.current = true;

    const engine = engineRef.current;
    engine.initFileStatus(leftFiles, rightFiles);

    // Build initial tree
    diffTreeRef.current = buildDiffTree(engine.fileStatus);

    dispatch({ type: 'SHOW_RESULTS' });

    // Open packages on scanner workers
    const leftSide = workerSidesRef.current.left;
    const rightSide = workerSidesRef.current.right;

    try {
      await Promise.all([
        leftScanner.call({
          type: 'parseFile',
          pckFile: leftSide.pckFile,
          pkxFiles: leftSide.pkxFiles,
          keys: leftSide.customKeys ?? undefined,
        }),
        rightScanner.call({
          type: 'parseFile',
          pckFile: rightSide.pckFile,
          pkxFiles: rightSide.pkxFiles,
          keys: rightSide.customKeys ?? undefined,
        }),
      ]);

      await Promise.all([runScanLoop('left'), runScanLoop('right')]);
    } catch (e: unknown) {
      if (comparisonActiveRef.current) {
        dispatch({ type: 'SET_ERROR', message: e instanceof Error ? e.message : String(e) });
      }
    }

    scheduleStatusUpdate();
  }

  // --- New compare ---

  function handleNewCompare() {
    comparisonActiveRef.current = false;
    if (treeRebuildTimerRef.current) {
      clearTimeout(treeRebuildTimerRef.current);
      treeRebuildTimerRef.current = null;
    }
    diffTreeRef.current = null;
    workerSidesRef.current.left.files = null;
    workerSidesRef.current.right.files = null;
    dispatch({ type: 'NEW_COMPARE' });
  }

  // --- Swap ---

  function handleSwap() {
    comparisonActiveRef.current = false;

    // Swap worker refs
    const tmp = workerSidesRef.current.left;
    workerSidesRef.current.left = workerSidesRef.current.right;
    workerSidesRef.current.right = tmp;

    // Swap scanner refs
    const tmpScanner = scannerSidesRef.current.left;
    scannerSidesRef.current.left = scannerSidesRef.current.right;
    scannerSidesRef.current.right = tmpScanner;

    // Swap engine state
    engineRef.current.swap();

    // Rebuild tree
    diffTreeRef.current = buildDiffTree(engineRef.current.fileStatus);

    dispatch({ type: 'SWAP' });
  }

  // --- Keyboard shortcuts ---

  useEffect(() => {
    if (state.phase !== 'results') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.matches('input, select, textarea');

      if (isInput) {
        if (e.key === 'Escape') {
          target.blur();
          e.preventDefault();
        }
        return;
      }

      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowDown': {
          e.preventDefault();
          const dir = e.key === 'ArrowDown' ? 1 : -1;
          navigateTree(dir, false);
          break;
        }
        case 'n':
          navigateTree(1, true);
          break;
        case 'p':
          navigateTree(-1, true);
          break;
        case 'u':
          toggleDiffView();
          break;
        case '/':
          e.preventDefault();
          document.getElementById('diff-filter-input')?.focus();
          break;
        case 'Escape':
          if (state.filterText) {
            dispatch({ type: 'SET_FILTER', text: '' });
          } else {
            handleNewCompare();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state.phase, state.filterText]); // eslint-disable-line react-hooks/exhaustive-deps

  function navigateTree(direction: number, skipUnchanged: boolean) {
    const tree = treeContainerRef.current;
    if (!tree) return;
    const items = [...tree.querySelectorAll<HTMLElement>('[data-path]')];
    if (items.length === 0) return;

    let currentIdx = items.findIndex(el => el.dataset.path === state.selectedPath);
    let nextIdx = currentIdx;

    do {
      nextIdx += direction;
      if (nextIdx < 0 || nextIdx >= items.length) return;
    } while (skipUnchanged && items[nextIdx].dataset.status === DiffStatus.UNCHANGED);

    const path = items[nextIdx].dataset.path!;
    dispatch({ type: 'SELECT_FILE', path });
    items[nextIdx].scrollIntoView({ block: 'nearest' });
  }

  function toggleDiffView() {
    const toggle = document.querySelector('[data-diff-toggle]');
    if (!toggle) return;
    const buttons = toggle.querySelectorAll<HTMLButtonElement>('button');
    const activeIdx = [...buttons].findIndex(b => b.dataset.active === 'true');
    const nextIdx = activeIdx === 0 ? 1 : 0;
    buttons[nextIdx]?.click();
  }

  // --- Render ---

  const { phase, left, right, selectedPath, filterText, activeFilters, error } = state;
  const deferredFilter = useDeferredValue(filterText);
  const isFiltering = filterText !== deferredFilter;
  const engine = engineRef.current;
  const counts = engine.statusCounts;

  const getFileStatus = useCallback(
    (path: string) => engineRef.current.fileStatus.get(path),
    [state.statusVersion], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const getLeftData = useCallback((path: string) => getFileData('left', path), []); // eslint-disable-line react-hooks/exhaustive-deps
  const getRightData = useCallback((path: string) => getFileData('right', path), []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResolveStatus = useCallback((path: string, resolved: DiffStatusValue) => {
    engineRef.current.setFileStatus(path, resolved);
    scheduleStatusUpdate();
    scheduleTreeRebuild();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Status bar text
  const changedCount = counts.added + counts.deleted + counts.modified;
  const pendingInfo = counts.pending > 0 ? ` · ${counts.pending} pending` : '';
  const statusText = phase === 'results'
    ? `${changedCount} files changed${pendingInfo} · ${left.fileName ?? 'Left'}: ${workerSidesRef.current.left.files?.length ?? 0} files · ${right.fileName ?? 'Right'}: ${workerSidesRef.current.right.files?.length ?? 0} files`
    : 'Ready. Drop packages to compare.';

  const selectedStatus = selectedPath
    ? (engine.fileStatus.get(selectedPath) ?? DiffStatus.PENDING)
    : DiffStatus.PENDING;

  return (
    <div className={styles.appRoot}>
      <NavBar active="pck-diff" />
      {/* Chooser / comparing header */}
      {(phase === 'chooser' || phase === 'comparing') && (
        <ChooserPanel
          left={left}
          right={right}
          onLoadFiles={loadPackage}
          onCompare={startComparison}
          compareEnabled={left.loaded && right.loaded}
          dimmed={phase === 'comparing'}
          leftKeys={leftKeys}
          rightKeys={rightKeys}
          onLeftKeysChange={setLeftKeys}
          onRightKeysChange={setRightKeys}
        />
      )}

      {/* Error banner */}
      <ErrorBanner message={error} onDismiss={() => dispatch({ type: 'SET_ERROR', message: null })} />

      {/* Progress: full-screen while comparing, inline while results */}
      {(phase === 'comparing' || phase === 'results') && (
        <ProgressPanel
          leftProgress={state.leftProgress.done ? 100 : state.leftProgress.total > 0 ? Math.round(state.leftProgress.scanned / state.leftProgress.total * 100) : 0}
          rightProgress={state.rightProgress.done ? 100 : state.rightProgress.total > 0 ? Math.round(state.rightProgress.scanned / state.rightProgress.total * 100) : 0}
          leftDone={state.leftProgress.done}
          rightDone={state.rightProgress.done}
          verifyProgress={state.verifyTotal > 0 ? Math.round(state.verifyDone / state.verifyTotal * 100) : 0}
          verifyTotal={state.verifyTotal}
          verifyDone={state.verifyDone}
          leftLabel={state.leftProgress.label || 'Hashing left...'}
          rightLabel={state.rightProgress.label || 'Hashing right...'}
          inline={phase === 'results'}
        />
      )}

      {/* Results view */}
      {phase === 'results' && (
        <main className={styles.results}>
          {/* Summary bar */}
          <div className={styles.summaryBar}>
            <div className={styles.summaryNames}>
              <span>{left.fileName ?? 'Left'}</span>
              <span className={styles.summaryArrow}>&harr;</span>
              <span>{right.fileName ?? 'Right'}</span>
            </div>
            <div className={styles.summaryStats}>
              {([DiffStatus.ADDED, DiffStatus.DELETED, DiffStatus.MODIFIED, DiffStatus.UNCHANGED, DiffStatus.PENDING] as DiffStatusValue[]).map(s => {
                const count = counts[s];
                if (s === DiffStatus.PENDING && count === 0) return null;
                const isActive = activeFilters.has(s);
                const badgeClass = [
                  styles.statBadge,
                  styles[`statBadge_${s}`] ?? '',
                  isActive ? styles.statBadgeActive : '',
                ].filter(Boolean).join(' ');
                return (
                  <button
                    key={s}
                    className={badgeClass}
                    onClick={() => dispatch({ type: 'TOGGLE_FILTER', status: s })}
                  >
                    {STATUS_PREFIX[s]}{count} {s}
                  </button>
                );
              })}
            </div>
            <div className={styles.summaryActions}>
              <button className={`${styles.btn} ${styles.btnSmall}`} onClick={handleSwap} title="Swap left and right">
                &#8644; Swap
              </button>
              <button className={`${styles.btn} ${styles.btnSmall}`} onClick={handleNewCompare}>
                New Compare
              </button>
            </div>
          </div>

          {/* Results body */}
          <div className={styles.resultsBody}>
            {/* Sidebar */}
            <aside
              ref={sidebarRef}
              className={styles.sidebar}
              onPointerDown={() => { treePointerDownRef.current = true; }}
            >
              <div className={styles.sidebarControls} data-filtering={isFiltering || undefined}>
                <input
                  id="diff-filter-input"
                  type="text"
                  className={styles.filterInput}
                  placeholder="Filter files..."
                  value={filterText}
                  onChange={(e) => dispatch({ type: 'SET_FILTER', text: e.target.value })}
                />
              </div>
              <div ref={treeContainerRef} className={styles.tree}>
                <DiffTree
                  root={diffTreeRef.current}
                  selectedPath={selectedPath}
                  filterText={filterText}
                  activeFilters={activeFilters}
                  getFileStatus={getFileStatus}
                  onSelectFile={(path) => dispatch({ type: 'SELECT_FILE', path })}
                />
              </div>
            </aside>

            {/* Divider */}
            <div ref={diffDividerRef} className={styles.divider} />

            {/* Content */}
            <section className={styles.content}>
              <ContentHeader
                path={selectedPath}
                status={selectedStatus}
              />
              <div className={styles.previewArea}>
                {wasm && (
                  <DiffPreview
                    path={selectedPath}
                    status={selectedStatus}
                    getLeftData={getLeftData}
                    getRightData={getRightData}
                    wasm={wasm}
                    onResolveStatus={handleResolveStatus}
                  />
                )}
              </div>
            </section>
          </div>
        </main>
      )}

      {/* Status bar */}
      {phase !== 'chooser' && (
        <footer className={styles.statusBar}>
          <span>{statusText}</span>
        </footer>
      )}
    </div>
  );
}

