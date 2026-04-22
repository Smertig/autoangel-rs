import { useState, useRef, useEffect, useCallback } from 'react';
import type { AutoangelModule } from '../../types/autoangel';
import { findFormat } from '@shared/formats/registry';
import { getExtension } from '@shared/util/files';
import { downloadFile } from '@shared/util/download';
import type { DownloadAction } from '@shared/formats/types';
import type { FindFile } from '@shared/components/gfx/util/resolveEnginePath';
import styles from './FilePreview.module.css';

interface FilePreviewProps {
  path: string;
  getData: (path: string) => Promise<Uint8Array>;
  wasm: AutoangelModule;
  listFiles: (prefix: string) => string[];
  findFile: FindFile;
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

export function FilePreview({ path, getData, wasm, listFiles, findFile }: FilePreviewProps) {
  const ext = getExtension(path);
  const format = findFormat(ext);

  const ctx = { path, ext, getData, wasm, listFiles, findFile };
  const actions: DownloadAction[] = format.downloadActions?.(ctx) ?? [
    { label: '⬇ Download', onClick: () => downloadFile(path, getData) },
  ];

  return (
    <div className={styles.filePreviewWrapper}>
      <div className={styles.actionsBar}>
        <DownloadButton actions={actions} />
      </div>
      <div className={styles.previewContent}>
        <format.Viewer
          path={path}
          ext={ext}
          getData={getData}
          wasm={wasm}
          listFiles={listFiles}
          findFile={findFile}
        />
      </div>
    </div>
  );
}
