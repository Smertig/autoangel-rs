import styles from './ErrorBanner.module.css';

interface ErrorBannerProps {
  message: string | null;
  onDismiss: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  if (message === null) return null;

  return (
    <div className={styles.errorBanner}>
      <span className={styles.errorText}>{message}</span>
      <button className={styles.errorDismiss} onClick={onDismiss} aria-label="Dismiss">
        &times;
      </button>
    </div>
  );
}
