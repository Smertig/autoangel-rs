import { formatSize } from '@shared/util/files';
import type { IndexerStatus as Status } from '../index/useFileIndex';
import styles from './IndexerStatus.module.css';

const ENABLE_TOOLTIP =
  'Build an in-browser index of references between files in this ' +
  'package set so you can jump from a model to its skin, from a SKI ' +
  'to its textures, and back. Indexing decompresses every parseable ' +
  'file once — for very large packages this takes significant CPU ' +
  'and memory.';

const DISABLE_TOOLTIP =
  'Stop indexing and discard the index for this session.';

const CLEAR_TOOLTIP =
  'Wipe every cached slot index from IndexedDB. Re-enabling indexing ' +
  'after this re-scans all parseable files from scratch.';

export interface IndexerStatusProps {
  status: Status;
  totalEdges?: number;
  indexBytes?: number;
  /** Last file the worker is processing — surfaced as a tooltip on
   *  the indexing line so heavy traffic doesn't widen the footer. */
  currentPath?: string;
  onEnable?: () => void;
  onDisable?: () => void;
  /** Wipe every cached slot index from IndexedDB. */
  onClear?: () => void;
}

export function IndexerStatus({
  status,
  totalEdges,
  indexBytes,
  currentPath,
  onEnable,
  onDisable,
  onClear,
}: IndexerStatusProps) {
  if (status.kind === 'disabled') {
    return (
      <span className={styles.row}>
        <span className={styles.label} title={ENABLE_TOOLTIP}>
          indexing off
        </span>
        <span className={styles.sep}>·</span>
        <button
          type="button"
          className={styles.linkBtn}
          onClick={onEnable}
          disabled={!onEnable}
          title={ENABLE_TOOLTIP}
        >
          enable
        </button>
        {onClear && (
          <>
            <span className={styles.sep}>·</span>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={onClear}
              title={CLEAR_TOOLTIP}
            >
              clear cache
            </button>
          </>
        )}
      </span>
    );
  }

  if (status.kind === 'indexing') {
    // Worker is just spinning up and no slotMeta has landed yet —
    // hide rather than flash "Indexing 0/0".
    if (status.total === 0) return null;
    const pct = Math.min(100, Math.round((status.indexed / status.total) * 100));
    const tooltip = currentPath
      ? `Indexing ${currentPath}`
      : 'Indexing in progress';
    return (
      <span className={styles.row}>
        <span className={styles.label} title={tooltip}>
          Indexing {status.indexed.toLocaleString()}/
          {status.total.toLocaleString()}
        </span>
        <span className={styles.pct}>{pct}%</span>
        {onDisable && (
          <>
            <span className={styles.sep}>·</span>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={onDisable}
              title={DISABLE_TOOLTIP}
            >
              disable
            </button>
          </>
        )}
      </span>
    );
  }

  if (status.kind === 'paused-loading') {
    // Hide while packages are still loading or attaching; chip
    // progress bars carry the "things are happening" signal.
    return null;
  }

  if (status.kind === 'error-disabled') {
    return (
      <span className={styles.row}>
        <span className={styles.label}>indexing unavailable</span>
      </span>
    );
  }

  // status.kind === 'idle'
  if (totalEdges && totalEdges > 0) {
    const sizePart =
      indexBytes !== undefined && indexBytes > 0
        ? ` · ${formatSize(indexBytes)}`
        : '';
    return (
      <span className={styles.row}>
        <span className={styles.checkmark}>✓</span>
        <span className={styles.label}>
          {totalEdges.toLocaleString()} reference
          {totalEdges === 1 ? '' : 's'}
          {sizePart}
        </span>
        {onDisable && (
          <>
            <span className={styles.sep}>·</span>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={onDisable}
              title={DISABLE_TOOLTIP}
            >
              disable
            </button>
          </>
        )}
        {onClear && (
          <>
            <span className={styles.sep}>·</span>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={onClear}
              title={CLEAR_TOOLTIP}
            >
              clear cache
            </button>
          </>
        )}
      </span>
    );
  }
  // Idle but indexer just attached — show a quiet "indexing…" so the
  // footer doesn't blink between disabled and idle while the worker
  // boots.
  return (
    <span className={styles.row}>
      <span className={styles.label}>indexing…</span>
    </span>
  );
}

/** Thin progress strip rendered at the top of the footer. Returns
 *  null when not in the indexing state — keeps the strip out of
 *  cleanup spaghetti when status flips. */
export function IndexerProgressStrip({ status }: { status: Status }) {
  if (status.kind !== 'indexing' || status.total === 0) return null;
  const pct = Math.min(100, Math.round((status.indexed / status.total) * 100));
  return (
    <div
      className={styles.strip}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={status.total}
      aria-valuenow={status.indexed}
    >
      <div className={styles.stripFill} style={{ width: `${pct}%` }} />
    </div>
  );
}
