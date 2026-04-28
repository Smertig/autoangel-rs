import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import styles from './PackageChip.module.css';

interface BaseProps {
  stem: string;
  color: string;
}

export interface IndexDetails {
  indexed: number;
  total: number;
  perExt: Array<{ name: string; indexed: number; total: number }>;
  outgoingCount: number;
  incomingCount: number;
  done: boolean;
  currentPath?: string;
}

interface LoadedProps extends BaseProps {
  state: 'loaded';
  fileCount: number;
  version: number;
  onRemove: () => void;
  /** Optional indexer details for this slot. Drives both the inline
   *  progress strip (when in flight) and the hover popover. Null when
   *  the indexer hasn't been told about this slot yet. */
  indexDetails?: IndexDetails | null;
}

interface LoadingProps extends BaseProps {
  state: 'loading';
  /** 0..100, or null = indeterminate (parse started but no progress yet). */
  progress: number | null;
}

export type PackageChipProps = LoadedProps | LoadingProps;

export function PackageChip(props: PackageChipProps) {
  const { stem, color } = props;
  const chipStyle = { '--pkg-color': color } as CSSProperties;
  const isLoading = props.state === 'loading';

  const meta = isLoading
    ? 'Parsing\u2026'
    : `${props.fileCount.toLocaleString()} files \u00b7 v0x${props.version.toString(16).toUpperCase()}`;

  const progressBarStyle: CSSProperties | undefined = isLoading
    ? { width: `${props.progress ?? 0}%`, background: color }
    : undefined;

  // Indexer details (only on loaded chips).
  const idx = !isLoading ? props.indexDetails ?? null : null;
  const showIndexBar = idx !== null && idx.total > 0 && idx.indexed < idx.total;
  const indexPct = showIndexBar
    ? Math.min(100, Math.round((idx.indexed / idx.total) * 100))
    : 0;
  const showCheck = idx !== null && idx.done;

  // Hover state for the portal-rendered popover. Tracking state
  // (instead of CSS-only) lets us escape the chip-row's scrollable
  // overflow and project the popover at body-level coordinates.
  const chipRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState(false);
  const onEnter = idx !== null ? () => setHover(true) : undefined;
  const onLeave = idx !== null ? () => setHover(false) : undefined;

  return (
    <div
      className={styles.chipWrap}
      ref={chipRef}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
    >
      <div
        className={styles.chip}
        style={chipStyle}
        data-testid="package-chip"
        data-state={props.state}
      >
        <div className={styles.stem}>{stem}</div>
        <div className={styles.meta}>
          {meta}
          {showCheck && (
            <span
              className={styles.indexDone}
              aria-label="Index up to date for this package"
              title="Index up to date"
            >
              {'✓'}
            </span>
          )}
        </div>
        {isLoading && (
          <div
            className={styles.progressBar}
            style={progressBarStyle}
            data-indeterminate={props.progress === null ? 'true' : undefined}
          />
        )}
        {showIndexBar && (
          <div
            className={styles.indexBar}
            style={{ width: `${indexPct}%`, background: color }}
            data-testid="package-chip-index-progress"
          />
        )}
        {!isLoading && (
          <button
            type="button"
            className={styles.remove}
            onClick={props.onRemove}
            aria-label={`Remove ${stem}`}
            data-testid="package-chip-remove"
          >
            &times;
          </button>
        )}
      </div>
      {idx !== null && hover && (
        <IndexPopover
          anchor={chipRef.current}
          stem={stem}
          color={color}
          details={idx}
        />
      )}
    </div>
  );
}

function IndexPopover({
  anchor,
  stem,
  color,
  details,
}: {
  anchor: HTMLElement | null;
  stem: string;
  color: string;
  details: IndexDetails;
}) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  useLayoutEffect(() => {
    if (!anchor) return;
    const update = () => {
      const r = anchor.getBoundingClientRect();
      setCoords({ top: r.bottom + 6, left: r.left });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [anchor]);

  if (!coords) return null;

  const total = details.total;
  const indexed = details.indexed;
  const pct = total > 0 ? Math.min(100, Math.round((indexed / total) * 100)) : 0;
  return createPortal(
    <div
      className={styles.popover}
      role="tooltip"
      style={{ top: coords.top, left: coords.left }}
    >
      <div className={styles.popHeader}>
        <span className={styles.popDot} style={{ background: color }} />
        <span className={styles.popStem}>{stem}.pck</span>
        <span className={styles.popState}>
          {details.done
            ? 'indexed'
            : total > 0
              ? `${pct}%`
              : 'queued'}
        </span>
      </div>
      {details.perExt.length > 0 ? (
        <ul className={styles.popList}>
          {details.perExt.map((row) => (
            <li key={row.name} className={styles.popRow}>
              <span className={styles.popName}>{row.name}</span>
              <span className={styles.popCount}>
                {row.indexed.toLocaleString()}/{row.total.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.popEmpty}>No parseable files in this slot.</div>
      )}
      <div className={styles.popFoot}>
        <div className={styles.popFootRow}>
          <span className={styles.popName}>outgoing</span>
          <span>{details.outgoingCount.toLocaleString()}</span>
        </div>
        <div className={styles.popFootRow}>
          <span className={styles.popName}>incoming</span>
          <span>{details.incomingCount.toLocaleString()}</span>
        </div>
      </div>
      {details.currentPath && !details.done && (
        <div className={styles.popPath} title={details.currentPath}>
          {details.currentPath}
        </div>
      )}
    </div>,
    document.body,
  );
}
