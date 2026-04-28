import React, { useRef } from 'react';
import { useDividerDrag } from '../hooks/useDividerDrag';
import styles from './ResizableSplit.module.css';

interface ResizableSplitProps {
  /** Which side the resizable panel is anchored to. */
  side: 'left' | 'right';
  /** The resizable panel's content. */
  panel: React.ReactNode;
  /** The non-resizable region's content (fills remaining width). */
  children: React.ReactNode;
  initialWidth?: number;
  minWidth?: number;
}

export function ResizableSplit({
  side,
  panel,
  children,
  initialWidth = 280,
  minWidth,
}: ResizableSplitProps) {
  const panelRef = useRef<HTMLElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);

  useDividerDrag(dividerRef, panelRef, { min: minWidth, side });

  const panelEl = (
    <aside
      ref={panelRef}
      className={styles.panel}
      data-side={side}
      style={{ width: initialWidth }}
    >
      {panel}
    </aside>
  );
  const dividerEl = <div ref={dividerRef} className={styles.divider} />;
  const contentEl = <div className={styles.content}>{children}</div>;

  return (
    <div className={styles.layout}>
      {side === 'left' ? (
        <>
          {panelEl}
          {dividerEl}
          {contentEl}
        </>
      ) : (
        <>
          {contentEl}
          {dividerEl}
          {panelEl}
        </>
      )}
    </div>
  );
}
