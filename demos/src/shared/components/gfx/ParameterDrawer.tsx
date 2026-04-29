import { useEffect } from 'react';
import { FieldPanel } from './fieldPanel';
import { buildFieldRowsFor } from './fields';
import { formatKindBadge } from './util/kindLabel';
import type { GfxElement, ViewerCtx } from './previews/types';
import styles from './ParameterDrawer.module.css';

interface ParameterDrawerProps {
  element: GfxElement | null;
  context: ViewerCtx;
  onClose: () => void;
}

export function ParameterDrawer({ element, context, onClose }: ParameterDrawerProps) {
  useEffect(() => {
    if (!element) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [element, onClose]);

  if (!element) return null;

  const rows = buildFieldRowsFor(element.body, element, context);

  return (
    <aside data-testid="drawer" className={styles.drawer}>
      <header className={styles.header}>
        <span className={styles.kindBadge}>{formatKindBadge(element)}</span>
        <span className={styles.name}>
          {element.name || <em className={styles.unnamed}>&lt;unnamed&gt;</em>}
        </span>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Close drawer"
          title="Close (Esc)"
        >×</button>
      </header>
      <div className={styles.body}>
        <FieldPanel rows={rows} />
      </div>
    </aside>
  );
}
