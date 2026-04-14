import { CopyButton } from '@shared/components/CopyButton';
import styles from './Breadcrumb.module.css';

interface BreadcrumbProps {
  parts: string[];
  onReset: () => void;
}

export function Breadcrumb({ parts, onReset }: BreadcrumbProps) {
  const rootIsClickable = parts.length > 0;

  return (
    <nav className={styles.breadcrumb}>
      <span
        className={rootIsClickable ? styles.crumb : styles.crumbCurrent}
        onClick={rootIsClickable ? onReset : undefined}
      >
        📦 root
      </span>
      {parts.map((part, i) => {
        const isLast = i === parts.length - 1;
        return (
          <span key={i}>
            <span className={styles.crumbSep}>▸</span>
            <span className={isLast ? styles.crumbCurrent : styles.crumb}>
              {part}
            </span>
          </span>
        );
      })}
      {parts.length > 0 && (
        <CopyButton text={parts.join('/')} />
      )}
    </nav>
  );
}
