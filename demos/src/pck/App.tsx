import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { resolveCDN } from '../cdn';
import { initWasm } from '../wasm';
import type { AutoangelModule } from '../types/autoangel';
import { classifyMultiPackageDrop, type PackageDrop } from '@shared/util/files';
import { NavBar } from '@shared/components/NavBar';
import { ErrorBanner } from '@shared/components/ErrorBanner';
import { ResizableSidebar } from '@shared/components/ResizableSidebar';
import { FileTree, type TreeFile } from '@shared/components/FileTree';
import { KeysPanel, type KeyConfig } from '@shared/components/KeysPanel';
import { SourceLink } from '@shared/components/SourceLink';
import { Breadcrumb } from './components/Breadcrumb';
import { FilePreview } from './components/FilePreview';
import { PackageChipRow } from './components/PackageChipRow';
import { EmptyDropPanel } from './components/EmptyDropPanel';
import { mergePackageTrees, type TaggedTreeFile } from './merge-tree';
import { PackageRemovedError, usePackageSlots } from './usePackageSlots';
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

  // Multi-package slot state
  const { slots, loadingEntries, loadPackages, removeSlot, replaceSlot, getFile } = usePackageSlots(cdn);

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

  const pathIndex = useMemo(() => {
    const byLower = new Map<string, Array<{ orig: string; pkgId: number }>>();
    for (const slot of slots) {
      for (const f of slot.fileList) {
        const lower = f.toLowerCase();
        const entry = { orig: f, pkgId: slot.pkgId };
        const bucket = byLower.get(lower);
        if (bucket) bucket.push(entry);
        else byLower.set(lower, [entry]);
      }
    }
    return byLower;
  }, [slots]);

  const selectedPkgId = selectedFile?.pkgId ?? null;

  const getFileData = useCallback(
    (path: string): Promise<Uint8Array> => {
      if (selectedPkgId === null) return Promise.reject(new PackageRemovedError());
      const bucket = pathIndex.get(path.toLowerCase());
      if (!bucket) return Promise.reject(new PackageRemovedError());
      // Selected slot wins on cross-package collision (rare).
      const hit = bucket.find((e) => e.pkgId === selectedPkgId) ?? bucket[0];
      return getFile(hit.pkgId, path);
    },
    [selectedPkgId, pathIndex, getFile],
  );

  const findFile = useCallback(
    (path: string): string | null => pathIndex.get(path.toLowerCase())?.[0].orig ?? null,
    [pathIndex],
  );

  const listFiles = useCallback(
    (prefix: string): string[] => {
      const lower = prefix.toLowerCase();
      const out: string[] = [];
      for (const [l, bucket] of pathIndex) {
        if (l.startsWith(lower)) {
          for (const e of bucket) out.push(e.orig);
        }
      }
      return out;
    },
    [pathIndex],
  );

  // Handle file drop / picker: classify and load. Drops whose stem matches an
  // already-loaded slot are routed to `replaceSlot` (preserves color). The
  // rest go through `loadPackages`.
  const handleDrop = useCallback(
    async (files: File[]) => {
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
      await Promise.all([
        ...replacements.map((r) =>
          replaceSlot(r.pkgId, r.drop, customKeys).catch((e: unknown) => {
            errors.push(e instanceof Error ? e.message : String(e));
          }),
        ),
        additions.length > 0
          ? loadPackages(additions, customKeys).catch((e: unknown) => {
              errors.push(e instanceof Error ? e.message : String(e));
            })
          : Promise.resolve(),
      ]);

      setError(errors.length > 0 ? errors.join('; ') : null);
    },
    [slots, loadPackages, replaceSlot, customKeys],
  );

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

  // Selecting a file from the merged tree: the clicked leaf carries its
  // `pkgIndex` via the `TaggedTreeFile` tag, so duplicate siblings are
  // disambiguated automatically.
  const handleSelectFile = useCallback(
    (file: TreeFile) =>
      setSelectedFile({ pkgId: (file as TaggedTreeFile).pkgIndex, path: file.fullPath }),
    [],
  );

  const handleReset = useCallback(() => {
    setSelectedFile(null);
  }, []);

  const selectedParts = useMemo(
    () => (selectedFile ? selectedFile.path.split('\\') : []),
    [selectedFile],
  );

  // Slot for the currently-selected file (for Breadcrumb label/color)
  const selectedSlot = useMemo(
    () => (selectedPkgId !== null ? slotLookup.get(selectedPkgId) ?? null : null),
    [slotLookup, selectedPkgId],
  );

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

      {!mergedTree && <EmptyDropPanel onDrop={handleDrop} />}

      {mergedTree && (
        <ResizableSidebar
          initialWidth={300}
          minWidth={180}
          sidebar={
            <>
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
              <FileTree
                root={mergedTree}
                selectedPath={selectedFile?.path ?? null}
                filterText={filterText}
                onSelectFile={handleSelectFile}
                renderFileBadge={renderFileBadge}
                fileRowStyle={fileRowStyle}
                suppressRootAutoExpand={slots.length + loadingEntries.length > 1}
              />
            </>
          }
        >
          <Breadcrumb
            parts={selectedParts}
            onReset={handleReset}
            packageLabel={selectedSlot ? `${selectedSlot.stem}.pck` : undefined}
            packageColor={selectedSlot?.color}
          />

          <div className={styles.previewArea}>
            {selectedFile && wasmRef.current ? (
              <FilePreview
                path={selectedFile.path}
                getData={getFileData}
                wasm={wasmRef.current}
                listFiles={listFiles}
                findFile={findFile}
              />
            ) : (
              <div className={styles.placeholder}>Select a file to preview</div>
            )}
          </div>
        </ResizableSidebar>
      )}

      {mergedTree && (
        <footer className={styles.statusBar}>
          <span>
            {slots.length} {slots.length === 1 ? 'package' : 'packages'} · {totalFiles} files
            {commonVersion !== null && ` · v0x${commonVersion.toString(16).toUpperCase()}`}
          </span>
        </footer>
      )}
    </div>
  );
}
