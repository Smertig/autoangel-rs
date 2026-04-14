import { useCallback, useEffect, useState } from 'react';
import { getExtension, isLikelyText, formatSize } from '@shared/util/files';
import { detectEncoding } from '@shared/util/encoding';
import { bytesEqual } from '@shared/util/bytes';
import type { AutoangelModule } from '@shared/../types/autoangel';
import { DiffStatus, DiffStatusValue } from '../types';
import { findFormat } from '@shared/formats/registry';
import { CopyButton } from '@shared/components/CopyButton';
import styles from '../App.module.css';

interface DiffPreviewProps {
  path: string | null;
  status: DiffStatusValue;
  getLeftData: (path: string) => Promise<Uint8Array>;
  getRightData: (path: string) => Promise<Uint8Array>;
  wasm: AutoangelModule;
  onResolveStatus?: (path: string, resolved: DiffStatusValue) => void;
}

type PreviewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'single'; data: Uint8Array; status: DiffStatusValue }
  | { kind: 'modified'; leftData: Uint8Array; rightData: Uint8Array };

function DiffBanner({ status }: { status: DiffStatusValue }) {
  const bannerClass = `${styles.diffBannerEl} ${styles[`diffBanner_${status}`] ?? ''}`;
  const text =
    status === DiffStatus.ADDED ? 'New file (not in left package)'
    : status === DiffStatus.DELETED ? 'Removed file (not in right package)'
    : 'Unchanged';
  return <div className={bannerClass}>{text}</div>;
}

// --- Content Header ---

export function ContentHeader({
  path,
  status,
  leftSize,
  rightSize,
  leftEnc,
  rightEnc,
}: {
  path: string | null;
  status: DiffStatusValue;
  leftSize?: number;
  rightSize?: number;
  leftEnc?: string;
  rightEnc?: string;
}) {
  if (!path) return null;

  return (
    <div className={styles.contentHeader}>
      <span className={styles.contentPath}>{path}</span>
      <CopyButton text={path.replaceAll('\\', '/')} />
      {leftSize != null && rightSize != null && (
        <span className={styles.contentSize}>
          {formatSize(leftSize)} &rarr; {formatSize(rightSize)}
        </span>
      )}
      {leftSize != null && rightSize == null && (
        <span className={styles.contentSize}>{formatSize(leftSize)}</span>
      )}
      {leftEnc && rightEnc && leftEnc !== rightEnc && (
        <span className={styles.contentSize}>({leftEnc} &rarr; {rightEnc})</span>
      )}
      {leftEnc && rightEnc && leftEnc === rightEnc && leftEnc !== 'gbk' && (
        <span className={styles.contentSize}>({leftEnc})</span>
      )}
      <span className={`${styles.diffBadge} ${styles[`diffBadge_${status}`] ?? ''}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    </div>
  );
}

// --- DiffPreview ---

export function DiffPreview({
  path,
  status,
  getLeftData,
  getRightData,
  wasm,
  onResolveStatus,
}: DiffPreviewProps) {
  const [previewState, setPreviewState] = useState<PreviewState>({ kind: 'idle' });

  // Must be before early returns to satisfy rules of hooks.
  // For 'single' state, wraps pre-loaded data as a getData callback for format.Viewer.
  const singleData = previewState.kind === 'single' ? previewState.data : null;
  const singleGetData = useCallback(async (_p: string) => singleData!, [singleData]);

  useEffect(() => {
    if (!path) {
      setPreviewState({ kind: 'idle' });
      return;
    }

    let cancelled = false;
    setPreviewState({ kind: 'loading' });

    async function load() {
      if (!path) return;

      try {
        if (status === DiffStatus.PENDING) {
          const [leftData, rightData] = await Promise.all([getLeftData(path), getRightData(path)]);
          if (cancelled) return;
          const match = bytesEqual(leftData, rightData);
          const resolved = match ? DiffStatus.UNCHANGED : DiffStatus.MODIFIED;
          onResolveStatus?.(path, resolved);
          if (match) {
            setPreviewState({ kind: 'single', data: rightData, status: DiffStatus.UNCHANGED });
          } else {
            setPreviewState({ kind: 'modified', leftData, rightData });
          }
        } else if (status === DiffStatus.MODIFIED) {
          const [leftData, rightData] = await Promise.all([getLeftData(path), getRightData(path)]);
          if (cancelled) return;
          setPreviewState({ kind: 'modified', leftData, rightData });
        } else if (status === DiffStatus.ADDED) {
          const data = await getRightData(path);
          if (cancelled) return;
          setPreviewState({ kind: 'single', data, status: DiffStatus.ADDED });
        } else if (status === DiffStatus.DELETED) {
          const data = await getLeftData(path);
          if (cancelled) return;
          setPreviewState({ kind: 'single', data, status: DiffStatus.DELETED });
        } else {
          // UNCHANGED
          const data = await getRightData(path);
          if (cancelled) return;
          setPreviewState({ kind: 'single', data, status: DiffStatus.UNCHANGED });
        }
      } catch (e: unknown) {
        if (cancelled) return;
        setPreviewState({ kind: 'error', message: `Error: ${e instanceof Error ? e.message : String(e)}` });
      }
    }

    load();
    return () => { cancelled = true; };
  }, [path, status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!path || previewState.kind === 'idle') {
    return <div className={styles.placeholder}>Select a file to view its diff</div>;
  }

  if (previewState.kind === 'loading') {
    return <div className={styles.placeholder}>Loading&hellip;</div>;
  }

  if (previewState.kind === 'error') {
    return <div className={styles.placeholder}>{previewState.message}</div>;
  }

  const ext = getExtension(path);
  const format = findFormat(ext);

  if (previewState.kind === 'modified') {
    const { leftData, rightData } = previewState;
    return (
      <format.Differ
        path={path}
        ext={ext}
        leftData={leftData}
        rightData={rightData}
        wasm={wasm}
      />
    );
  }

  // single file: added, deleted, or unchanged
  return (
    <>
      <DiffBanner status={previewState.status} />
      <format.Viewer path={path} ext={ext} getData={singleGetData} wasm={wasm} />
    </>
  );
}

// re-export for sizing info used in ContentHeader
export function getPreviewHeaderInfo(
  state: PreviewState,
  path: string,
): { leftSize?: number; rightSize?: number; leftEnc?: string; rightEnc?: string } | null {
  if (state.kind !== 'modified' && state.kind !== 'single') return null;
  const ext = getExtension(path);
  if (state.kind === 'modified') {
    const { leftData, rightData } = state;
    const isText = isLikelyText(leftData, ext) && isLikelyText(rightData, ext);
    if (isText) {
      const leftEnc = detectEncoding(leftData);
      const rightEnc = detectEncoding(rightData);
      return { leftSize: leftData.byteLength, rightSize: rightData.byteLength, leftEnc, rightEnc };
    }
    return { leftSize: leftData.byteLength, rightSize: rightData.byteLength };
  }
  if (state.kind === 'single') {
    return { leftSize: state.data.byteLength };
  }
  return null;
}
