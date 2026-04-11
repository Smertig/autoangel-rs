import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveCDN } from '../cdn';
import { initWasm } from '../wasm';
import type { AutoangelModule } from '../types/autoangel';
import { classifyFiles, formatSize } from '@shared/util/files';
import { NavBar } from '@shared/components/NavBar';
import { DropZone } from '@shared/components/DropZone';
import { ErrorBanner } from '@shared/components/ErrorBanner';
import { ResizableSidebar } from '@shared/components/ResizableSidebar';
import { InlineProgress } from '@shared/components/InlineProgress';
import { FileTree, buildTree, type TreeNode } from '@shared/components/FileTree';
import { KeysPanel, type KeyConfig } from '@shared/components/KeysPanel';
import { SourceLink } from '@shared/components/SourceLink';
import { useWorker } from '@shared/hooks/useWorker';
import { useWorkerInit } from '@shared/hooks/useWorkerInit';
import { Breadcrumb } from './components/Breadcrumb';
import { FilePreview } from './components/FilePreview';
import styles from './App.module.css';

const cdn = resolveCDN();

export function App() {
  // WASM ref (for image decoding and in-memory fallback)
  const wasmRef = useRef<AutoangelModule | null>(null);
  // In-memory package fallback (when no worker)
  const pkgRef = useRef<any>(null);

  // State
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Loading WASM…');
  const [progress, setProgress] = useState<number | null>(null);
  const [fileTree, setFileTree] = useState<TreeNode | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [encoding, setEncoding] = useState('auto');
  const [fileCount, setFileCount] = useState(0);
  const [version, setVersion] = useState(0);
  const [compact, setCompact] = useState(false);
  const [customKeys, setCustomKeys] = useState<KeyConfig | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);

  // Worker
  const worker = useWorker(() => {
    return new Worker(new URL('./pck-worker.ts', import.meta.url), { type: 'module' });
  });
  const { call: workerCall, ready: workerReady } = worker;

  // Effect 1: main-thread WASM init (runs once on mount)
  useEffect(() => {
    initWasm(cdn).then((mod) => {
      wasmRef.current = mod;
      setStatus('Ready. Open a .pck file.');
    }).catch((e: unknown) => {
      setError(`Failed to load WASM: ${e instanceof Error ? e.message : String(e)}`);
      setStatus('Error loading WASM.');
    });
  }, []);

  // Effect 2: worker init (runs once when worker becomes ready)
  useWorkerInit(worker, cdn);

  // Get file data (worker or in-memory fallback)
  const getFileData = useCallback(async (path: string): Promise<Uint8Array> => {
    if (workerReady) {
      const result = await workerCall<{ data: ArrayBuffer; byteOffset: number; byteLength: number }>(
        { type: 'getFile', path },
      );
      return new Uint8Array(result.data, result.byteOffset, result.byteLength);
    } else {
      const pkg = pkgRef.current;
      if (!pkg) throw new Error('No package loaded');
      const data = await pkg.getFile(path);
      if (!data) throw new Error(`File not found or decompression failed: ${path}`);
      return data;
    }
  }, [workerReady, workerCall]);

  // Load files
  const loadFiles = useCallback(async (files: File[]) => {
    const { pck: pckFile, pkxFiles } = classifyFiles(files);
    if (!pckFile) {
      setError('No .pck file found.');
      return;
    }

    const label =
      pkxFiles.length > 0
        ? `${pckFile.name} + ${pkxFiles.map((f) => f.name).join(' + ')}`
        : pckFile.name;
    const totalSize = pckFile.size + pkxFiles.reduce((s, f) => s + f.size, 0);

    setError(null);
    setStatus(`Parsing ${label} (${formatSize(totalSize)})…`);
    setProgress(0);
    setSelectedPath(null);
    setFileTree(null);

    // Free previous in-memory package
    if (pkgRef.current) {
      pkgRef.current.free();
      pkgRef.current = null;
    }

    let fileList: string[];
    let ver: number;

    try {
      if (workerReady) {
        const result = await workerCall<{ fileList: string[]; version: number; fileCount: number }>(
          { type: 'parseFile', pckFile, pkxFiles, keys: customKeys ?? undefined },
          undefined,
          {
            onProgress: ({ phase, index, total }: { phase: string; index: number; total: number }) => {
              if (phase === 'parse') {
                setProgress(Math.round(((index + 1) / total) * 100));
              }
            },
          },
        );
        fileList = result.fileList;
        ver = result.version;
      } else {
        // In-memory fallback
        if (!wasmRef.current) throw new Error('WASM not loaded');
        if (pkxFiles.length > 0) {
          throw new Error('.pkx files require a modern browser with Web Worker support');
        }
        const { PckPackage, PackageConfig } = wasmRef.current as any;
        const pckBytes = new Uint8Array(await pckFile.arrayBuffer());
        const config = customKeys
          ? PackageConfig.withKeys(customKeys.key1, customKeys.key2, customKeys.guard1, customKeys.guard2)
          : undefined;
        pkgRef.current = await PckPackage.parse(pckBytes, config, {
          onProgress: (index: number, total: number) => {
            setProgress(Math.round(((index + 1) / total) * 100));
          },
        });
        fileList = pkgRef.current.fileList();
        ver = pkgRef.current.version;
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setProgress(null);
      setStatus('Error parsing file.');
      return;
    }

    const tree = buildTree(fileList);
    setFileTree(tree);
    setFileCount(fileList.length);
    setVersion(ver);
    setStatus(label);
    setProgress(null);
    setCompact(true);
  }, [workerReady, workerCall, customKeys]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (!fileTree) return;
      if (e.key === '/') {
        e.preventDefault();
        filterInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        setFilterText('');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [fileTree]);

  const handleSelectFile = useCallback((path: string) => {
    setSelectedPath(path);
    setEncoding('auto');
  }, []);

  const handleReset = useCallback(() => {
    setSelectedPath(null);
  }, []);

  const selectedParts = selectedPath ? selectedPath.split('\\') : [];

  return (
    <div className={styles.appContainer}>
      <NavBar active="pck" />
      <header className={styles.header}>
        <DropZone
          accept=".pck,.pkx,.pkx1,.pkx2,.pkx3,.pkx4,.pkx5"
          multiple
          compact={compact}
          label={
            <>
              Drop <code>.pck</code> (and optional <code>.pkx*</code>) here, or{' '}
            </>
          }
          onFiles={loadFiles}
        />

        {progress !== null ? (
          <InlineProgress text={status} progress={progress} />
        ) : (
          <span className={styles.status}>{status}</span>
        )}

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

      {fileTree && (
        <ResizableSidebar
          initialWidth={300}
          minWidth={180}
          sidebar={
            <>
              <div className={styles.sidebarControls}>
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
                root={fileTree}
                selectedPath={selectedPath}
                filterText={filterText}
                onSelectFile={handleSelectFile}
              />
            </>
          }
        >
          <Breadcrumb parts={selectedParts} onReset={handleReset} />

          <div className={styles.previewArea}>
            {selectedPath && wasmRef.current ? (
              <FilePreview
                path={selectedPath}
                getData={getFileData}
                wasm={wasmRef.current}
                encoding={encoding}
                onEncodingChange={setEncoding}
              />
            ) : (
              <div className={styles.placeholder}>Select a file to preview</div>
            )}
          </div>
        </ResizableSidebar>
      )}

      {fileTree && (
        <footer className={styles.statusBar}>
          <span>{fileCount} files</span>
          <span>format v0x{version.toString(16).toUpperCase()}</span>
        </footer>
      )}
    </div>
  );
}
