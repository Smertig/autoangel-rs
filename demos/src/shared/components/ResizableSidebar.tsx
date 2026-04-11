import React, { useRef } from 'react';
import { useDividerDrag } from '../hooks/useDividerDrag';
import styles from './ResizableSidebar.module.css';

interface ResizableSidebarProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  initialWidth?: number;
  minWidth?: number;
}

export function ResizableSidebar({
  sidebar,
  children,
  initialWidth = 280,
  minWidth,
}: ResizableSidebarProps) {
  const sidebarRef = useRef<HTMLElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);

  useDividerDrag(dividerRef, sidebarRef, { min: minWidth });

  return (
    <div className={styles.layout}>
      <aside
        ref={sidebarRef}
        className={styles.sidebar}
        style={{ width: initialWidth }}
      >
        {sidebar}
      </aside>
      <div ref={dividerRef} className={styles.divider} />
      <div className={styles.content}>
        {children}
      </div>
    </div>
  );
}
