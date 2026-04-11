import styles from './InlineProgress.module.css';

interface InlineProgressProps {
  text: string;
  progress: number;
}

export function InlineProgress({ text, progress }: InlineProgressProps) {
  return (
    <div className={styles.container}>
      <span className={styles.statusText}>{text}</span>
      <div className={styles.statusBar}>
        <div
          className={styles.statusBarFill}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
