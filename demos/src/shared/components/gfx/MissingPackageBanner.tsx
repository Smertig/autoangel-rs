import type { ReactNode } from 'react';
import styles from './MissingPackageBanner.module.css';

interface MissingPackageBannerProps {
  title: string;
  children: ReactNode;
}

export function MissingPackageBanner({ title, children }: MissingPackageBannerProps) {
  return (
    <div className={styles.banner} role="status">
      <span className={styles.icon} aria-hidden="true">⊘</span>
      <div className={styles.text}>
        <strong>{title}</strong>{' '}{children}
      </div>
    </div>
  );
}
