import React, { useState } from 'react';
import { DropZone } from '@shared/components/DropZone';
import { KeysPanel } from '@shared/components/KeysPanel';
import type { KeyConfig } from '@shared/components/KeysPanel';
import type { SideState } from '../types';
import styles from '../App.module.css';

interface ChooserPanelProps {
  left: SideState;
  right: SideState;
  onLoadFiles: (side: 'left' | 'right', files: File[]) => void;
  onCompare: () => void;
  compareEnabled: boolean;
  dimmed?: boolean;
  leftKeys: KeyConfig | null;
  rightKeys: KeyConfig | null;
  onLeftKeysChange: (keys: KeyConfig | null) => void;
  onRightKeysChange: (keys: KeyConfig | null) => void;
}

function SidePanel({
  side,
  label,
  state,
  keys,
  onKeysChange,
  onFiles,
}: {
  side: 'left' | 'right';
  label: string;
  state: SideState;
  keys: KeyConfig | null;
  onKeysChange: (keys: KeyConfig | null) => void;
  onFiles: (files: File[]) => void;
}) {
  const [keysOpen, setKeysOpen] = useState(false);

  const panelClass = [
    styles.chooserPanel,
    side === 'left' ? styles.panelLeft : styles.panelRight,
  ].join(' ');

  const statusLineClass = [
    styles.statusLine,
    state.loaded ? styles.loaded : '',
  ].filter(Boolean).join(' ');

  // Wrap DropZone to apply side-specific tinted border styles
  const dropWrapClass = side === 'left' ? styles.dropWrapLeft : styles.dropWrapRight;

  return (
    <div className={panelClass}>
      <div className={styles.panelLabel}>{label}</div>
      <div className={dropWrapClass}>
        <DropZone
          accept=".pck,.pkx,.pkx1,.pkx2,.pkx3,.pkx4,.pkx5"
          multiple
          vertical
          label={
            <>
              Drop <code>.pck</code> (and optional <code>.pkx*</code>) here, or
            </>
          }
          onFiles={onFiles}
        />
      </div>
      <div className={styles.panelControls}>
        <KeysPanel
          open={keysOpen}
          onToggle={() => setKeysOpen(v => !v)}
          onKeysChange={onKeysChange}
          variant="inline"
        />
        <div className={statusLineClass}>
          {state.loaded ? state.fileName : ''}
        </div>
      </div>
    </div>
  );
}

export function ChooserPanel({
  left,
  right,
  onLoadFiles,
  onCompare,
  compareEnabled,
  dimmed,
  leftKeys,
  rightKeys,
  onLeftKeysChange,
  onRightKeysChange,
}: ChooserPanelProps) {
  const chooserClass = [
    styles.chooser,
    dimmed ? styles.dimmed : '',
  ].filter(Boolean).join(' ');

  return (
    <header className={chooserClass}>
      <div className={styles.chooserTitle}>
        <h1>PCK Diff <span className={styles.chooserGlyph}>&larr;&rarr;</span></h1>
        <p className={styles.chooserSubtitle}>Compare two package archives</p>
      </div>

      <div className={styles.chooserPanels}>
        <SidePanel
          side="left"
          label="Left (old)"
          state={left}
          keys={leftKeys}
          onKeysChange={onLeftKeysChange}
          onFiles={(files) => onLoadFiles('left', files)}
        />
        <SidePanel
          side="right"
          label="Right (new)"
          state={right}
          keys={rightKeys}
          onKeysChange={onRightKeysChange}
          onFiles={(files) => onLoadFiles('right', files)}
        />
      </div>

      <button
        className={`${styles.btn} ${styles.btnCompare}`}
        disabled={!compareEnabled}
        onClick={onCompare}
      >
        Compare
      </button>
    </header>
  );
}
