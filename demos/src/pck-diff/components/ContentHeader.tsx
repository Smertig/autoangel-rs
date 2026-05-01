import { formatSize } from '@shared/util/files';
import { CopyButton } from '@shared/components/CopyButton';
import type { DiffStatusValue } from '../types';
import styles from '../App.module.css';

interface ContentHeaderProps {
  path: string | null;
  status: DiffStatusValue;
  leftSize?: number;
  rightSize?: number;
  leftEnc?: string;
  rightEnc?: string;
}

export function ContentHeader({
  path,
  status,
  leftSize,
  rightSize,
  leftEnc,
  rightEnc,
}: ContentHeaderProps) {
  if (!path) return null;

  return (
    <div className={styles.contentHeader}>
      <span className={styles.contentPath}>{path}</span>
      <CopyButton text={path} />
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
