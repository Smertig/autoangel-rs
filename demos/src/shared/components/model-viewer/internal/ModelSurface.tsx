import styles from '../ModelViewer.module.css';

const HIDDEN_STYLE: React.CSSProperties = { display: 'none' };

interface ModelSurfaceProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  error: string | null;
}

export function ModelSurface({ containerRef, error }: ModelSurfaceProps) {
  return (
    <>
      {error && <div className={styles.modelError}>{error}</div>}
      <div ref={containerRef} className={styles.modelContainer} style={error ? HIDDEN_STYLE : undefined} />
    </>
  );
}
