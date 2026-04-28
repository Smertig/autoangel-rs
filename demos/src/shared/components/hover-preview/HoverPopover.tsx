import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { formatSize, getExtension } from '@shared/util/files';
import { computeAnchor, type TriggerRect } from './anchor';
import styles from './HoverPopover.module.css';

const POPOVER_W = 300;
const POPOVER_H = 360;
const META_H = 64;
const GAP = 8;

interface HoverPopoverProps {
  path: string;
  /** Bytes from the package index; null if unknown. */
  size: number | null;
  triggerRect: TriggerRect;
  children: ReactNode;
}

function splitPath(path: string): { dir: string; name: string } {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (i < 0) return { dir: '', name: path };
  return { dir: path.slice(0, i + 1), name: path.slice(i + 1) };
}

export function HoverPopover({ path, size, triggerRect, children }: HoverPopoverProps) {
  const viewport = { w: window.innerWidth, h: window.innerHeight };
  const { left, top } = computeAnchor(triggerRect, POPOVER_W, POPOVER_H, viewport, GAP);
  const { dir, name } = splitPath(path);
  const ext = getExtension(name);
  const extLabel = ext ? ext.slice(1).toUpperCase() : '';
  const sizeLabel = size != null ? formatSize(size) : null;
  const meta = [extLabel, sizeLabel].filter(Boolean).join(' · ');

  return createPortal(
    <div
      role="tooltip"
      className={styles.popover}
      style={{ left, top, width: POPOVER_W }}
    >
      <div className={styles.body} style={{ height: POPOVER_H - META_H }}>
        {children}
      </div>
      <div className={styles.meta}>
        <div className={styles.name}>{name}</div>
        {dir && <div className={styles.dir}>{dir}</div>}
        <div className={styles.summary}>{meta}</div>
      </div>
    </div>,
    document.body,
  );
}
