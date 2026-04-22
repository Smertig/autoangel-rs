import { useFileDrop, type PickedItem } from '@shared/hooks/useFileDrop';
import { PACKAGE_COLORS } from '../colors';
import styles from './EmptyDropPanel.module.css';

interface EmptyDropPanelProps {
  onDrop: (items: PickedItem[]) => void;
}

export function EmptyDropPanel({ onDrop }: EmptyDropPanelProps) {
  const { over, dragProps, inputProps, triggerPicker } = useFileDrop({ onFiles: onDrop, multiple: true });

  return (
    <button
      type="button"
      className={styles.panel}
      data-over={over ? 'true' : undefined}
      data-testid="empty-drop-panel"
      aria-label="Drop .pck or .pkx files here, or click to browse"
      onClick={triggerPicker}
      {...dragProps}
    >
      <div className={styles.content}>
        <div className={styles.marker} aria-hidden="true">
          <span className={styles.bar} style={{ background: PACKAGE_COLORS[0] }} />
          <span className={styles.bar} style={{ background: PACKAGE_COLORS[1] }} />
          <span className={styles.bar} style={{ background: PACKAGE_COLORS[2] }} />
        </div>
        <p className={styles.headline}>Drop .pck or .pkx files here</p>
        <p className={styles.secondary}>
          Multiple packages supported &mdash; drop them all at once.
        </p>
        <p className={styles.tertiary}>
          Extensions (.pkx, .pkx1, &hellip;) are grouped with their .pck automatically.
        </p>
      </div>
      <input {...inputProps} className={styles.fileInput} />
    </button>
  );
}
