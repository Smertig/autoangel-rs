import React, { useRef } from 'react';
import { useDividerDrag } from '../hooks/useDividerDrag';
import styles from './ResizableRightRail.module.css';

interface ResizableRightRailProps {
  rail: React.ReactNode;
  children: React.ReactNode;
  initialWidth?: number;
  minWidth?: number;
}

/** Mirror of `ResizableSidebar` for a right-anchored rail. Children
 *  fill the remaining width on the left; `rail` sits on the right with
 *  a vertical divider between them that the user can drag. */
export function ResizableRightRail({
  rail,
  children,
  initialWidth = 280,
  minWidth,
}: ResizableRightRailProps) {
  const railRef = useRef<HTMLElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);

  useDividerDrag(dividerRef, railRef, { min: minWidth, side: 'right' });

  return (
    <div className={styles.layout}>
      <div className={styles.content}>{children}</div>
      <div ref={dividerRef} className={styles.divider} />
      <aside
        ref={railRef}
        className={styles.rail}
        style={{ width: initialWidth }}
      >
        {rail}
      </aside>
    </div>
  );
}
