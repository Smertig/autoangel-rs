import type { CSSProperties } from 'react';
import styles from './PackageChip.module.css';

interface BaseProps {
  stem: string;
  color: string;
}

interface LoadedProps extends BaseProps {
  state: 'loaded';
  fileCount: number;
  version: number;
  onRemove: () => void;
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

  return (
    <div
      className={styles.chip}
      style={chipStyle}
      data-testid="package-chip"
      data-state={props.state}
    >
      <div className={styles.stem}>{stem}</div>
      <div className={styles.meta}>{meta}</div>
      {isLoading && (
        <div
          className={styles.progressBar}
          style={progressBarStyle}
          data-indeterminate={props.progress === null ? 'true' : undefined}
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
  );
}
