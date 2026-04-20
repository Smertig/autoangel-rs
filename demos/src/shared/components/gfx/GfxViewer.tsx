import { useMemo } from 'react';
import { ElementCard } from './ElementCard';
import type { ViewerCtx } from './previews/types';
import styles from './GfxViewer.module.css';

interface GfxViewerProps {
  data: Uint8Array;
  context: ViewerCtx;
}

export function GfxViewer({ data, context }: GfxViewerProps) {
  const parsed = useMemo(() => {
    try {
      return { ok: true as const, value: context.wasm.parseGfx(data) };
    } catch (e: unknown) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  }, [data, context.wasm]);

  return (
    <div className={styles.root}>
      {parsed.ok ? (
        <>
          <div className={styles.header}>
            <span className={styles.headerBadge}>GFX v{parsed.value.version}</span>
            <span className={styles.headerSubtitle}>
              {parsed.value.elements.length} element{parsed.value.elements.length === 1 ? '' : 's'} · scale {parsed.value.default_scale.toFixed(3)} · speed {parsed.value.play_speed.toFixed(3)} · alpha {parsed.value.default_alpha.toFixed(3)}
            </span>
          </div>
          <div className={styles.elements}>
            {parsed.value.elements.map((el, i) => (
              <ElementCard key={i} element={el} context={context} />
            ))}
          </div>
        </>
      ) : (
        <div style={{ padding: 12, color: 'var(--gfx-acc-warn)', font: '400 12px var(--gfx-font-data)' }}>
          Parse error: {parsed.error}
        </div>
      )}
    </div>
  );
}
