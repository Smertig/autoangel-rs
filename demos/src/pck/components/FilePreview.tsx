import { Suspense, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { AutoangelModule } from '../../types/autoangel';
import { findFormat, lazyFormatComponent } from '@shared/formats/registry';
import { getExtension } from '@shared/util/files';
import { downloadFile } from '@shared/util/download';
import type { DownloadAction, StatePorts } from '@shared/formats/types';
import type { PackageView } from '@shared/package';
import styles from './FilePreview.module.css';

interface FilePreviewProps {
  path: string;
  pkg: PackageView;
  wasm: AutoangelModule;
  onNavigateToFile?: (path: string) => void;
  /** Persisted-state ports already routed to the correct session/format/entry. */
  state?: StatePorts;
}

interface DownloadButtonProps {
  actions: DownloadAction[];
}

function DownloadButton({ actions }: DownloadButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);

  const handleOutsideClick = useCallback((e: MouseEvent) => {
    if (groupRef.current && !groupRef.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener('mousedown', handleOutsideClick);
    } else {
      document.removeEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open, handleOutsideClick]);

  const runAction = useCallback(async (action: DownloadAction) => {
    setOpen(false);
    setBusy(true);
    try {
      await action.onClick();
    } finally {
      setBusy(false);
    }
  }, []);

  const isSingle = actions.length === 1;
  const label = busy ? '⬇ Collecting…' : (isSingle ? actions[0].label : `${actions[0].label} ▾`);

  const handleClick = useCallback(() => {
    if (busy) return;
    if (isSingle) {
      void runAction(actions[0]);
    } else {
      setOpen((v) => !v);
    }
  }, [busy, isSingle, actions, runAction]);

  return (
    <div className={styles.downloadGroup} ref={groupRef}>
      <button
        className={styles.btnPrimary}
        onClick={handleClick}
        disabled={busy}
      >
        {label}
      </button>
      {!isSingle && open && (
        <div className={styles.downloadMenu}>
          {actions.map((action, i) => (
            <button
              key={i}
              className={styles.downloadMenuItem}
              onClick={() => void runAction(action)}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FilePreview({
  path, pkg, wasm, onNavigateToFile, state,
}: FilePreviewProps) {
  const ext = getExtension(path);
  const loader = findFormat(ext);

  const Viewer = useMemo(() => lazyFormatComponent(loader, 'Viewer'), [loader]);

  const defaultActions = useMemo<DownloadAction[]>(
    () => [{ label: '⬇ Download', onClick: () => downloadFile(path, pkg) }],
    [path, pkg],
  );
  const [customActions, setCustomActions] = useState<DownloadAction[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCustomActions(null);
    void loader.load().then((format) => {
      if (cancelled) return;
      const custom = format.downloadActions?.({
        path, ext, pkg, wasm, onNavigateToFile,
      });
      setCustomActions(custom ?? null);
    });
    return () => { cancelled = true; };
  }, [loader, path, ext, pkg, wasm, onNavigateToFile]);

  const actions = customActions ?? defaultActions;

  return (
    <div className={styles.filePreviewWrapper}>
      <div className={styles.actionsBar}>
        <DownloadButton actions={actions} />
      </div>
      <div className={styles.previewContent}>
        <Suspense fallback={<div>Loading…</div>}>
          <Viewer
            path={path}
            ext={ext}
            pkg={pkg}
            wasm={wasm}
            onNavigateToFile={onNavigateToFile}
            state={state}
          />
        </Suspense>
      </div>
    </div>
  );
}
