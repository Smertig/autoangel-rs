import { Suspense, lazy, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { resolveCDN } from '../cdn';
import { initWasm } from '../wasm';
import type { AutoangelModule } from '../types/autoangel';
import { classifyMultiPackageDrop, getExtension, type PackageDrop } from '@shared/util/files';
import { findFormat } from '@shared/formats/registry';
import { createPackageView, type PackageView } from '@shared/package';
import type { StatePorts } from '@shared/formats/types';
import type { PickedItem } from '@shared/hooks/useFileDrop';
import { NavBar } from '@shared/components/NavBar';
import { ErrorBanner } from '@shared/components/ErrorBanner';
import { ResizableSplit } from '@shared/components/ResizableSplit';
import { FileTree, type TreeFile } from '@shared/components/FileTree';
import { KeysPanel, type KeyConfig } from '@shared/components/KeysPanel';
import { SourceLink } from '@shared/components/SourceLink';
import { clearHoverCache } from '@shared/components/hover-preview/hoverState';
import { Breadcrumb } from './components/Breadcrumb';
import { PackageChipRow } from './components/PackageChipRow';
import { EmptyState } from './components/EmptyState';
import { RecentEntries } from './components/RecentEntries';

const FilePreview = lazy(() =>
  import('./components/FilePreview').then((m) => ({ default: m.FilePreview })),
);
import { mergePackageTrees, type TaggedTreeFile } from './merge-tree';
import { PackageRemovedError, usePackageSlots } from './usePackageSlots';
import { useFileIndex, type IndexedSlot } from './index/useFileIndex';
import { clearAllCachedSlotIndexes } from './index/idb';
import { RefsPanel } from './components/RefsPanel';
import {
  IndexerProgressStrip,
  IndexerStatus,
} from './components/IndexerStatus';
import { normalizePath } from '@shared/util/path';
import { useSessions } from './history/useSessions';
import {
  fileFingerprint,
  sessionIdFromFileIds,
  type RecentEntry,
  type Session,
  type SessionFile,
} from './history/types';
import styles from './App.module.css';

const cdn = resolveCDN();

interface SelectedFile {
  pkgId: number;
  path: string;
}

export function App() {
  // WASM ref (for image decoding and format viewers in FilePreview)
  const wasmRef = useRef<AutoangelModule | null>(null);

  // State
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>('Loading WASM…');
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [filterText, setFilterText] = useState('');
  const [customKeys, setCustomKeys] = useState<KeyConfig | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);
  // Entry to auto-select after a session reopen settles.
  const [pendingSelection, setPendingSelection] = useState<RecentEntry | null>(null);

  // Multi-package slot state
  const {
    slots, loadingEntries, loadPackages, removeSlot, replaceSlot, getFile,
    getSlotInputs,
  } = usePackageSlots(cdn);

  const sessionsApi = useSessions();

  // Main-thread WASM init (runs once on mount) — needed for FilePreview image decoders
  useEffect(() => {
    initWasm(cdn)
      .then((mod) => {
        wasmRef.current = mod;
        setStatus(null);
      })
      .catch((e: unknown) => {
        setError(`Failed to load WASM: ${e instanceof Error ? e.message : String(e)}`);
        setStatus('Error loading WASM.');
      });
  }, []);

  // Clear selection if its owning slot was removed
  useEffect(() => {
    if (selectedFile && !slots.some((s) => s.pkgId === selectedFile.pkgId)) {
      setSelectedFile(null);
    }
  }, [slots, selectedFile]);

  // Merged tree across all loaded packages
  const mergedTree = useMemo(
    () =>
      slots.length === 0
        ? null
        : mergePackageTrees(slots.map((s) => ({ tree: s.tree, pkgIndex: s.pkgId }))),
    [slots],
  );

  const slotLookup = useMemo(
    () => new Map(slots.map((s) => [s.pkgId, s])),
    [slots],
  );

  // `slot.fileList` items are already in canonical JS form (lowercase +
  // forward-slash), normalized by usePackageSlots at the WASM boundary —
  // so the entry path doubles as the lookup key. The bucket retains an
  // `orig` so that callers needing the original (i.e. WASM read) get a
  // string that round-trips through `getFile`.
  const pathIndex = useMemo(() => {
    const byKey = new Map<string, Array<{ orig: string; pkgId: number }>>();
    for (const slot of slots) {
      for (const f of slot.fileList) {
        const entry = { orig: f, pkgId: slot.pkgId };
        const bucket = byKey.get(f);
        if (bucket) bucket.push(entry);
        else byKey.set(f, [entry]);
      }
    }
    return byKey;
  }, [slots]);

  const selectedPkgId = selectedFile?.pkgId ?? null;

  useEffect(() => {
    clearHoverCache();
  }, [selectedPkgId]);

  // Stable across renders: every callback reads through refs, so switching
  // the selected slot doesn't churn the `pkg` reference. Without this,
  // useFileData / useGfxPreload / FilePreview's download-actions effect all
  // re-fire on every selection because they depend on `pkg`.
  const pathIndexRef = useRef(pathIndex);
  pathIndexRef.current = pathIndex;
  const selectedPkgIdRef = useRef(selectedPkgId);
  selectedPkgIdRef.current = selectedPkgId;
  const getFileRef = useRef(getFile);
  getFileRef.current = getFile;
  const pkg = useMemo<PackageView>(() => createPackageView({
    getData: async (canonicalPath) => {
      const sel = selectedPkgIdRef.current;
      if (sel === null) throw new PackageRemovedError();
      // `canonicalPath` came from `resolve`, so the bucket lookup must hit.
      const bucket = pathIndexRef.current.get(canonicalPath)!;
      // Selected slot wins on cross-package collision (rare).
      const hit = bucket.find((e) => e.pkgId === sel) ?? bucket[0];
      return getFileRef.current(hit.pkgId, hit.orig);
    },
    resolve: (path) => pathIndexRef.current.get(normalizePath(path))?.[0].orig ?? null,
    list: (prefix) => {
      const key = normalizePath(prefix);
      const out: string[] = [];
      for (const [k, bucket] of pathIndexRef.current) {
        if (k.startsWith(key)) {
          for (const e of bucket) out.push(e.orig);
        }
      }
      return out;
    },
  }), []);

  // Handle file drop / picker: classify and load. Drops whose stem matches an
  // already-loaded slot are routed to `replaceSlot` (preserves color). The
  // rest go through `loadPackages`.
  const handleDrop = useCallback(
    async (items: PickedItem[]) => {
      const files = items.map((it) => it.file);
      const handleByName = new Map<string, FileSystemFileHandle>();
      for (const it of items) {
        if (it.handle) handleByName.set(it.file.name.toLowerCase(), it.handle);
      }

      const result = classifyMultiPackageDrop(files);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.packages.length === 0) {
        setError('No .pck file found.');
        return;
      }

      const stemToPkgId = new Map(slots.map((s) => [s.stem, s.pkgId]));
      const replacements: Array<{ pkgId: number; drop: PackageDrop }> = [];
      const additions: PackageDrop[] = [];
      for (const drop of result.packages) {
        const existing = stemToPkgId.get(drop.stem);
        if (existing !== undefined) replacements.push({ pkgId: existing, drop });
        else additions.push(drop);
      }

      const errors: string[] = [];
      const succeeded: PackageDrop[] = [];
      await Promise.all([
        ...replacements.map((r) =>
          replaceSlot(r.pkgId, r.drop, customKeys)
            .then(() => {
              succeeded.push(r.drop);
            })
            .catch((e: unknown) => {
              errors.push(e instanceof Error ? e.message : String(e));
            }),
        ),
        additions.length > 0
          ? loadPackages(additions, customKeys)
              .then(() => {
                // loadPackages may partially succeed even when it throws, but we
                // can't tell which sub-drops landed; on the success path all did.
                succeeded.push(...additions);
              })
              .catch((e: unknown) => {
                errors.push(e instanceof Error ? e.message : String(e));
              })
          : Promise.resolve(),
      ]);

      // Persist the package's full handle set (`.pck` + every `.pkx`) so a
      // future restore can reopen the whole package in one shot. A partial
      // set would silently load a broken multi-part package, so we skip
      // persistence when any part's handle is missing.
      for (const drop of succeeded) {
        const allParts = [drop.pck, ...drop.pkxFiles].map((f) =>
          handleByName.get(f.name.toLowerCase()),
        );
        if (!allParts.every((h): h is FileSystemFileHandle => Boolean(h))) continue;
        void sessionsApi.saveHandles(
          fileFingerprint(drop.pck),
          allParts as FileSystemFileHandle[],
        );
      }

      setError(errors.length > 0 ? errors.join('; ') : null);
    },
    [slots, loadPackages, replaceSlot, customKeys, sessionsApi],
  );

  // Upsert only when no parse is in flight — otherwise a sequential
  // multi-package drop would record each transient slot state as its own
  // session.
  const { upsertCurrent } = sessionsApi;
  const currentSessionFiles = useMemo<SessionFile[]>(
    () => slots.map(({ fileId, pckName, pckSize }) => ({ fileId, pckName, pckSize })),
    [slots],
  );
  const isStable = loadingEntries.length === 0;
  useEffect(() => {
    if (!isStable) return;
    upsertCurrent(currentSessionFiles);
  }, [currentSessionFiles, isStable, upsertCurrent]);

  // Hash of the currently-loaded set, used to attribute exploration clicks.
  const currentSessionId = useMemo(
    () => sessionIdFromFileIds(currentSessionFiles.map((f) => f.fileId)),
    [currentSessionFiles],
  );

  // Recent entries for the currently-loaded set (empty until the session
  // upsert settles after first load).
  const currentRecentEntries = useMemo<RecentEntry[]>(() => {
    if (!currentSessionId) return [];
    const current = sessionsApi.sessions.find((s) => s.id === currentSessionId);
    return current?.recentEntries ?? [];
  }, [sessionsApi.sessions, currentSessionId]);

  // Open every file in a session via stored handles. Failures (missing
  // handle, denied permission) are surfaced; the partial set still loads.
  const handleOpenSession = useCallback(
    async (session: Session) => {
      const { items, failed, pendingSelection } = await sessionsApi.openSession(session);
      // Arm the auto-jump before loading — the effect below fires once the
      // packages settle and the target path resolves in the merged tree.
      setPendingSelection(pendingSelection);
      if (items.length > 0) await handleDrop(items);
      if (failed.length > 0) {
        const verb = items.length > 0 ? 'restored partially' : 'couldn\u2019t auto-restore';
        setError(
          `Session ${verb}: ${failed.map((f) => f.pckName).join(', ')} need a fresh drop (no stored handle, or permission denied).`,
        );
      }
    },
    [sessionsApi, handleDrop],
  );

  // Auto-jump: once loading settles, resolve the pending entry against the
  // merged tree and select it. A missing path silently drops the intent
  // (package changed, file renamed, etc.). `isStable` is defined above.
  useEffect(() => {
    if (!pendingSelection || !isStable || slots.length === 0) return;
    const bucket = pathIndex.get(normalizePath(pendingSelection.path));
    const slotForPck = slots.find(
      (s) => `${s.stem}.pck`.toLowerCase() === pendingSelection.pckName.toLowerCase(),
    );
    const hit =
      (slotForPck && bucket?.find((e) => e.pkgId === slotForPck.pkgId)) ?? bucket?.[0] ?? null;
    if (hit) setSelectedFile({ pkgId: hit.pkgId, path: hit.orig });
    setPendingSelection(null);
  }, [pendingSelection, isStable, slots, pathIndex]);

  const deferredFilter = useDeferredValue(filterText);
  const isFiltering = filterText !== deferredFilter;

  // Filter input ref (for keyboard shortcut focus)
  const filterInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: / to focus filter, Escape to clear
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.matches('input, select, textarea')) {
        if (e.key === 'Escape') {
          target.blur();
          e.preventDefault();
        }
        return;
      }
      if (!mergedTree) return;
      if (e.key === '/') {
        e.preventDefault();
        filterInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        setFilterText('');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mergedTree]);

  // Tree-click handler: fresh exploration — bump to head of the ring. Tree
  // leaves carry their `pkgIndex` via the `TaggedTreeFile` tag, so duplicate
  // siblings are disambiguated automatically.
  const handleSelectFile = useCallback(
    (file: TreeFile) => {
      const pkgId = (file as TaggedTreeFile).pkgIndex;
      setSelectedFile({ pkgId, path: file.fullPath });
      const slot = slotLookup.get(pkgId);
      if (slot) {
        sessionsApi.recordExplored(currentSessionId, {
          pckName: `${slot.stem}.pck`,
          path: file.fullPath,
          at: Date.now(),
        });
      }
    },
    [sessionsApi, currentSessionId, slotLookup],
  );

  // Recent-entry click: revisit — refresh `at` without reordering the list.
  // Auto-jump on reopen picks the max-`at` entry, so this still anchors the
  // "return to last active" target without reshuffling the ring under the
  // user's cursor.
  const handleSelectRecent = useCallback(
    (target: { pkgId: number; path: string }) => {
      setSelectedFile(target);
      const slot = slotLookup.get(target.pkgId);
      if (slot) {
        sessionsApi.recordTouched(currentSessionId, {
          pckName: `${slot.stem}.pck`,
          path: target.path,
          at: Date.now(),
        });
      }
    },
    [sessionsApi, currentSessionId, slotLookup],
  );

  // Cross-file navigation from inside a viewer (e.g. clicking a GFX path in
  // the ECM event tooltip or a nested `PathOrText` field). Path comes from
  // `findFile` — canonical-cased — so a direct pathIndex hit is expected.
  // Prefer the currently-selected pkg on cross-package collision, matching
  // `getFileData` so the file opens from the same slot the viewer is using.
  const handleNavigateToFile = useCallback(
    (path: string) => {
      const bucket = pathIndex.get(normalizePath(path));
      if (!bucket) return;
      const hit = bucket.find((e) => e.pkgId === selectedPkgId) ?? bucket[0];
      setSelectedFile({ pkgId: hit.pkgId, path: hit.orig });
      const slot = slotLookup.get(hit.pkgId);
      if (slot) {
        sessionsApi.recordExplored(currentSessionId, {
          pckName: `${slot.stem}.pck`,
          path: hit.orig,
          at: Date.now(),
        });
      }
    },
    [pathIndex, selectedPkgId, slotLookup, sessionsApi, currentSessionId],
  );

  const handleReset = useCallback(() => {
    setSelectedFile(null);
  }, []);

  const selectedParts = useMemo(
    () => (selectedFile ? selectedFile.path.split('/') : []),
    [selectedFile],
  );

  // Slot for the currently-selected file (for Breadcrumb label/color)
  const selectedSlot = useMemo(
    () => (selectedPkgId !== null ? slotLookup.get(selectedPkgId) ?? null : null),
    [slotLookup, selectedPkgId],
  );

  const selectedPckName = selectedSlot ? `${selectedSlot.stem}.pck` : null;
  const selectedFormatName = useMemo(
    () => (selectedFile ? findFormat(getExtension(selectedFile.path)).name : null),
    [selectedFile],
  );

  const currentSession = useMemo(
    () => (currentSessionId ? sessionsApi.sessions.find((s) => s.id === currentSessionId) ?? null : null),
    [sessionsApi.sessions, currentSessionId],
  );

  // Cross-reference indexer. Skips slots whose pck/pkx handles are
  // unavailable (shouldn't happen in practice — the slot map always
  // owns them while the slot exists).
  const indexedSlots = useMemo<IndexedSlot[]>(() => {
    const out: IndexedSlot[] = [];
    for (const s of slots) {
      const inputs = getSlotInputs(s.pkgId);
      if (!inputs) continue;
      out.push({
        pkgId: s.pkgId,
        fileId: s.fileId,
        pckFile: inputs.pckFile,
        pkxFiles: inputs.pkxFiles,
        fileList: s.fileList,
      });
    }
    return out;
  }, [slots, getSlotInputs]);

  // Flatten the multi-bucket pathIndex to a key → canonical-path map
  // for the indexer. On cross-package collision, first slot wins —
  // matches the existing convention in `findFile`.
  const indexerPathMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const [k, bucket] of pathIndex) m.set(k, bucket[0].orig);
    return m;
  }, [pathIndex]);

  const indexingEnabled = currentSession?.indexingEnabled ?? false;

  const fileIndex = useFileIndex({
    cdn,
    slots: indexedSlots,
    loading: loadingEntries.length,
    mergedPathIndex: indexerPathMap,
    enabled: indexingEnabled,
  });

  const handleEnableIndexing = useCallback(() => {
    if (!currentSessionId) return;
    sessionsApi.setIndexingEnabled(currentSessionId, true);
  }, [sessionsApi, currentSessionId]);

  const handleDisableIndexing = useCallback(() => {
    if (!currentSessionId) return;
    sessionsApi.setIndexingEnabled(currentSessionId, false);
  }, [sessionsApi, currentSessionId]);

  // Disable indexing for the current session AND wipe every cached
  // slot record from IDB. We disable first so the worker doesn't
  // race a fresh checkpoint write against the clear, then drop the
  // store. Re-enabling rebuilds from scratch.
  const handleClearIndexCache = useCallback(() => {
    if (currentSessionId) {
      sessionsApi.setIndexingEnabled(currentSessionId, false);
    }
    void clearAllCachedSlotIndexes();
  }, [sessionsApi, currentSessionId]);

  const selectedKey = selectedFile ? normalizePath(selectedFile.path) : null;
  const outgoingRefs = useMemo(
    () => (selectedKey ? fileIndex.getOutgoing(selectedKey) : []),
    [fileIndex, selectedKey],
  );
  const incomingRefs = useMemo(
    () => (selectedKey ? fileIndex.getIncoming(selectedKey) : []),
    [fileIndex, selectedKey],
  );

  const viewerStatePorts = useMemo<StatePorts | undefined>(() => {
    if (!selectedFile || !selectedPckName || !selectedFormatName || !currentSessionId) return undefined;
    return {
      initialEntryState: currentRecentEntries.find(
        (e) => e.pckName === selectedPckName && e.path === selectedFile.path,
      )?.state,
      initialFormatState: currentSession?.formatStates?.[selectedFormatName],
      onEntryStateChange: (state) =>
        sessionsApi.recordEntryState(
          currentSessionId,
          { pckName: selectedPckName, path: selectedFile.path },
          state,
        ),
      onFormatStateChange: (state) =>
        sessionsApi.recordFormatState(currentSessionId, selectedFormatName, state),
    };
  }, [
    sessionsApi, currentSessionId, currentSession, currentRecentEntries,
    selectedFile, selectedPckName, selectedFormatName,
  ]);

  // Per-row color stripe: only show when multiple packages are loaded
  const fileRowStyle = useCallback(
    (file: TreeFile): CSSProperties | undefined => {
      if (slots.length < 2) return undefined;
      const pkgIndex = (file as TaggedTreeFile).pkgIndex;
      const slot = slotLookup.get(pkgIndex);
      return slot ? { borderLeft: `2px solid ${slot.color}` } : undefined;
    },
    [slots.length, slotLookup],
  );

  // Badge for duplicate leaves: show which package this entry belongs to.
  // Siblings at the same fullPath render as separate rows, each with its own
  // package-name suffix.
  const renderFileBadge = useCallback(
    (file: TreeFile) => {
      const tagged = file as TaggedTreeFile;
      if (!tagged.duplicate) return null;
      const slot = slotLookup.get(tagged.pkgIndex);
      if (!slot) return null;
      return <span className={styles.dupSuffix}>{slot.stem}.pck</span>;
    },
    [slotLookup],
  );

  // Footer aggregates
  const totalFiles = useMemo(() => slots.reduce((n, s) => n + s.fileCount, 0), [slots]);
  const commonVersion = useMemo(() => {
    if (slots.length === 0) return null;
    const first = slots[0].version;
    return slots.every((s) => s.version === first) ? first : null;
  }, [slots]);

  return (
    <div className={styles.appContainer}>
      <NavBar active="pck" />
      <header className={styles.header}>
        <PackageChipRow
          slots={slots}
          loadingEntries={loadingEntries}
          onRemove={removeSlot}
          onDrop={handleDrop}
          getIndexDetails={fileIndex.getSlotDetails}
        />

        {status !== null && <span className={styles.status}>{status}</span>}

        <KeysPanel
          open={keysOpen}
          onToggle={() => setKeysOpen((v) => !v)}
          onKeysChange={setCustomKeys}
        />

        <SourceLink
          href="https://github.com/Smertig/autoangel-rs/tree/master/demos/pck"
          className={styles.sourceLink}
        />
      </header>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {!mergedTree && (
        <EmptyState
          sessions={sessionsApi.sessions}
          loading={sessionsApi.loading}
          onDrop={handleDrop}
          onOpenSession={handleOpenSession}
          onRemoveSession={sessionsApi.removeOne}
          onClearAll={sessionsApi.clearAll}
        />
      )}

      {mergedTree && (
        <ResizableSplit
          side="left"
          initialWidth={300}
          minWidth={180}
          panel={
            <div className={styles.sidebarInner}>
              <div className={styles.sidebarControls} data-filtering={isFiltering || undefined}>
                <input
                  ref={filterInputRef}
                  type="text"
                  className={styles.filterInput}
                  placeholder="Filter files... (/)"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setFilterText('');
                      e.currentTarget.blur();
                    }
                  }}
                />
              </div>
              <div className={styles.treeScroll}>
                <FileTree
                  root={mergedTree}
                  selectedPath={selectedFile?.path ?? null}
                  filterText={filterText}
                  onSelectFile={handleSelectFile}
                  renderFileBadge={renderFileBadge}
                  fileRowStyle={fileRowStyle}
                  suppressRootAutoExpand={slots.length + loadingEntries.length > 1}
                />
              </div>
              <RecentEntries
                entries={currentRecentEntries}
                slots={slots}
                selectedPath={selectedFile?.path ?? null}
                selectedPkgId={selectedPkgId}
                onSelect={handleSelectRecent}
              />
            </div>
          }
        >
          {(() => {
            const previewPane = (
              <>
                <Breadcrumb
                  parts={selectedParts}
                  onReset={handleReset}
                  packageLabel={selectedSlot ? `${selectedSlot.stem}.pck` : undefined}
                  packageColor={selectedSlot?.color}
                />
                <div className={styles.previewArea}>
                  {selectedFile && wasmRef.current ? (
                    <Suspense fallback={<div className={styles.placeholder}>Loading preview&hellip;</div>}>
                      <FilePreview
                        path={selectedFile.path}
                        pkg={pkg}
                        wasm={wasmRef.current}
                        onNavigateToFile={handleNavigateToFile}
                        state={viewerStatePorts}
                      />
                    </Suspense>
                  ) : (
                    <div className={styles.placeholder}>Select a file to preview</div>
                  )}
                </div>
              </>
            );
            return indexingEnabled ? (
              <ResizableSplit
                side="right"
                initialWidth={320}
                minWidth={220}
                panel={
                  <RefsPanel
                    outgoing={outgoingRefs}
                    incoming={incomingRefs}
                    onNavigate={handleNavigateToFile}
                    selectedPath={selectedFile?.path ?? null}
                    pkg={pkg}
                    wasm={wasmRef.current ?? undefined}
                  />
                }
              >
                {previewPane}
              </ResizableSplit>
            ) : (
              previewPane
            );
          })()}
        </ResizableSplit>
      )}

      {mergedTree && (
        <footer className={styles.statusBar}>
          <IndexerProgressStrip status={fileIndex.status} />
          <span>
            {slots.length} {slots.length === 1 ? 'package' : 'packages'} · {totalFiles} files
            {commonVersion !== null && ` · v0x${commonVersion.toString(16).toUpperCase()}`}
          </span>
          <IndexerStatus
            status={fileIndex.status}
            totalEdges={fileIndex.totalEdges}
            indexBytes={fileIndex.indexBytes}
            currentPath={fileIndex.currentPath}
            onEnable={handleEnableIndexing}
            onDisable={handleDisableIndexing}
            onClear={handleClearIndexCache}
          />
        </footer>
      )}
    </div>
  );
}
