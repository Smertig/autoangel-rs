import type { PreviewProps } from './types';
import styles from './UnknownPreview.module.css';

export function UnknownPreview({ body, expanded }: PreviewProps<'unknown'>) {
  const lines = (body as { lines: string[] }).lines ?? [];
  if (!expanded) return <span className={styles.thumb}>U</span>;
  return (
    <div className={styles.expanded}>
      <div className={styles.header}>{`${lines.length} unparsed line${lines.length === 1 ? '' : 's'}`}</div>
      <pre className={styles.body}>{lines.join('\n')}</pre>
    </div>
  );
}
