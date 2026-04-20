import { useMemo } from 'react';
import type { AutoangelModule } from '../../types/autoangel';
import styles from './StckViewer.module.css';

interface StckViewerProps {
  data: Uint8Array;
  wasm: AutoangelModule;
}

export function StckViewer({ data, wasm }: StckViewerProps) {
  const parsed = useMemo(() => {
    try {
      using ts = wasm.TrackSet.parse(data);
      return {
        ok: true as const,
        version: ts.version,
        animStart: ts.animStart,
        animEnd: ts.animEnd,
        animFps: ts.animFps || 30,
        trackCount: ts.trackCount,
      };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  }, [data, wasm]);

  if (!parsed.ok) return <div className={styles.error}>STCK parse failed: {parsed.error}</div>;
  const duration = (parsed.animEnd - parsed.animStart) / parsed.animFps;

  return (
    <div className={styles.root}>
      <h3 className={styles.title}>STCK Track Set</h3>
      <table className={styles.table}>
        <tbody>
          <tr><td>Version</td><td>{parsed.version}</td></tr>
          <tr><td>Frames</td><td>{parsed.animStart}–{parsed.animEnd}</td></tr>
          <tr><td>FPS</td><td>{parsed.animFps}</td></tr>
          <tr><td>Bone tracks</td><td>{parsed.trackCount}</td></tr>
          <tr><td>Duration</td><td>{duration.toFixed(2)}s</td></tr>
        </tbody>
      </table>
    </div>
  );
}
