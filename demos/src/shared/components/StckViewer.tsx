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
      const ts = wasm.parseAnimation(data);
      return {
        ok: true as const,
        animStart: ts.anim_start,
        animEnd: ts.anim_end,
        animFps: ts.anim_fps || 30,
        trackCount: ts.bone_tracks.length,
      };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  }, [data, wasm]);

  if (!parsed.ok) return <div className={styles.error}>STCK parse failed: {parsed.error}</div>;
  const animEnd = parsed.animEnd ?? parsed.animStart;
  const duration = (animEnd - parsed.animStart) / parsed.animFps;

  return (
    <div className={styles.root}>
      <h3 className={styles.title}>STCK Track Set</h3>
      <table className={styles.table}>
        <tbody>
          <tr><td>Frames</td><td>{parsed.animStart}–{animEnd}</td></tr>
          <tr><td>FPS</td><td>{parsed.animFps}</td></tr>
          <tr><td>Bone tracks</td><td>{parsed.trackCount}</td></tr>
          <tr><td>Duration</td><td>{duration.toFixed(2)}s</td></tr>
        </tbody>
      </table>
    </div>
  );
}
