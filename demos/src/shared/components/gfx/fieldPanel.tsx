import { ReactNode } from 'react';
import styles from './fieldPanel.module.css';

export type FieldRow =
  | { label: string; value: ReactNode; key?: string }
  | { divider: true };

export function FieldPanel({ rows }: { rows: FieldRow[] }) {
  return (
    <div className={styles.panel}>
      {rows.map((row, i) =>
        'divider' in row
          ? <div key={`d${i}`} data-testid="panel-divider" className={styles.divider} />
          : (
            <div key={row.key ?? row.label} className={styles.row}>
              <span className={styles.label}>{row.label}</span>
              <span className={styles.value}>{row.value}</span>
            </div>
          ),
      )}
    </div>
  );
}
