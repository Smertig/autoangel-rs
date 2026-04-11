import React, { useRef, useState } from 'react';
import styles from '../App.module.css';

interface ConfigPanelProps {
  open: boolean;
  configInfo: string;
  configError: string | null;
  hasCustomConfig: boolean;
  onApply: (text: string) => void;
  onClear: () => void;
  onLoadFile: (file: File) => void;
}

export function ConfigToggleButton({ open, hasCustomConfig, onClick }: {
  open: boolean;
  hasCustomConfig: boolean;
  onClick: () => void;
}) {
  const cls = [
    styles.configToggle,
    open ? styles.configToggleActive : '',
    hasCustomConfig ? styles.configToggleHasConfig : '',
  ].filter(Boolean).join(' ');

  return (
    <button className={cls} title="Use a custom config file" onClick={onClick}>
      <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
        <path d="M16.5 10a1.5 1.5 0 0 0 .3-1.65l-.75-1.3a1.5 1.5 0 0 0-1.65-.68l-.36.08a7 7 0 0 0-1.04-.6V5.5A1.5 1.5 0 0 0 11.65 4h-1.5a1.5 1.5 0 0 0-1.35.85v.36a7 7 0 0 0-1.04.6l-.36-.08a1.5 1.5 0 0 0-1.65.68l-.75 1.3A1.5 1.5 0 0 0 5.3 9.36l.28.24a7 7 0 0 0 0 1.2l-.28.24a1.5 1.5 0 0 0-.3 1.65l.75 1.3a1.5 1.5 0 0 0 1.65.68l.36-.08a7 7 0 0 0 1.04.6v.36a1.5 1.5 0 0 0 1.35.85h1.5a1.5 1.5 0 0 0 1.35-.85v-.36a7 7 0 0 0 1.04-.6l.36.08a1.5 1.5 0 0 0 1.65-.68l.75-1.3a1.5 1.5 0 0 0-.3-1.65l-.28-.24a7 7 0 0 0 0-1.2z"/>
      </svg>
      <span>Config</span>
    </button>
  );
}

export function ConfigPanel({ open, configInfo, configError, hasCustomConfig, onApply, onClear, onLoadFile }: ConfigPanelProps) {
  const [textDragover, setTextDragover] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  if (!open) return null;

  const handleTextDragOver = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    setTextDragover(true);
  };
  const handleTextDragLeave = () => setTextDragover(false);
  const handleTextDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    setTextDragover(false);
    const file = e.dataTransfer.files[0];
    if (file) onLoadFile(file);
  };

  return (
    <div className={styles.configPanel}>
      <div className={styles.configBody}>
        <div className={styles.configLeft}>
          <textarea
            ref={textareaRef}
            className={textDragover ? styles.textareaDragover : undefined}
            spellCheck={false}
            placeholder={'Paste a .cfg config here\n\nExample format:\n2\n0\n\n001 - Weapons\nAUTO\nID;Name;Level\nint32;wstring:64;int32\n\n002 - Armor\nAUTO\nID;Name\nint32;wstring:64'}
            onDragOver={handleTextDragOver}
            onDragLeave={handleTextDragLeave}
            onDrop={handleTextDrop}
          />
        </div>
        <div className={styles.configRight}>
          <div className={`${styles.configInfo}${hasCustomConfig ? ` ${styles.configInfoCustom}` : ''}`}>
            {configInfo}
          </div>
          {configError && (
            <div className={styles.configError}>{configError}</div>
          )}
          <label className={`${styles.btn} ${styles.btnFile}`}>
            Load .cfg file
            <input
              type="file"
              accept=".cfg,.txt"
              hidden
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) onLoadFile(file);
                e.target.value = '';
              }}
            />
          </label>
          <div className={styles.configActions}>
            <button
              className={`${styles.btn} ${styles.btnApply}`}
              onClick={() => {
                if (textareaRef.current) onApply(textareaRef.current.value);
              }}
            >
              Apply
            </button>
            <button
              className={`${styles.btn} ${styles.btnClear}`}
              disabled={!hasCustomConfig}
              onClick={onClear}
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
