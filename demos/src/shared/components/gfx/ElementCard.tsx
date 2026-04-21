import { useId, useState, KeyboardEvent } from 'react';
import type { FC } from 'react';
import { PREVIEW_REGISTRY } from './previews/registry';
import type { GfxElement, PreviewProps, ViewerCtx } from './previews/types';
import { formatKindBadge } from './util/kindLabel';
import styles from './ElementCard.module.css';

export function ElementCard({ element, context }: { element: GfxElement; context: ViewerCtx }) {
  const [expanded, setExpanded] = useState(false);
  const kind = element.body.kind;
  const blockId = useId();
  const Preview = PREVIEW_REGISTRY[kind] as FC<PreviewProps>;

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && expanded) { setExpanded(false); e.stopPropagation(); }
  }

  return (
    <div
      className={`${styles.card} ${kind === 'unknown' ? styles.cardUnknown : ''}`}
      style={{ '--gfx-kind-tint': `var(--gfx-kind-${kind})` } as React.CSSProperties}
    >
      <button
        type="button"
        className={styles.header}
        aria-expanded={expanded}
        aria-controls={blockId}
        onClick={() => setExpanded(e => !e)}
        onKeyDown={onKey}
      >
        <span className={styles.kindBadge}>{formatKindBadge(element)}</span>
        <span className={styles.name}>
          {element.name
            ? element.name
            : <em className={styles.unnamed}><span className={styles.dim}>&lt;</span>unnamed<span className={styles.dim}>&gt;</span></em>}
        </span>
        {element.is_dummy && <span className={styles.dummyBadge}>dummy</span>}
        <span className={`${styles.chevron} ${expanded ? styles.chevronOpen : ''}`}>▸</span>
        <Preview body={element.body as any} element={element} context={context} expanded={false} />
      </button>
      {expanded && (
        <div id={blockId} className={styles.expandedBlock} onKeyDown={onKey}>
          <Preview body={element.body as any} element={element} context={context} expanded={true} />
        </div>
      )}
    </div>
  );
}
